import type { ClientSession } from 'mongoose';
import { Types } from 'mongoose';
import { AccountType } from '../../common/enums/account-type.enum';
import { AuditAction } from '../../common/enums/governance.enum';
import { Role } from '../../common/enums/role.enum';
import { badRequest, notFound } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  assertDebitsEqualCredits,
  fromMinorUnits,
  toMinorUnits,
} from '../../common/utils/money';
import { withTransaction } from '../../database/connection';
import type { AuditService } from '../governance/audit.service';
import type { CustomersService } from '../customers/customers.service';
import { TreasuryAccountModel } from '../banking/treasury-account.model';
import { SupplierModel } from '../procurement/supplier.model';
import type { ProjectsService } from '../projects/projects.service';
import { UserModel } from '../users/user.model';
import type { UsersService } from '../users/users.service';
import { assertManualLineDimensions } from './account-dimensions';
import { AccountsService } from './accounts.service';
import { CounterModel } from './counter.model';
import type { JournalLineDto, PostJournalDto } from './dto/journal.dto';
import {
  JournalEntityType,
  JournalStatus,
  JournalType,
  type JournalEntityType as EntityType,
  type JournalType as JournalTypeValue,
} from './journal.enums';
import { SystemAccountCode } from './system-account-codes';
import {
  JournalEntryModel,
  type IJournalLine,
  type JournalEntryDocument,
} from './journal-entry.model';
import { LedgerLineModel } from './ledger.model';

export type PreparedLine = {
  accountCode: string;
  accountName: string;
  accountId: Types.ObjectId;
  debitMinor: number;
  creditMinor: number;
  description?: string;
  projectId?: string;
  entityType?: EntityType;
  entityId?: string;
  entityName?: string;
};

export function prepareJournalLines(
  lines: JournalLineDto[],
  options: { requireBalance?: boolean } = {},
): {
  debitMinor: number;
  creditMinor: number;
  prepared: Omit<PreparedLine, 'accountId' | 'accountName' | 'entityName'>[];
} {
  const requireBalance = options.requireBalance !== false;
  let debitMinor = 0;
  let creditMinor = 0;
  const prepared = lines.map((line) => {
    const debit = toMinorUnits(line.debit ?? 0);
    const credit = toMinorUnits(line.credit ?? 0);

    if (debit > 0 && credit > 0) {
      throw badRequest(
        `Line ${line.accountCode} cannot have both debit and credit`,
      );
    }
    if (requireBalance && debit === 0 && credit === 0) {
      throw badRequest(`Line ${line.accountCode} must have a debit or a credit`);
    }

    debitMinor += debit;
    creditMinor += credit;
    return {
      accountCode: line.accountCode.trim().toUpperCase(),
      debitMinor: debit,
      creditMinor: credit,
      description: line.description?.trim(),
      projectId: line.projectId,
      entityType: line.entityType as EntityType | undefined,
      entityId: line.entityId,
    };
  });

  if (requireBalance) {
    assertDebitsEqualCredits(debitMinor, creditMinor);
  }
  return { debitMinor, creditMinor, prepared };
}

export type PublicJournalLine = {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description: string | null;
  projectId: string | null;
  entityType: string | null;
  entityId: string | null;
  entityName: string | null;
};

export type PublicJournal = {
  id: string;
  entryNumber: string;
  date: string;
  memo: string;
  reference: string | null;
  journalType: string;
  status: string;
  source: string;
  projectId: string | null;
  totalDebit: number;
  totalCredit: number;
  postedAt: string | null;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  reversedByEntryId: string | null;
  reversesEntryId: string | null;
  lines: PublicJournalLine[];
};

export type JournalListFilters = {
  projectId?: string;
  fromDate?: string;
  toDate?: string;
  status?: string;
  journalType?: string;
  accountCode?: string;
  entityType?: string;
  entityId?: string;
  search?: string;
  source?: string;
};

export type JournalSummary = {
  total: number;
  draft: number;
  pendingApproval: number;
  posted: number;
  reversed: number;
  totalDebit: number;
  totalCredit: number;
};

