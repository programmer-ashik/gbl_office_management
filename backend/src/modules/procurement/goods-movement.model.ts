import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose';
import {
  PurchaseDestination,
  VendorLedgerType,
} from '../../common/enums/procurement.enum';

export interface IGoodsMovementLine {
  poLineId: Types.ObjectId;
  itemId: Types.ObjectId;
  sku: string;
  name: string;
  unit: string;
  quantityMilli: number;
  unitCostMinor: number;
  amountMinor: number;
}

export interface IGoodsMovement {
  movementNumber: string;
  type: VendorLedgerType;
  destination: PurchaseDestination;
  purchaseOrderId: Types.ObjectId;
  poNumber: string;
  supplierId: Types.ObjectId;
  supplierName: string;
  projectId?: Types.ObjectId;
  warehouseId?: Types.ObjectId;
  date: Date;
  amountMinor: number;
  lines: IGoodsMovementLine[];
  journalId: Types.ObjectId;
  journalNumber: string;
  createdBy: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export type GoodsMovementDocument = HydratedDocument<IGoodsMovement>;

const movementLineSchema = new Schema<IGoodsMovementLine>(
  {
    poLineId: { type: Schema.Types.ObjectId, required: true },
    itemId: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    sku: { type: String, required: true },
    name: { type: String, required: true },
    unit: { type: String, required: true },
    quantityMilli: { type: Number, required: true, min: 1 },
    unitCostMinor: { type: Number, required: true, min: 1 },
    amountMinor: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const goodsMovementSchema = new Schema<IGoodsMovement>(
  {
    movementNumber: { type: String, required: true, unique: true },
    type: {
      type: String,
      required: true,
      enum: Object.values(VendorLedgerType),
      index: true,
    },
    destination: {
      type: String,
      required: true,
      enum: Object.values(PurchaseDestination),
    },
    purchaseOrderId: {
      type: Schema.Types.ObjectId,
      ref: 'PurchaseOrder',
      required: true,
      index: true,
    },
    poNumber: { type: String, required: true },
    supplierId: {
      type: Schema.Types.ObjectId,
      ref: 'Supplier',
      required: true,
      index: true,
    },
    supplierName: { type: String, required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
    date: { type: Date, required: true, index: true },
    amountMinor: { type: Number, required: true, min: 1 },
    lines: { type: [movementLineSchema], required: true },
    journalId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', required: true },
    journalNumber: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'goods_movements' },
);

export const GoodsMovementModel =
  (models.GoodsMovement as Model<IGoodsMovement> | undefined) ??
  model<IGoodsMovement>('GoodsMovement', goodsMovementSchema);
