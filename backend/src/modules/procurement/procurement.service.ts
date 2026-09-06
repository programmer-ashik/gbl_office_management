import { Types } from 'mongoose';
import {
  PurchaseDestination,
  PurchaseOrderStatus,
  VendorLedgerType,
} from '../../common/enums/procurement.enum';
import { Role } from '../../common/enums/role.enum';
import { badRequest, forbidden, notFound } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { fromMinorUnits, toMinorUnits } from '../../common/utils/money';
import {
  fromMilliQty,
  lineAmountMinor,
  toMilliQty,
} from '../../common/utils/quantity';
import { CounterModel } from '../accounting/counter.model';
import type { JournalService } from '../accounting/journal.service';
import { SystemAccountCode } from '../accounting/system-account-codes';
import type { BankingService } from '../banking/banking.service';
import { isBankLike, isCashLike } from '../../common/enums/treasury-kind.enum';
import type { ProjectsService } from '../projects/projects.service';
import {
  buildIssueJournalLines,
  buildReceiptJournalLines,
  buildReturnJournalLines,
  type ReceiptSettlement,
} from './allocation';
import type {
  CreateItemDto,
  CreatePurchaseOrderDto,
  CreateSupplierDto,
  IssueStockDto,
  ReceiveGoodsDto,
  ReturnGoodsDto,
} from './dto/procurement.dto';
import { GoodsMovementModel } from './goods-movement.model';
import { ItemModel, type ItemDocument } from './item.model';
import {
  PurchaseOrderModel,
  type PurchaseOrderDocument,
} from './purchase-order.model';
import { StockIssueModel } from './stock-issue.model';
import { StockLotModel } from './stock-lot.model';
import { SupplierModel, type SupplierDocument } from './supplier.model';
import { WarehouseModel, type WarehouseDocument } from './warehouse.model';

const FINANCE_ROLES = new Set([Role.ADMIN, Role.ACCOUNTANT]);
const PROCUREMENT_ROLES = new Set([
  Role.ADMIN,
  Role.ACCOUNTANT,
  Role.PROJECT_MANAGER,
]);

export type PublicSupplier = {
  id: string;
  supplierNumber: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  paymentTermsDays: number;
  notes: string | null;
  isActive: boolean;
};

export type PublicItem = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  brand: string | null;
  model: string | null;
  countryOfOrigin: string | null;
  technicalSpecification: string | null;
  isActive: boolean;
};

export type PublicWarehouse = {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
};

export type PublicPurchaseOrderLine = {
  id: string;
  itemId: string;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
  receivedQty: number;
  returnedQty: number;
  outstandingQty: number;
};

export type PublicPurchaseOrder = {
  id: string;
  poNumber: string;
  status: PurchaseOrderStatus;
  destination: PurchaseDestination;
  supplierId: string;
  supplierNumber: string;
  supplierName: string;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  warehouseId: string | null;
  warehouseCode: string | null;
  warehouseName: string | null;
  date: string;
  notes: string | null;
  orderedAmount: number;
  receivedAmount: number;
  returnedAmount: number;
  outstandingPayable: number;
  lines: PublicPurchaseOrderLine[];
};

export type PublicStockRow = {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  itemId: string;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  value: number;
};

export type PublicVendorLedger = {
  supplier: PublicSupplier;
  purchased: number;
  returned: number;
  outstanding: number;
  entries: Array<{
    id: string;
    date: string;
    type: VendorLedgerType;
    reference: string;
    poNumber: string;
    journalNumber: string;
    amount: number;
    runningOutstanding: number;
  }>;
};

export class ProcurementService {
  constructor(
    private readonly journalService: JournalService,
    private readonly projectsService: ProjectsService,
    private readonly bankingService: BankingService,
  ) {}

  async seedDefaults(): Promise<void> {
    const count = await WarehouseModel.countDocuments().exec();
    if (count > 0) {
      return;
    }
    await WarehouseModel.create({
      code: 'WH-01',
      name: 'Central Warehouse',
      isDefault: true,
      isActive: true,
    });
    console.log('Seeded 1 warehouse');
  }

