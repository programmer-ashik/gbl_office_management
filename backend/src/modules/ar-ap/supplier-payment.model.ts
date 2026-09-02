import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose';
import { SupplierPaymentStatus } from '../../common/enums/ar-ap.enum';

export interface ISupplierPayment {
  paymentNumber: string;
  status: SupplierPaymentStatus;
  supplierId: Types.ObjectId;
  supplierNumber: string;
  supplierName: string;
  amountMinor: number;
  scheduledDate?: Date;
  executedDate?: Date;
  treasuryId: Types.ObjectId;
  treasuryAccountCode: string;
  memo?: string;
  journalId?: Types.ObjectId;
  journalNumber?: string;
  createdBy: Types.ObjectId;
  executedBy?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export type SupplierPaymentDocument = HydratedDocument<ISupplierPayment>;

const supplierPaymentSchema = new Schema<ISupplierPayment>(
  {
    paymentNumber: { type: String, required: true, unique: true },
    status: {
      type: String,
      required: true,
      enum: Object.values(SupplierPaymentStatus),
      default: SupplierPaymentStatus.SCHEDULED,
      index: true,
    },
    supplierId: {
      type: Schema.Types.ObjectId,
      ref: 'Supplier',
      required: true,
      index: true,
    },
    supplierNumber: { type: String, required: true },
    supplierName: { type: String, required: true },
    amountMinor: { type: Number, required: true, min: 1 },
    scheduledDate: { type: Date, index: true },
    executedDate: { type: Date, index: true },
    treasuryId: {
      type: Schema.Types.ObjectId,
      ref: 'TreasuryAccount',
      required: true,
    },
    treasuryAccountCode: { type: String, required: true },
    memo: { type: String, trim: true, maxlength: 500 },
    journalId: { type: Schema.Types.ObjectId, ref: 'JournalEntry' },
    journalNumber: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    executedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'supplier_payments' },
);

supplierPaymentSchema.index({ status: 1, scheduledDate: 1 });

export const SupplierPaymentModel =
  (models.SupplierPayment as Model<ISupplierPayment> | undefined) ??
  model<ISupplierPayment>('SupplierPayment', supplierPaymentSchema);
