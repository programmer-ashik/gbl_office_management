import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose';

export interface IStockIssueLine {
  itemId: Types.ObjectId;
  sku: string;
  name: string;
  unit: string;
  quantityMilli: number;
  amountMinor: number;
}

export interface IStockIssue {
  issueNumber: string;
  warehouseId: Types.ObjectId;
  warehouseCode: string;
  warehouseName: string;
  projectId: Types.ObjectId;
  projectCode: string;
  projectName: string;
  date: Date;
  amountMinor: number;
  lines: IStockIssueLine[];
  journalId: Types.ObjectId;
  journalNumber: string;
  createdBy: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export type StockIssueDocument = HydratedDocument<IStockIssue>;

const stockIssueLineSchema = new Schema<IStockIssueLine>(
  {
    itemId: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    sku: { type: String, required: true },
    name: { type: String, required: true },
    unit: { type: String, required: true },
    quantityMilli: { type: Number, required: true, min: 1 },
    amountMinor: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const stockIssueSchema = new Schema<IStockIssue>(
  {
    issueNumber: { type: String, required: true, unique: true },
    warehouseId: {
      type: Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true,
      index: true,
    },
    warehouseCode: { type: String, required: true },
    warehouseName: { type: String, required: true },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    projectCode: { type: String, required: true },
    projectName: { type: String, required: true },
    date: { type: Date, required: true, index: true },
    amountMinor: { type: Number, required: true, min: 1 },
    lines: { type: [stockIssueLineSchema], required: true },
    journalId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', required: true },
    journalNumber: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'stock_issues' },
);

export const StockIssueModel =
  (models.StockIssue as Model<IStockIssue> | undefined) ??
  model<IStockIssue>('StockIssue', stockIssueSchema);
