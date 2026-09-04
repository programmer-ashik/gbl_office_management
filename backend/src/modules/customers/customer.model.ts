import { HydratedDocument, Model, Schema, model, models } from 'mongoose';

export interface ICustomer {
  customerNumber: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CustomerDocument = HydratedDocument<ICustomer>;

const customerSchema = new Schema<ICustomer>(
  {
    customerNumber: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    contactName: { type: String, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, maxlength: 160 },
    phone: { type: String, trim: true, maxlength: 40 },
    address: { type: String, trim: true, maxlength: 240 },
    isActive: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: 'customers' },
);

customerSchema.index({ name: 1 });
customerSchema.index({ isActive: 1 });

export const CustomerModel =
  (models.Customer as Model<ICustomer> | undefined) ??
  model<ICustomer>('Customer', customerSchema);

export type PublicCustomer = {
  id: string;
  customerNumber: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
};

export function toPublicCustomer(doc: CustomerDocument): PublicCustomer {
  return {
    id: doc._id.toString(),
    customerNumber: doc.customerNumber,
    name: doc.name,
    contactName: doc.contactName ?? null,
    email: doc.email ?? null,
    phone: doc.phone ?? null,
    address: doc.address ?? null,
    isActive: doc.isActive,
  };
}
