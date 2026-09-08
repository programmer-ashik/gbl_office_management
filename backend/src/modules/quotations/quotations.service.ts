import { Types } from 'mongoose';
import { Role } from '../../common/enums/role.enum';
import { QuotationStatus } from '../../common/enums/quotation-status.enum';
import {
  badRequest,
  forbidden,
  notFound,
} from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { fromMinorUnits, toMinorUnits } from '../../common/utils/money';
import { CounterModel } from '../accounting/counter.model';
import { ItemModel } from '../procurement/item.model';
import { ProjectModel } from '../projects/project.model';
import type { UsersService } from '../users/users.service';
import type { CreateQuotationDto } from './dto/quotation.dto';
import {
  QuotationModel,
  type PublicQuotation,
  type QuotationDocument,
} from './quotation.model';

const DEFAULT_TERMS =
  'Prices are valid for 30 days. Payment terms as agreed. Thank you for your business.';

export type QuotationListFilters = {
  createdBy?: string;
  projectId?: string;
  status?: QuotationStatus;
  fromDate?: Date;
  toDate?: Date;
};

export class QuotationsService {
  constructor(private readonly usersService: UsersService) {}

  async list(
    actor: AuthenticatedUser,
    filters: QuotationListFilters = {},
  ): Promise<PublicQuotation[]> {
    const query: Record<string, unknown> = {};
    const canAudit =
      actor.role === Role.ADMIN || actor.role === Role.ACCOUNTANT;

    if (!canAudit) {
      query.createdBy = new Types.ObjectId(actor.userId);
    } else if (filters.createdBy && Types.ObjectId.isValid(filters.createdBy)) {
      query.createdBy = new Types.ObjectId(filters.createdBy);
    }

    if (filters.projectId && Types.ObjectId.isValid(filters.projectId)) {
      query.projectId = new Types.ObjectId(filters.projectId);
    }
    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.fromDate || filters.toDate) {
      const range: Record<string, Date> = {};
      if (filters.fromDate) {
        const start = new Date(filters.fromDate);
        start.setUTCHours(0, 0, 0, 0);
        range.$gte = start;
      }
      if (filters.toDate) {
        const end = new Date(filters.toDate);
        end.setUTCHours(23, 59, 59, 999);
        range.$lte = end;
      }
      query.createdAt = range;
    }

