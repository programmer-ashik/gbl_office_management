import { Types } from 'mongoose';
import { badRequest, notFound } from '../../common/errors/app-error';
import { CounterModel } from '../accounting/counter.model';
import { withTransaction } from '../../database/connection';
import type { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import {
  CustomerModel,
  toPublicCustomer,
  type PublicCustomer,
} from './customer.model';

export class CustomersService {
  async list(activeOnly = false): Promise<PublicCustomer[]> {
    const filter = activeOnly ? { isActive: true } : {};
    const rows = await CustomerModel.find(filter).sort({ name: 1 }).exec();
    return rows.map(toPublicCustomer);
  }

  async create(dto: CreateCustomerDto): Promise<PublicCustomer> {
    const created = await withTransaction(async (session) => {
      const year = new Date().getUTCFullYear();
      const counter = await CounterModel.findOneAndUpdate(
        { key: `customer:${year}` },
        { $inc: { seq: 1 } },
        { upsert: true, new: true, session },
      );
      const seq = counter?.seq ?? 1;
      const customerNumber = `CUS-${year}-${String(seq).padStart(4, '0')}`;
      const [doc] = await CustomerModel.create(
        [
          {
            customerNumber,
            name: dto.name.trim(),
            contactName: dto.contactName?.trim(),
            email: dto.email?.trim().toLowerCase(),
            phone: dto.phone?.trim(),
            address: dto.address?.trim(),
            isActive: true,
          },
        ],
        { session },
      );
      return doc;
    });
    return toPublicCustomer(created);
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<PublicCustomer> {
    if (!Types.ObjectId.isValid(id)) {
      throw badRequest('Invalid customer id');
    }
    const doc = await CustomerModel.findById(id).exec();
    if (!doc) {
      throw notFound('Customer not found');
    }
    if (dto.name !== undefined) doc.name = dto.name.trim();
    if (dto.contactName !== undefined) doc.contactName = dto.contactName.trim();
    if (dto.email !== undefined) doc.email = dto.email.trim().toLowerCase();
    if (dto.phone !== undefined) doc.phone = dto.phone.trim();
    if (dto.address !== undefined) doc.address = dto.address.trim();
    if (dto.isActive !== undefined) doc.isActive = dto.isActive;
    await doc.save();
    return toPublicCustomer(doc);
  }

  async assertExists(id: string): Promise<PublicCustomer> {
    if (!Types.ObjectId.isValid(id)) {
      throw badRequest('Invalid customer id');
    }
    const doc = await CustomerModel.findById(id).exec();
    if (!doc || !doc.isActive) {
      throw notFound('Customer not found');
    }
    return toPublicCustomer(doc);
  }

  async findById(id: string): Promise<PublicCustomer | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await CustomerModel.findById(id).exec();
    return doc ? toPublicCustomer(doc) : null;
  }
}