export class JournalService {
  private onManualPosted:
    | ((journal: PublicJournal, userId: string) => Promise<void>)
    | null = null;
  private onJournalReversed:
    | ((originalJournalId: string, userId: string) => Promise<void>)
    | null = null;
  private assertJournalReversible:
    | ((originalJournalId: string) => Promise<void>)
    | null = null;

  constructor(
    private readonly accountsService: AccountsService,
    private readonly projectsService: ProjectsService,
    private readonly auditService?: AuditService,
    private readonly usersService?: UsersService,
    private readonly customersService?: CustomersService,
  ) {}

  /** Wire AR/AP sub-ledger sync without a circular constructor dependency. */
  setArApHooks(hooks: {
    onManualPosted?: (journal: PublicJournal, userId: string) => Promise<void>;
    onJournalReversed?: (
      originalJournalId: string,
      userId: string,
    ) => Promise<void>;
    assertJournalReversible?: (originalJournalId: string) => Promise<void>;
  }): void {
    this.onManualPosted = hooks.onManualPosted ?? null;
    this.onJournalReversed = hooks.onJournalReversed ?? null;
    this.assertJournalReversible = hooks.assertJournalReversible ?? null;
  }

  private async notifyManualPosted(
    journal: PublicJournal,
    userId: string,
  ): Promise<void> {
    if (
      journal.source !== 'manual' ||
      journal.status !== JournalStatus.POSTED ||
      !this.onManualPosted
    ) {
      return;
    }
    await this.onManualPosted(journal, userId);
  }

  private async notifyReversed(
    originalJournalId: string,
    userId: string,
  ): Promise<void> {
    if (!this.onJournalReversed) return;
    await this.onJournalReversed(originalJournalId, userId);
  }

  toPublic(entry: JournalEntryDocument): PublicJournal {
    return {
      id: entry._id.toString(),
      entryNumber: entry.entryNumber,
      date: entry.date.toISOString(),
      memo: entry.memo,
      reference: entry.reference ?? null,
      journalType: entry.journalType ?? JournalType.GENERAL,
      status: entry.status,
      source: entry.source,
      projectId: entry.projectId ? entry.projectId.toString() : null,
      totalDebit: fromMinorUnits(entry.totalDebitMinor),
      totalCredit: fromMinorUnits(entry.totalCreditMinor),
      postedAt: entry.postedAt ? entry.postedAt.toISOString() : null,
      createdBy: entry.createdBy
        ? entry.createdBy.toString()
        : entry.postedBy
          ? entry.postedBy.toString()
          : null,
      approvedBy: entry.approvedBy ? entry.approvedBy.toString() : null,
      approvedAt: entry.approvedAt ? entry.approvedAt.toISOString() : null,
      reversedByEntryId: entry.reversedByEntryId
        ? entry.reversedByEntryId.toString()
        : null,
      reversesEntryId: entry.reversesEntryId
        ? entry.reversesEntryId.toString()
        : null,
      lines: entry.lines.map((line) => ({
        accountCode: line.accountCode,
        accountName: line.accountName,
        debit: fromMinorUnits(line.debitMinor),
        credit: fromMinorUnits(line.creditMinor),
        description: line.description ?? null,
        projectId: line.projectId ? line.projectId.toString() : null,
        entityType: line.entityType ?? null,
        entityId: line.entityId ? line.entityId.toString() : null,
        entityName: line.entityName ?? null,
      })),
    };
  }

  /**
   * Immediate post — used by system modules and manual "Post".
   * Always balanced; writes ledger lines.
   */
  async post(
    dto: PostJournalDto,
    userId: string,
    source: 'manual' | 'system' = 'manual',
  ): Promise<PublicJournal> {
    return this.persistJournal(dto, userId, {
      source,
      status: JournalStatus.POSTED,
      requireBalance: true,
      writeLedger: true,
    });
  }

  /**
   * Balanced Opening Balance for a newly created postable account.
   * Debit-normal (asset/expense): Dr account / Cr owner capital (3100).
   * Credit-normal (liability/equity/revenue): Cr account / Dr owner capital.
   * Creating 3100 itself: Dr cash (1111) / Cr 3100.
   */
  async postOpeningBalanceForNewAccount(input: {
    accountCode: string;
    accountType: AccountType;
    amount: number;
    userId: string;
    date?: string;
  }): Promise<PublicJournal> {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount < 0.01) {
      throw badRequest('Opening balance must be at least 0.01');
    }

