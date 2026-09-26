import { AdvanceModel } from '../advances/advance.model';
import { FundTransferModel } from '../banking/fund-transfer.model';
import { ReconciliationModel } from '../banking/reconciliation.model';
import { TreasuryAccountModel } from '../banking/treasury-account.model';
import { AccountModel } from './account.model';
import { JournalEntryModel } from './journal-entry.model';
import { LedgerLineModel } from './ledger.model';

export type AccountSnap = {
  code: string;
  name: string;
  parentCode: string | null;
  isPostable: boolean;
  isActive: boolean;
};

export type RepairOp =
  | {
      op: 'recode';
      from: string;
      to: string;
      name: string;
      parentCode: string | null;
      isPostable: boolean;
      isActive: boolean;
    }
  | {
      op: 'upsert';
      code: string;
      name: string;
      parentCode: string | null;
      isPostable: boolean;
      isActive: boolean;
    }
  | { op: 'reparent'; code: string; parentCode: string }
  | { op: 'delete'; code: string; moveLinesTo?: string };

const BANK_HEADER = '1120';
const CASH_GROUP = '1110';

function norm(name: string): string {
  return name.trim().toLowerCase();
}

function isCombinedMobile(account: AccountSnap): boolean {
  const name = norm(account.name);
  return name.includes('bkash') && name.includes('nagad');
}

function isDbbl(account: AccountSnap): boolean {
  return /dbbl|dutch-bangla|dutch bangla/.test(norm(account.name));
}

function isBrac(account: AccountSnap): boolean {
  return /\bbrac\b/.test(norm(account.name));
}

function isCity(account: AccountSnap): boolean {
  return /city\s*bank/.test(norm(account.name));
}

function isBkash(account: AccountSnap): boolean {
  return norm(account.name).includes('bkash') && !isCombinedMobile(account);
}

function isNagad(account: AccountSnap): boolean {
  return norm(account.name).includes('nagad') && !isCombinedMobile(account);
}

export function applyRepairPlan(
  accounts: AccountSnap[],
  ops: RepairOp[],
): AccountSnap[] {
  let rows = accounts.map((account) => ({ ...account }));
  for (const op of ops) {
    if (op.op === 'recode') {
      rows = rows.map((row) => {
        if (row.code === op.from) {
          return {
            code: op.to,
            name: op.name,
            parentCode: op.parentCode,
            isPostable: op.isPostable,
            isActive: op.isActive,
          };
        }
        if (row.parentCode === op.from) {
          return { ...row, parentCode: op.to };
        }
        return row;
      });
      continue;
    }
    if (op.op === 'upsert') {
      const index = rows.findIndex((row) => row.code === op.code);
      const next: AccountSnap = {
        code: op.code,
        name: op.name,
        parentCode: op.parentCode,
        isPostable: op.isPostable,
        isActive: op.isActive,
      };
      if (index === -1) rows.push(next);
      else rows[index] = next;
      continue;
    }
    if (op.op === 'reparent') {
      rows = rows.map((row) =>
        row.code === op.code ? { ...row, parentCode: op.parentCode } : row,
      );
      continue;
    }
    rows = rows.filter((row) => row.code !== op.code);
  }
  return rows;
}

function nextSiblingCode(rows: AccountSnap[], parentCode: string): string {
  const used = new Set(rows.map((row) => row.code));
  const siblingNums = rows
    .filter((row) => row.parentCode === parentCode)
    .map((row) => Number.parseInt(row.code, 10))
    .filter((value) => Number.isFinite(value));
  let candidate = siblingNums.length
    ? Math.max(...siblingNums) + 1
    : Number.parseInt(parentCode, 10) + 1;
  while (used.has(String(candidate))) candidate += 1;
  return String(candidate);
}

/**
 * One-time plan that frees 1120–1132 for Cash in Bank / Mobile Banking,
 * moves Client Receivables to 1151 and Advance to Staff to 1161,
 * and makes DBBL, BRAC, and City Bank siblings under 1120.
 */
