import { Types } from 'mongoose';
import { badRequest, notFound } from '../../common/errors/app-error';
import { fromMinorUnits } from '../../common/utils/money';
import { TreasuryAccountModel } from '../banking/treasury-account.model';
import { EmployeeModel } from '../employees/employee.model';
import { AccountModel, type AccountDocument } from './account.model';
import { dimensionRuleForAccount } from './account-dimensions';
import { JournalEntityType, JournalStatus, JournalType } from './journal.enums';
import { JournalEntryModel } from './journal-entry.model';
import type { JournalService } from './journal.service';
import { LedgerLineModel } from './ledger.model';
import { SystemAccountCode } from './system-account-codes';

const CODE_PATTERN = /^[A-Z0-9-]{3,12}$/;

/** System codes that are plain report heads, not automatic posting targets. */
const SPLITTABLE_SYSTEM_CODES = new Set<string>([
  SystemAccountCode.OFFICE_RENT,
  SystemAccountCode.UTILITIES,
  SystemAccountCode.OTHER_UTILITIES,
]);

const PROTECTED_CODES = new Set<string>(
  Object.values(SystemAccountCode).filter((code) => !SPLITTABLE_SYSTEM_CODES.has(code)),
);

export type SplitChildInput = { code: string; name: string };

export type AccountSplitInput = {
  code: string;
  children: SplitChildInput[];
  /** Sub-account that receives the balance already posted to the account. */
  historyTo?: string | null;
};

export type SplitReclass = {
  journalEntryId: string;
  entryNumber: string;
  date: string;
  projectId: string | null;
  employeeId: string | null;
  /** Net debit the journal left on the account (negative = net credit). */
  amount: number;
  reference: string;
};

export type AccountSplitPlan = {
  account: { code: string; name: string; type: string; parentCode: string | null };
  alreadyHeader: boolean;
  alreadyDone: boolean;
  /** Blocking problems; nothing is changed while any exist. */
  errors: string[];
  warnings: string[];
  children: SplitChildInput[];
  childrenToCreate: string[];
  historyTo: string | null;
  reclasses: SplitReclass[];
  totalToMove: number;
  /** Unposted journals still on the account; switch their line to a sub-account first. */
  unpostedJournals: Array<{ entryNumber: string; status: string }>;
};

export type AccountSplitResult = AccountSplitPlan & {
  postedReclasses: Array<{ reference: string; entryNumber: string }>;
  headerOwnBalanceAfter: number;
};

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function normalizeInput(input: AccountSplitInput) {
  return {
    code: input.code.trim().toUpperCase(),
    children: input.children.map((child) => ({
      code: child.code.trim().toUpperCase(),
      name: child.name.trim(),
    })),
    historyTo: input.historyTo?.trim().toUpperCase() || null,
  };
}

function reclassPrefix(code: string): string {
  return `RCL-${code}-`;
}

/** Read-only: validates the request and lists what the split would do. */
export async function planAccountSplit(
  raw: AccountSplitInput,
): Promise<AccountSplitPlan> {
  const input = normalizeInput(raw);
  const account = await AccountModel.findOne({ code: input.code }).lean().exec();
  if (!account) throw notFound(`Account ${input.code} not found`);

  const errors: string[] = [];
  const warnings: string[] = [];

  if (account.isPostable) {
    if (PROTECTED_CODES.has(account.code)) {
      errors.push(
        `${account.code} ${account.name} is used for automatic postings and cannot become a header`,
      );
    } else if (dimensionRuleForAccount(account.code).entityType) {
      errors.push(`${account.code} ${account.name} is a party / treasury control account`);
    }
    if (await TreasuryAccountModel.exists({ glAccountCode: account.code })) {
      errors.push(`${account.code} is linked to a bank / cash treasury account`);
    }
    if (!account.isActive) {
      errors.push(`${account.code} is inactive`);
    }
  }

  if (input.children.length === 0) {
    errors.push('Add at least one sub-account');
  }
  const seen = new Set<string>();
  for (const child of input.children) {
    if (!CODE_PATTERN.test(child.code)) {
      errors.push(`Code "${child.code}" must be 3-12 letters, numbers, or hyphens`);
    }
    if (child.code === account.code) {
      errors.push(`Sub-account code ${child.code} is the account itself`);
    }
    if (seen.has(child.code)) {
      errors.push(`Code ${child.code} is listed twice`);
    }
    seen.add(child.code);
    if (child.name.length < 2 || child.name.length > 120) {
      errors.push(`Name for ${child.code} must be 2-120 characters`);
    }
  }

  const existing = await AccountModel.find({
    code: { $in: input.children.map((child) => child.code) },
  })
    .lean()
    .exec();
  const existingByCode = new Map(existing.map((row) => [row.code, row]));
  for (const row of existing) {
    const resumable =
      row.isPostable &&
      row.type === account.type &&
      (row.parentCode === account.code ||
        (row.code === input.historyTo && row.parentCode === account.parentCode));
    if (!resumable) {
      errors.push(`Code ${row.code} is already used by ${row.name}`);
    }
  }
  const childrenToCreate = input.children
    .filter((child) => !existingByCode.has(child.code))
    .map((child) => child.code);

  let reclasses: SplitReclass[] = [];
  let totalMinor = 0;
  if (account.isPostable) {
    ({ reclasses, totalMinor } = await pendingReclasses(account.code, warnings));
  }

  if (reclasses.length > 0) {
    if (!input.historyTo) {
      errors.push('Choose which sub-account receives the existing balance');
    } else if (!seen.has(input.historyTo)) {
      errors.push(`${input.historyTo} is not one of the sub-accounts`);
    }
  }

  const unposted = await JournalEntryModel.find(
    {
      'lines.accountCode': account.code,
      status: {
        $in: [JournalStatus.DRAFT, JournalStatus.PENDING_APPROVAL, JournalStatus.APPROVED],
      },
    },
    { entryNumber: 1, status: 1 },
  )
    .lean()
    .exec();

  return {
    account: {
      code: account.code,
      name: account.name,
      type: account.type,
      parentCode: account.parentCode ?? null,
    },
    alreadyHeader: !account.isPostable,
    alreadyDone:
      !account.isPostable && childrenToCreate.length === 0 && reclasses.length === 0,
    errors,
    warnings,
    children: input.children,
    childrenToCreate,
    historyTo: reclasses.length > 0 ? input.historyTo : null,
    reclasses,
    totalToMove: fromMinorUnits(totalMinor),
    unpostedJournals: unposted.map((row) => ({
      entryNumber: row.entryNumber,
      status: row.status,
    })),
  };
}

