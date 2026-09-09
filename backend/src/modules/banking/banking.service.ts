import { AccountType } from '../../common/enums/account-type.enum';
import {
  isBankLike,
  isCashLike,
  TreasuryKind,
  TREASURY_PARENT_CODE,
} from '../../common/enums/treasury-kind.enum';
import { TransferKind } from '../../common/enums/transfer-kind.enum';
import { badRequest, conflict, notFound } from '../../common/errors/app-error';
import { fromMinorUnits, toMinorUnits } from '../../common/utils/money';
import { AccountModel } from '../accounting/account.model';
import { AccountsService } from '../accounting/accounts.service';
import { CounterModel } from '../accounting/counter.model';
import type { JournalService } from '../accounting/journal.service';
import { LedgerLineModel } from '../accounting/ledger.model';
import { LedgerService } from '../accounting/ledger.service';
import { JournalEntryModel } from '../accounting/journal-entry.model';
import { SystemAccountCode } from '../accounting/system-account-codes';
import { ProjectModel } from '../projects/project.model';
import {
  autoMatchStatementLines,
  parseStatementCsvDetailed,
  toSignedMinorUnits,
} from './csv';
import {
  bufferFromPdfBase64,
  parseStatementPdfDetailed,
} from './pdf-statement';
import { buildStatementParseResult } from './statement-meta';
import type {
  AdjustReconciliationDto,
  CreateTransferDto,
  CreateTreasuryAccountDto,
  ImportReconciliationDto,
  PreviewStatementDto,
  UpdateTreasuryAccountDto,
} from './dto/banking.dto';
import { BankAdjustKind } from './dto/banking.dto';
import {
  FundTransferModel,
  type FundTransferDocument,
} from './fund-transfer.model';
import {
  ReconciliationModel,
  type IStatementLine,
  type ReconciliationDocument,
} from './reconciliation.model';
import {
  TreasuryAccountModel,
  type TreasuryAccountDocument,
} from './treasury-account.model';
import { Types } from 'mongoose';

export type PublicTreasuryAccount = {
  id: string;
  name: string;
  kind: TreasuryKind;
  institution: string | null;
  accountNumber: string | null;
  glAccountCode: string;
  currency: string;
  isActive: boolean;
  isSystem: boolean;
  bookBalance: number;
};

export type PublicFundTransfer = {
  id: string;
  transferNumber: string;
  kind: TransferKind;
  date: string;
  amount: number;
  memo: string;
  reference: string | null;
  fromTreasuryId: string;
  toTreasuryId: string;
  fromAccountCode: string;
  toAccountCode: string;
  journalEntryId: string;
  journalEntryNumber: string;
};

export type PublicStatementLine = {
  id: string;
  date: string;
  description: string;
  amount: number;
  debit: number;
  credit: number;
  reference: string | null;
  status: string;
  matchedLedgerLineId: string | null;
  reconciledDate: string | null;
};

export type PublicReconciliation = {
  id: string;
  reconciliationNumber: string;
  treasuryAccountId: string;
  glAccountCode: string;
  asOf: string;
  openingBalance: number | null;
  statementBalance: number;
  bookBalance: number;
  /** Statement ending + uncollected deposits − unpresented cheques */
  calculatedBookBalance: number;
  uncollectedDeposits: number;
  unpresentedCheques: number;
  difference: number;
  fileName: string | null;
  status: string;
  displayStatus: 'draft' | 'partially_reconciled' | 'reconciled';
  matchedCount: number;
  unmatchedStatementCount: number;
  isReconciled: boolean;
  lines: PublicStatementLine[];
  unmatchedBook: Array<{
    id: string;
    date: string;
    entryNumber: string;
    memo: string;
    reference: string | null;
    debit: number;
    credit: number;
  }>;
};

const DEFAULT_TREASURY: Array<{
  name: string;
  kind: TreasuryKind;
  glAccountCode: string;
  institution?: string;
}> = [
  {
    name: 'Hand Cash',
    kind: TreasuryKind.CASH,
    glAccountCode: SystemAccountCode.CASH,
  },
  {
    name: 'BRAC Bank',
    kind: TreasuryKind.COMMERCIAL_BANK,
    glAccountCode: SystemAccountCode.BANK,
    institution: 'BRAC Bank',
  },
  {
    name: 'Mobile Banking (bKash / Nagad)',
    kind: TreasuryKind.MOBILE_BANKING,
    glAccountCode: SystemAccountCode.MOBILE_BANKING,
    institution: 'bKash / Nagad',
  },
];

