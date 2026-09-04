import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose';
import { AccountType } from '../../common/enums/account-type.enum';
import {
  JOURNAL_ENTITY_TYPE_VALUES,
  type JournalEntityType,
} from './journal.enums';

export interface ILedgerLine {
  journalEntryId: Types.ObjectId;
  journalEntryNumber: string;
  accountId: Types.ObjectId;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  date: Date;
  memo: string;
  debitMinor: number;
  creditMinor: number;
  projectId?: Types.ObjectId;
  entityType?: JournalEntityType;
  entityId?: Types.ObjectId;
  entityName?: string;
  createdAt?: Date;
}

export type LedgerLineDocument = HydratedDocument<ILedgerLine>;

const ledgerLineSchema = new Schema<ILedgerLine>(
  {
    journalEntryId: {
      type: Schema.Types.ObjectId,
      ref: 'JournalEntry',
      required: true,
      index: true,
    },
    journalEntryNumber: { type: String, required: true, index: true },
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
      index: true,
    },
    accountCode: { type: String, required: true, index: true },
    accountName: { type: String, required: true },
    accountType: {
      type: String,
      required: true,
      enum: Object.values(AccountType),
    },
    date: { type: Date, required: true, index: true },
    memo: { type: String, required: true },
    debitMinor: { type: Number, required: true, min: 0 },
    creditMinor: { type: Number, required: true, min: 0 },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', index: true },
    entityType: {
      type: String,
      enum: JOURNAL_ENTITY_TYPE_VALUES,
      index: true,
    },
    entityId: { type: Schema.Types.ObjectId, index: true },
    entityName: { type: String, trim: true, maxlength: 160 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'ledger_lines' },
);

ledgerLineSchema.index({ accountId: 1, date: 1, journalEntryNumber: 1 });
ledgerLineSchema.index({ projectId: 1, date: 1 });
ledgerLineSchema.index({ entityType: 1, entityId: 1, date: 1 });

export const LedgerLineModel =
  (models.LedgerLine as Model<ILedgerLine> | undefined) ??
  model<ILedgerLine>('LedgerLine', ledgerLineSchema);
