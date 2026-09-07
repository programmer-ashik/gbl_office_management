import { Types } from 'mongoose';
import { HydratedDocument, Model, Schema, model, models } from 'mongoose';

export interface IItem {
  sku: string;
  name: string;
  unit: string;
  description?: string;
  /** List / quote price in minor units */
  unitPriceMinor?: number;
  /** Default catalog quantity hint */
  quantity?: number;
  brand?: string;
  model?: string;
  countryOfOrigin?: string;
  technicalSpecification?: string;
  categoryId?: Types.ObjectId;
  subCategoryId?: Types.ObjectId;
  supplierId?: Types.ObjectId;
  supplierName?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ItemDocument = HydratedDocument<IItem>;

const itemSchema = new Schema<IItem>(
  {
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    unit: { type: String, required: true, trim: true, maxlength: 24 },
    description: { type: String, trim: true, maxlength: 2000 },
    unitPriceMinor: { type: Number, min: 0 },
    quantity: { type: Number, min: 0 },
    brand: { type: String, trim: true, maxlength: 120 },
    model: { type: String, trim: true, maxlength: 120 },
    countryOfOrigin: { type: String, trim: true, maxlength: 120 },
    technicalSpecification: { type: String, trim: true, maxlength: 2000 },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'ProductCategory',
      index: true,
    },
    subCategoryId: {
      type: Schema.Types.ObjectId,
      ref: 'ProductCategory',
      index: true,
    },
    supplierId: {
      type: Schema.Types.ObjectId,
      ref: 'Supplier',
      index: true,
    },
    supplierName: { type: String, trim: true, maxlength: 160 },
    isActive: { type: Boolean, required: true, default: true, index: true },
  },
  { timestamps: true, collection: 'items' },
);

export const ItemModel =
  (models.Item as Model<IItem> | undefined) ??
  model<IItem>('Item', itemSchema);
