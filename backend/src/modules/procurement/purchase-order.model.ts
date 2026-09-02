import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose';
import {
  PurchaseDestination,
  PurchaseOrderStatus,
} from '../../common/enums/procurement.enum';

export interface IPurchaseOrderLine {
  _id: Types.ObjectId;
  itemId: Types.ObjectId;
  sku: string;
  name: string;
  unit: string;
  quantityMilli: number;
  unitCostMinor: number;
  lineTotalMinor: number;
  receivedMilli: number;
  returnedMilli: number;
}

export interface IPurchaseOrder {
  poNumber: string;
  status: PurchaseOrderStatus;
  destination: PurchaseDestination;
  supplierId: Types.ObjectId;
  supplierNumber: string;
  supplierName: string;
  projectId?: Types.ObjectId;
  projectCode?: string;
  projectName?: string;
  warehouseId?: Types.ObjectId;
  warehouseCode?: string;
  warehouseName?: string;
  date: Date;
  notes?: string;
  orderedMinor: number;
  receivedMinor: number;
  returnedMinor: number;
  lines: IPurchaseOrderLine[];
  createdBy: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export type PurchaseOrderDocument = HydratedDocument<IPurchaseOrder>;

const purchaseOrderLineSchema = new Schema<IPurchaseOrderLine>(
  {
    itemId: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    sku: { type: String, required: true },
    name: { type: String, required: true },
    unit: { type: String, required: true },
    quantityMilli: { type: Number, required: true, min: 1 },
    unitCostMinor: { type: Number, required: true, min: 1 },
    lineTotalMinor: { type: Number, required: true, min: 1 },
    receivedMilli: { type: Number, required: true, default: 0, min: 0 },
    returnedMilli: { type: Number, required: true, default: 0, min: 0 },
  },
  { _id: true },
);

const purchaseOrderSchema = new Schema<IPurchaseOrder>(
  {
    poNumber: { type: String, required: true, unique: true },
    status: {
      type: String,
      required: true,
      enum: Object.values(PurchaseOrderStatus),
      default: PurchaseOrderStatus.ISSUED,
      index: true,
    },
    destination: {
      type: String,
      required: true,
      enum: Object.values(PurchaseDestination),
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
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
    warehouseCode: { type: String },
    warehouseName: { type: String },
    date: { type: Date, required: true, index: true },
    notes: { type: String, trim: true, maxlength: 500 },
    orderedMinor: { type: Number, required: true, min: 1 },
    receivedMinor: { type: Number, required: true, default: 0, min: 0 },
    returnedMinor: { type: Number, required: true, default: 0, min: 0 },
    lines: { type: [purchaseOrderLineSchema], required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'purchase_orders' },
);

purchaseOrderSchema.index({ status: 1, date: -1 });

export const PurchaseOrderModel =
  (models.PurchaseOrder as Model<IPurchaseOrder> | undefined) ??
  model<IPurchaseOrder>('PurchaseOrder', purchaseOrderSchema);
