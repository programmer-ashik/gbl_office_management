import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose';
import { TreasuryKind } from '../../common/enums/treasury-kind.enum';

export interface ITreasuryAccount {
  name: string;
  kind: TreasuryKind;
  institution?: string;
  accountNumber?: string;
  glAccountId: Types.ObjectId;
  glAccountCode: string;
  currency: string;
  isActive: boolean;
  isSystem: boolean;
  createdBy?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TreasuryAccountDocument = HydratedDocument<ITreasuryAccount>;

const treasuryAccountSchema = new Schema<ITreasuryAccount>(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    kind: {
      type: String,
      required: true,
      enum: Object.values(TreasuryKind),
      index: true,
    },
    institution: { type: String, trim: true, maxlength: 120 },
    accountNumber: { type: String, trim: true, maxlength: 40 },
    glAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
      unique: true,
    },
    glAccountCode: { type: String, required: true, unique: true, uppercase: true },
    currency: { type: String, required: true, default: 'BDT', uppercase: true },
    isActive: { type: Boolean, required: true, default: true, index: true },
    isSystem: { type: Boolean, required: true, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'treasury_accounts' },
);

treasuryAccountSchema.index({ kind: 1, isActive: 1 });

export const TreasuryAccountModel =
  (models.TreasuryAccount as Model<ITreasuryAccount> | undefined) ??
  model<ITreasuryAccount>('TreasuryAccount', treasuryAccountSchema);