async function pendingReclasses(
  code: string,
  warnings: string[],
): Promise<{ reclasses: SplitReclass[]; totalMinor: number }> {
  const prefix = reclassPrefix(code);
  const done = await JournalEntryModel.find(
    { reference: { $regex: `^${prefix}` }, status: JournalStatus.POSTED },
    { reference: 1 },
  )
    .lean()
    .exec();
  const doneRefs = new Set(done.map((row) => row.reference));
  const doneIds = new Set(done.map((row) => row._id.toString()));

  const grouped = await LedgerLineModel.aggregate<{
    _id: {
      journalEntryId: Types.ObjectId;
      projectId: Types.ObjectId | null;
      entityType: string | null;
      entityId: Types.ObjectId | null;
    };
    entryNumber: string;
    date: Date;
    debitMinor: number;
    creditMinor: number;
  }>([
    { $match: { accountCode: code } },
    {
      $group: {
        _id: {
          journalEntryId: '$journalEntryId',
          projectId: { $ifNull: ['$projectId', null] },
          entityType: { $ifNull: ['$entityType', null] },
          entityId: { $ifNull: ['$entityId', null] },
        },
        entryNumber: { $first: '$journalEntryNumber' },
        date: { $first: '$date' },
        debitMinor: { $sum: '$debitMinor' },
        creditMinor: { $sum: '$creditMinor' },
      },
    },
  ]);

  const employeeIds = grouped
    .filter((row) => row._id.entityType === JournalEntityType.EMPLOYEE && row._id.entityId)
    .map((row) => row._id.entityId!);
  const activeEmployees = new Set(
    employeeIds.length
      ? (
          await EmployeeModel.distinct('_id', {
            _id: { $in: employeeIds },
            isActive: true,
          }).exec()
        ).map((id) => String(id))
      : [],
  );

  grouped.sort(
    (a, b) =>
      a.date.getTime() - b.date.getTime() ||
      a.entryNumber.localeCompare(b.entryNumber) ||
      String(a._id.projectId).localeCompare(String(b._id.projectId)) ||
      String(a._id.entityId).localeCompare(String(b._id.entityId)),
  );

  const perJournal = new Map<string, number>();
  const reclasses: SplitReclass[] = [];
  let totalMinor = 0;
  for (const row of grouped) {
    const journalEntryId = row._id.journalEntryId.toString();
    if (doneIds.has(journalEntryId)) continue;
    const netMinor = row.debitMinor - row.creditMinor;
    if (netMinor === 0) continue;

    const n = (perJournal.get(journalEntryId) ?? 0) + 1;
    perJournal.set(journalEntryId, n);
    const reference = `${prefix}${row.entryNumber}${n > 1 ? `-${n}` : ''}`;
    if (doneRefs.has(reference)) continue;

    let employeeId: string | null = null;
    if (row._id.entityId && row._id.entityType !== JournalEntityType.EMPLOYEE) {
      warnings.push(
        `${row.entryNumber}: the ${row._id.entityType ?? 'party'} tag is not carried to the sub-account`,
      );
    }
    if (row._id.entityType === JournalEntityType.EMPLOYEE && row._id.entityId) {
      const id = row._id.entityId.toString();
      if (activeEmployees.has(id)) {
        employeeId = id;
      } else {
        warnings.push(
          `${row.entryNumber}: employee is inactive, so the moved amount is not tagged to them`,
        );
      }
    }

    totalMinor += netMinor;
    reclasses.push({
      journalEntryId,
      entryNumber: row.entryNumber,
      date: isoDay(row.date),
      projectId: row._id.projectId ? row._id.projectId.toString() : null,
      employeeId,
      amount: fromMinorUnits(netMinor),
      reference,
    });
  }
  return { reclasses, totalMinor };
}

