import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose';

export interface ISalaryComponent {
  name: string;
  amountMinor: number;
}

export interface ISalaryStructure {
  employeeId: Types.ObjectId;
  employeeName: string;
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
