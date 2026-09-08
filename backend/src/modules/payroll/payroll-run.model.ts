import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose';
import { PayrollRunStatus } from '../../common/enums/payroll.enum';

export interface IPayrollAdvanceDeduction {
  advanceId: Types.ObjectId;
  advanceNumber: string;
  projectId: Types.ObjectId;
  amountMinor: number;
}

export interface IPayrollAllocation {
  projectId: Types.ObjectId;
  projectCode: string;
  projectName: string;
  quantityMilli: number;
  amountMinor: number;
}

export interface IPayrollLine {
  employeeId: Types.ObjectId;
  employeeName: string;
  basicMinor: number;
  allowancesMinor: number;
  structuralDeductionMinor: number;
  providentFundMinor: number;
  taxDeductionMinor: number;
  structureAdvanceMinor: number;
  grossMinor: number;
  advanceDeductions: IPayrollAdvanceDeduction[];
  totalAdvanceDeductionMinor: number;
  netPayMinor: number;
  allocations: IPayrollAllocation[];
}

export interface IPayrollRun {
  sheetNumber: string;
  status: PayrollRunStatus;
  periodYear: number;
  periodMonth: number;
  lines: IPayrollLine[];
  totalGrossMinor: number;
  totalStructuralDeductionMinor: number;
  totalAdvanceDeductionMinor: number;
  totalNetPayMinor: number;
  accrualJournalId?: Types.ObjectId;
  accrualJournalNumber?: string;
  postedAt?: Date;
  postedBy?: Types.ObjectId;
  treasuryId?: Types.ObjectId;
  treasuryAccountCode?: string;
  journalId?: Types.ObjectId;
  journalNumber?: string;
  disbursedAt?: Date;
  disbursedBy?: Types.ObjectId;
  createdBy: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export type PayrollRunDocument = HydratedDocument<IPayrollRun>;

const advanceDeductionSchema = new Schema<IPayrollAdvanceDeduction>(
  {
    advanceId: { type: Schema.Types.ObjectId, ref: 'Advance', required: true },
    advanceNumber: { type: String, required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    amountMinor: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const allocationSchema = new Schema<IPayrollAllocation>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    projectCode: { type: String, required: true },
    projectName: { type: String, required: true },
    quantityMilli: { type: Number, required: true, min: 1 },
    amountMinor: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const payrollLineSchema = new Schema<IPayrollLine>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    employeeName: { type: String, required: true },
    basicMinor: { type: Number, required: true, min: 1 },
    allowancesMinor: { type: Number, required: true, min: 0 },
    structuralDeductionMinor: { type: Number, required: true, min: 0 },
    providentFundMinor: { type: Number, required: true, min: 0, default: 0 },
    taxDeductionMinor: { type: Number, required: true, min: 0, default: 0 },
    structureAdvanceMinor: { type: Number, required: true, min: 0, default: 0 },
    grossMinor: { type: Number, required: true, min: 1 },
    advanceDeductions: { type: [advanceDeductionSchema], default: [] },
    totalAdvanceDeductionMinor: { type: Number, required: true, min: 0 },
    netPayMinor: { type: Number, required: true, min: 0 },
    allocations: { type: [allocationSchema], default: [] },
  },
  { _id: false },
);

const payrollRunSchema = new Schema<IPayrollRun>(
  {
    sheetNumber: { type: String, required: true, unique: true },
    status: {
      type: String,
      required: true,
      enum: Object.values(PayrollRunStatus),
      default: PayrollRunStatus.DRAFT,
      index: true,
    },
    periodYear: { type: Number, required: true, min: 2000, index: true },
    periodMonth: { type: Number, required: true, min: 1, max: 12, index: true },
    lines: { type: [payrollLineSchema], required: true },
    totalGrossMinor: { type: Number, required: true, min: 1 },
    totalStructuralDeductionMinor: { type: Number, required: true, min: 0 },
    totalAdvanceDeductionMinor: { type: Number, required: true, min: 0 },
    totalNetPayMinor: { type: Number, required: true, min: 0 },
    accrualJournalId: { type: Schema.Types.ObjectId, ref: 'JournalEntry' },
    accrualJournalNumber: { type: String },
    postedAt: { type: Date },
    postedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    treasuryId: { type: Schema.Types.ObjectId, ref: 'TreasuryAccount' },
    treasuryAccountCode: { type: String },
    journalId: { type: Schema.Types.ObjectId, ref: 'JournalEntry' },
    journalNumber: { type: String },
    disbursedAt: { type: Date },
    disbursedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'payroll_runs' },
);

payrollRunSchema.index({ periodYear: 1, periodMonth: 1 }, { unique: true });

export const PayrollRunModel =
  (models.PayrollRun as Model<IPayrollRun> | undefined) ??
  model<IPayrollRun>('PayrollRun', payrollRunSchema);