    const code = input.accountCode.trim().toUpperCase();
    const entityRequiredCodes = [
      SystemAccountCode.ACCOUNTS_RECEIVABLE,
      SystemAccountCode.ACCOUNTS_PAYABLE,
      SystemAccountCode.SUBCONTRACTOR_PAYABLE,
      SystemAccountCode.EMPLOYEE_ADVANCES,
      SystemAccountCode.EMPLOYEE_PAYABLES,
    ] as const;
    if ((entityRequiredCodes as readonly string[]).includes(code)) {
      throw badRequest(
        `Opening balance on ${code} needs a customer/supplier/employee. Create the account without amount, then post an Opening Balance journal with the entity selected.`,
      );
    }

    const account = await this.accountsService.findByCodeOrFail(code);
    if (!account.isPostable) {
      throw badRequest('Opening balance is only allowed on postable (leaf) accounts');
    }
    if (!account.isActive) {
      throw badRequest(`Account ${code} is inactive`);
    }

    const capitalCode = SystemAccountCode.OWNER_CAPITAL;
    const cashCode = SystemAccountCode.CASH;
    let lines: JournalLineDto[];

    if (code === capitalCode) {
      await this.accountsService.findByCodeOrFail(cashCode);
      lines = [
        {
          accountCode: cashCode,
          debit: amount,
          description: `Opening balance for ${code}`,
        },
        {
          accountCode: capitalCode,
          credit: amount,
          description: `Opening capital ${code}`,
        },
      ];
    } else {
      await this.accountsService.findByCodeOrFail(capitalCode);
      const isDebitNormal =
        input.accountType === AccountType.ASSET ||
        input.accountType === AccountType.EXPENSE;
      if (isDebitNormal) {
        lines = [
          {
            accountCode: code,
            debit: amount,
            description: `Opening balance ${code}`,
          },
          {
            accountCode: capitalCode,
            credit: amount,
            description: `Opening equity offset for ${code}`,
          },
        ];
      } else {
        lines = [
          {
            accountCode: capitalCode,
            debit: amount,
            description: `Opening equity offset for ${code}`,
          },
          {
            accountCode: code,
            credit: amount,
            description: `Opening balance ${code}`,
          },
        ];
      }
    }

