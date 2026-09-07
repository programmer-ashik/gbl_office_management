import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose';
import { QuotationStatus } from '../../common/enums/quotation-status.enum';

export interface IQuotationItem {
  _id: Types.ObjectId;
  productId?: Types.ObjectId;
  productName: string;
  unitPriceMinor: number;
  quantity: number;
  discountRate: number;
  lineTotalMinor: number;
}

export interface IQuotationClientInfo {
  name: string;
  phone?: string;
  company?: string;
}

export interface IQuotation {
  quotationNumber: string;
  projectId?: Types.ObjectId;
  projectCode?: string;
  projectName?: string;
  createdBy: Types.ObjectId;
  createdByName: string;
  clientInfo: IQuotationClientInfo;
  items: IQuotationItem[];
  subTotalMinor: number;
  taxRate: number;
  taxAmountMinor: number;
  grandTotalMinor: number;
  status: QuotationStatus;
  notes?: string;
  terms?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type QuotationDocument = HydratedDocument<IQuotation>;

export type PublicQuotationItem = {
  id: string;
  productId: string | null;
  productName: string;
  unitPrice: number;
  quantity: number;
  discount: number;
  lineTotal: number;
};

export type PublicQuotation = {
  id: string;
  quotationNumber: string;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  createdBy: string;
  createdByName: string;
  clientInfo: {
    name: string;
    phone: string | null;
    company: string | null;
  };
  items: PublicQuotationItem[];
  subTotal: number;
  taxRate: number;
  taxAmount: number;
  grandTotal: number;
  status: QuotationStatus;
  notes: string | null;
  terms: string | null;
  createdAt: string;
  updatedAt: string;
};

const quotationItemSchema = new Schema<IQuotationItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Item' },
    productName: { type: String, required: true, trim: true, maxlength: 200 },
    unitPriceMinor: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 0.001 },
    discountRate: { type: Number, required: true, default: 0, min: 0, max: 100 },
    lineTotalMinor: { type: Number, required: true, min: 0 },
  },
  { _id: true },
);

const quotationSchema = new Schema<IQuotation>(
  {
    quotationNumber: { type: String, required: true, unique: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', index: true },
    projectCode: { type: String, trim: true },
    projectName: { type: String, trim: true },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    createdByName: { type: String, required: true, trim: true },
    clientInfo: {
      name: { type: String, required: true, trim: true, maxlength: 160 },
      phone: { type: String, trim: true, maxlength: 40 },
      company: { type: String, trim: true, maxlength: 160 },
    },
    items: { type: [quotationItemSchema], required: true },
    subTotalMinor: { type: Number, required: true, min: 0 },
    taxRate: { type: Number, required: true, default: 0, min: 0, max: 100 },
    taxAmountMinor: { type: Number, required: true, min: 0 },
    grandTotalMinor: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      required: true,
      enum: Object.values(QuotationStatus),
      default: QuotationStatus.DRAFT,
      index: true,
    },
    notes: { type: String, trim: true, maxlength: 2000 },
    terms: { type: String, trim: true, maxlength: 4000 },
  },
  { timestamps: true, collection: 'quotations' },
);

quotationSchema.index({ createdAt: -1 });
quotationSchema.index({ createdBy: 1, createdAt: -1 });

export const QuotationModel =
  (models.Quotation as Model<IQuotation> | undefined) ??
  model<IQuotation>('Quotation', quotationSchema);