async function ensureChild(
  parent: AccountDocument,
  child: SplitChildInput,
  parentCode: string | undefined,
): Promise<void> {
  const existing = await AccountModel.findOne({ code: child.code }).exec();
  if (existing) {
    if (existing.parentCode !== parentCode) {
      existing.parentCode = parentCode;
      await existing.save();
    }
    return;
  }
  await AccountModel.create({
    code: child.code,
    name: child.name,
    type: parent.type,
    normalBalance: parent.normalBalance,
    parentCode,
    isSystem: false,
    isPostable: true,
    isActive: true,
    ...(parent.employeeExpenseKind
      ? { employeeExpenseKind: parent.employeeExpenseKind }
      : {}),
  });
}

async function ownBalanceMinor(code: string): Promise<number> {
  const [row] = await LedgerLineModel.aggregate<{ debit: number; credit: number }>([
    { $match: { accountCode: code } },
    { $group: { _id: null, debit: { $sum: '$debitMinor' }, credit: { $sum: '$creditMinor' } } },
  ]);
  return row ? row.debit - row.credit : 0;
}

/**
 * Turns a postable account into a header with postable sub-accounts.
 *
 * Posted journals are never edited. What each one left on the account moves
 * to `historyTo` through a system reclassification journal on the same date
 * (keeping its project and employee), then the account becomes a header.
 * Report totals are unchanged at every step, so a failed run can be re-run.
 * Sub-accounts inherit the type, normal balance, and employee tagging.
 */
export async function applyAccountSplit(
  journalService: JournalService,
  userId: string,
  raw: AccountSplitInput,
): Promise<AccountSplitResult> {
  const plan = await planAccountSplit(raw);
  if (plan.errors.length > 0) {
    throw badRequest(plan.errors.join('; '));
  }
  const result: AccountSplitResult = {
    ...plan,
    postedReclasses: [],
    headerOwnBalanceAfter: 0,
  };

  const account = await AccountModel.findOne({ code: plan.account.code }).exec();
  if (!account) throw notFound(`Account ${plan.account.code} not found`);

  if (account.isPostable) {
    if (plan.reclasses.length > 0 && plan.historyTo) {
      const target = plan.children.find((child) => child.code === plan.historyTo)!;
      // A sibling while the account is still postable, so rollups keep counting it.
      await ensureChild(account, target, account.parentCode);

      for (const row of plan.reclasses) {
        const amount = Math.abs(row.amount);
        const debitTarget = row.amount > 0;
        const tag = row.employeeId
          ? { entityType: JournalEntityType.EMPLOYEE, entityId: row.employeeId }
          : {};
        const description = `Reclassified from ${account.code} ${account.name} · ${row.entryNumber}`;
        const posted = await journalService.post(
          {
            date: row.date,
            memo: `Sub-account split · reclass ${row.entryNumber}`,
            reference: row.reference,
            journalType: JournalType.GENERAL,
            lines: [
              {
                accountCode: target.code,
                ...(debitTarget ? { debit: amount } : { credit: amount }),
                description,
                projectId: row.projectId ?? undefined,
                ...tag,
              },
              {
                accountCode: account.code,
                ...(debitTarget ? { credit: amount } : { debit: amount }),
                description,
                projectId: row.projectId ?? undefined,
                ...tag,
              },
            ],
          },
          userId,
          'system',
        );
        result.postedReclasses.push({
          reference: row.reference,
          entryNumber: posted.entryNumber,
        });
      }
    }

    const remaining = await ownBalanceMinor(account.code);
    if (remaining !== 0) {
      throw badRequest(
        `${account.code} still carries ${fromMinorUnits(remaining)} after reclassification; it was left postable`,
      );
    }
    account.isPostable = false;
    account.description = account.description || 'Header account (non-postable)';
    await account.save();
  }

  for (const child of plan.children) {
    await ensureChild(account, child, account.code);
  }
  if (account.employeeExpenseKind) {
    account.employeeExpenseKind = undefined;
    await account.save();
  }

  result.headerOwnBalanceAfter = fromMinorUnits(await ownBalanceMinor(account.code));
  return result;
}
