import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose';
import { TransferKind } from '../../common/enums/transfer-kind.enum';

export interface IFundTransfer {
  transferNumber: string;
  kind: TransferKind;
  date: Date;
  amountMinor: number;
  memo: string;
  reference?: string;
  fromTreasuryId: Types.ObjectId;
  toTreasuryId: Types.ObjectId;
  fromAccountCode: string;
  toAccountCode: string;
  journalEntryId: Types.ObjectId;
  journalEntryNumber: string;
  postedBy: Types.ObjectId;
  createdAt?: Date;
}

export type FundTransferDocument = HydratedDocument<IFundTransfer>;

const fundTransferSchema = new Schema<IFundTransfer>(
  {
    transferNumber: { type: String, required: true, unique: true },
    kind: {
      type: String,
      required: true,
      enum: Object.values(TransferKind),
      index: true,
    },
    date: { type: Date, required: true, index: true },
    amountMinor: { type: Number, required: true, min: 1 },
    memo: { type: String, required: true, trim: true, maxlength: 500 },
    reference: { type: String, trim: true, maxlength: 80 },
    fromTreasuryId: {
      type: Schema.Types.ObjectId,
      ref: 'TreasuryAccount',
      required: true,
      index: true,
    },
    toTreasuryId: {
      type: Schema.Types.ObjectId,
      ref: 'TreasuryAccount',
      required: true,
      index: true,
    },
    fromAccountCode: { type: String, required: true },
    toAccountCode: { type: String, required: true },
    journalEntryId: {
      type: Schema.Types.ObjectId,
      ref: 'JournalEntry',
      required: true,
    },
    journalEntryNumber: { type: String, required: true },
    postedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'fund_transfers' },
);

fundTransferSchema.index({ date: -1, transferNumber: -1 });

export const FundTransferModel =
  (models.FundTransfer as Model<IFundTransfer> | undefined) ??
  model<IFundTransfer>('FundTransfer', fundTransferSchema);