  toPublicSupplier(row: SupplierDocument): PublicSupplier {
    return {
      id: row._id.toString(),
      supplierNumber: row.supplierNumber,
      name: row.name,
      contactName: row.contactName ?? null,
      email: row.email ?? null,
      phone: row.phone ?? null,
      address: row.address ?? null,
      taxId: row.taxId ?? null,
      paymentTermsDays: row.paymentTermsDays,
      notes: row.notes ?? null,
      isActive: row.isActive,
    };
  }

  toPublicItem(row: ItemDocument): PublicItem {
    return {
      id: row._id.toString(),
      sku: row.sku,
      name: row.name,
      unit: row.unit,
      brand: row.brand ?? null,
      model: row.model ?? null,
      countryOfOrigin: row.countryOfOrigin ?? null,
      technicalSpecification: row.technicalSpecification ?? null,
      isActive: row.isActive,
    };
  }

  toPublicWarehouse(row: WarehouseDocument): PublicWarehouse {
    return {
      id: row._id.toString(),
      code: row.code,
      name: row.name,
      isDefault: row.isDefault,
    };
  }

  toPublicPo(row: PurchaseOrderDocument): PublicPurchaseOrder {
    return {
      id: row._id.toString(),
      poNumber: row.poNumber,
      status: row.status,
      destination: row.destination,
      supplierId: row.supplierId.toString(),
      supplierNumber: row.supplierNumber,
      supplierName: row.supplierName,
      projectId: row.projectId ? row.projectId.toString() : null,
      projectCode: row.projectCode ?? null,
      projectName: row.projectName ?? null,
      warehouseId: row.warehouseId ? row.warehouseId.toString() : null,
      warehouseCode: row.warehouseCode ?? null,
      warehouseName: row.warehouseName ?? null,
      date: row.date.toISOString(),
      notes: row.notes ?? null,
      orderedAmount: fromMinorUnits(row.orderedMinor),
      receivedAmount: fromMinorUnits(row.receivedMinor),
      returnedAmount: fromMinorUnits(row.returnedMinor),
      outstandingPayable: fromMinorUnits(row.receivedMinor - row.returnedMinor),
      lines: row.lines.map((line) => ({
        id: line._id.toString(),
        itemId: line.itemId.toString(),
        sku: line.sku,
        name: line.name,
        unit: line.unit,
        quantity: fromMilliQty(line.quantityMilli),
        unitCost: fromMinorUnits(line.unitCostMinor),
        lineTotal: fromMinorUnits(line.lineTotalMinor),
        receivedQty: fromMilliQty(line.receivedMilli),
        returnedQty: fromMilliQty(line.returnedMilli),
        outstandingQty: fromMilliQty(
          Math.max(0, line.quantityMilli - line.receivedMilli),
        ),
      })),
    };
  }

  async createSupplier(
    dto: CreateSupplierDto,
    actor: AuthenticatedUser,
  ): Promise<PublicSupplier> {
    this.assertFinance(actor);
    const created = await SupplierModel.create({
      supplierNumber: await this.nextNumber('supplier', 'SUP'),
      name: dto.name.trim(),
      contactName: dto.contactName?.trim(),
      email: dto.email?.trim().toLowerCase(),
      phone: dto.phone?.trim(),
      address: dto.address?.trim(),
      taxId: dto.taxId?.trim(),
      paymentTermsDays: dto.paymentTermsDays ?? 30,
      notes: dto.notes?.trim(),
      isActive: true,
    });
    return this.toPublicSupplier(created);
  }

  async listSuppliers(actor: AuthenticatedUser): Promise<PublicSupplier[]> {
    this.assertProcurement(actor);
    const rows = await SupplierModel.find()
      .sort({ name: 1 })
      .exec();
    return rows.map((row) => this.toPublicSupplier(row));
  }

