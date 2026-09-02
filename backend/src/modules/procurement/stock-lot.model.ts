import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose';

export interface IStockLot {
  warehouseId: Types.ObjectId;
  itemId: Types.ObjectId;
  sku: string;
  itemName: string;
  unit: string;
  purchaseOrderId: Types.ObjectId;
  poNumber: string;
  poLineId: Types.ObjectId;
  unitCostMinor: number;
  receivedMilli: number;
  remainingMilli: number;
  receivedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type StockLotDocument = HydratedDocument<IStockLot>;

const stockLotSchema = new Schema<IStockLot>(
  {
    warehouseId: {
      type: Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true,
      index: true,
    },
    itemId: { type: Schema.Types.ObjectId, ref: 'Item', required: true, index: true },
    sku: { type: String, required: true },
    itemName: { type: String, required: true },
    unit: { type: String, required: true },
    purchaseOrderId: {
      type: Schema.Types.ObjectId,
      ref: 'PurchaseOrder',
      required: true,
      index: true,
    },
    poNumber: { type: String, required: true },
    poLineId: { type: Schema.Types.ObjectId, required: true, index: true },
    unitCostMinor: { type: Number, required: true, min: 1 },
    receivedMilli: { type: Number, required: true, min: 1 },
    remainingMilli: { type: Number, required: true, min: 0 },
    receivedAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'stock_lots' },
);

stockLotSchema.index({ warehouseId: 1, itemId: 1, receivedAt: 1 });

export const StockLotModel =
  (models.StockLot as Model<IStockLot> | undefined) ??
  model<IStockLot>('StockLot', stockLotSchema);
