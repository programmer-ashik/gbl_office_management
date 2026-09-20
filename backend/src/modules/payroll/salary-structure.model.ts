import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose';

export interface ISalaryComponent {
  name: string;
  amountMinor: number;
}

/** Typed BD breakdown (amounts in minor units). */
export interface ISalaryBreakdown {
  basicSalaryMinor: number;
  houseRentMinor: number;
  medicalAllowanceMinor: number;
  conveyanceAllowanceMinor: number;
  otherAllowancesMinor: number;
}

export interface ISalaryDeductionDetail {
  providentFundMinor: number;
  taxDeductionMinor: number;
  advanceAdjustmentMinor: number;
}

export interface ISalaryStructure {
  employeeId: Types.ObjectId;
  employeeName: string;
  /** Gross monthly salary (source of truth for auto-calc). */
  grossSalaryMinor?: number;
  customBreakdownApplied?: boolean;
  breakdown?: ISalaryBreakdown;
  deductionDetail?: ISalaryDeductionDetail;
  netPayableMinor?: number;
  /** Legacy fields kept for payroll-run / journal compatibility. */
  basicMinor: number;
  allowances: ISalaryComponent[];
  deductions: ISalaryComponent[];
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type SalaryStructureDocument = HydratedDocument<ISalaryStructure>;

const componentSchema = new Schema<ISalaryComponent>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    amountMinor: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const breakdownSchema = new Schema<ISalaryBreakdown>(
  {
    basicSalaryMinor: { type: Number, required: true, min: 0 },
    houseRentMinor: { type: Number, required: true, min: 0 },
    medicalAllowanceMinor: { type: Number, required: true, min: 0 },
    conveyanceAllowanceMinor: { type: Number, required: true, min: 0 },
    otherAllowancesMinor: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const deductionDetailSchema = new Schema<ISalaryDeductionDetail>(
  {
    providentFundMinor: { type: Number, required: true, min: 0, default: 0 },
    taxDeductionMinor: { type: Number, required: true, min: 0, default: 0 },
    advanceAdjustmentMinor: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false },
);

const salaryStructureSchema = new Schema<ISalaryStructure>(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    employeeName: { type: String, required: true },
    grossSalaryMinor: { type: Number, min: 0 },
    customBreakdownApplied: { type: Boolean, default: false },
    breakdown: { type: breakdownSchema },
    deductionDetail: { type: deductionDetailSchema },
    netPayableMinor: { type: Number, min: 0 },
    basicMinor: { type: Number, required: true, min: 1 },
    allowances: { type: [componentSchema], default: [] },
    deductions: { type: [componentSchema], default: [] },
    isActive: { type: Boolean, required: true, default: true, index: true },
  },
  { timestamps: true, collection: 'salary_structures' },
);

export const SalaryStructureModel =
  (models.SalaryStructure as Model<ISalaryStructure> | undefined) ??
  model<ISalaryStructure>('SalaryStructure', salaryStructureSchema);
