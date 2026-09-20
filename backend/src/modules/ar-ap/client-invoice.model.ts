import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose';
import {
  InvoiceStatus,
  InvoiceType,
} from '../../common/enums/ar-ap.enum';

export interface IClientInvoice {
  invoiceNumber: string;
  type: InvoiceType;
  status: InvoiceStatus;
  projectId: Types.ObjectId;
  projectCode: string;
  projectName: string;
  clientName: string;
  clientEmail?: string;
  date: Date;
  dueDate: Date;
  description: string;
  milestoneLabel?: string;
  amountMinor: number;
  paidMinor: number;
  journalId: Types.ObjectId;
  journalNumber: string;
  createdBy: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ClientInvoiceDocument = HydratedDocument<IClientInvoice>;

const clientInvoiceSchema = new Schema<IClientInvoice>(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    type: {
      type: String,
      required: true,
      enum: Object.values(InvoiceType),
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(InvoiceStatus),
      default: InvoiceStatus.ISSUED,
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    projectCode: { type: String, required: true },
    projectName: { type: String, required: true },
    clientName: { type: String, required: true },
    clientEmail: { type: String, trim: true, lowercase: true },
    date: { type: Date, required: true, index: true },
    dueDate: { type: Date, required: true, index: true },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    milestoneLabel: { type: String, trim: true, maxlength: 160 },
    amountMinor: { type: Number, required: true, min: 1 },
    paidMinor: { type: Number, required: true, default: 0, min: 0 },
    journalId: {
      type: Schema.Types.ObjectId,
      ref: 'JournalEntry',
      required: true,
    },
    journalNumber: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'client_invoices' },
);

clientInvoiceSchema.index({ status: 1, dueDate: 1 });
clientInvoiceSchema.index({ journalId: 1 });

export const ClientInvoiceModel =
  (models.ClientInvoice as Model<IClientInvoice> | undefined) ??
  model<IClientInvoice>('ClientInvoice', clientInvoiceSchema);
