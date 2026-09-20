import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose';
import {
  BillPaymentType,
  BillStatus,
} from '../../common/enums/ar-ap.enum';

export interface ISupplierBill {
  billNumber: string;
  paymentType: BillPaymentType;
  status: BillStatus;
  supplierId: Types.ObjectId;
  supplierNumber: string;
  supplierName: string;
  projectId?: Types.ObjectId;
  projectCode?: string;
  projectName?: string;
  expenseAccountCode: string;
  expenseAccountName: string;
  date: Date;
  dueDate: Date;
  description: string;
  amountMinor: number;
  treasuryId?: Types.ObjectId;
  treasuryAccountCode?: string;
  journalId: Types.ObjectId;
  journalNumber: string;
  createdBy: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export type SupplierBillDocument = HydratedDocument<ISupplierBill>;

const supplierBillSchema = new Schema<ISupplierBill>(
  {
    billNumber: { type: String, required: true, unique: true },
    paymentType: {
      type: String,
      required: true,
      enum: Object.values(BillPaymentType),
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(BillStatus),
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
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', index: true },
    projectCode: { type: String },
    projectName: { type: String },
    expenseAccountCode: { type: String, required: true, uppercase: true },
    expenseAccountName: { type: String, required: true },
    date: { type: Date, required: true, index: true },
    dueDate: { type: Date, required: true, index: true },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    amountMinor: { type: Number, required: true, min: 1 },
    treasuryId: { type: Schema.Types.ObjectId, ref: 'TreasuryAccount' },
    treasuryAccountCode: { type: String },
    journalId: {
      type: Schema.Types.ObjectId,
      ref: 'JournalEntry',
      required: true,
    },
    journalNumber: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'supplier_bills' },
);

supplierBillSchema.index({ status: 1, dueDate: 1 });
supplierBillSchema.index({ journalId: 1 });

export const SupplierBillModel =
  (models.SupplierBill as Model<ISupplierBill> | undefined) ??
  model<ISupplierBill>('SupplierBill', supplierBillSchema);
