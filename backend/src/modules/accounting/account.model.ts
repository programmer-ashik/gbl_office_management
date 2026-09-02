import { HydratedDocument, Model, Schema, model, models } from 'mongoose';
import {
  AccountType,
  type NormalBalance,
} from '../../common/enums/account-type.enum';

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
  },
  { timestamps: true, collection: 'accounts' },
);

accountSchema.index({ type: 1, code: 1 });
accountSchema.index({ isActive: 1, isPostable: 1 });

export const AccountModel =
  (models.Account as Model<IAccount> | undefined) ??
  model<IAccount>('Account', accountSchema);
