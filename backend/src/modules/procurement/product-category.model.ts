import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose';

export interface IProductCategory {
  name: string;
  code?: string;
  /** null/undefined = top-level category; set = sub-category under a parent */
  parentId?: Types.ObjectId | null;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ProductCategoryDocument = HydratedDocument<IProductCategory>;

export type PublicProductCategory = {
  id: string;
  name: string;
  code: string | null;
  parentId: string | null;
  isActive: boolean;
};

const productCategorySchema = new Schema<IProductCategory>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    code: { type: String, trim: true, uppercase: true, maxlength: 32 },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: 'ProductCategory',
      default: null,
      index: true,
    },
    isActive: { type: Boolean, required: true, default: true, index: true },
  },
  { timestamps: true, collection: 'product_categories' },
);

productCategorySchema.index({ parentId: 1, name: 1 });

export const ProductCategoryModel =
  (models.ProductCategory as Model<IProductCategory> | undefined) ??
  model<IProductCategory>('ProductCategory', productCategorySchema);

export function toPublicProductCategory(
  row: ProductCategoryDocument,
): PublicProductCategory {
  return {
    id: row._id.toString(),
    name: row.name,
    code: row.code ?? null,
    parentId: row.parentId ? row.parentId.toString() : null,
    isActive: row.isActive,
  };
}
