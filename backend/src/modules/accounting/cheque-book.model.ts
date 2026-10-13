import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose';

export const ChequeLeafStatus = {
  AVAILABLE: 'available',
  ISSUED: 'issued',
  CANCELLED: 'cancelled',
} as const;

export type ChequeLeafStatus = (typeof ChequeLeafStatus)[keyof typeof ChequeLeafStatus];

/** A company chequebook received from the bank for one of our own bank accounts. */
export interface IChequeBook {
  treasuryId: Types.ObjectId;
  bankAccountCode: string;
  bankName: string;
  bookName: string;
  prefix: string;
  startNumber: string;
  endNumber: string;
  leafCount: number;
  receivedDate?: Date;
  notes?: string;
  createdBy: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

/** One physical leaf of a company chequebook. */
export interface IChequeLeaf {
  bookId: Types.ObjectId;
  treasuryId: Types.ObjectId;
  bankAccountCode: string;
  /** Printed number including the book prefix and zero padding. */
  chequeNumber: string;
  sequence: number;
  status: ChequeLeafStatus;
  journalId?: Types.ObjectId;
  journalNumber?: string;
  issuedAt?: Date;
  issuedBy?: Types.ObjectId;
  payeeName?: string;
  amountMinor?: number;
  chequeDate?: Date;
  cancelReason?: string;
  cancelledAt?: Date;
  cancelledBy?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ChequeBookDocument = HydratedDocument<IChequeBook>;
export type ChequeLeafDocument = HydratedDocument<IChequeLeaf>;

const chequeBookSchema = new Schema<IChequeBook>(
  {
    treasuryId: {
      type: Schema.Types.ObjectId,
      ref: 'TreasuryAccount',
      required: true,
      index: true,
    },
    bankAccountCode: { type: String, required: true, index: true },
    bankName: { type: String, required: true },
    bookName: { type: String, required: true, trim: true, maxlength: 80 },
    prefix: { type: String, default: '', trim: true, maxlength: 12 },
    startNumber: { type: String, required: true },
    endNumber: { type: String, required: true },
    leafCount: { type: Number, required: true, min: 1 },
    receivedDate: { type: Date },
    notes: { type: String, trim: true, maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'cheque_books' },
);

const chequeLeafSchema = new Schema<IChequeLeaf>(
  {
    bookId: {
      type: Schema.Types.ObjectId,
      ref: 'ChequeBook',
      required: true,
      index: true,
    },
    treasuryId: { type: Schema.Types.ObjectId, ref: 'TreasuryAccount', required: true },
    bankAccountCode: { type: String, required: true },
    chequeNumber: { type: String, required: true },
    sequence: { type: Number, required: true },
    status: {
      type: String,
      required: true,
      enum: Object.values(ChequeLeafStatus),
      default: ChequeLeafStatus.AVAILABLE,
    },
    journalId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', index: true },
    journalNumber: { type: String },
    issuedAt: { type: Date },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    payeeName: { type: String, trim: true, maxlength: 200 },
    amountMinor: { type: Number, min: 0 },
    chequeDate: { type: Date },
    cancelReason: { type: String, trim: true, maxlength: 240 },
    cancelledAt: { type: Date },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'cheque_leaves' },
);

/** A printed cheque number can exist only once per bank account. */
chequeLeafSchema.index({ bankAccountCode: 1, chequeNumber: 1 }, { unique: true });
chequeLeafSchema.index({ bankAccountCode: 1, status: 1, sequence: 1 });

export const ChequeBookModel =
  (models.ChequeBook as Model<IChequeBook> | undefined) ??
  model<IChequeBook>('ChequeBook', chequeBookSchema);

export const ChequeLeafModel =
  (models.ChequeLeaf as Model<IChequeLeaf> | undefined) ??
  model<IChequeLeaf>('ChequeLeaf', chequeLeafSchema);
