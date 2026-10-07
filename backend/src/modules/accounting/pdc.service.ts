import { Types } from 'mongoose';
import { TreasuryKind } from '../../common/enums/treasury-kind.enum';
import { badRequest, conflict } from '../../common/errors/app-error';
import { fromMinorUnits } from '../../common/utils/money';
import { TreasuryAccountModel } from '../banking/treasury-account.model';
import { AccountModel } from './account.model';
import type { JournalLineDto } from './dto/journal.dto';
import { JournalEntryModel, type JournalEntryDocument } from './journal-entry.model';
import { JournalEntityType, JournalStatus, JournalType } from './journal.enums';
import type { JournalService, PublicJournal } from './journal.service';
import {
  PDC_PAYABLE_CODE,
  PDC_RECEIVABLE_CODE,
  PdcDirection,
  PdcStatus,
  chequeDay,
  todayIsoDate,
} from './pdc';

export type PdcListFilters = {
  status?: string;
  direction?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
};

/** One cheque in the register (PDC or current-dated). */
export type ChequeRegisterRow = PublicJournal & {
  chequeAmount: number;
  direction: PdcDirection | null;
  bankAccountCode: string | null;
  bankAccountName: string | null;
  partyName: string | null;
  partyType: string | null;
  clearingEntryNumber: string | null;
  reversalEntryNumber: string | null;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class PdcService {
  constructor(private readonly journalService: JournalService) {}

  /** PDC register (post-dated only), earliest cheque date first. */
  async list(filters: PdcListFilters = {}): Promise<PublicJournal[]> {
    const rows = await JournalEntryModel.find(this.buildQuery(filters, true))
      .sort({ chequeDate: 1, entryNumber: 1 })
      .exec();
    return rows.map((row) => this.journalService.toPublic(row));
  }

  /**
   * Cheque register: every journal carrying a cheque (post-dated or not),
   * excluding the clearing journals the PDC flow writes.
   */
  async register(filters: PdcListFilters = {}): Promise<ChequeRegisterRow[]> {
    const rows = await JournalEntryModel.find(this.buildQuery(filters, false))
      .sort({ chequeDate: -1, entryNumber: -1 })
      .limit(1000)
      .exec();

    const bankCodes = await this.bankCodes(rows);
    const linkedIds = rows.flatMap((row) =>
      [row.pdcClearingEntryId, row.reversedByEntryId].filter(
        (id): id is Types.ObjectId => Boolean(id),
      ),
    );
    const linked = linkedIds.length
      ? await JournalEntryModel.find({ _id: { $in: linkedIds } })
          .select('entryNumber')
          .lean()
          .exec()
      : [];
    const numberById = new Map(linked.map((row) => [row._id.toString(), row.entryNumber]));

    const out = rows.map((row) => {
      const base = this.journalService.toPublic(row);
      const summary = this.summarise(row, bankCodes);
      return {
        ...base,
        ...summary,
        clearingEntryNumber: row.pdcClearingEntryId
          ? numberById.get(row.pdcClearingEntryId.toString()) ?? null
          : null,
        reversalEntryNumber: row.reversedByEntryId
          ? numberById.get(row.reversedByEntryId.toString()) ?? null
          : null,
      };
    });
    if (!filters.direction) return out;
    return out.filter((row) => row.direction === filters.direction);
  }

  private buildQuery(filters: PdcListFilters, pdcOnly: boolean): Record<string, unknown> {
    const and: Record<string, unknown>[] = [];
    if (pdcOnly) {
      and.push({ isPdc: true });
      if (filters.direction) and.push({ pdcDirection: filters.direction });
    } else {
      and.push({
        $or: [{ isPdc: true }, { chequeNumber: { $exists: true, $nin: [null, ''] } }],
      });
      and.push({ pdcClearsEntryId: { $exists: false } });
      and.push({ reversesEntryId: { $exists: false } });
      and.push({ status: { $in: [JournalStatus.POSTED, JournalStatus.REVERSED] } });
    }
    if (filters.status) and.push({ pdcStatus: filters.status });
    const from = chequeDay(filters.fromDate);
    const to = chequeDay(filters.toDate);
    if (from || to) {
      and.push({
        chequeDate: {
          ...(from ? { $gte: new Date(`${from}T00:00:00.000Z`) } : {}),
          ...(to ? { $lte: new Date(`${to}T23:59:59.999Z`) } : {}),
        },
      });
    }
    const search = filters.search?.trim();
    if (search) {
      const pattern = new RegExp(escapeRegex(search), 'i');
      and.push({
        $or: [
          { chequeNumber: pattern },
          { entryNumber: pattern },
          { memo: pattern },
          { 'lines.entityName': pattern },
        ],
      });
    }
    return { $and: and };
  }

  private async bankCodes(rows: JournalEntryDocument[]): Promise<Map<string, string>> {
    const codes = [
      ...new Set(
        rows.flatMap((row) => [
          ...row.lines.map((line) => line.accountCode),
          ...(row.intendedBankAccountCode ? [row.intendedBankAccountCode] : []),
        ]),
      ),
    ];
    const accounts = await AccountModel.find({
      code: { $in: codes },
      parentCode: '1120',
    })
      .select('code name')
      .lean()
      .exec();
    const treasury = await TreasuryAccountModel.find({
      kind: TreasuryKind.COMMERCIAL_BANK,
      glAccountCode: { $in: codes },
    })
      .select('glAccountCode name')
      .lean()
      .exec();
    const out = new Map<string, string>();
    for (const account of accounts) out.set(account.code, account.name);
    for (const row of treasury) out.set(row.glAccountCode, row.name);
    return out;
  }

  /** Amount, direction, bank and party for one cheque journal. */
  private summarise(
    row: JournalEntryDocument,
    bankNames: Map<string, string>,
  ): Omit<ChequeRegisterRow, keyof PublicJournal | 'clearingEntryNumber' | 'reversalEntryNumber'> {
    let direction: PdcDirection | null = row.pdcDirection ?? null;
    let bankCode: string | null = row.intendedBankAccountCode ?? null;
    let amountMinor = 0;

    if (row.isPdc) {
      const code = direction === PdcDirection.PAYMENT ? PDC_PAYABLE_CODE : PDC_RECEIVABLE_CODE;
      amountMinor = row.lines
        .filter((line) => line.accountCode === code)
        .reduce(
          (sum, line) =>
            sum + (direction === PdcDirection.PAYMENT ? line.creditMinor : line.debitMinor),
          0,
        );
    } else {
      const bankLines = row.lines.filter((line) => bankNames.has(line.accountCode));
      if (bankLines.length > 0) {
        bankCode = bankLines[0]!.accountCode;
        const debit = bankLines.reduce((sum, line) => sum + line.debitMinor, 0);
        const credit = bankLines.reduce((sum, line) => sum + line.creditMinor, 0);
        direction = debit >= credit ? PdcDirection.RECEIPT : PdcDirection.PAYMENT;
        amountMinor = Math.abs(debit - credit);
      } else {
        amountMinor = row.totalDebitMinor;
      }
    }

    const party = row.lines.find(
      (line) =>
        (line.entityType === JournalEntityType.CUSTOMER ||
          line.entityType === JournalEntityType.SUPPLIER) &&
        line.entityName,
    );
    const counterLine =
      party ??
      row.lines.find(
        (line) =>
          !bankNames.has(line.accountCode) &&
          line.accountCode !== PDC_RECEIVABLE_CODE &&
          line.accountCode !== PDC_PAYABLE_CODE,
      );

    return {
      chequeAmount: fromMinorUnits(amountMinor),
      direction,
      bankAccountCode: bankCode,
      bankAccountName: bankCode ? bankNames.get(bankCode) ?? null : null,
      partyName: party?.entityName ?? counterLine?.accountName ?? null,
      partyType: party?.entityType ?? (counterLine ? 'account' : null),
    };
  }

  /**
   * Cheque honoured by the bank: post a NEW journal that moves the money from
   * the PDC clearing account into (receipt) or out of (payment) the bank that
   * was chosen when the cheque was recorded, then mark the PDC Cleared.
   */
  async clear(
    id: string,
    userId: string,
    input: { date?: string; memo?: string } = {},
  ): Promise<{ pdc: PublicJournal; clearingJournal: PublicJournal }> {
    const entry = await this.journalService.findByIdOrFail(id);
    this.assertPending(entry, 'cleared');

    const bank = await AccountModel.findById(entry.intendedBankAccountId).exec();
    if (!bank || !bank.isActive || !bank.isPostable) {
      throw badRequest(
        `Intended bank account ${entry.intendedBankAccountCode ?? entry.intendedBankAccountId} is missing or not postable`,
      );
    }

    const receipt = entry.pdcDirection !== PdcDirection.PAYMENT;
    const clearingCode = receipt ? PDC_RECEIVABLE_CODE : PDC_PAYABLE_CODE;
    const heldLines = entry.lines.filter(
      (line) =>
        line.accountCode === clearingCode &&
        (receipt ? line.debitMinor > 0 : line.creditMinor > 0),
    );
    if (heldLines.length === 0) {
      throw badRequest(
        `${entry.entryNumber} has no ${receipt ? 'PDC Receivable debit' : 'PDC Payable credit'} to clear`,
      );
    }

    const day = chequeDay(input.date) ?? todayIsoDate();
    const journalDay = entry.date.toISOString().slice(0, 10);
    if (day < journalDay) {
      throw badRequest(
        `Clearing date ${day} cannot be before the cheque was recorded (${journalDay})`,
      );
    }

    const treasury = await TreasuryAccountModel.findOne({
      glAccountCode: bank.code,
      kind: TreasuryKind.COMMERCIAL_BANK,
      isActive: true,
    })
      .select('_id')
      .lean()
      .exec();

    const cheque = entry.chequeNumber ? ` · Chq ${entry.chequeNumber}` : '';
    const narrative = `PDC cleared${cheque} · ${entry.entryNumber}`;
    const lines: JournalLineDto[] = [];
    for (const held of heldLines) {
      const amount = fromMinorUnits(receipt ? held.debitMinor : held.creditMinor);
      const projectId = held.projectId?.toString();
      const bankLine: JournalLineDto = {
        accountCode: bank.code,
        description: narrative,
        projectId,
        entityType: treasury ? JournalEntityType.TREASURY : undefined,
        entityId: treasury ? treasury._id.toString() : undefined,
      };
      const clearingLine: JournalLineDto = {
        accountCode: clearingCode,
        description: narrative,
        projectId,
        entityType: held.entityType,
        entityId: held.entityId?.toString(),
      };
      if (receipt) {
        lines.push({ ...bankLine, debit: amount }, { ...clearingLine, credit: amount });
      } else {
        lines.push({ ...clearingLine, debit: amount }, { ...bankLine, credit: amount });
      }
    }

    const settledAt = new Date();
    const claimed = await JournalEntryModel.updateOne(
      {
        _id: entry._id,
        isPdc: true,
        status: JournalStatus.POSTED,
        pdcStatus: PdcStatus.PENDING,
      },
      {
        $set: {
          pdcStatus: PdcStatus.CLEARED,
          pdcSettledAt: settledAt,
          pdcSettledBy: new Types.ObjectId(userId),
        },
      },
    ).exec();
    if (claimed.modifiedCount !== 1) {
      throw conflict('Post-dated cheque status changed — reload and try again');
    }

    let clearingJournal: PublicJournal;
    try {
      clearingJournal = await this.journalService.post(
        {
          date: day,
          memo: input.memo?.trim() || narrative,
          reference: entry.entryNumber,
          journalType: receipt ? JournalType.BANK_DEPOSIT : JournalType.BANK_WITHDRAWAL,
          projectId: entry.projectId?.toString(),
          chequeNumber: entry.chequeNumber,
          lines,
        },
        userId,
        'system',
      );
    } catch (error) {
      await JournalEntryModel.updateOne(
        { _id: entry._id, pdcStatus: PdcStatus.CLEARED },
        {
          $set: { pdcStatus: PdcStatus.PENDING },
          $unset: { pdcSettledAt: 1, pdcSettledBy: 1 },
        },
      ).exec();
      throw error;
    }

    const clearingId = new Types.ObjectId(clearingJournal.id);
    await Promise.all([
      JournalEntryModel.updateOne(
        { _id: entry._id },
        { $set: { pdcClearingEntryId: clearingId } },
      ).exec(),
      JournalEntryModel.updateOne(
        { _id: clearingId },
        { $set: { pdcClearsEntryId: entry._id } },
      ).exec(),
    ]);

    const [pdc, clearing] = await Promise.all([
      this.journalService.findByIdOrFail(entry._id.toString()),
      this.journalService.findByIdOrFail(clearingJournal.id),
    ]);
    return {
      pdc: this.journalService.toPublic(pdc),
      clearingJournal: this.journalService.toPublic(clearing),
    };
  }

  /**
   * Cheque dishonoured / cancelled: reverse the cheque journal (customer or
   * supplier balance comes back) and mark it Bounced. Works for a pending
   * PDC and for a current-dated cheque that already went through the bank.
   */
  async bounce(
    id: string,
    userId: string,
    input: { reason?: string } = {},
  ): Promise<{ pdc: PublicJournal; reversal: PublicJournal }> {
    const entry = await this.journalService.findByIdOrFail(id);
    const reason = input.reason?.trim() || 'Cheque bounced';

    if (entry.isPdc) {
      this.assertPending(entry, 'bounced');
      const reversal = await this.journalService.reverse(id, userId, {
        bounceReason: reason,
      });
      const pdc = await this.journalService.findByIdOrFail(id);
      return { pdc: this.journalService.toPublic(pdc), reversal };
    }

    if (!entry.chequeNumber) {
      throw badRequest(`${entry.entryNumber} is not a cheque transaction`);
    }
    const status = entry.pdcStatus ?? PdcStatus.NONE;
    if (status !== PdcStatus.NONE || entry.status !== JournalStatus.POSTED) {
      throw conflict(
        `Cheque on ${entry.entryNumber} is already ${status === PdcStatus.NONE ? entry.status : status} and cannot be bounced`,
      );
    }
    const claimed = await JournalEntryModel.updateOne(
      {
        _id: entry._id,
        status: JournalStatus.POSTED,
        $or: [{ pdcStatus: PdcStatus.NONE }, { pdcStatus: { $exists: false } }],
      },
      {
        $set: {
          pdcStatus: PdcStatus.BOUNCED,
          pdcBounceReason: reason,
          pdcSettledAt: new Date(),
          pdcSettledBy: new Types.ObjectId(userId),
        },
      },
    ).exec();
    if (claimed.modifiedCount !== 1) {
      throw conflict('Cheque status changed — reload and try again');
    }
    let reversal: PublicJournal;
    try {
      reversal = await this.journalService.reverse(id, userId);
    } catch (error) {
      await JournalEntryModel.updateOne(
        { _id: entry._id, pdcStatus: PdcStatus.BOUNCED },
        {
          $set: { pdcStatus: PdcStatus.NONE },
          $unset: { pdcBounceReason: 1, pdcSettledAt: 1, pdcSettledBy: 1 },
        },
      ).exec();
      throw error;
    }
    const cheque = await this.journalService.findByIdOrFail(id);
    return { pdc: this.journalService.toPublic(cheque), reversal };
  }

  /** Undo a clearing: reverse the clearing journal; the cheque goes back to Pending. */
  async undoClear(id: string, userId: string): Promise<{ pdc: PublicJournal; reversal: PublicJournal }> {
    const entry = await this.journalService.findByIdOrFail(id);
    if (!entry.isPdc || entry.pdcStatus !== PdcStatus.CLEARED || !entry.pdcClearingEntryId) {
      throw conflict(`${entry.entryNumber} is not a cleared post-dated cheque`);
    }
    const reversal = await this.journalService.reverse(
      entry.pdcClearingEntryId.toString(),
      userId,
    );
    const pdc = await this.journalService.findByIdOrFail(id);
    return { pdc: this.journalService.toPublic(pdc), reversal };
  }

  private assertPending(entry: JournalEntryDocument, action: 'cleared' | 'bounced'): void {
    if (!entry.isPdc) {
      throw badRequest(`${entry.entryNumber} is not a post-dated cheque`);
    }
    const status = entry.pdcStatus ?? PdcStatus.NONE;
    if (status !== PdcStatus.PENDING) {
      throw conflict(
        `Post-dated cheque on ${entry.entryNumber} is already ${status} and cannot be ${action}`,
      );
    }
    if (entry.status !== JournalStatus.POSTED) {
      throw conflict(
        `${entry.entryNumber} is ${entry.status}; only posted post-dated cheques can be ${action}`,
      );
    }
    if (!entry.intendedBankAccountId) {
      throw badRequest(`${entry.entryNumber} has no intended bank account recorded`);
    }
  }
}
