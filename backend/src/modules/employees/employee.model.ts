import {
  HydratedDocument,
  Model,
  Schema,
  Types,
  model,
  models,
} from 'mongoose';

/**
 * HR record. Software access lives on `User`; `userId` is an optional,
 * one-to-one link (unique when set). Deleting the user unsets `userId`
 * (see user.model.ts) and never deletes the employee.
 *
 * Employees migrated from pre-split users keep the user's `_id`, so every
 * historical `employeeId` (advances, payroll, ledger entity) still resolves.
 */
export interface IEmployee {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  designation?: string;
  salaryMinor?: number;
  joinDate?: Date;
  isActive: boolean;
  userId?: Types.ObjectId | null;
  createdBy?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export type EmployeeDocument = HydratedDocument<IEmployee>;

const employeeSchema = new Schema<IEmployee>(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, trim: true, lowercase: true, maxlength: 160 },
    phone: { type: String, trim: true, maxlength: 40 },
    designation: { type: String, trim: true, maxlength: 120 },
    salaryMinor: { type: Number, min: 0 },
    joinDate: { type: Date },
    isActive: { type: Boolean, required: true, default: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'employees' },
);

employeeSchema.index(
  { userId: 1 },
  {
    unique: true,
    partialFilterExpression: { userId: { $type: 'objectId' } },
  },
);
employeeSchema.index({ lastName: 1, firstName: 1 });

export const EmployeeModel =
  (models.Employee as Model<IEmployee> | undefined) ??
  model<IEmployee>('Employee', employeeSchema);