export function planCashBankRepair(input: AccountSnap[]): RepairOp[] {
  const ops: RepairOp[] = [];
  let rows = input.map((account) => ({ ...account }));
  const emit = (op: RepairOp) => {
    ops.push(op);
    rows = applyRepairPlan(rows, [op]);
  };

  const freeUnless = (
    code: string,
    to: string,
    keep: (account: AccountSnap) => boolean,
    name: string,
    parentCode: string,
    isPostable: boolean,
  ) => {
    const account = rows.find((row) => row.code === code);
    if (!account || keep(account)) return;
    emit({
      op: 'recode',
      from: code,
      to,
      name,
      parentCode,
      isPostable,
      isActive: true,
    });
  };

  freeUnless('1121', '1151', isDbbl, 'Client Receivables', '1150', true);
  freeUnless(
    '1129',
    '1159',
    () => false,
    'Allowance for Doubtful Accounts',
    '1150',
    true,
  );
  freeUnless('1131', '1161', isBkash, 'Advance to Staff', '1160', true);
  freeUnless(
    '1120',
    '1150',
    (account) => !account.isPostable && norm(account.name) === 'cash in bank',
    'ACCOUNTS RECEIVABLE',
    '1100',
    false,
  );
  freeUnless(
    '1130',
    '1160',
    (account) => !account.isPostable && norm(account.name) === 'mobile banking',
    'Employee Advances',
    '1100',
    false,
  );

  const ensure = (
    code: string,
    name: string,
    parentCode: string | null,
    isPostable: boolean,
  ) => {
    const existing = rows.find((row) => row.code === code);
    if (
      existing &&
      existing.name === name &&
      existing.parentCode === parentCode &&
      existing.isPostable === isPostable &&
      existing.isActive
    ) {
      return;
    }
    emit({
      op: 'upsert',
      code,
      name,
      parentCode,
      isPostable,
      isActive: true,
    });
  };

  if (rows.some((row) => row.code === '1151' || row.code === '1159')) {
    ensure('1150', 'ACCOUNTS RECEIVABLE', '1100', false);
  }
  if (rows.some((row) => row.code === '1161')) {
    ensure('1160', 'Employee Advances', '1100', false);
  }
  ensure(CASH_GROUP, 'Cash & Bank Accounts', '1100', false);
  ensure('1111', 'Cash in Hand', CASH_GROUP, true);
  ensure(BANK_HEADER, 'Cash in Bank', CASH_GROUP, false);

  const placeLeaf = (
    match: (account: AccountSnap) => boolean,
    target: string,
    name: string,
    parentCode: string,
    legacyCodes: string[],
  ) => {
    const isLegacy = (code: string) =>
      legacyCodes.some(
        (prefix) => code === prefix || code.startsWith(`${prefix}-`),
      );
    const matches = rows.filter(
      (row) => row.isPostable && match(row) && !isCombinedMobile(row),
    );
    const atTarget = matches.find((row) => row.code === target);
    const legacy = matches.find((row) => row.code !== target && isLegacy(row.code));
    if (!atTarget && legacy) {
      emit({
        op: 'recode',
        from: legacy.code,
        to: target,
        name,
        parentCode,
        isPostable: true,
        isActive: true,
      });
    } else {
      ensure(target, name, parentCode, true);
    }
    for (const extra of matches) {
      if (extra.code === target || extra.code === legacy?.code) continue;
      if (!isLegacy(extra.code)) continue;
      if (!rows.some((row) => row.code === extra.code)) continue;
      emit({ op: 'delete', code: extra.code, moveLinesTo: target });
    }
  };

  placeLeaf(isDbbl, '1121', 'DBBL Bank A/C', BANK_HEADER, ['1113']);
  placeLeaf(isBrac, '1122', 'BRAC Bank A/C', BANK_HEADER, ['1112']);
  placeLeaf(isCity, '1123', 'City Bank A/C', BANK_HEADER, ['1112']);
  placeLeaf(isBkash, '1131', 'bKash', CASH_GROUP, ['1117']);
  placeLeaf(isNagad, '1132', 'Nagad', CASH_GROUP, ['1118']);

  for (const row of [...rows]) {
    if (!row.parentCode) continue;
    const parent = rows.find((item) => item.code === row.parentCode);
    const underLegacyHeader =
      row.parentCode === '1119' ||
      row.parentCode === '1115' ||
      row.parentCode === '1116' ||
      row.parentCode === '1114' ||
      row.parentCode === '1130';
    const underPostable = Boolean(parent?.isPostable);
    if (!underLegacyHeader && !underPostable) continue;
    if (row.code === '1111') continue;
    const parentName = parent ? norm(parent.name) : '';
    const dest =
      row.parentCode === '1130' ||
      row.parentCode === '1116' ||
      row.parentCode === '1114' ||
      parentName.includes('mobile')
        ? CASH_GROUP
        : BANK_HEADER;
    const nextCode = row.code.includes('-') ? nextSiblingCode(rows, dest) : row.code;
    if (nextCode !== row.code) {
      emit({
        op: 'recode',
        from: row.code,
        to: nextCode,
        name: row.name,
        parentCode: dest,
        isPostable: true,
        isActive: row.isActive,
      });
    } else if (row.parentCode !== dest) {
      emit({ op: 'reparent', code: row.code, parentCode: dest });
    }
  }

  for (const code of ['1114', '1115', '1116', '1117', '1118', '1119', '1130']) {
    if (!rows.some((row) => row.code === code)) continue;
    const moveLinesTo =
      code === '1114' || code === '1130'
        ? '1131'
        : code === '1115'
          ? '1111'
          : undefined;
    emit({
      op: 'delete',
      code,
      moveLinesTo,
    });
  }

  return ops;
}

