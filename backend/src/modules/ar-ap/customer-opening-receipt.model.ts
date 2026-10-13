import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose';

export const CustomerOpeningReceiptStatus = {
  EXECUTED: 'executed',
  CANCELLED: 'cancelled',
} as const;

export type CustomerOpeningReceiptStatus =
  (typeof CustomerOpeningReceiptStatus)[keyof typeof CustomerOpeningReceiptStatus];

/** Cash/bank received against a customer's go-live opening due (no invoice). */
export interface ICustomerOpeningReceipt {
  receiptNumber: string;
  status: CustomerOpeningReceiptStatus;
  customerId: Types.ObjectId;
  customerName: string;
  amountMinor: number;
  date: Date;
  treasuryId: Types.ObjectId;
  treasuryAccountCode: string;
  memo?: string;
  journalId: Types.ObjectId;
  journalNumber: string;
  createdBy: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CustomerOpeningReceiptDocument =
  HydratedDocument<ICustomerOpeningReceipt>;

const customerOpeningReceiptSchema = new Schema<ICustomerOpeningReceipt>(
  {
    receiptNumber: { type: String, required: true, unique: true },
    status: {
      type: String,
      required: true,
      enum: Object.values(CustomerOpeningReceiptStatus),
      default: CustomerOpeningReceiptStatus.EXECUTED,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    customerName: { type: String, required: true },
    amountMinor: { type: Number, required: true, min: 1 },
    date: { type: Date, required: true, index: true },
    treasuryId: {
      type: Schema.Types.ObjectId,
      ref: 'TreasuryAccount',
      required: true,
    },
    treasuryAccountCode: { type: String, required: true },
    memo: { type: String, trim: true, maxlength: 500 },
    journalId: {
      type: Schema.Types.ObjectId,
      ref: 'JournalEntry',
      required: true,
      index: true,
    },
    journalNumber: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'customer_opening_receipts' },
);

export const CustomerOpeningReceiptModel =
  (models.CustomerOpeningReceipt as Model<ICustomerOpeningReceipt> | undefined) ??
  model<ICustomerOpeningReceipt>(
    'CustomerOpeningReceipt',
    customerOpeningReceiptSchema,
  );