    const date =
      input.date && !Number.isNaN(new Date(input.date).getTime())
        ? new Date(input.date).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);

    return this.post(
      {
        date,
        memo: `Opening balance for account ${code}`,
        reference: `OB-${code}`,
        journalType: JournalType.OPENING_BALANCE,
        lines,
        intent: 'post',
      },
      input.userId,
      'manual',
    );
  }

  /** Save/update draft — may be unbalanced; no ledger impact. */
  async saveDraft(dto: PostJournalDto, userId: string): Promise<PublicJournal> {
    return this.persistJournal(dto, userId, {
      source: 'manual',
      status: JournalStatus.DRAFT,
      requireBalance: false,
      writeLedger: false,
    });
  }

  async update(
    id: string,
    dto: PostJournalDto,
    userId: string,
  ): Promise<PublicJournal> {
    const existing = await this.findByIdOrFail(id);
    if (existing.source === 'system') {
      throw badRequest('System-generated journals cannot be edited');
    }
    if (existing.status === JournalStatus.REVERSED) {
      throw badRequest('Cannot edit a reversed journal');
    }
    if (existing.status === JournalStatus.POSTED) {
      throw badRequest('Posted journals cannot be edited — create a reversal');
    }
    if (
      existing.status !== JournalStatus.DRAFT &&
      existing.status !== JournalStatus.REJECTED &&
      existing.status !== JournalStatus.APPROVED
    ) {
      throw badRequest(`Cannot edit journal in status ${existing.status}`);
    }

    const asDraft =
      existing.status === JournalStatus.DRAFT ||
      existing.status === JournalStatus.REJECTED ||
      dto.intent === 'draft';

    return this.rewriteEditableJournal(existing, dto, userId, {
      status: asDraft
        ? JournalStatus.DRAFT
        : existing.status === JournalStatus.APPROVED
          ? JournalStatus.APPROVED
          : JournalStatus.DRAFT,
      requireBalance: !asDraft && dto.intent === 'post',
      writeLedger: false,
      postNow: dto.intent === 'post',
    });
  }

  async postExisting(id: string, userId: string): Promise<PublicJournal> {
    const existing = await this.findByIdOrFail(id);
    if (existing.source === 'system') {
      throw badRequest('System journals are already posted');
    }
    if (
      existing.status !== JournalStatus.DRAFT &&
      existing.status !== JournalStatus.APPROVED &&
      existing.status !== JournalStatus.REJECTED
    ) {
      throw badRequest(`Cannot post journal in status ${existing.status}`);
    }

    const dto: PostJournalDto = {
      date: existing.date.toISOString(),
      memo: existing.memo,
      reference: existing.reference,
      journalType: existing.journalType,
      projectId: existing.projectId?.toString(),
      lines: existing.lines.map((line) => ({
        accountCode: line.accountCode,
        debit: fromMinorUnits(line.debitMinor) || undefined,
        credit: fromMinorUnits(line.creditMinor) || undefined,
        description: line.description,
        projectId: line.projectId?.toString(),
        entityType: line.entityType,
        entityId: line.entityId?.toString(),
      })),
      intent: 'post',
    };

    return this.rewriteEditableJournal(existing, dto, userId, {
      status: JournalStatus.POSTED,
      requireBalance: true,
      writeLedger: true,
      postNow: true,
    });
  }

  async delete(id: string, userId: string): Promise<{ id: string; entryNumber: string }> {
    const existing = await this.findByIdOrFail(id);
    if (existing.source === 'system') {
      throw badRequest('System-generated journals cannot be deleted');
    }
    if (existing.status === JournalStatus.POSTED) {
      throw badRequest('Posted journals cannot be deleted — reverse instead');
    }
    if (existing.status === JournalStatus.REVERSED) {
      throw badRequest('Reversed journals cannot be deleted');
    }
    if (
      existing.status !== JournalStatus.DRAFT &&
      existing.status !== JournalStatus.REJECTED &&
      existing.status !== JournalStatus.CANCELLED
    ) {
      throw badRequest(`Cannot delete journal in status ${existing.status}`);
    }
    if (existing.reversedByEntryId || existing.reversesEntryId) {
      throw badRequest('Linked reversal journals cannot be deleted');
    }

    const snapshot = this.toPublic(existing);
    await JournalEntryModel.deleteOne({ _id: existing._id }).exec();

    await this.auditLedgerWrite(
      userId,
      AuditAction.DELETE,
      { id: snapshot.id, entryNumber: snapshot.entryNumber, deleted: true },
      `Journal deleted: ${snapshot.entryNumber}`,
      snapshot as unknown as Record<string, unknown>,
    );

    return { id: snapshot.id, entryNumber: snapshot.entryNumber };
  }

  async findByIdOrFail(id: string): Promise<JournalEntryDocument> {
    const entry = await JournalEntryModel.findById(id).exec();
    if (!entry) {
      throw notFound('Journal entry not found');
    }
    return entry;
  }

  async list(
    limit = 200,
    filters: JournalListFilters = {},
  ): Promise<PublicJournal[]> {
    const filter = this.buildListFilter(filters);
    const entries = await JournalEntryModel.find(filter)
      .sort({ date: -1, entryNumber: -1 })
      .limit(limit)
      .exec();
    return entries.map((entry) => this.toPublic(entry));
  }

  async summary(filters: JournalListFilters = {}): Promise<JournalSummary> {
    const filter = this.buildListFilter(filters);
    const rows = await JournalEntryModel.find(filter)
      .select('status totalDebitMinor totalCreditMinor')
      .exec();
    const summary: JournalSummary = {
      total: rows.length,
      draft: 0,
      pendingApproval: 0,
      posted: 0,
      reversed: 0,
      totalDebit: 0,
      totalCredit: 0,
    };
    for (const row of rows) {
      if (row.status === JournalStatus.DRAFT) summary.draft += 1;
      if (row.status === JournalStatus.PENDING_APPROVAL) {
        summary.pendingApproval += 1;
      }
      if (row.status === JournalStatus.POSTED) summary.posted += 1;
      if (row.status === JournalStatus.REVERSED) summary.reversed += 1;
      if (row.status === JournalStatus.POSTED) {
        summary.totalDebit += fromMinorUnits(row.totalDebitMinor);
        summary.totalCredit += fromMinorUnits(row.totalCreditMinor);
      }
    }
    summary.totalDebit = Number(summary.totalDebit.toFixed(2));
    summary.totalCredit = Number(summary.totalCredit.toFixed(2));
    return summary;
  }

  async reverse(id: string, userId: string): Promise<PublicJournal> {
    const original = await this.findByIdOrFail(id);
    if (original.status !== JournalStatus.POSTED) {
      throw badRequest('Only posted journals can be reversed');
    }

    if (this.assertJournalReversible) {
      await this.assertJournalReversible(original._id.toString());
    }

    const reversing = await this.post(
      {
        date: new Date().toISOString(),
        memo: `Reversal of ${original.entryNumber}`,
        reference: original.entryNumber,
        journalType: original.journalType ?? JournalType.GENERAL,
        projectId: original.projectId?.toString(),
        lines: original.lines.map((line) => ({
          accountCode: line.accountCode,
          debit: fromMinorUnits(line.creditMinor),
          credit: fromMinorUnits(line.debitMinor),
          description: `Reversal of ${original.entryNumber}`,
          projectId: line.projectId?.toString(),
          entityType: line.entityType,
          entityId: line.entityId?.toString(),
        })),
      },
      userId,
      'system',
    );

    original.status = JournalStatus.REVERSED;
    original.reversedByEntryId = new Types.ObjectId(reversing.id);
    await original.save();

    await JournalEntryModel.updateOne(
      { _id: reversing.id },
      { $set: { reversesEntryId: original._id } },
    ).exec();

    await this.auditLedgerWrite(
      userId,
      AuditAction.UPDATE,
      {
        originalId: original._id.toString(),
        originalNumber: original.entryNumber,
        reversingId: reversing.id,
        reversingNumber: reversing.entryNumber,
      },
      `Journal reversed: ${original.entryNumber} → ${reversing.entryNumber}`,
      {
        id: original._id.toString(),
        status: 'posted',
      },
    );

    await this.notifyReversed(original._id.toString(), userId);

    return reversing;
  }

  private buildListFilter(filters: JournalListFilters): Record<string, unknown> {
    const filter: Record<string, unknown> = {};
    if (filters.projectId && Types.ObjectId.isValid(filters.projectId)) {
      filter.$or = [
        { projectId: new Types.ObjectId(filters.projectId) },
        { 'lines.projectId': new Types.ObjectId(filters.projectId) },
      ];
    }
    if (filters.status) filter.status = filters.status;
    if (filters.journalType) filter.journalType = filters.journalType;
    if (filters.source) filter.source = filters.source;
    if (filters.accountCode) {
      filter['lines.accountCode'] = filters.accountCode.trim().toUpperCase();
    }
    if (filters.entityType) filter['lines.entityType'] = filters.entityType;
    if (filters.entityId && Types.ObjectId.isValid(filters.entityId)) {
      filter['lines.entityId'] = new Types.ObjectId(filters.entityId);
    }
    if (filters.fromDate || filters.toDate) {
      const dateFilter: { $gte?: Date; $lte?: Date } = {};
      if (filters.fromDate) {
        const from = new Date(filters.fromDate);
        if (Number.isNaN(from.getTime())) throw badRequest('Invalid fromDate');
        dateFilter.$gte = from;
      }
      if (filters.toDate) {
        const to = new Date(filters.toDate);
        if (Number.isNaN(to.getTime())) throw badRequest('Invalid toDate');
        to.setUTCHours(23, 59, 59, 999);
        dateFilter.$lte = to;
      }
      filter.date = dateFilter;
    }
    if (filters.search?.trim()) {
      const needle = filters.search.trim();
      const searchOr = [
        { entryNumber: new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        { memo: new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        { reference: new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        {
          'lines.entityName': new RegExp(
            needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            'i',
          ),
        },
        {
          'lines.accountCode': new RegExp(
            needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            'i',
          ),
        },
      ];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or as unknown[] }, { $or: searchOr }];
        delete filter.$or;
      } else {
        filter.$or = searchOr;
      }
    }
    return filter;
  }

  private async persistJournal(
    dto: PostJournalDto,
    userId: string,
    options: {
      source: 'manual' | 'system';
      status: typeof JournalStatus.POSTED | typeof JournalStatus.DRAFT;
      requireBalance: boolean;
      writeLedger: boolean;
    },
  ): Promise<PublicJournal> {
    const { debitMinor, creditMinor, prepared } = prepareJournalLines(dto.lines, {
      requireBalance: options.requireBalance,
    });
    const date = new Date(dto.date);
    if (Number.isNaN(date.getTime())) {
      throw badRequest('Invalid journal date');
    }

    await this.assertProjects(dto, prepared);
    const resolved = await this.resolveLines(
      prepared,
      dto.projectId,
      options.source,
    );

    const journalType = (dto.journalType as JournalTypeValue) || JournalType.GENERAL;
    const postedAt = options.writeLedger ? new Date() : undefined;

    const entry = await withTransaction(async (session) => {
      const entryNumber = await this.nextEntryNumber(date, session);
      const [created] = await JournalEntryModel.create(
        [
          {
            entryNumber,
            date,
            memo: dto.memo.trim(),
            reference: dto.reference?.trim(),
            journalType,
            status: options.status,
            source: options.source,
            projectId: dto.projectId
              ? new Types.ObjectId(dto.projectId)
              : undefined,
            lines: resolved.lines,
            totalDebitMinor: debitMinor,
            totalCreditMinor: creditMinor,
            postedAt,
            postedBy: options.writeLedger
              ? new Types.ObjectId(userId)
              : undefined,
            createdBy: new Types.ObjectId(userId),
          },
        ],
        { session },
      );

      if (options.writeLedger) {
        await this.writeLedgerLines(
          created,
          resolved.byCode,
          dto.memo.trim(),
          session,
        );
      }

      return created;
    });

    const publicEntry = this.toPublic(entry);
    await this.auditLedgerWrite(
      userId,
      AuditAction.CREATE,
      publicEntry,
      options.writeLedger
        ? `Journal posted: ${publicEntry.entryNumber}`
        : `Journal draft saved: ${publicEntry.entryNumber}`,
    );
    if (options.writeLedger) {
      try {
        await this.notifyManualPosted(publicEntry, userId);
      } catch (error) {
        await LedgerLineModel.deleteMany({ journalEntryId: entry._id }).exec();
        await JournalEntryModel.deleteOne({ _id: entry._id }).exec();
        throw error;
      }
    }
    return publicEntry;
  }

  private async rewriteEditableJournal(
    existing: JournalEntryDocument,
    dto: PostJournalDto,
    userId: string,
    options: {
      status: string;
      requireBalance: boolean;
      writeLedger: boolean;
      postNow: boolean;
    },
  ): Promise<PublicJournal> {
    const requireBalance = options.postNow || options.requireBalance;
    const { debitMinor, creditMinor, prepared } = prepareJournalLines(dto.lines, {
      requireBalance,
    });
    const date = new Date(dto.date);
    if (Number.isNaN(date.getTime())) {
      throw badRequest('Invalid journal date');
    }

    await this.assertProjects(dto, prepared);
    const resolved = await this.resolveLines(prepared, dto.projectId, 'manual');
    const before = this.toPublic(existing);
    const journalType =
      (dto.journalType as JournalTypeValue) ||
      existing.journalType ||
      JournalType.GENERAL;

    const updated = await withTransaction(async (session) => {
      existing.date = date;
      existing.memo = dto.memo.trim();
      existing.reference = dto.reference?.trim();
      existing.journalType = journalType;
      existing.projectId = dto.projectId
        ? new Types.ObjectId(dto.projectId)
        : undefined;
      existing.lines = resolved.lines;
      existing.totalDebitMinor = debitMinor;
      existing.totalCreditMinor = creditMinor;
      existing.status = options.postNow
        ? JournalStatus.POSTED
        : (options.status as typeof JournalStatus.DRAFT);

      if (options.postNow) {
        existing.postedAt = new Date();
        existing.postedBy = new Types.ObjectId(userId);
      }

      await existing.save({ session });

      await LedgerLineModel.deleteMany(
        { journalEntryId: existing._id },
        { session },
      ).exec();

      if (options.writeLedger || options.postNow) {
        await this.writeLedgerLines(
          existing,
          resolved.byCode,
          dto.memo.trim(),
          session,
        );
      }

      return existing;
    });

    const publicEntry = this.toPublic(updated);
    await this.auditLedgerWrite(
      userId,
      AuditAction.UPDATE,
      publicEntry,
      options.postNow
        ? `Journal posted: ${publicEntry.entryNumber}`
        : `Journal updated: ${publicEntry.entryNumber}`,
      before as unknown as Record<string, unknown>,
    );
    if (options.postNow) {
      await this.notifyManualPosted(publicEntry, userId);
    }
    return publicEntry;
  }

  private async assertProjects(
    dto: PostJournalDto,
    prepared: Array<{ projectId?: string }>,
  ): Promise<void> {
    const projectIds = new Set<string>();
    if (dto.projectId) projectIds.add(dto.projectId);
    for (const line of prepared) {
      if (line.projectId) projectIds.add(line.projectId);
    }
    for (const projectId of projectIds) {
      await this.projectsService.assertExists(projectId);
    }
  }

  private async resolveLines(
    prepared: Omit<PreparedLine, 'accountId' | 'accountName' | 'entityName'>[],
    headerProjectId: string | undefined,
    source: 'manual' | 'system',
  ): Promise<{
    lines: IJournalLine[];
    byCode: Map<string, { _id: Types.ObjectId; code: string; name: string; type: string }>;
  }> {
    const accounts = await this.accountsService.findPostableByCodes(
      prepared.map((line) => line.accountCode),
    );
    const byCode = new Map(
      accounts.map((account) => [
        account.code,
        {
          _id: account._id,
          code: account.code,
          name: account.name,
          type: account.type,
        },
      ]),
    );

    const lines: IJournalLine[] = [];
    for (const line of prepared) {
      const account = byCode.get(line.accountCode);
      if (!account) {
        throw badRequest(`Account ${line.accountCode} is not postable`);
      }
      const projectId = line.projectId ?? headerProjectId;

      if (source === 'manual') {
        assertManualLineDimensions({
          accountCode: line.accountCode,
          entityType: line.entityType,
          entityId: line.entityId,
          projectId: line.projectId,
          headerProjectId,
        });
      }

      let entityType = line.entityType;
      let entityId = line.entityId;
      let entityName: string | undefined;

      if (entityId) {
        const resolved = await this.resolveEntity(
          entityType,
          entityId,
          line.accountCode,
        );
        entityType = resolved.entityType;
        entityId = resolved.entityId;
        entityName = resolved.entityName;
      }

      lines.push({
        accountId: account._id,
        accountCode: account.code,
        accountName: account.name,
        debitMinor: line.debitMinor,
        creditMinor: line.creditMinor,
        description: line.description,
        projectId: projectId ? new Types.ObjectId(projectId) : undefined,
        entityType,
        entityId: entityId ? new Types.ObjectId(entityId) : undefined,
        entityName,
      });
    }

    return { lines, byCode };
  }

  private async resolveEntity(
    entityType: EntityType | undefined,
    entityId: string,
    accountCode: string,
  ): Promise<{ entityType: EntityType; entityId: string; entityName: string }> {
    if (!Types.ObjectId.isValid(entityId)) {
      throw badRequest('Invalid entity id');
    }

    let type = entityType;
    if (!type) {
      if (accountCode === SystemAccountCode.ACCOUNTS_RECEIVABLE) {
        type = JournalEntityType.CUSTOMER;
      } else if (
        accountCode === SystemAccountCode.ACCOUNTS_PAYABLE ||
        accountCode === SystemAccountCode.SUBCONTRACTOR_PAYABLE
      ) {
        type = JournalEntityType.SUPPLIER;
      } else if (
        accountCode === SystemAccountCode.EMPLOYEE_ADVANCES ||
        accountCode === SystemAccountCode.EMPLOYEE_PAYABLES
      ) {
        type = JournalEntityType.EMPLOYEE;
      } else if (
        accountCode === SystemAccountCode.CASH ||
        accountCode === SystemAccountCode.BANK ||
        accountCode === SystemAccountCode.BANK_ALT ||
        accountCode === SystemAccountCode.MOBILE_BANKING
      ) {
        type = JournalEntityType.TREASURY;
      } else {
        throw badRequest('entityType is required when entityId is set');
      }
    }

    if (type === JournalEntityType.CUSTOMER) {
      if (!this.customersService) {
        throw badRequest('Customer service unavailable');
      }
      const customer = await this.customersService.assertExists(entityId);
      return {
        entityType: type,
        entityId,
        entityName: customer.name,
      };
    }

    if (type === JournalEntityType.SUPPLIER) {
      const supplier = await SupplierModel.findById(entityId).exec();
      if (!supplier || !supplier.isActive) {
        throw notFound('Supplier not found');
      }
      return { entityType: type, entityId, entityName: supplier.name };
    }

    if (type === JournalEntityType.EMPLOYEE) {
      const user = await UserModel.findById(entityId).exec();
      if (!user || !user.isActive) {
        throw notFound('Employee not found');
      }
      return {
        entityType: type,
        entityId,
        entityName: `${user.firstName} ${user.lastName}`.trim(),
      };
    }

    if (type === JournalEntityType.TREASURY) {
      const treasury = await TreasuryAccountModel.findById(entityId).exec();
      if (!treasury || !treasury.isActive) {
        throw notFound('Treasury account not found');
      }
      return { entityType: type, entityId, entityName: treasury.name };
    }

    throw badRequest(`Unsupported entity type: ${type}`);
  }

  private async writeLedgerLines(
    entry: JournalEntryDocument,
    byCode: Map<string, { _id: Types.ObjectId; code: string; name: string; type: string }>,
    _memo: string,
    session: ClientSession,
  ): Promise<void> {
    await LedgerLineModel.insertMany(
      entry.lines.map((line) => {
        const account = byCode.get(line.accountCode)!;
        const lineDescription = line.description?.trim();
        return {
          journalEntryId: entry._id,
          journalEntryNumber: entry.entryNumber,
          accountId: line.accountId,
          accountCode: line.accountCode,
          accountName: line.accountName,
          accountType: account.type,
          date: entry.date,
          memo: entry.memo,
          description: lineDescription || entry.memo,
          reference: entry.reference,
          debitMinor: line.debitMinor,
          creditMinor: line.creditMinor,
          projectId: line.projectId,
          entityType: line.entityType,
          entityId: line.entityId,
          entityName: line.entityName,
        };
      }),
      { session },
    );
  }

  private async auditLedgerWrite(
    userId: string,
    action: AuditAction,
    after: Record<string, unknown> | PublicJournal,
    summary: string,
    before?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.auditService) {
      return;
    }
    let actor: AuthenticatedUser = {
      userId,
      email: 'unknown@local',
      role: Role.ADMIN,
    };
    if (this.usersService && Types.ObjectId.isValid(userId)) {
      const user = await this.usersService.findById(userId);
      if (user) {
        actor = {
          userId: user._id.toString(),
          email: user.email,
          role: user.role,
        };
      }
    }
    const entityId =
      typeof after === 'object' && after && 'id' in after
        ? String((after as { id: string }).id)
        : userId;
    await this.auditService.record({
      action,
      entityType: 'journal_entry',
      entityId,
      actor,
      summary,
      before: before ?? null,
      after: after as Record<string, unknown>,
    });
  }

  private async nextEntryNumber(
    date: Date,
    session: ClientSession,
  ): Promise<string> {
    const year = date.getUTCFullYear();
    const counter = await CounterModel.findOneAndUpdate(
      { key: `journal:${year}` },
      { $inc: { seq: 1 } },
      { upsert: true, new: true, session },
    );
    const seq = counter?.seq ?? 1;
    return `JE-${year}-${String(seq).padStart(5, '0')}`;
  }
}