async function rewriteAccountCode(
  from: string,
  to: string,
  accountId: unknown,
  accountName: string,
): Promise<void> {
  await LedgerLineModel.updateMany(
    { accountCode: from },
    { $set: { accountCode: to, accountId, accountName } },
  ).exec();
  await JournalEntryModel.updateMany(
    { 'lines.accountCode': from },
    {
      $set: {
        'lines.$[line].accountCode': to,
        'lines.$[line].accountId': accountId,
        'lines.$[line].accountName': accountName,
      },
    },
    { arrayFilters: [{ 'line.accountCode': from }] },
  ).exec();
  await AccountModel.updateMany(
    { parentCode: from },
    { $set: { parentCode: to } },
  ).exec();
  await AdvanceModel.updateMany(
    { accountCode: from },
    { $set: { accountCode: to } },
  ).exec();
  await FundTransferModel.updateMany(
    { fromAccountCode: from },
    { $set: { fromAccountCode: to } },
  ).exec();
  await FundTransferModel.updateMany(
    { toAccountCode: from },
    { $set: { toAccountCode: to } },
  ).exec();
  await ReconciliationModel.updateMany(
    { glAccountCode: from },
    { $set: { glAccountCode: to } },
  ).exec();

  const destinationTreasury = await TreasuryAccountModel.findOne({
    glAccountCode: to,
  }).exec();
  const sources = await TreasuryAccountModel.find({ glAccountCode: from }).exec();
  if (destinationTreasury) {
    for (const source of sources) {
      source.isActive = false;
      await source.save();
    }
    return;
  }
  const [first, ...rest] = sources;
  if (first) {
    first.glAccountCode = to;
    first.glAccountId = accountId as typeof first.glAccountId;
    await first.save();
  }
  for (const source of rest) {
    source.isActive = false;
    await source.save();
  }
}

export async function repairCashBankChart(): Promise<{ operations: number }> {
  const docs = await AccountModel.find().exec();
  const snap: AccountSnap[] = docs.map((account) => ({
    code: account.code,
    name: account.name,
    parentCode: account.parentCode ?? null,
    isPostable: account.isPostable,
    isActive: account.isActive,
  }));
  const ops = planCashBankRepair(snap);

  for (const op of ops) {
    if (op.op === 'recode') {
      const doc = await AccountModel.findOne({ code: op.from }).exec();
      if (!doc) continue;
      const clash = await AccountModel.findOne({ code: op.to }).exec();
      if (clash && clash._id.toString() !== doc._id.toString()) {
        throw new Error(`Cannot recode ${op.from} to ${op.to}: ${op.to} already exists`);
      }
      const previous = doc.code;
      doc.code = op.to;
      doc.name = op.name;
      doc.parentCode = op.parentCode ?? undefined;
      doc.isPostable = op.isPostable;
      doc.isActive = op.isActive;
      doc.description = op.isPostable ? doc.description : 'Header account (non-postable)';
      await doc.save();
      await rewriteAccountCode(previous, op.to, doc._id, doc.name);
      continue;
    }

    if (op.op === 'upsert') {
      const existing = await AccountModel.findOne({ code: op.code }).exec();
      if (!existing) {
        await AccountModel.create({
          code: op.code,
          name: op.name,
          type: 'asset',
          normalBalance: 'debit',
          parentCode: op.parentCode ?? undefined,
          description: op.isPostable ? undefined : 'Header account (non-postable)',
          isSystem: true,
          isPostable: op.isPostable,
          isActive: true,
        });
        continue;
      }
      existing.name = op.name;
      existing.parentCode = op.parentCode ?? undefined;
      existing.isPostable = op.isPostable;
      existing.isActive = true;
      existing.isSystem = true;
      await existing.save();
      continue;
    }

    if (op.op === 'reparent') {
      await AccountModel.updateOne(
        { code: op.code },
        { $set: { parentCode: op.parentCode } },
      ).exec();
      continue;
    }

    const doomed = await AccountModel.findOne({ code: op.code }).exec();
    if (!doomed) continue;
    if (op.moveLinesTo) {
      const target = await AccountModel.findOne({ code: op.moveLinesTo }).exec();
      if (!target) {
        throw new Error(`Cannot move lines from ${op.code} to missing ${op.moveLinesTo}`);
      }
      await rewriteAccountCode(op.code, op.moveLinesTo, target._id, target.name);
    }
    await AccountModel.updateMany(
      { parentCode: op.code },
      { $set: { parentCode: CASH_GROUP } },
    ).exec();
    await doomed.deleteOne();
  }

  if (ops.length > 0) {
    console.log(`Cash & Bank chart repair applied ${ops.length} operation(s)`);
  }
  return { operations: ops.length };
}
