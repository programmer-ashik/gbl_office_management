import { HydratedDocument, Model, Schema, model, models } from 'mongoose';

export interface IWarehouse {
  code: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type WarehouseDocument = HydratedDocument<IWarehouse>;

const warehouseSchema = new Schema<IWarehouse>(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    isDefault: { type: Boolean, required: true, default: false },
    isActive: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: 'warehouses' },
);

export const WarehouseModel =
  (models.Warehouse as Model<IWarehouse> | undefined) ??
  model<IWarehouse>('Warehouse', warehouseSchema);
