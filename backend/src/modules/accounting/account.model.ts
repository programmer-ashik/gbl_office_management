import { HydratedDocument, Model, Schema, model, models } from 'mongoose';
import {
  AccountType,
  type NormalBalance,
} from '../../common/enums/account-type.enum';

/** Expense heads whose journal lines are tagged with the employee they were paid to. */
export const EmployeeExpenseKind = {
  SALARY: 'salary',
  CONVEYANCE: 'conveyance',
} as const;

export type EmployeeExpenseKind =
  (typeof EmployeeExpenseKind)[keyof typeof EmployeeExpenseKind];

export const EMPLOYEE_EXPENSE_KIND_VALUES = Object.values(EmployeeExpenseKind);

export interface IAccount {
  code: string;
  name: string;
  type: AccountType;
  normalBalance: NormalBalance;
  parentCode?: string;
  description?: string;
  isSystem: boolean;
  isPostable: boolean;
  isActive: boolean;
  /** Unset on most accounts; set on salary / conveyance expense heads. */
  employeeExpenseKind?: EmployeeExpenseKind;
  createdAt?: Date;
  updatedAt?: Date;
}

export type AccountDocument = HydratedDocument<IAccount>;

const accountSchema = new Schema<IAccount>(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    type: {
      type: String,
      required: true,
      enum: Object.values(AccountType),
      index: true,
    },
    normalBalance: {
      type: String,
      required: true,
      enum: ['debit', 'credit'],
    },
    parentCode: { type: String, trim: true, uppercase: true, index: true },
    description: { type: String, trim: true, maxlength: 500 },
    isSystem: { type: Boolean, required: true, default: false },
    isPostable: { type: Boolean, required: true, default: true },
    isActive: { type: Boolean, required: true, default: true, index: true },
    employeeExpenseKind: {
      type: String,
      enum: EMPLOYEE_EXPENSE_KIND_VALUES,
      required: false,
    },
  },
  { timestamps: true, collection: 'accounts' },
);

accountSchema.index({ type: 1, code: 1 });
accountSchema.index({ isActive: 1, isPostable: 1 });

export const AccountModel =
  (models.Account as Model<IAccount> | undefined) ??
  model<IAccount>('Account', accountSchema);