  async getSupplier(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<PublicSupplier> {
    this.assertProcurement(actor);
    return this.toPublicSupplier(await this.findSupplierOrFail(id));
  }

  async vendorLedger(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<PublicVendorLedger> {
    this.assertFinance(actor);
    const supplier = await this.findSupplierOrFail(id);
    const movements = await GoodsMovementModel.find({ supplierId: supplier._id })
      .sort({ date: 1, movementNumber: 1 })
      .exec();

    let running = 0;
    let purchased = 0;
    let returned = 0;
    const entries = movements.map((row) => {
      if (row.type === VendorLedgerType.RECEIPT) {
        running += row.amountMinor;
        purchased += row.amountMinor;
      } else {
        running -= row.amountMinor;
        returned += row.amountMinor;
      }
      return {
        id: row._id.toString(),
        date: row.date.toISOString(),
        type: row.type,
        reference: row.movementNumber,
        poNumber: row.poNumber,
        journalNumber: row.journalNumber,
        amount: fromMinorUnits(row.amountMinor),
        runningOutstanding: fromMinorUnits(running),
      };
    });

    return {
      supplier: this.toPublicSupplier(supplier),
      purchased: fromMinorUnits(purchased),
      returned: fromMinorUnits(returned),
      outstanding: fromMinorUnits(running),
      entries,
    };
  }

  async createItem(dto: CreateItemDto, actor: AuthenticatedUser): Promise<PublicItem> {
    this.assertFinance(actor);
    const sku = dto.sku.trim().toUpperCase();
    const existing = await ItemModel.findOne({ sku }).exec();
    if (existing) {
      throw badRequest(`SKU ${sku} already exists`);
    }
    const created = await ItemModel.create({
      sku,
      name: dto.name.trim(),
      unit: dto.unit.trim(),
      brand: dto.brand?.trim() || undefined,
      model: dto.model?.trim() || undefined,
      countryOfOrigin: dto.countryOfOrigin?.trim() || undefined,
      technicalSpecification: dto.technicalSpecification?.trim() || undefined,
      isActive: true,
    });
    return this.toPublicItem(created);
  }

  async listItems(actor: AuthenticatedUser): Promise<PublicItem[]> {
    this.assertProcurement(actor);
    const rows = await ItemModel.find({ isActive: true }).sort({ sku: 1 }).exec();
    return rows.map((row) => this.toPublicItem(row));
  }

  async listWarehouses(actor: AuthenticatedUser): Promise<PublicWarehouse[]> {
    this.assertProcurement(actor);
    const rows = await WarehouseModel.find({ isActive: true })
      .sort({ isDefault: -1, code: 1 })
      .exec();
    return rows.map((row) => this.toPublicWarehouse(row));
  }

  async createPurchaseOrder(
    dto: CreatePurchaseOrderDto,
    actor: AuthenticatedUser,
  ): Promise<PublicPurchaseOrder> {
    this.assertProcurement(actor);
    const date = this.parseDate(dto.date);
    const supplier = await this.findSupplierOrFail(dto.supplierId);
    if (!supplier.isActive) {
      throw badRequest('Supplier is inactive');
    }

    let projectId: string | undefined;
    let projectCode: string | undefined;
    let projectName: string | undefined;
    let warehouseId: Types.ObjectId | undefined;
    let warehouseCode: string | undefined;
    let warehouseName: string | undefined;

    if (dto.destination === PurchaseDestination.DIRECT_TO_SITE) {
      if (!dto.projectId) {
        throw badRequest('Direct-to-site purchase orders require a project');
      }
      await this.projectsService.assertCanAccessProjectId(actor, dto.projectId);
      const project = await this.projectsService.findByIdOrFail(dto.projectId);
      projectId = project._id.toString();
      projectCode = project.code;
      projectName = project.name;
    } else {
      const warehouse = dto.warehouseId
        ? await this.findWarehouseOrFail(dto.warehouseId)
        : await this.defaultWarehouse();
      warehouseId = warehouse._id;
      warehouseCode = warehouse.code;
      warehouseName = warehouse.name;
    }

    const lines = [];
    let orderedMinor = 0;
    for (const input of dto.lines) {
      const item = await this.findItemOrFail(input.itemId);
      if (!item.isActive) {
        throw badRequest(`Item ${item.sku} is inactive`);
      }
      const quantityMilli = toMilliQty(input.quantity);
      const unitCostMinor = toMinorUnits(input.unitCost);
      const lineTotalMinor = lineAmountMinor(quantityMilli, unitCostMinor);
      orderedMinor += lineTotalMinor;
      lines.push({
        itemId: item._id,
        sku: item.sku,
        name: item.name,
        unit: item.unit,
        quantityMilli,
        unitCostMinor,
        lineTotalMinor,
        receivedMilli: 0,
        returnedMilli: 0,
      });
    }

    const created = await PurchaseOrderModel.create({
      poNumber: await this.nextNumber('po', 'PO', date),
      status: PurchaseOrderStatus.ISSUED,
      destination: dto.destination,
      supplierId: supplier._id,
      supplierNumber: supplier.supplierNumber,
      supplierName: supplier.name,
      projectId: projectId ? new Types.ObjectId(projectId) : undefined,
      projectCode,
      projectName,
      warehouseId,
      warehouseCode,
      warehouseName,
      date,
      notes: dto.notes?.trim(),
      orderedMinor,
      receivedMinor: 0,
      returnedMinor: 0,
      lines,
      createdBy: new Types.ObjectId(actor.userId),
    });
    return this.toPublicPo(created);
  }

  async listPurchaseOrders(
    actor: AuthenticatedUser,
  ): Promise<PublicPurchaseOrder[]> {
    this.assertProcurement(actor);
    let filter: Record<string, unknown> = {};
    if (actor.role === Role.PROJECT_MANAGER) {
      const projectIds = await this.projectsService.managedProjectIds(actor);
      filter = {
        $or: [
          { projectId: { $in: projectIds } },
          { projectId: { $exists: false } },
          { projectId: null },
        ],
      };
    }
    const rows = await PurchaseOrderModel.find(filter)
      .sort({ date: -1, poNumber: -1 })
      .exec();
    return rows.map((row) => this.toPublicPo(row));
  }

  async getPurchaseOrder(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<PublicPurchaseOrder> {
    this.assertProcurement(actor);
    return this.toPublicPo(await this.findPoOrFail(id));
  }

  async cancelPurchaseOrder(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<PublicPurchaseOrder> {
    this.assertFinance(actor);
    const row = await this.findPoOrFail(id);
    if (row.receivedMinor > 0) {
      throw badRequest('Cannot cancel a purchase order after goods have been received');
    }
    if (row.status === PurchaseOrderStatus.CANCELLED) {
      throw badRequest('Purchase order is already cancelled');
    }
    row.status = PurchaseOrderStatus.CANCELLED;
    await row.save();
    return this.toPublicPo(row);
  }

  async receiveGoods(
    id: string,
    dto: ReceiveGoodsDto,
    actor: AuthenticatedUser,
  ): Promise<PublicPurchaseOrder> {
    this.assertFinance(actor);
    const po = await this.findPoOrFail(id);
    if (
      po.status === PurchaseOrderStatus.CANCELLED ||
      po.status === PurchaseOrderStatus.RECEIVED
    ) {
      throw badRequest('This purchase order cannot receive more goods');
    }

    const date = this.parseDate(dto.date);
    const movementLines = [];
    let amountMinor = 0;

    for (const input of dto.lines) {
      const line = po.lines.find((row) => row._id.toString() === input.lineId);
      if (!line) {
        throw notFound('Purchase order line not found');
      }
      const quantityMilli = toMilliQty(input.quantity);
      const remaining = line.quantityMilli - line.receivedMilli;
      if (quantityMilli > remaining) {
        throw badRequest(
          `Cannot receive more than the outstanding quantity for ${line.sku}`,
        );
      }
      const lineAmount = lineAmountMinor(quantityMilli, line.unitCostMinor);
      line.receivedMilli += quantityMilli;
      amountMinor += lineAmount;
      movementLines.push({
        poLineId: line._id,
        itemId: line.itemId,
        sku: line.sku,
        name: line.name,
        unit: line.unit,
        quantityMilli,
        unitCostMinor: line.unitCostMinor,
        amountMinor: lineAmount,
      });

      if (po.destination === PurchaseDestination.WAREHOUSE) {
        // Same SKU + same unit cost → top up the open FIFO lot so on-hand
        // shows one combined quantity instead of many zero/partial lots.
        const openLot = await StockLotModel.findOne({
          warehouseId: po.warehouseId,
          itemId: line.itemId,
          unitCostMinor: line.unitCostMinor,
          remainingMilli: { $gt: 0 },
        })
          .sort({ receivedAt: 1 })
          .exec();
        if (openLot) {
          openLot.receivedMilli += quantityMilli;
          openLot.remainingMilli += quantityMilli;
          await openLot.save();
        } else {
          await StockLotModel.create({
            warehouseId: po.warehouseId,
            itemId: line.itemId,
            sku: line.sku,
            itemName: line.name,
            unit: line.unit,
            purchaseOrderId: po._id,
            poNumber: po.poNumber,
            poLineId: line._id,
            unitCostMinor: line.unitCostMinor,
            receivedMilli: quantityMilli,
            remainingMilli: quantityMilli,
            receivedAt: date,
          });
        }
      }
    }

    po.receivedMinor += amountMinor;
    this.refreshPoStatus(po);

    const settlement = (dto.paymentMethod ?? 'due') as ReceiptSettlement;
    let creditAccountCode: string | undefined;
    if (settlement === 'cash' || settlement === 'bank') {
      if (dto.treasuryId) {
        const treasury = await this.bankingService.requireActive(dto.treasuryId);
        if (settlement === 'cash' && !isCashLike(treasury.kind)) {
          throw badRequest('Select a cash or petty-cash treasury channel');
        }
        if (settlement === 'bank' && !isBankLike(treasury.kind)) {
          throw badRequest('Select a bank or mobile-banking treasury channel');
        }
        creditAccountCode = treasury.glAccountCode;
      } else if (settlement === 'cash') {
        creditAccountCode = SystemAccountCode.CASH_IN_HAND;
      } else {
        throw badRequest('Select a bank account for bank settlement');
      }
    }

    const journal = await this.journalService.post(
      {
        date: date.toISOString(),
        memo: `GRN for ${po.poNumber}`,
        reference: po.poNumber,
        projectId: po.projectId?.toString(),
        lines: buildReceiptJournalLines({
          destination: po.destination,
          amountMinor,
          projectId: po.projectId?.toString(),
          description: `Goods received ${po.poNumber}`,
          settlement,
          creditAccountCode,
          supplierId: po.supplierId.toString(),
        }),
      },
      actor.userId,
      'system',
    );

    await GoodsMovementModel.create({
      movementNumber: await this.nextNumber('grn', 'GRN', date),
      type: VendorLedgerType.RECEIPT,
      destination: po.destination,
      purchaseOrderId: po._id,
      poNumber: po.poNumber,
      supplierId: po.supplierId,
      supplierName: po.supplierName,
      projectId: po.projectId,
      warehouseId: po.warehouseId,
      date,
      amountMinor,
      lines: movementLines,
      journalId: new Types.ObjectId(journal.id),
      journalNumber: journal.entryNumber,
      createdBy: new Types.ObjectId(actor.userId),
    });

    await po.save();
    return this.toPublicPo(po);
  }

  async returnGoods(
    id: string,
    dto: ReturnGoodsDto,
    actor: AuthenticatedUser,
  ): Promise<PublicPurchaseOrder> {
    this.assertFinance(actor);
    const po = await this.findPoOrFail(id);
    if (po.status === PurchaseOrderStatus.CANCELLED) {
      throw badRequest('Cannot return against a cancelled purchase order');
    }

    const date = this.parseDate(dto.date);
    const movementLines = [];
    let amountMinor = 0;

    for (const input of dto.lines) {
      const line = po.lines.find((row) => row._id.toString() === input.lineId);
      if (!line) {
        throw notFound('Purchase order line not found');
      }
      const quantityMilli = toMilliQty(input.quantity);
      const returnable = line.receivedMilli - line.returnedMilli;
      if (quantityMilli > returnable) {
        throw badRequest(`Cannot return more than received for ${line.sku}`);
      }

      if (po.destination === PurchaseDestination.WAREHOUSE) {
        await this.reduceLotsForReturn(line._id, quantityMilli);
      }

      const lineAmount = lineAmountMinor(quantityMilli, line.unitCostMinor);
      line.returnedMilli += quantityMilli;
      amountMinor += lineAmount;
      movementLines.push({
        poLineId: line._id,
        itemId: line.itemId,
        sku: line.sku,
        name: line.name,
        unit: line.unit,
        quantityMilli,
        unitCostMinor: line.unitCostMinor,
        amountMinor: lineAmount,
      });
    }

    po.returnedMinor += amountMinor;

    const journal = await this.journalService.post(
      {
        date: date.toISOString(),
        memo: `Return against ${po.poNumber}`,
        reference: po.poNumber,
        projectId: po.projectId?.toString(),
        lines: buildReturnJournalLines({
          destination: po.destination,
          amountMinor,
          projectId: po.projectId?.toString(),
          description: `Vendor return ${po.poNumber}`,
        }),
      },
      actor.userId,
      'system',
    );

    await GoodsMovementModel.create({
      movementNumber: await this.nextNumber('ret', 'RET', date),
      type: VendorLedgerType.RETURN,
      destination: po.destination,
      purchaseOrderId: po._id,
      poNumber: po.poNumber,
      supplierId: po.supplierId,
      supplierName: po.supplierName,
      projectId: po.projectId,
      warehouseId: po.warehouseId,
      date,
      amountMinor,
      lines: movementLines,
      journalId: new Types.ObjectId(journal.id),
      journalNumber: journal.entryNumber,
      createdBy: new Types.ObjectId(actor.userId),
    });

    await po.save();
    return this.toPublicPo(po);
  }

  async inventory(actor: AuthenticatedUser): Promise<PublicStockRow[]> {
    this.assertProcurement(actor);
    const lots = await StockLotModel.find({ remainingMilli: { $gt: 0 } }).exec();
    const warehouses = await WarehouseModel.find().exec();
    const warehouseById = new Map(
      warehouses.map((row) => [row._id.toString(), row]),
    );
    const grouped = new Map<
      string,
      {
        warehouseId: string;
        itemId: string;
        sku: string;
        name: string;
        unit: string;
        quantityMilli: number;
        valueMinor: number;
      }
    >();

    for (const lot of lots) {
      const key = `${lot.warehouseId.toString()}:${lot.itemId.toString()}`;
      const current = grouped.get(key) ?? {
        warehouseId: lot.warehouseId.toString(),
        itemId: lot.itemId.toString(),
        sku: lot.sku,
        name: lot.itemName,
        unit: lot.unit,
        quantityMilli: 0,
        valueMinor: 0,
      };
      current.quantityMilli += lot.remainingMilli;
      current.valueMinor += lineAmountMinor(lot.remainingMilli, lot.unitCostMinor);
      grouped.set(key, current);
    }

    return [...grouped.values()]
      .map((row) => {
        const warehouse = warehouseById.get(row.warehouseId);
        return {
          warehouseId: row.warehouseId,
          warehouseCode: warehouse?.code ?? '',
          warehouseName: warehouse?.name ?? '',
          itemId: row.itemId,
          sku: row.sku,
          name: row.name,
          unit: row.unit,
          quantity: fromMilliQty(row.quantityMilli),
          value: fromMinorUnits(row.valueMinor),
        };
      })
      .sort((a, b) =>
        a.sku === b.sku
          ? a.warehouseCode.localeCompare(b.warehouseCode)
          : a.sku.localeCompare(b.sku),
      );
  }

  async issueStock(
    dto: IssueStockDto,
    actor: AuthenticatedUser,
  ): Promise<{
    id: string;
    issueNumber: string;
    journalNumber: string;
    amount: number;
    projectId: string;
  }> {
    this.assertFinance(actor);
    const date = this.parseDate(dto.date);
    const warehouse = await this.findWarehouseOrFail(dto.warehouseId);
    const project = await this.projectsService.findByIdOrFail(dto.projectId);

    const issueLines = [];
    let amountMinor = 0;
    // Merge duplicate item lines in one request into a single consume.
    const mergedLines = new Map<string, number>();
    for (const input of dto.lines) {
      const quantityMilli = toMilliQty(input.quantity);
      mergedLines.set(
        input.itemId,
        (mergedLines.get(input.itemId) ?? 0) + quantityMilli,
      );
    }

    for (const [itemId, quantityMilli] of mergedLines) {
      const item = await this.findItemOrFail(itemId);
      const consumed = await this.consumeLotsFifo(
        warehouse._id,
        item._id,
        quantityMilli,
      );
      amountMinor += consumed;
      issueLines.push({
        itemId: item._id,
        sku: item.sku,
        name: item.name,
        unit: item.unit,
        quantityMilli,
        amountMinor: consumed,
      });
    }

    const journal = await this.journalService.post(
      {
        date: date.toISOString(),
        memo: `Issue stock to ${project.code}`,
        reference: project.code,
        // Do not set header projectId — only the materials debit is project-tagged.
        lines: buildIssueJournalLines({
          amountMinor,
          projectId: project._id.toString(),
          description: `Warehouse issue to ${project.code}`,
        }),
      },
      actor.userId,
      'system',
    );

    const created = await StockIssueModel.create({
      issueNumber: await this.nextNumber('iss', 'ISS', date),
      warehouseId: warehouse._id,
      warehouseCode: warehouse.code,
      warehouseName: warehouse.name,
      projectId: project._id,
      projectCode: project.code,
      projectName: project.name,
      date,
      amountMinor,
      lines: issueLines,
      journalId: new Types.ObjectId(journal.id),
      journalNumber: journal.entryNumber,
      createdBy: new Types.ObjectId(actor.userId),
    });

    return {
      id: created._id.toString(),
      issueNumber: created.issueNumber,
      journalNumber: journal.entryNumber,
      amount: fromMinorUnits(amountMinor),
      projectId: project._id.toString(),
    };
  }

  async listIssues(actor: AuthenticatedUser) {
    this.assertProcurement(actor);
    const rows = await StockIssueModel.find()
      .sort({ date: -1, issueNumber: -1 })
      .limit(50)
      .exec();
    return rows.map((row) => {
      const quantityMilli = row.lines.reduce(
        (sum, line) => sum + line.quantityMilli,
        0,
      );
      const lines = row.lines.map((line) => {
        const quantity = fromMilliQty(line.quantityMilli);
        const amount = fromMinorUnits(line.amountMinor);
        return {
          itemId: line.itemId.toString(),
          sku: line.sku,
          name: line.name,
          unit: line.unit,
          quantity,
          amount,
          unitCost: quantity > 0 ? Number((amount / quantity).toFixed(4)) : 0,
        };
      });
      return {
        id: row._id.toString(),
        issueNumber: row.issueNumber,
        warehouseCode: row.warehouseCode,
        warehouseName: row.warehouseName,
        projectId: row.projectId.toString(),
        projectCode: row.projectCode,
        projectName: row.projectName,
        date: row.date.toISOString(),
        quantity: fromMilliQty(quantityMilli),
        amount: fromMinorUnits(row.amountMinor),
        journalNumber: row.journalNumber,
        lines,
      };
    });
  }

  private async consumeLotsFifo(
    warehouseId: Types.ObjectId,
    itemId: Types.ObjectId,
    quantityMilli: number,
  ): Promise<number> {
    const lots = await StockLotModel.find({
      warehouseId,
      itemId,
      remainingMilli: { $gt: 0 },
    })
      .sort({ receivedAt: 1, _id: 1 })
      .exec();

    let remaining = quantityMilli;
    let amountMinor = 0;
    for (const lot of lots) {
      if (remaining <= 0) {
        break;
      }
      const take = Math.min(lot.remainingMilli, remaining);
      lot.remainingMilli -= take;
      remaining -= take;
      amountMinor += lineAmountMinor(take, lot.unitCostMinor);
      await lot.save();
    }
    if (remaining > 0) {
      throw badRequest('Insufficient warehouse quantity for this item');
    }
    return amountMinor;
  }

  private async reduceLotsForReturn(
    poLineId: Types.ObjectId,
    quantityMilli: number,
  ): Promise<void> {
    const lots = await StockLotModel.find({
      poLineId,
      remainingMilli: { $gt: 0 },
    })
      .sort({ receivedAt: -1, _id: -1 })
      .exec();

    let remaining = quantityMilli;
    for (const lot of lots) {
      if (remaining <= 0) {
        break;
      }
      const take = Math.min(lot.remainingMilli, remaining);
      lot.remainingMilli -= take;
      remaining -= take;
      await lot.save();
    }
    if (remaining > 0) {
      throw badRequest(
        'Cannot return warehouse stock that has already been issued to a project',
      );
    }
  }

  private refreshPoStatus(po: PurchaseOrderDocument): void {
    const fullyReceived = po.lines.every(
      (line) => line.receivedMilli >= line.quantityMilli,
    );
    po.status = fullyReceived
      ? PurchaseOrderStatus.RECEIVED
      : PurchaseOrderStatus.PARTIAL;
  }

  private parseDate(value: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw badRequest('Invalid date');
    }
    return date;
  }

  private async nextNumber(
    key: string,
    prefix: string,
    date = new Date(),
  ): Promise<string> {
    const year = date.getUTCFullYear();
    const counter = await CounterModel.findOneAndUpdate(
      { key: `${key}:${year}` },
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    );
    const seq = counter?.seq ?? 1;
    return `${prefix}-${year}-${String(seq).padStart(5, '0')}`;
  }

  private async findSupplierOrFail(id: string): Promise<SupplierDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw notFound('Supplier not found');
    }
    const row = await SupplierModel.findById(id).exec();
    if (!row) {
      throw notFound('Supplier not found');
    }
    return row;
  }

  private async findItemOrFail(id: string): Promise<ItemDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw notFound('Item not found');
    }
    const row = await ItemModel.findById(id).exec();
    if (!row) {
      throw notFound('Item not found');
    }
    return row;
  }

  private async findWarehouseOrFail(id: string): Promise<WarehouseDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw notFound('Warehouse not found');
    }
    const row = await WarehouseModel.findById(id).exec();
    if (!row || !row.isActive) {
      throw notFound('Warehouse not found');
    }
    return row;
  }

  private async defaultWarehouse(): Promise<WarehouseDocument> {
    const row = await WarehouseModel.findOne({ isDefault: true, isActive: true }).exec();
    if (!row) {
      throw badRequest('No default warehouse is configured');
    }
    return row;
  }

  private async findPoOrFail(id: string): Promise<PurchaseOrderDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw notFound('Purchase order not found');
    }
    const row = await PurchaseOrderModel.findById(id).exec();
    if (!row) {
      throw notFound('Purchase order not found');
    }
    return row;
  }

  private assertFinance(actor: AuthenticatedUser): void {
    if (!FINANCE_ROLES.has(actor.role)) {
      throw forbidden('You do not have permission to perform this action');
    }
  }

  private assertProcurement(actor: AuthenticatedUser): void {
    if (!PROCUREMENT_ROLES.has(actor.role)) {
      throw forbidden('You do not have permission to perform this action');
    }
  }
}
