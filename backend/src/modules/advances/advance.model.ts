import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose';
import {
  AdvanceStatus,
  SettlementCase,
} from '../../common/enums/advance-status.enum';

export interface IAdvanceVoucher {
  accountCode: string;
  accountName: string;
  amountMinor: number;
  description?: string;
}

export interface IAdvance {
  advanceNumber: string;
  status: AdvanceStatus;
  employeeId: Types.ObjectId;
  employeeName: string;
  projectId: Types.ObjectId;
  projectCode: string;
  projectName: string;
  requestedMinor: number;
  purpose: string;
  requestedAt: Date;
  disbursedMinor?: number;
  disbursedAt?: Date;
  disbursedBy?: Types.ObjectId;
  treasuryId?: Types.ObjectId;
  treasuryAccountCode?: string;
  disbursementJournalId?: Types.ObjectId;
  disbursementJournalNumber?: string;
  vouchers: IAdvanceVoucher[];
  spentMinor?: number;
  submittedAt?: Date;
  settlementCase?: SettlementCase;
  returnTreasuryId?: Types.ObjectId;
  returnAccountCode?: string;
  settlementJournalId?: Types.ObjectId;
  settlementJournalNumber?: string;
  settledAt?: Date;
  settledBy?: Types.ObjectId;
  reimbursedMinor?: number;
  reimbursedAt?: Date;
  reimbursedBy?: Types.ObjectId;
  reimbursementTreasuryId?: Types.ObjectId;
  reimbursementAccountCode?: string;
  reimbursementJournalId?: Types.ObjectId;
  reimbursementJournalNumber?: string;
  payrollDeductedMinor?: number;
  rejectionReason?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type AdvanceDocument = HydratedDocument<IAdvance>;

const voucherSchema = new Schema<IAdvanceVoucher>(
  {
    accountCode: { type: String, required: true, uppercase: true },
    accountName: { type: String, required: true },
    amountMinor: { type: Number, required: true, min: 1 },
    description: { type: String, trim: true, maxlength: 240 },
  },
  { _id: false },
);

const advanceSchema = new Schema<IAdvance>(
  {
    advanceNumber: { type: String, required: true, unique: true },
    status: {
      type: String,
      required: true,
      enum: Object.values(AdvanceStatus),
      default: AdvanceStatus.PENDING,
      index: true,
    },
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    employeeName: { type: String, required: true },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    projectCode: { type: String, required: true },
    projectName: { type: String, required: true },
    requestedMinor: { type: Number, required: true, min: 1 },
    purpose: { type: String, required: true, trim: true, maxlength: 500 },
    requestedAt: { type: Date, required: true },
    disbursedMinor: { type: Number, min: 1 },
    disbursedAt: { type: Date },
    disbursedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    treasuryId: { type: Schema.Types.ObjectId, ref: 'TreasuryAccount' },
    treasuryAccountCode: { type: String },
    disbursementJournalId: { type: Schema.Types.ObjectId, ref: 'JournalEntry' },
    disbursementJournalNumber: { type: String },
    vouchers: { type: [voucherSchema], default: [] },
    spentMinor: { type: Number, min: 0 },
    submittedAt: { type: Date },
    settlementCase: {
      type: String,
      enum: Object.values(SettlementCase),
    },
    returnTreasuryId: { type: Schema.Types.ObjectId, ref: 'TreasuryAccount' },
    returnAccountCode: { type: String },
    settlementJournalId: { type: Schema.Types.ObjectId, ref: 'JournalEntry' },
    settlementJournalNumber: { type: String },
    settledAt: { type: Date },
    settledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reimbursedMinor: { type: Number, min: 0, default: 0 },
    reimbursedAt: { type: Date },
    reimbursedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reimbursementTreasuryId: {
      type: Schema.Types.ObjectId,
      ref: 'TreasuryAccount',
    },
    reimbursementAccountCode: { type: String },
    reimbursementJournalId: {
      type: Schema.Types.ObjectId,
      ref: 'JournalEntry',
    },
    reimbursementJournalNumber: { type: String },
    payrollDeductedMinor: { type: Number, min: 0, default: 0 },
    rejectionReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true, collection: 'advances' },
);

advanceSchema.index({ status: 1, requestedAt: -1 });
advanceSchema.index({ employeeId: 1, status: 1 });

export const AdvanceModel =
  (models.Advance as Model<IAdvance> | undefined) ??
  model<IAdvance>('Advance', advanceSchema);