/** Legacy duplicate cash GL — same as Hand Cash; deactivate if still linked. */
const LEGACY_CASH_IN_HAND_CODE = '1115';

export class BankingService {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly journalService: JournalService,
    private readonly ledgerService: LedgerService,
  ) {}

  async seedDefaults(): Promise<void> {
    let created = 0;
    for (const row of DEFAULT_TREASURY) {
      const existing = await TreasuryAccountModel.findOne({
        glAccountCode: row.glAccountCode,
      }).exec();
      if (existing) {
        let dirty = false;
        if (existing.name !== row.name) {
          existing.name = row.name;
          dirty = true;
        }
        if (existing.kind !== row.kind) {
          existing.kind = row.kind;
          dirty = true;
        }
        if (row.institution && existing.institution !== row.institution) {
          existing.institution = row.institution;
          dirty = true;
        }
        if (!existing.isActive) {
          existing.isActive = true;
          dirty = true;
        }
        if (!existing.isSystem) {
          existing.isSystem = true;
          dirty = true;
        }
        if (dirty) {
          await existing.save();
        }
        continue;
      }
      const gl = await this.accountsService.findByCodeOrFail(row.glAccountCode);
      await TreasuryAccountModel.create({
        name: row.name,
        kind: row.kind,
        institution: row.institution,
        glAccountId: gl._id,
        glAccountCode: gl.code,
        currency: 'BDT',
        isActive: true,
        isSystem: true,
      });
      created += 1;
    }

    // Align Hand Cash GL display name with CoA / treasury label.
    const cashGl = await AccountModel.findOne({
      code: SystemAccountCode.CASH,
    }).exec();
    if (cashGl && cashGl.name !== 'Hand Cash') {
      cashGl.name = 'Hand Cash';
      await cashGl.save();
    }

    // Retire duplicate "Cash in Hand" (1115) — same concept as Hand Cash (1111).
    const legacyCash = await TreasuryAccountModel.findOne({
      glAccountCode: LEGACY_CASH_IN_HAND_CODE,
    }).exec();
    if (legacyCash && legacyCash.isActive) {
      legacyCash.isActive = false;
      legacyCash.isSystem = false;
      await legacyCash.save();
      console.log(
        'Deactivated legacy treasury "Cash in Hand" (1115); use Hand Cash (1111)',
      );
    }

    const legacyGl = await AccountModel.findOne({
      code: LEGACY_CASH_IN_HAND_CODE,
    }).exec();
    if (legacyGl && legacyGl.isActive) {
      legacyGl.isActive = false;
      await legacyGl.save();
    }

    if (created > 0) {
      console.log(`Seeded ${created} treasury account(s)`);
    }
  }

  async create(
    dto: CreateTreasuryAccountDto,
    userId?: string,
  ): Promise<PublicTreasuryAccount> {
    let glCode = dto.glAccountCode?.trim().toUpperCase();
    if (glCode) {
      const existingLink = await TreasuryAccountModel.findOne({
        glAccountCode: glCode,
      }).exec();
      if (existingLink) {
        throw conflict(`GL account ${glCode} is already a treasury account`);
      }
      const gl = await this.accountsService.findByCodeOrFail(glCode);
      if (gl.type !== AccountType.ASSET) {
        throw badRequest('Treasury accounts must post to an asset account');
      }
      if (!gl.isPostable || !gl.isActive) {
        throw badRequest(`Account ${glCode} is not postable`);
      }
      const created = await TreasuryAccountModel.create({
        name: dto.name.trim(),
        kind: dto.kind,
        institution: dto.institution?.trim(),
        accountNumber: dto.accountNumber?.trim(),
        glAccountId: gl._id,
        glAccountCode: gl.code,
        currency: 'BDT',
        isActive: true,
        isSystem: false,
        createdBy: userId ? new Types.ObjectId(userId) : undefined,
      });
      return this.toPublicTreasury(created, 0);
    }

    const parentCode = TREASURY_PARENT_CODE[dto.kind];
    glCode = await this.nextChildCode(parentCode);
    const gl = await this.accountsService.create({
      code: glCode,
      name: dto.name.trim(),
      type: AccountType.ASSET,
      parentCode,
      description: `${dto.kind} treasury account`,
      isPostable: true,
    });
    const glDoc = await this.accountsService.findByCodeOrFail(gl.code);
    const created = await TreasuryAccountModel.create({
      name: dto.name.trim(),
      kind: dto.kind,
      institution: dto.institution?.trim(),
      accountNumber: dto.accountNumber?.trim(),
      glAccountId: glDoc._id,
      glAccountCode: glDoc.code,
      currency: 'BDT',
      isActive: true,
      isSystem: false,
      createdBy: userId ? new Types.ObjectId(userId) : undefined,
    });
    return this.toPublicTreasury(created, 0);
  }

  async list(): Promise<PublicTreasuryAccount[]> {
    const accounts = await TreasuryAccountModel.find({ isActive: true })
      .sort({ kind: 1, name: 1 })
      .exec();
    const balances = await this.balancesByCode(
      accounts.map((account) => account.glAccountCode),
    );
    return accounts.map((account) =>
      this.toPublicTreasury(
        account,
        balances.get(account.glAccountCode) ?? 0,
      ),
    );
  }

  async getById(id: string): Promise<PublicTreasuryAccount> {
    const account = await this.findTreasuryOrFail(id);
    const balance = await this.bookBalanceMinor(account.glAccountCode);
    return this.toPublicTreasury(account, balance);
  }

  async requireActive(id: string): Promise<PublicTreasuryAccount> {
    const account = await this.getById(id);
    if (!account.isActive) {
      throw badRequest('Treasury account is inactive');
    }
    return account;
  }

  async update(
    id: string,
    dto: UpdateTreasuryAccountDto,
  ): Promise<PublicTreasuryAccount> {
    const account = await this.findTreasuryOrFail(id);
    if (dto.name) account.name = dto.name.trim();
    if (dto.institution !== undefined) {
      account.institution = dto.institution.trim();
    }
    if (dto.accountNumber !== undefined) {
      account.accountNumber = dto.accountNumber.trim();
    }
    if (dto.isActive !== undefined) {
      if (account.isSystem && dto.isActive === false) {
        throw badRequest('Cannot deactivate a system treasury account');
      }
      account.isActive = dto.isActive;
    }
    await account.save();
    return this.getById(id);
  }

  async transfer(
    dto: CreateTransferDto,
    userId: string,
  ): Promise<PublicFundTransfer> {
    if (dto.fromTreasuryId === dto.toTreasuryId) {
      throw badRequest('Source and destination accounts must be different');
    }
    const from = await this.findTreasuryOrFail(dto.fromTreasuryId);
    const to = await this.findTreasuryOrFail(dto.toTreasuryId);
    if (!from.isActive || !to.isActive) {
      throw badRequest('Both treasury accounts must be active');
    }

    const kind = dto.kind ?? inferTransferKind(from.kind, to.kind);
    assertTransferKind(kind, from.kind, to.kind);

    const date = new Date(dto.date);
    if (Number.isNaN(date.getTime())) {
      throw badRequest('Invalid transfer date');
    }

    const amountMinor = toMinorUnits(dto.amount);
    const transferNumber = await this.nextNumber('transfer', date);
    const journal = await this.journalService.post(
      {
        date: date.toISOString(),
        memo: dto.memo.trim(),
        reference: dto.reference?.trim() || transferNumber,
        lines: [
          {
            accountCode: to.glAccountCode,
            debit: dto.amount,
            description: `Transfer in from ${from.name}`,
          },
          {
            accountCode: from.glAccountCode,
            credit: dto.amount,
            description: `Transfer out to ${to.name}`,
          },
        ],
      },
      userId,
      'system',
    );

    const [created] = await FundTransferModel.create([
      {
        transferNumber,
        kind,
        date,
        amountMinor,
        memo: dto.memo.trim(),
        reference: dto.reference?.trim(),
        fromTreasuryId: from._id,
        toTreasuryId: to._id,
        fromAccountCode: from.glAccountCode,
        toAccountCode: to.glAccountCode,
        journalEntryId: new Types.ObjectId(journal.id),
        journalEntryNumber: journal.entryNumber,
        postedBy: new Types.ObjectId(userId),
      },
    ]);

    return this.toPublicTransfer(created);
  }

  async listTransfers(limit = 50): Promise<PublicFundTransfer[]> {
    const rows = await FundTransferModel.find()
      .sort({ date: -1, transferNumber: -1 })
      .limit(limit)
      .exec();
    return rows.map((row) => this.toPublicTransfer(row));
  }

  async previewStatement(
    treasuryId: string,
    dto: PreviewStatementDto,
  ): Promise<{
    lineCount: number;
    openingBalance: number | null;
    closingBalance: number | null;
    periodFrom: string | null;
    periodTo: string | null;
    asOf: string | null;
    sampleLines: Array<{
      date: string;
      description: string;
      amount: number;
      reference?: string;
    }>;
  }> {
    await this.findTreasuryOrFail(treasuryId);
    const parsed = await this.parseStatementInput(dto);
    return {
      lineCount: parsed.lines.length,
      openingBalance: parsed.openingBalance ?? null,
      closingBalance: parsed.closingBalance ?? null,
      periodFrom: parsed.periodFrom ?? null,
      periodTo: parsed.periodTo ?? null,
      asOf: parsed.asOf ?? null,
      sampleLines: parsed.lines.slice(0, 8),
    };
  }

  async importReconciliation(
    treasuryId: string,
    dto: ImportReconciliationDto,
    userId: string,
  ): Promise<PublicReconciliation> {
    const treasury = await this.findTreasuryOrFail(treasuryId);
    const parsed = await this.parseStatementInput(dto);

    if (parsed.lines.length === 0) {
      throw badRequest('Provide CSV text, PDF (pdfBase64), or statement lines');
    }

    const closing =
      dto.statementBalance ?? parsed.closingBalance;
    if (closing == null) {
      throw badRequest(
        'Closing / ending balance is required (not found on statement)',
      );
    }

    const asOfRaw = dto.asOf ?? parsed.asOf;
    if (!asOfRaw) {
      throw badRequest('Statement as-of date is required');
    }
    const asOf = new Date(
      /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw)
        ? `${asOfRaw}T00:00:00.000Z`
        : asOfRaw,
    );
    if (Number.isNaN(asOf.getTime())) {
      throw badRequest('Invalid statement date');
    }

    const opening =
      dto.openingBalance ?? parsed.openingBalance ?? undefined;

    const lines: IStatementLine[] = parsed.lines.map((line) => ({
      date: new Date(line.date),
      description: line.description.trim(),
      amountMinor: toSignedMinorUnits(line.amount),
      reference: line.reference?.trim(),
      status: 'unmatched',
    }));

    const [created] = await ReconciliationModel.create([
      {
        reconciliationNumber: await this.nextNumber('reconciliation', asOf),
        treasuryAccountId: treasury._id,
        glAccountCode: treasury.glAccountCode,
        asOf,
        openingBalanceMinor:
          opening != null ? toSignedMinorUnits(opening) : undefined,
        statementBalanceMinor: toSignedMinorUnits(closing),
        fileName: dto.fileName?.trim() || undefined,
        status: 'open',
        lines,
        createdBy: new Types.ObjectId(userId),
      },
    ]);

    await this.applyAutoMatch(created);
    return this.toPublicReconciliation(created);
  }

  private async parseStatementInput(dto: {
    csv?: string;
    pdfBase64?: string;
    lines?: Array<{
      date: string;
      description: string;
      amount: number;
      reference?: string;
    }>;
  }) {
    if (dto.pdfBase64?.trim()) {
      const buffer = bufferFromPdfBase64(dto.pdfBase64);
      return parseStatementPdfDetailed(buffer);
    }
    if (dto.csv?.trim()) {
      return parseStatementCsvDetailed(dto.csv);
    }
    if (dto.lines?.length) {
      return buildStatementParseResult(
        dto.lines.map((line) => ({
          date: line.date,
          description: line.description,
          amount: line.amount,
          reference: line.reference,
        })),
      );
    }
    throw badRequest('Provide CSV text, PDF (pdfBase64), or statement lines');
  }

  async autoMatchReconciliation(
    reconciliationId: string,
  ): Promise<PublicReconciliation> {
    const session = await this.findReconciliationOrFail(reconciliationId);
    if (session.status === 'completed') {
      throw badRequest('Reconciliation is already completed');
    }
    await this.applyAutoMatch(session);
    return this.toPublicReconciliation(session);
  }

  async adjustReconciliation(
    reconciliationId: string,
    dto: AdjustReconciliationDto,
    userId: string,
  ): Promise<PublicReconciliation> {
    const session = await this.findReconciliationOrFail(reconciliationId);
    if (session.status === 'completed') {
      throw badRequest('Reconciliation is already completed');
    }

    const date = new Date(dto.date);
    if (Number.isNaN(date.getTime())) {
      throw badRequest('Invalid adjustment date');
    }

    let projectId: string | undefined;
    if (dto.projectId) {
      if (!Types.ObjectId.isValid(dto.projectId)) {
        throw badRequest('Invalid projectId');
      }
      const project = await ProjectModel.findById(dto.projectId).exec();
      if (!project) {
        throw notFound('Project not found');
      }
      projectId = project._id.toString();
    }

    const amount = dto.amount;
    const memo =
      dto.memo?.trim() ||
      (dto.kind === BankAdjustKind.BANK_CHARGE
        ? `Bank charge · ${session.reconciliationNumber}`
        : `Bank interest · ${session.reconciliationNumber}`);

    const bankLine = {
      accountCode: session.glAccountCode,
      description: memo,
      ...(dto.reference ? { reference: dto.reference } : {}),
    };

    const counterCode =
      dto.kind === BankAdjustKind.BANK_CHARGE
        ? SystemAccountCode.BANK_CHARGES
        : SystemAccountCode.OTHER_INCOME;

    const lines =
      dto.kind === BankAdjustKind.BANK_CHARGE
        ? [
            {
              accountCode: counterCode,
              debit: amount,
              description: memo,
              ...(projectId ? { projectId } : {}),
            },
            {
              ...bankLine,
              credit: amount,
            },
          ]
        : [
            {
              ...bankLine,
              debit: amount,
            },
            {
              accountCode: counterCode,
              credit: amount,
              description: memo,
              ...(projectId ? { projectId } : {}),
            },
          ];

    await this.journalService.post(
      {
        date: date.toISOString(),
        memo,
        reference: dto.reference?.trim() || session.reconciliationNumber,
        projectId,
        lines,
      },
      userId,
      'system',
    );

    // Re-run auto-match so the new bank ledger line can clear against the statement.
    await this.applyAutoMatch(session);
    return this.toPublicReconciliation(session);
  }

  async getReconciliation(id: string): Promise<PublicReconciliation> {
    const session = await this.findReconciliationOrFail(id);
    return this.toPublicReconciliation(session);
  }

  async listReconciliations(treasuryId: string): Promise<PublicReconciliation[]> {
    await this.findTreasuryOrFail(treasuryId);
    const rows = await ReconciliationModel.find({
      treasuryAccountId: treasuryId,
    })
      .sort({ asOf: -1, createdAt: -1 })
      .exec();
    const result: PublicReconciliation[] = [];
    for (const row of rows) {
      result.push(await this.toPublicReconciliation(row));
    }
    return result;
  }

  async matchLine(
    reconciliationId: string,
    statementLineId: string,
    ledgerLineId: string,
  ): Promise<PublicReconciliation> {
    const session = await this.findReconciliationOrFail(reconciliationId);
    if (session.status === 'completed') {
      throw badRequest('Reconciliation is already completed');
    }
    const line = session.lines.find(
      (item) => item._id?.toString() === statementLineId,
    );
    if (!line) {
      throw notFound('Statement line not found');
    }
    if (line.status === 'matched') {
      throw badRequest('Statement line is already matched');
    }

    const already = session.lines.some(
      (item) => item.matchedLedgerLineId?.toString() === ledgerLineId,
    );
    if (already) {
      throw conflict('Ledger line is already matched in this reconciliation');
    }

    const book = await LedgerLineModel.findById(ledgerLineId).exec();
    if (!book || book.accountCode !== session.glAccountCode) {
      throw badRequest('Ledger line does not belong to this treasury account');
    }
    if (line.amountMinor > 0 && book.debitMinor !== line.amountMinor) {
      throw badRequest('Inflow amount does not match the ledger debit');
    }
    if (line.amountMinor < 0 && book.creditMinor !== -line.amountMinor) {
      throw badRequest('Outflow amount does not match the ledger credit');
    }

    line.status = 'matched';
    line.matchedLedgerLineId = book._id;
    line.reconciledDate = new Date();
    await session.save();
    return this.toPublicReconciliation(session);
  }

  async unmatchLine(
    reconciliationId: string,
    statementLineId: string,
  ): Promise<PublicReconciliation> {
    const session = await this.findReconciliationOrFail(reconciliationId);
    if (session.status === 'completed') {
      throw badRequest('Reconciliation is already completed');
    }
    const line = session.lines.find(
      (item) => item._id?.toString() === statementLineId,
    );
    if (!line) {
      throw notFound('Statement line not found');
    }
    if (line.status !== 'matched') {
      throw badRequest('Statement line is not matched');
    }
    line.status = 'unmatched';
    // Clear link fields on the subdocument (markModified so Mongoose persists unset).
    (line as { matchedLedgerLineId?: Types.ObjectId }).matchedLedgerLineId =
      undefined;
    (line as { reconciledDate?: Date }).reconciledDate = undefined;
    session.markModified('lines');
    await session.save();
    return this.toPublicReconciliation(session);
  }

  async complete(reconciliationId: string): Promise<PublicReconciliation> {
    const session = await this.findReconciliationOrFail(reconciliationId);
    if (session.status === 'completed') {
      return this.toPublicReconciliation(session);
    }
    const publicSession = await this.toPublicReconciliation(session);
    if (!publicSession.isReconciled) {
      throw badRequest(
        'Cannot complete: unmatched statement lines remain or book and statement balances differ',
      );
    }
    session.status = 'completed';
    session.completedAt = new Date();
    await session.save();
    return this.toPublicReconciliation(session);
  }

  private toPublicTreasury(
    account: TreasuryAccountDocument,
    balanceMinor: number,
  ): PublicTreasuryAccount {
    return {
      id: account._id.toString(),
      name: account.name,
      kind: account.kind,
      institution: account.institution ?? null,
      accountNumber: account.accountNumber ?? null,
      glAccountCode: account.glAccountCode,
      currency: account.currency,
      isActive: account.isActive,
      isSystem: account.isSystem,
      bookBalance: fromMinorUnits(balanceMinor),
    };
  }

  private toPublicTransfer(row: FundTransferDocument): PublicFundTransfer {
    return {
      id: row._id.toString(),
      transferNumber: row.transferNumber,
      kind: row.kind,
      date: row.date.toISOString(),
      amount: fromMinorUnits(row.amountMinor),
      memo: row.memo,
      reference: row.reference ?? null,
      fromTreasuryId: row.fromTreasuryId.toString(),
      toTreasuryId: row.toTreasuryId.toString(),
      fromAccountCode: row.fromAccountCode,
      toAccountCode: row.toAccountCode,
      journalEntryId: row.journalEntryId.toString(),
      journalEntryNumber: row.journalEntryNumber,
    };
  }

  private async toPublicReconciliation(
    session: ReconciliationDocument,
  ): Promise<PublicReconciliation> {
    const bookBalanceMinor = await this.bookBalanceMinor(
      session.glAccountCode,
      session.asOf,
    );
    const matchedIds = new Set(
      session.lines
        .filter((line) => line.matchedLedgerLineId)
        .map((line) => line.matchedLedgerLineId!.toString()),
    );
    const ledger = await this.ledgerService.listForAccount(
      session.glAccountCode,
      { asOf: session.asOf },
    );
    const journalIds = [
      ...new Set(ledger.entries.map((entry) => entry.journalEntryId)),
    ];
    const journals = journalIds.length
      ? await JournalEntryModel.find({
          _id: { $in: journalIds.map((id) => new Types.ObjectId(id)) },
        })
          .select('journalType status reversesEntryId')
          .lean()
          .exec()
      : [];
    const skipJournalIds = new Set(
      journals
        .filter(
          (row) =>
            row.journalType === 'opening_balance' ||
            row.status === 'reversed' ||
            Boolean(row.reversesEntryId),
        )
        .map((row) => row._id.toString()),
    );
    const unmatchedBook = ledger.entries
      .filter(
        (entry) =>
          !matchedIds.has(entry.id) && !skipJournalIds.has(entry.journalEntryId),
      )
      .map((entry) => ({
        id: entry.id,
        date: entry.date,
        entryNumber: entry.entryNumber,
        memo: entry.memo,
        reference: entry.reference ?? null,
        debit: entry.debit,
        credit: entry.credit,
      }));

    const unmatchedStatementCount = session.lines.filter(
      (line) => line.status === 'unmatched',
    ).length;
    const matchedCount = session.lines.filter(
      (line) => line.status === 'matched',
    ).length;

    const uncollectedDepositsMinor = unmatchedBook.reduce(
      (sum, row) => sum + toMinorUnits(row.debit),
      0,
    );
    const unpresentedChequesMinor = unmatchedBook.reduce(
      (sum, row) => sum + toMinorUnits(row.credit),
      0,
    );
    const calculatedBookBalanceMinor =
      session.statementBalanceMinor +
      uncollectedDepositsMinor -
      unpresentedChequesMinor;
    const difference = fromMinorUnits(
      calculatedBookBalanceMinor - bookBalanceMinor,
    );
    const isReconciled =
      unmatchedStatementCount === 0 && Math.abs(difference) < 0.005;

    let displayStatus: PublicReconciliation['displayStatus'] = 'draft';
    if (session.status === 'completed' || isReconciled) {
      displayStatus = 'reconciled';
    } else if (matchedCount > 0) {
      displayStatus = 'partially_reconciled';
    }

    return {
      id: session._id.toString(),
      reconciliationNumber: session.reconciliationNumber,
      treasuryAccountId: session.treasuryAccountId.toString(),
      glAccountCode: session.glAccountCode,
      asOf: session.asOf.toISOString(),
      openingBalance:
        session.openingBalanceMinor != null
          ? fromMinorUnits(session.openingBalanceMinor)
          : null,
      statementBalance: fromMinorUnits(session.statementBalanceMinor),
      bookBalance: fromMinorUnits(bookBalanceMinor),
      calculatedBookBalance: fromMinorUnits(calculatedBookBalanceMinor),
      uncollectedDeposits: fromMinorUnits(uncollectedDepositsMinor),
      unpresentedCheques: fromMinorUnits(unpresentedChequesMinor),
      difference,
      fileName: session.fileName ?? null,
      status: session.status,
      displayStatus,
      matchedCount,
      unmatchedStatementCount,
      isReconciled,
      lines: session.lines.map((line) => {
        const amount = fromMinorUnits(line.amountMinor);
        return {
          id: String(line._id),
          date: line.date.toISOString(),
          description: line.description,
          amount,
          debit: amount > 0 ? amount : 0,
          credit: amount < 0 ? -amount : 0,
          reference: line.reference ?? null,
          status: line.status,
          matchedLedgerLineId: line.matchedLedgerLineId
            ? line.matchedLedgerLineId.toString()
            : null,
          reconciledDate: line.reconciledDate
            ? line.reconciledDate.toISOString()
            : null,
        };
      }),
      unmatchedBook,
    };
  }

  private async applyAutoMatch(session: ReconciliationDocument): Promise<void> {
    const ledger = await this.ledgerService.listForAccount(
      session.glAccountCode,
      { asOf: session.asOf },
    );
    const used = new Set(
      session.lines
        .filter((line) => line.matchedLedgerLineId)
        .map((line) => line.matchedLedgerLineId!.toString()),
    );
    const book = ledger.entries
      .filter((entry) => !used.has(entry.id))
      .map((entry) => ({
        id: entry.id,
        date: new Date(entry.date),
        debitMinor: toMinorUnits(entry.debit),
        creditMinor: toMinorUnits(entry.credit),
        reference: entry.reference,
        memo: entry.memo,
      }));
    const statement = session.lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.status === 'unmatched')
      .map(({ line, index }) => ({
        index,
        date: line.date,
        amountMinor: line.amountMinor,
        reference: line.reference,
      }));
    const matches = autoMatchStatementLines(statement, book);
    const now = new Date();
    for (const match of matches) {
      const line = session.lines[match.statementIndex];
      if (!line || line.status !== 'unmatched') continue;
      line.status = 'matched';
      line.matchedLedgerLineId = new Types.ObjectId(match.ledgerLineId);
      line.reconciledDate = now;
    }
    await session.save();
  }

  private async findTreasuryOrFail(id: string): Promise<TreasuryAccountDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw notFound('Treasury account not found');
    }
    const account = await TreasuryAccountModel.findById(id).exec();
    if (!account) {
      throw notFound('Treasury account not found');
    }
    return account;
  }

  private async findReconciliationOrFail(
    id: string,
  ): Promise<ReconciliationDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw notFound('Reconciliation not found');
    }
    const session = await ReconciliationModel.findById(id).exec();
    if (!session) {
      throw notFound('Reconciliation not found');
    }
    return session;
  }

  private async bookBalanceMinor(
    accountCode: string,
    asOf?: Date,
  ): Promise<number> {
    const match: Record<string, unknown> = { accountCode };
    if (asOf) {
      match.date = { $lte: asOf };
    }
    const [row] = await LedgerLineModel.aggregate<{
      debitMinor: number;
      creditMinor: number;
    }>([
      { $match: match },
      {
        $group: {
          _id: null,
          debitMinor: { $sum: '$debitMinor' },
          creditMinor: { $sum: '$creditMinor' },
        },
      },
    ]);
    return (row?.debitMinor ?? 0) - (row?.creditMinor ?? 0);
  }

  private async balancesByCode(
    codes: string[],
  ): Promise<Map<string, number>> {
    if (codes.length === 0) {
      return new Map();
    }
    const rows = await LedgerLineModel.aggregate<{
      _id: string;
      debitMinor: number;
      creditMinor: number;
    }>([
      { $match: { accountCode: { $in: codes } } },
      {
        $group: {
          _id: '$accountCode',
          debitMinor: { $sum: '$debitMinor' },
          creditMinor: { $sum: '$creditMinor' },
        },
      },
    ]);
    return new Map(
      rows.map((row) => [row._id, row.debitMinor - row.creditMinor]),
    );
  }

  private async nextChildCode(parentCode: string): Promise<string> {
    const escaped = parentCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existing = await AccountModel.find({
      code: new RegExp(`^${escaped}-\\d+$`),
    })
      .select('code')
      .exec();
    let max = 0;
    for (const account of existing) {
      const seq = Number(account.code.slice(parentCode.length + 1));
      if (seq > max) {
        max = seq;
      }
    }
    return `${parentCode}-${String(max + 1).padStart(2, '0')}`;
  }

  private async nextNumber(kind: 'transfer' | 'reconciliation', date: Date) {
    const year = date.getUTCFullYear();
    const prefix = kind === 'transfer' ? 'TRF' : 'REC';
    const counter = await CounterModel.findOneAndUpdate(
      { key: `${kind}:${year}` },
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    );
    const seq = counter?.seq ?? 1;
    return `${prefix}-${year}-${String(seq).padStart(5, '0')}`;
  }
}

export function inferTransferKind(
  from: TreasuryKind,
  to: TreasuryKind,
): TransferKind {
  if (isBankLike(from) && isCashLike(to)) {
    return TransferKind.WITHDRAWAL;
  }
  if (isCashLike(from) && isBankLike(to)) {
    return TransferKind.DEPOSIT;
  }
  return TransferKind.TRANSFER;
}

export function assertTransferKind(
  kind: TransferKind,
  from: TreasuryKind,
  to: TreasuryKind,
): void {
  if (kind === TransferKind.WITHDRAWAL && !(isBankLike(from) && isCashLike(to))) {
    throw badRequest(
      'A withdrawal must move money from a bank or wallet into cash or petty cash',
    );
  }
  if (kind === TransferKind.DEPOSIT && !(isCashLike(from) && isBankLike(to))) {
    throw badRequest(
      'A deposit must move money from cash or petty cash into a bank or wallet',
    );
  }
}
