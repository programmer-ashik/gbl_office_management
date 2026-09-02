import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose';

export interface IJournalLine {
  accountId: Types.ObjectId;
  accountCode: string;
  accountName: string;
  debitMinor: number;
  creditMinor: number;
  description?: string;
  projectId?: Types.ObjectId;
}

export type JournalStatus = 'posted' | 'reversed';

export interface IJournalEntry {
  entryNumber: string;
  date: Date;
  memo: string;
  reference?: string;
  status: JournalStatus;
  source: 'manual' | 'system';
  projectId?: Types.ObjectId;
  lines: IJournalLine[];
  totalDebitMinor: number;
  totalCreditMinor: number;
  postedAt: Date;
  postedBy: Types.ObjectId;
  reversedByEntryId?: Types.ObjectId;
  reversesEntryId?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export type JournalEntryDocument = HydratedDocument<IJournalEntry>;

const journalLineSchema = new Schema<IJournalLine>(
  {
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    accountCode: { type: String, required: true },
    accountName: { type: String, required: true },
    debitMinor: { type: Number, required: true, min: 0 },
    creditMinor: { type: Number, required: true, min: 0 },
    description: { type: String, trim: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', index: true },
  },
  { _id: false },
);

const journalEntrySchema = new Schema<IJournalEntry>(
  {
    entryNumber: { type: String, required: true, unique: true },
    date: { type: Date, required: true, index: true },
    memo: { type: String, required: true, trim: true, maxlength: 500 },
    reference: { type: String, trim: true, maxlength: 80 },
    status: {
      type: String,
      required: true,
      enum: ['posted', 'reversed'],
      default: 'posted',
      index: true,
    },
    source: {
      type: String,
      required: true,
      enum: ['manual', 'system'],
      default: 'manual',
    },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', index: true },
    lines: { type: [journalLineSchema], required: true },
    totalDebitMinor: { type: Number, required: true, min: 0 },
    totalCreditMinor: { type: Number, required: true, min: 0 },
    postedAt: { type: Date, required: true },
    postedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reversedByEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry' },
    reversesEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry' },
  },
  { timestamps: true, collection: 'journal_entries' },
);

journalEntrySchema.index({ date: -1, entryNumber: -1 });

export const JournalEntryModel =
  (models.JournalEntry as Model<IJournalEntry> | undefined) ??
  model<IJournalEntry>('JournalEntry', journalEntrySchema);
