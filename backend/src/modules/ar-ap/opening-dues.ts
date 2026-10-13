import { Types } from 'mongoose';
import { JournalEntryModel } from '../accounting/journal-entry.model';
import {
  JournalEntityType,
  JournalStatus,
  JournalType,
} from '../accounting/journal.enums';

export type OpeningPartyRow = {
  entityId: string;
  entityName: string;
  date: Date;
  journalId: string;
  journalNumber: string;
  /** Positive = party owes us (AR) / we owe party (AP), per `normal`. */
  signedMinor: number;
};

/**
 * Party balances carried in via posted Opening Balance journals.
 * One row per journal per party. Reversed journals and their reversal
 * entries are both excluded so a reversed opening nets to nothing.
 */
export async function openingPartyRows(input: {
  entityType:
    | typeof JournalEntityType.CUSTOMER
    | typeof JournalEntityType.SUPPLIER;
  accountCodes: readonly string[];
  normal: 'debit' | 'credit';
  entityId?: Types.ObjectId;
}): Promise<OpeningPartyRow[]> {
  const codes = new Set(input.accountCodes.map((code) => code.toUpperCase()));
  const entries = await JournalEntryModel.find({
    journalType: JournalType.OPENING_BALANCE,
    status: JournalStatus.POSTED,
    reversesEntryId: null,
    'lines.entityType': input.entityType,
    ...(input.entityId ? { 'lines.entityId': input.entityId } : {}),
  })
    .sort({ date: 1, entryNumber: 1 })
    .exec();

  const rows: OpeningPartyRow[] = [];
  for (const entry of entries) {
    const byEntity = new Map<string, OpeningPartyRow>();
    for (const line of entry.lines) {
      if (!line.entityId || line.entityType !== input.entityType) continue;
      if (!codes.has(line.accountCode.toUpperCase())) continue;
      const entityId = line.entityId.toString();
      if (input.entityId && entityId !== input.entityId.toString()) continue;

      const signed =
        input.normal === 'debit'
          ? line.debitMinor - line.creditMinor
          : line.creditMinor - line.debitMinor;
      const existing = byEntity.get(entityId);
      if (existing) {
        existing.signedMinor += signed;
        continue;
      }
      byEntity.set(entityId, {
        entityId,
        entityName: line.entityName ?? '',
        date: entry.date,
        journalId: entry._id.toString(),
        journalNumber: entry.entryNumber,
        signedMinor: signed,
      });
    }
    for (const row of byEntity.values()) {
      if (row.signedMinor !== 0) rows.push(row);
    }
  }
  return rows;
}

export function sumOpeningByEntity(rows: OpeningPartyRow[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.entityId, (totals.get(row.entityId) ?? 0) + row.signedMinor);
  }
  return totals;
}
