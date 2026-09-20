import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose';

export const SalaryFacilityKind = {
  ADVANCE: 'salary_advance',
  LOAN: 'salary_loan',
} as const;
export type SalaryFacilityKind =
  (typeof SalaryFacilityKind)[keyof typeof SalaryFacilityKind];

export const SalaryFacilityStatus = {
  ACTIVE: 'active',
  SETTLED: 'settled',
  CANCELLED: 'cancelled',
} as const;
export type SalaryFacilityStatus =
  (typeof SalaryFacilityStatus)[keyof typeof SalaryFacilityStatus];

export interface ISalaryFacility {
  facilityNumber: string;
  kind: SalaryFacilityKind;
  status: SalaryFacilityStatus;
  employeeId: Types.ObjectId;
  employeeName: string;
  principalMinor: number;
  installmentMinor: number;
  installmentCount: number;
  repaidMinor: number;
  purpose: string;
  treasuryId?: Types.ObjectId;
  treasuryAccountCode?: string;
  journalId?: Types.ObjectId;
  journalNumber?: string;
  disbursedAt: Date;
  createdBy: Types.ObjectId;
  settledAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type SalaryFacilityDocument = HydratedDocument<ISalaryFacility>;

const salaryFacilitySchema = new Schema<ISalaryFacility>(
  {
    facilityNumber: { type: String, required: true, unique: true },
    kind: {
      type: String,
      required: true,
      enum: Object.values(SalaryFacilityKind),
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(SalaryFacilityStatus),
      default: SalaryFacilityStatus.ACTIVE,
      index: true,
    },
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    employeeName: { type: String, required: true },
    principalMinor: { type: Number, required: true, min: 1 },
    installmentMinor: { type: Number, required: true, min: 1 },
    installmentCount: { type: Number, required: true, min: 1 },
    repaidMinor: { type: Number, required: true, min: 0, default: 0 },
    purpose: { type: String, required: true, trim: true, maxlength: 240 },
    treasuryId: { type: Schema.Types.ObjectId, ref: 'TreasuryAccount' },
    treasuryAccountCode: { type: String },
    journalId: { type: Schema.Types.ObjectId, ref: 'JournalEntry' },
    journalNumber: { type: String },
    disbursedAt: { type: Date, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    settledAt: { type: Date },
  },
  { timestamps: true, collection: 'salary_facilities' },
);

salaryFacilitySchema.index({ employeeId: 1, status: 1, kind: 1 });

export const SalaryFacilityModel =
  (models.SalaryFacility as Model<ISalaryFacility> | undefined) ??
  model<ISalaryFacility>('SalaryFacility', salaryFacilitySchema);
