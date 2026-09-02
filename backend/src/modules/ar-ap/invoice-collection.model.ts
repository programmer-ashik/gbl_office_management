import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose';

export interface IInvoiceCollection {
  collectionNumber: string;
  invoiceId: Types.ObjectId;
  invoiceNumber: string;
  projectId: Types.ObjectId;
  amountMinor: number;
  date: Date;
  treasuryId: Types.ObjectId;
  treasuryAccountCode: string;
  journalId: Types.ObjectId;
  journalNumber: string;
  createdBy: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export type InvoiceCollectionDocument = HydratedDocument<IInvoiceCollection>;

const invoiceCollectionSchema = new Schema<IInvoiceCollection>(
  {
    collectionNumber: { type: String, required: true, unique: true },
    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: 'ClientInvoice',
      required: true,
      index: true,
    },
    invoiceNumber: { type: String, required: true },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    amountMinor: { type: Number, required: true, min: 1 },
    date: { type: Date, required: true, index: true },
    treasuryId: {
      type: Schema.Types.ObjectId,
      ref: 'TreasuryAccount',
      required: true,
    },
    treasuryAccountCode: { type: String, required: true },
    journalId: {
      type: Schema.Types.ObjectId,
      ref: 'JournalEntry',
      required: true,
    },
    journalNumber: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'invoice_collections' },
);

export const InvoiceCollectionModel =
  (models.InvoiceCollection as Model<IInvoiceCollection> | undefined) ??
  model<IInvoiceCollection>('InvoiceCollection', invoiceCollectionSchema);
