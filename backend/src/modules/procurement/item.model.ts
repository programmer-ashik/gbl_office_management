import { HydratedDocument, Model, Schema, model, models } from 'mongoose';

export interface IItem {
  sku: string;
  name: string;
  unit: string;
  brand?: string;
  model?: string;
  countryOfOrigin?: string;
  technicalSpecification?: string;
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
    brand: { type: String, trim: true, maxlength: 120 },
    model: { type: String, trim: true, maxlength: 120 },
    countryOfOrigin: { type: String, trim: true, maxlength: 120 },
    technicalSpecification: { type: String, trim: true, maxlength: 2000 },
    isActive: { type: Boolean, required: true, default: true, index: true },
  },
  { timestamps: true, collection: 'items' },
);

export const ItemModel =
  (models.Item as Model<IItem> | undefined) ??
  model<IItem>('Item', itemSchema);
