import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose';
import {
  JOURNAL_ENTITY_TYPE_VALUES,
  JOURNAL_STATUS_VALUES,
  JOURNAL_TYPE_VALUES,
  JournalStatus,
  JournalType,
  type JournalEntityType,
  type JournalStatus as JournalStatusValue,
  type JournalType as JournalTypeValue,
} from './journal.enums';

export interface IJournalLine {
  accountId: Types.ObjectId;
  accountCode: string;
  accountName: string;
  debitMinor: number;
  creditMinor: number;
  description?: string;
  projectId?: Types.ObjectId;
  entityType?: JournalEntityType;
  entityId?: Types.ObjectId;
  entityName?: string;
}

export interface IJournalEntry {
  entryNumber: string;
  date: Date;
  memo: string;
  reference?: string;
  journalType?: JournalTypeValue;
  status: JournalStatusValue;
  source: 'manual' | 'system';
  projectId?: Types.ObjectId;
  lines: IJournalLine[];
  totalDebitMinor: number;
  totalCreditMinor: number;
  postedAt?: Date;
  postedBy?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  rejectedReason?: string;
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
    entityType: {
      type: String,
      enum: JOURNAL_ENTITY_TYPE_VALUES,
    },
    entityId: { type: Schema.Types.ObjectId, index: true },
    entityName: { type: String, trim: true, maxlength: 160 },
  },
  { _id: false },
);

const journalEntrySchema = new Schema<IJournalEntry>(
  {
    entryNumber: { type: String, required: true, unique: true },
    date: { type: Date, required: true, index: true },
    memo: { type: String, required: true, trim: true, maxlength: 500 },
    reference: { type: String, trim: true, maxlength: 80 },
    journalType: {
      type: String,
      enum: JOURNAL_TYPE_VALUES,
      default: JournalType.GENERAL,
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: JOURNAL_STATUS_VALUES,
      default: JournalStatus.POSTED,
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
    postedAt: { type: Date },
    postedBy: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    /** Optional for legacy rows; new journals always set this. */
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectedReason: { type: String, trim: true, maxlength: 240 },
    reversedByEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry' },
    reversesEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry' },
  },
  { timestamps: true, collection: 'journal_entries' },
);

journalEntrySchema.index({ date: -1, entryNumber: -1 });
journalEntrySchema.index({ 'lines.entityId': 1, 'lines.entityType': 1 });

export const JournalEntryModel =
  (models.JournalEntry as Model<IJournalEntry> | undefined) ??
  model<IJournalEntry>('JournalEntry', journalEntrySchema);