    const rows = await QuotationModel.find(query)
      .sort({ createdAt: -1 })
      .limit(500)
      .exec();
    return rows.map((row) => this.toPublic(row));
  }

  async getById(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<PublicQuotation> {
    const doc = await this.findOwnedOrAdmin(id, actor);
    return this.toPublic(doc);
  }

  async create(
    dto: CreateQuotationDto,
    actor: AuthenticatedUser,
  ): Promise<PublicQuotation> {
    if (!dto.items?.length) {
      throw badRequest('At least one quotation item is required');
    }

    let projectId: Types.ObjectId | undefined;
    let projectCode: string | undefined;
    let projectName: string | undefined;
    // Project is assigned on approve — ignore create-time projectId.
    void dto.projectId;

    const items = [];
    for (const line of dto.items) {
      let productName = line.productName.trim();
      let productId: Types.ObjectId | undefined;
      if (line.productId) {
        if (!Types.ObjectId.isValid(line.productId)) {
          throw badRequest('Invalid product id');
        }
        const item = await ItemModel.findById(line.productId).exec();
        if (!item || !item.isActive) {
          throw notFound(`Product ${line.productId} not found`);
        }
        productId = item._id;
        if (!productName) productName = `${item.sku} · ${item.name}`;
      }
      if (!productName) throw badRequest('Product name is required');

      const discountRate = line.discount ?? 0;
      const grossMinor = Math.round(
        toMinorUnits(line.unitPrice) * line.quantity,
      );
      const lineTotalMinor = Math.round(
        grossMinor * (1 - discountRate / 100),
      );
      items.push({
        productId,
        productName,
        unitPriceMinor: toMinorUnits(line.unitPrice),
        quantity: line.quantity,
        discountRate,
        lineTotalMinor,
      });
    }

    const subTotalMinor = items.reduce(
      (sum, row) => sum + row.lineTotalMinor,
      0,
    );
    const taxRate = dto.taxRate ?? 0;
    const taxAmountMinor = Math.round((subTotalMinor * taxRate) / 100);
    const grandTotalMinor = subTotalMinor + taxAmountMinor;

    const user = await this.usersService.findById(actor.userId);
    const createdByName = user
      ? `${user.firstName} ${user.lastName}`.trim()
      : actor.email;

    const year = new Date().getUTCFullYear();
    const counter = await CounterModel.findOneAndUpdate(
      { key: `quotation:${year}` },
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    );
    const seq = counter?.seq ?? 1;
    const quotationNumber = `QT-${year}-${String(seq).padStart(3, '0')}`;

    const created = await QuotationModel.create({
      quotationNumber,
      projectId,
      projectCode,
      projectName,
      createdBy: new Types.ObjectId(actor.userId),
      createdByName,
      clientInfo: {
        name: dto.clientInfo.name.trim(),
        phone: dto.clientInfo.phone?.trim(),
        company: dto.clientInfo.company?.trim(),
      },
      items,
      subTotalMinor,
      taxRate,
      taxAmountMinor,
      grandTotalMinor,
      status: dto.status ?? QuotationStatus.DRAFT,
      notes: dto.notes?.trim(),
      terms: dto.terms?.trim() || DEFAULT_TERMS,
    });

    return this.toPublic(created);
  }

  async updateStatus(
    id: string,
    status: QuotationStatus,
    actor: AuthenticatedUser,
    projectId?: string,
  ): Promise<PublicQuotation> {
    const doc = await this.findOwnedOrAdmin(id, actor);
    const canApprove =
      actor.role === Role.ADMIN || actor.role === Role.ACCOUNTANT;

    if (status === QuotationStatus.SENT) {
      if (doc.status !== QuotationStatus.DRAFT) {
        throw badRequest('Only draft quotations can be marked sent');
      }
    } else if (status === QuotationStatus.APPROVED) {
      if (!canApprove) {
        throw forbidden('Only admin or accountant can approve quotations');
      }
      if (doc.status !== QuotationStatus.SENT) {
        throw badRequest('Only sent quotations can be approved');
      }
      const assignId = projectId || doc.projectId?.toString();
      if (!assignId) {
        throw badRequest('Select a project before approving the quotation');
      }
      if (!Types.ObjectId.isValid(assignId)) {
        throw badRequest('Invalid project id');
      }
      const project = await ProjectModel.findById(assignId).exec();
      if (!project) throw notFound('Project not found');
      doc.projectId = project._id;
      doc.projectCode = project.code;
      doc.projectName = project.name;
    } else if (status === QuotationStatus.REJECTED) {
      if (!canApprove) {
        throw forbidden('Only admin or accountant can reject quotations');
      }
      if (doc.status !== QuotationStatus.SENT) {
        throw badRequest('Only sent quotations can be rejected');
      }
    }

    doc.status = status;
    await doc.save();
    return this.toPublic(doc);
  }

  private async findOwnedOrAdmin(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<QuotationDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw badRequest('Invalid quotation id');
    }
    const doc = await QuotationModel.findById(id).exec();
    if (!doc) throw notFound('Quotation not found');
    const canAudit =
      actor.role === Role.ADMIN || actor.role === Role.ACCOUNTANT;
    if (!canAudit && doc.createdBy.toString() !== actor.userId) {
      throw forbidden('You can only access your own quotations');
    }
    return doc;
  }

  private toPublic(doc: QuotationDocument): PublicQuotation {
    return {
      id: doc._id.toString(),
      quotationNumber: doc.quotationNumber,
      projectId: doc.projectId ? doc.projectId.toString() : null,
      projectCode: doc.projectCode ?? null,
      projectName: doc.projectName ?? null,
      createdBy: doc.createdBy.toString(),
      createdByName: doc.createdByName,
      clientInfo: {
        name: doc.clientInfo.name,
        phone: doc.clientInfo.phone ?? null,
        company: doc.clientInfo.company ?? null,
      },
      items: doc.items.map((item) => ({
        id: item._id.toString(),
        productId: item.productId ? item.productId.toString() : null,
        productName: item.productName,
        unitPrice: fromMinorUnits(item.unitPriceMinor),
        quantity: item.quantity,
        discount: item.discountRate,
        lineTotal: fromMinorUnits(item.lineTotalMinor),
      })),
      subTotal: fromMinorUnits(doc.subTotalMinor),
      taxRate: doc.taxRate,
      taxAmount: fromMinorUnits(doc.taxAmountMinor),
      grandTotal: fromMinorUnits(doc.grandTotalMinor),
      status: doc.status,
      notes: doc.notes ?? null,
      terms: doc.terms ?? null,
      createdAt: (doc.createdAt ?? new Date()).toISOString(),
      updatedAt: (doc.updatedAt ?? new Date()).toISOString(),
    };
  }
}
