import { HydratedDocument, Model, Schema, model, models } from 'mongoose';

export interface ISupplier {
  supplierNumber: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxId?: string;
  paymentTermsDays: number;
  notes?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type SupplierDocument = HydratedDocument<ISupplier>;

const supplierSchema = new Schema<ISupplier>(
  {
    supplierNumber: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    contactName: { type: String, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, maxlength: 160 },
    phone: { type: String, trim: true, maxlength: 40 },
    address: { type: String, trim: true, maxlength: 240 },
    taxId: { type: String, trim: true, maxlength: 40 },
    paymentTermsDays: { type: Number, required: true, min: 0, default: 30 },
    notes: { type: String, trim: true, maxlength: 500 },
    isActive: { type: Boolean, required: true, default: true, index: true },
  },
  { timestamps: true, collection: 'suppliers' },
);

supplierSchema.index({ name: 1 });

export const SupplierModel =
  (models.Supplier as Model<ISupplier> | undefined) ??
  model<ISupplier>('Supplier', supplierSchema);
