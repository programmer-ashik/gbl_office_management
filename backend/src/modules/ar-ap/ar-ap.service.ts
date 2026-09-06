import { Types } from 'mongoose';
import { AccountType } from '../../common/enums/account-type.enum';
import {
  ApLedgerEntryType,
  BillPaymentType,
  BillStatus,
  InvoiceStatus,
  InvoiceType,
  SupplierPaymentStatus,
} from '../../common/enums/ar-ap.enum';
import { VendorLedgerType } from '../../common/enums/procurement.enum';
import { Role } from '../../common/enums/role.enum';
import { badRequest, forbidden, notFound } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { fromMinorUnits, toMinorUnits } from '../../common/utils/money';
import { AccountsService } from '../accounting/accounts.service';
import { CounterModel } from '../accounting/counter.model';
import type {
  JournalService,
  PublicJournal,
} from '../accounting/journal.service';
import { SystemAccountCode } from '../accounting/system-account-codes';
import type { BankingService } from '../banking/banking.service';
import { CustomerModel } from '../customers/customer.model';
import { GoodsMovementModel } from '../procurement/goods-movement.model';
import { SupplierModel, type SupplierDocument } from '../procurement/supplier.model';
import type { ProjectsService } from '../projects/projects.service';
import { buildAgingReport, type AgingReport } from './aging';
import {
  ClientInvoiceModel,
  type ClientInvoiceDocument,
} from './client-invoice.model';
import type {
  CollectInvoiceDto,
  CreateInvoiceDto,
  CreateSupplierBillDto,
  CreateSupplierPaymentDto,
  ExecuteSupplierPaymentDto,
} from './dto/ar-ap.dto';
import {
  InvoiceCollectionModel,
  type InvoiceCollectionDocument,
} from './invoice-collection.model';
import {
  buildCashBillJournalLines,
  buildCollectionJournalLines,
  buildCreditBillJournalLines,
  buildInvoiceJournalLines,
  buildSupplierPaymentJournalLines,
  DEFAULT_BILL_EXPENSE_CODE,
} from './journals';
import {
  SupplierBillModel,
  type SupplierBillDocument,
} from './supplier-bill.model';
import {
  SupplierPaymentModel,
  type SupplierPaymentDocument,
} from './supplier-payment.model';

const FINANCE_ROLES = new Set([Role.ADMIN, Role.ACCOUNTANT]);

export type PublicInvoice = {
  id: string;
  invoiceNumber: string;
  type: InvoiceType;
  status: InvoiceStatus;
  projectId: string;
  projectCode: string;
  projectName: string;
  clientName: string;
  clientEmail: string | null;
  date: string;
  dueDate: string;
  description: string;
  milestoneLabel: string | null;
  amount: number;
  paidAmount: number;
  openAmount: number;
  journalNumber: string;
  isOverdue: boolean;
};

export type PublicCollection = {
  id: string;
  collectionNumber: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  date: string;
  treasuryAccountCode: string;
  journalNumber: string;
};

export type PublicSupplierBill = {
  id: string;
  billNumber: string;
  paymentType: BillPaymentType;
  status: BillStatus;
  supplierId: string;
  supplierNumber: string;
  supplierName: string;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  expenseAccountCode: string;
  expenseAccountName: string;
  date: string;
  dueDate: string;
  description: string;
  amount: number;
  treasuryAccountCode: string | null;
  journalNumber: string;
};

export type PublicSupplierPayment = {
  id: string;
  paymentNumber: string;
  status: SupplierPaymentStatus;
  supplierId: string;
  supplierNumber: string;
  supplierName: string;
  amount: number;
  scheduledDate: string | null;
  executedDate: string | null;
  treasuryAccountCode: string;
  memo: string | null;
  journalNumber: string | null;
};

export type PublicVendorLedger = {
  supplier: {
    id: string;
    supplierNumber: string;
    name: string;
    paymentTermsDays: number;
  };
  purchased: number;
  returned: number;
  billed: number;
  paid: number;
  outstanding: number;
  entries: Array<{
    id: string;
    date: string;
    type: ApLedgerEntryType;
    reference: string;
    poNumber: string | null;
    journalNumber: string;
    amount: number;
    runningOutstanding: number;
  }>;
};

export type OverdueInvoiceNotice = {
  invoiceId: string;
  invoiceNumber: string;
  projectCode: string;
  clientName: string;
  clientEmail: string | null;
  dueDate: string;
  daysPastDue: number;
  openAmount: number;
};

export class ArApService {
  constructor(
    private readonly journalService: JournalService,
    private readonly projectsService: ProjectsService,
    private readonly accountsService: AccountsService,
    private readonly bankingService: BankingService,
  ) {}

  async listInvoices(actor: AuthenticatedUser): Promise<PublicInvoice[]> {
    this.assertFinance(actor);
    await this.refreshOverdueStatuses();
    const rows = await ClientInvoiceModel.find()
      .sort({ date: -1, invoiceNumber: -1 })
      .exec();
    return rows.map((row) => this.toPublicInvoice(row));
  }

  async getInvoice(id: string, actor: AuthenticatedUser): Promise<PublicInvoice> {
    this.assertFinance(actor);
    await this.refreshOverdueStatuses();
    return this.toPublicInvoice(await this.findInvoiceOrFail(id));
  }

  async createInvoice(
    dto: CreateInvoiceDto,
    actor: AuthenticatedUser,
  ): Promise<PublicInvoice> {
    this.assertFinance(actor);
    const project = await this.projectsService.getById(dto.projectId);
    const date = this.parseDate(dto.date);
    const dueDate = this.parseDate(dto.dueDate);
    if (dueDate < date) {
      throw badRequest('Due date cannot be before invoice date');
    }
    const amountMinor = toMinorUnits(dto.amount);
    const invoiceNumber = await this.nextNumber('invoice', 'INV', date);
    const journal = await this.journalService.post(
      {
        date: date.toISOString(),
        memo: dto.description.trim(),
        reference: invoiceNumber,
        projectId: project.id,
        lines: buildInvoiceJournalLines({
          amountMinor,
          projectId: project.id,
          description: dto.description.trim(),
        }),
      },
      actor.userId,
      'system',
    );

    const created = await ClientInvoiceModel.create({
      invoiceNumber,
      type: dto.type,
      status: InvoiceStatus.ISSUED,
      projectId: new Types.ObjectId(project.id),
      projectCode: project.code,
      projectName: project.name,
      clientName: project.client.name,
      clientEmail: project.client.email ?? undefined,
      date,
      dueDate,
      description: dto.description.trim(),
      milestoneLabel: dto.milestoneLabel?.trim(),
      amountMinor,
      paidMinor: 0,
      journalId: new Types.ObjectId(journal.id),
      journalNumber: journal.entryNumber,
      createdBy: new Types.ObjectId(actor.userId),
    });
    return this.toPublicInvoice(created);
  }

  async collectInvoice(
    id: string,
    dto: CollectInvoiceDto,
    actor: AuthenticatedUser,
  ): Promise<PublicInvoice> {
    this.assertFinance(actor);
    const invoice = await this.findInvoiceOrFail(id);
    if (
      invoice.status === InvoiceStatus.PAID ||
      invoice.status === InvoiceStatus.VOID
    ) {
      throw badRequest('Invoice is already closed');
    }
    const amountMinor = toMinorUnits(dto.amount);
    const openMinor = invoice.amountMinor - invoice.paidMinor;
    if (amountMinor > openMinor) {
      throw badRequest('Collection exceeds the open invoice balance');
    }
    const treasury = await this.bankingService.requireActive(dto.treasuryId);
    const date = this.parseDate(dto.date);
    const collectionNumber = await this.nextNumber('collection', 'RC', date);
    const journal = await this.journalService.post(
      {
        date: date.toISOString(),
        memo: `Collection for ${invoice.invoiceNumber}`,
        reference: collectionNumber,
        projectId: invoice.projectId.toString(),
        lines: buildCollectionJournalLines({
          amountMinor,
          treasuryAccountCode: treasury.glAccountCode,
          projectId: invoice.projectId.toString(),
          description: `Collection ${invoice.invoiceNumber}`,
        }),
      },
      actor.userId,
      'system',
    );

    await InvoiceCollectionModel.create({
      collectionNumber,
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      projectId: invoice.projectId,
      amountMinor,
      date,
      treasuryId: new Types.ObjectId(treasury.id),
      treasuryAccountCode: treasury.glAccountCode,
      journalId: new Types.ObjectId(journal.id),
      journalNumber: journal.entryNumber,
      createdBy: new Types.ObjectId(actor.userId),
    });

    invoice.paidMinor += amountMinor;
    if (invoice.paidMinor >= invoice.amountMinor) {
      invoice.status = InvoiceStatus.PAID;
    } else {
      invoice.status = InvoiceStatus.PARTIAL;
    }
    await invoice.save();
    return this.toPublicInvoice(invoice);
  }

  async listCollections(
    invoiceId: string,
    actor: AuthenticatedUser,
  ): Promise<PublicCollection[]> {
    this.assertFinance(actor);
    const rows = await InvoiceCollectionModel.find({
      invoiceId: new Types.ObjectId(invoiceId),
    })
      .sort({ date: 1 })
      .exec();
    return rows.map((row) => this.toPublicCollection(row));
  }

  async overdueNotices(actor: AuthenticatedUser): Promise<OverdueInvoiceNotice[]> {
    this.assertFinance(actor);
    await this.refreshOverdueStatuses();
    const rows = await ClientInvoiceModel.find({
      status: { $in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE] },
      dueDate: { $lt: new Date() },
    })
      .sort({ dueDate: 1 })
      .exec();
    const now = new Date();
    return rows
      .map((row) => {
        const openMinor = row.amountMinor - row.paidMinor;
        if (openMinor <= 0) {
          return null;
        }
        const daysPastDue = Math.floor(
          (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
            Date.UTC(
              row.dueDate.getUTCFullYear(),
              row.dueDate.getUTCMonth(),
              row.dueDate.getUTCDate(),
            )) /
            86_400_000,
        );
        return {
          invoiceId: row._id.toString(),
          invoiceNumber: row.invoiceNumber,
          projectCode: row.projectCode,
          clientName: row.clientName,
          clientEmail: row.clientEmail ?? null,
          dueDate: row.dueDate.toISOString(),
          daysPastDue,
          openAmount: fromMinorUnits(openMinor),
        };
      })
      .filter((row): row is OverdueInvoiceNotice => row !== null);
  }

  async arAging(asOfInput: string | undefined, actor: AuthenticatedUser): Promise<AgingReport> {
    this.assertFinance(actor);
    await this.refreshOverdueStatuses();
    const asOf = asOfInput ? this.parseDate(asOfInput) : new Date();
    const rows = await ClientInvoiceModel.find({
      status: {
        $in: [
          InvoiceStatus.ISSUED,
          InvoiceStatus.PARTIAL,
          InvoiceStatus.OVERDUE,
        ],
      },
    }).exec();

    const lines = rows
      .map((row) => {
        const openMinor = row.amountMinor - row.paidMinor;
        if (openMinor <= 0) {
          return null;
        }
        return {
          id: row._id.toString(),
          reference: row.invoiceNumber,
          partyName: row.clientName,
          date: row.date.toISOString(),
          dueDate: row.dueDate.toISOString(),
          openAmount: fromMinorUnits(openMinor),
        };
      })
      .filter((row) => row !== null);

    return buildAgingReport(asOf, lines);
  }

  async listBills(actor: AuthenticatedUser): Promise<PublicSupplierBill[]> {
    this.assertFinance(actor);
    const rows = await SupplierBillModel.find()
      .sort({ date: -1, billNumber: -1 })
      .exec();
    return rows.map((row) => this.toPublicBill(row));
  }

  async createBill(
    dto: CreateSupplierBillDto,
    actor: AuthenticatedUser,
  ): Promise<PublicSupplierBill> {
    this.assertFinance(actor);
    const supplier = await this.findSupplierOrFail(dto.supplierId);
    const date = this.parseDate(dto.date);
    const expenseCode = dto.expenseAccountCode?.trim().toUpperCase() ?? DEFAULT_BILL_EXPENSE_CODE;
    const expenseAccount = await this.accountsService.findByCodeOrFail(expenseCode);
    if (!expenseAccount.isPostable || expenseAccount.type !== AccountType.EXPENSE) {
      throw badRequest(`${expenseCode} is not a postable expense account`);
    }

    let projectId: string | undefined;
    let projectCode: string | undefined;
    let projectName: string | undefined;
    if (dto.projectId) {
      const project = await this.projectsService.getById(dto.projectId);
      projectId = project.id;
      projectCode = project.code;
      projectName = project.name;
    }

    const amountMinor = toMinorUnits(dto.amount);
    const billNumber = await this.nextNumber('bill', 'BILL', date);

    if (dto.paymentType === BillPaymentType.CASH) {
      if (!dto.treasuryId) {
        throw badRequest('Cash bills require a treasury account');
      }
      const treasury = await this.bankingService.requireActive(dto.treasuryId);
      const journal = await this.journalService.post(
        {
          date: date.toISOString(),
          memo: dto.description.trim(),
          reference: billNumber,
          projectId,
          lines: buildCashBillJournalLines({
            amountMinor,
            expenseAccountCode: expenseCode,
            treasuryAccountCode: treasury.glAccountCode,
            projectId,
            description: dto.description.trim(),
            supplierId: supplier._id.toString(),
          }),
        },
        actor.userId,
        'system',
      );
      const created = await SupplierBillModel.create({
        billNumber,
        paymentType: BillPaymentType.CASH,
        status: BillStatus.PAID,
        supplierId: supplier._id,
        supplierNumber: supplier.supplierNumber,
        supplierName: supplier.name,
        projectId: projectId ? new Types.ObjectId(projectId) : undefined,
        projectCode,
        projectName,
        expenseAccountCode: expenseCode,
        expenseAccountName: expenseAccount.name,
        date,
        dueDate: date,
        description: dto.description.trim(),
        amountMinor,
        treasuryId: new Types.ObjectId(treasury.id),
        treasuryAccountCode: treasury.glAccountCode,
        journalId: new Types.ObjectId(journal.id),
        journalNumber: journal.entryNumber,
        createdBy: new Types.ObjectId(actor.userId),
      });
      return this.toPublicBill(created);
    }

    const dueDate = dto.dueDate
      ? this.parseDate(dto.dueDate)
      : this.addDays(date, supplier.paymentTermsDays);
    if (dueDate < date) {
      throw badRequest('Due date cannot be before bill date');
    }
    const journal = await this.journalService.post(
      {
        date: date.toISOString(),
        memo: dto.description.trim(),
        reference: billNumber,
        projectId,
        lines: buildCreditBillJournalLines({
          amountMinor,
          expenseAccountCode: expenseCode,
          projectId,
          description: dto.description.trim(),
          supplierId: supplier._id.toString(),
        }),
      },
      actor.userId,
      'system',
    );
    const created = await SupplierBillModel.create({
      billNumber,
      paymentType: BillPaymentType.CREDIT,
      status: BillStatus.OPEN,
      supplierId: supplier._id,
      supplierNumber: supplier.supplierNumber,
      supplierName: supplier.name,
      projectId: projectId ? new Types.ObjectId(projectId) : undefined,
      projectCode,
      projectName,
      expenseAccountCode: expenseCode,
      expenseAccountName: expenseAccount.name,
      date,
      dueDate,
      description: dto.description.trim(),
      amountMinor,
      journalId: new Types.ObjectId(journal.id),
      journalNumber: journal.entryNumber,
      createdBy: new Types.ObjectId(actor.userId),
    });
    return this.toPublicBill(created);
  }

  async listPayments(actor: AuthenticatedUser): Promise<PublicSupplierPayment[]> {
    this.assertFinance(actor);
    const rows = await SupplierPaymentModel.find()
      .sort({ createdAt: -1 })
      .exec();
    return rows.map((row) => this.toPublicPayment(row));
  }

  async schedulePayment(
    dto: CreateSupplierPaymentDto,
    actor: AuthenticatedUser,
  ): Promise<PublicSupplierPayment> {
    this.assertFinance(actor);
    const supplier = await this.findSupplierOrFail(dto.supplierId);
    const treasury = await this.bankingService.requireActive(dto.treasuryId);
    const amountMinor = toMinorUnits(dto.amount);
    const outstandingMinor = await this.supplierOutstandingMinor(supplier._id);
    if (amountMinor > outstandingMinor) {
      throw badRequest('Payment exceeds supplier outstanding balance');
    }
    const paymentNumber = await this.nextNumber('ap-payment', 'PAY');
    const created = await SupplierPaymentModel.create({
      paymentNumber,
      status: SupplierPaymentStatus.SCHEDULED,
      supplierId: supplier._id,
      supplierNumber: supplier.supplierNumber,
      supplierName: supplier.name,
      amountMinor,
      scheduledDate: dto.scheduledDate
        ? this.parseDate(dto.scheduledDate)
        : new Date(),
      treasuryId: new Types.ObjectId(treasury.id),
      treasuryAccountCode: treasury.glAccountCode,
      memo: dto.memo?.trim(),
      createdBy: new Types.ObjectId(actor.userId),
    });
    return this.toPublicPayment(created);
  }

  async executePayment(
    id: string,
    dto: ExecuteSupplierPaymentDto,
    actor: AuthenticatedUser,
  ): Promise<PublicSupplierPayment> {
    this.assertFinance(actor);
    const payment = await this.findPaymentOrFail(id);
    if (payment.status !== SupplierPaymentStatus.SCHEDULED) {
      throw badRequest('Only scheduled payments can be executed');
    }
    const supplier = await this.findSupplierOrFail(payment.supplierId.toString());
    const outstandingMinor = await this.supplierOutstandingMinor(supplier._id);
    if (payment.amountMinor > outstandingMinor) {
      throw badRequest('Payment exceeds supplier outstanding balance');
    }
    const treasury = await this.bankingService.requireActive(
      payment.treasuryId.toString(),
    );
    const date = this.parseDate(dto.date);
    const journal = await this.journalService.post(
      {
        date: date.toISOString(),
        memo: payment.memo?.trim() || `Payment to ${supplier.name}`,
        reference: payment.paymentNumber,
        lines: buildSupplierPaymentJournalLines({
          amountMinor: payment.amountMinor,
          treasuryAccountCode: treasury.glAccountCode,
          description: `Supplier payment ${payment.paymentNumber}`,
          supplierId: supplier._id.toString(),
        }),
      },
      actor.userId,
      'system',
    );

    payment.status = SupplierPaymentStatus.EXECUTED;
    payment.executedDate = date;
    payment.journalId = new Types.ObjectId(journal.id);
    payment.journalNumber = journal.entryNumber;
    payment.executedBy = new Types.ObjectId(actor.userId);
    await payment.save();
    return this.toPublicPayment(payment);
  }

  async cancelPayment(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<PublicSupplierPayment> {
    this.assertFinance(actor);
    const payment = await this.findPaymentOrFail(id);
    if (payment.status !== SupplierPaymentStatus.SCHEDULED) {
      throw badRequest('Only scheduled payments can be cancelled');
    }
    payment.status = SupplierPaymentStatus.CANCELLED;
    await payment.save();
    return this.toPublicPayment(payment);
  }

  async vendorLedger(
    supplierId: string,
    actor: AuthenticatedUser,
  ): Promise<PublicVendorLedger> {
    this.assertFinance(actor);
    const supplier = await this.findSupplierOrFail(supplierId);
    const supplierOid = new Types.ObjectId(supplier._id.toString());
    const supplierIdFilter = {
      $or: [{ supplierId: supplierOid }, { supplierId: supplier._id.toString() }],
    };

    const [movements, bills, payments] = await Promise.all([
      GoodsMovementModel.find({
        $or: [
          { supplierId: supplierOid },
          { supplierId: supplier._id.toString() },
        ],
      })
        .sort({ date: 1, movementNumber: 1 })
        .exec(),
      // All non-void bills (credit + cash). Cash bills are shown but do not
      // increase outstanding (already settled at posting).
      SupplierBillModel.find({
        ...supplierIdFilter,
        status: { $ne: BillStatus.VOID },
      })
        .sort({ date: 1, billNumber: 1 })
        .exec(),
      SupplierPaymentModel.find({
        ...supplierIdFilter,
        status: SupplierPaymentStatus.EXECUTED,
      })
        .sort({ executedDate: 1, paymentNumber: 1 })
        .exec(),
    ]);

    type LedgerRow = {
      id: string;
      date: Date;
      type: ApLedgerEntryType;
      reference: string;
      poNumber: string | null;
      journalNumber: string;
      amountMinor: number;
      signedMinor: number;
    };

    const rows: LedgerRow[] = [
      ...movements.map((row) => ({
        id: row._id.toString(),
        date: row.date,
        type:
          row.type === VendorLedgerType.RECEIPT
            ? ApLedgerEntryType.RECEIPT
            : ApLedgerEntryType.RETURN,
        reference: row.movementNumber,
        poNumber: row.poNumber,
        journalNumber: row.journalNumber,
        amountMinor: row.amountMinor,
        signedMinor:
          row.type === VendorLedgerType.RECEIPT
            ? row.amountMinor
            : -row.amountMinor,
      })),
      ...bills.map((row) => {
        const isOpenCredit =
          row.paymentType === BillPaymentType.CREDIT &&
          row.status === BillStatus.OPEN;
        return {
          id: row._id.toString(),
          date: row.date,
          type: ApLedgerEntryType.BILL,
          reference: row.billNumber,
          poNumber: null,
          journalNumber: row.journalNumber,
          amountMinor: row.amountMinor,
          // Paid/cash bills appear on the ledger but do not raise AP outstanding.
          signedMinor: isOpenCredit ? row.amountMinor : 0,
        };
      }),
      ...payments.map((row) => ({
        id: row._id.toString(),
        date: row.executedDate ?? row.createdAt ?? new Date(),
        type: ApLedgerEntryType.PAYMENT,
        reference: row.paymentNumber,
        poNumber: null,
        journalNumber: row.journalNumber ?? '',
        amountMinor: row.amountMinor,
        signedMinor: -row.amountMinor,
      })),
    ].sort((a, b) => {
      const diff = a.date.getTime() - b.date.getTime();
      if (diff !== 0) {
        return diff;
      }
      return a.reference.localeCompare(b.reference);
    });

    let running = 0;
    let purchased = 0;
    let returned = 0;
    let billed = 0;
    let paid = 0;
    const entries = rows.map((row) => {
      running += row.signedMinor;
      if (row.type === ApLedgerEntryType.RECEIPT) {
        purchased += row.amountMinor;
      } else if (row.type === ApLedgerEntryType.RETURN) {
        returned += row.amountMinor;
      } else if (row.type === ApLedgerEntryType.BILL) {
        billed += row.amountMinor;
        // Cash / already-paid bills count toward "paid" for the summary cards.
        if (row.signedMinor === 0) {
          paid += row.amountMinor;
        }
      } else if (row.type === ApLedgerEntryType.PAYMENT) {
        paid += row.amountMinor;
      }
      return {
        id: row.id,
        date: row.date.toISOString(),
        type: row.type,
        reference: row.reference,
        poNumber: row.poNumber,
        journalNumber: row.journalNumber,
        amount: fromMinorUnits(row.amountMinor),
        runningOutstanding: fromMinorUnits(running),
      };
    });

    return {
      supplier: {
        id: supplier._id.toString(),
        supplierNumber: supplier.supplierNumber,
        name: supplier.name,
        paymentTermsDays: supplier.paymentTermsDays,
      },
      purchased: fromMinorUnits(purchased),
      returned: fromMinorUnits(returned),
      billed: fromMinorUnits(billed),
      paid: fromMinorUnits(paid),
      outstanding: fromMinorUnits(running),
      entries,
    };
  }

  async apAging(asOfInput: string | undefined, actor: AuthenticatedUser): Promise<AgingReport> {
    this.assertFinance(actor);
    const asOf = asOfInput ? this.parseDate(asOfInput) : new Date();
    const suppliers = await SupplierModel.find({ isActive: true }).exec();
    const supplierTerms = new Map(
      suppliers.map((row) => [row._id.toString(), row.paymentTermsDays]),
    );

    const [movements, bills, payments] = await Promise.all([
      GoodsMovementModel.find().exec(),
      SupplierBillModel.find({
        paymentType: BillPaymentType.CREDIT,
        status: BillStatus.OPEN,
      }).exec(),
      SupplierPaymentModel.find({
        status: SupplierPaymentStatus.EXECUTED,
      }).exec(),
    ]);

    const paidBySupplier = new Map<string, number>();
    for (const row of payments) {
      const key = row.supplierId.toString();
      paidBySupplier.set(key, (paidBySupplier.get(key) ?? 0) + row.amountMinor);
    }

    const lines: Array<{
      id: string;
      reference: string;
      partyName: string;
      date: string;
      dueDate: string;
      openAmount: number;
    }> = [];

    for (const row of movements) {
      const supplierKey = row.supplierId.toString();
      const terms = supplierTerms.get(supplierKey) ?? 30;
      const dueDate = this.addDays(row.date, terms);
      const signed =
        row.type === VendorLedgerType.RECEIPT ? row.amountMinor : -row.amountMinor;
      if (signed <= 0) {
        continue;
      }
      lines.push({
        id: row._id.toString(),
        reference: row.movementNumber,
        partyName: row.supplierName,
        date: row.date.toISOString(),
        dueDate: dueDate.toISOString(),
        openAmount: fromMinorUnits(signed),
      });
    }

    for (const row of bills) {
      lines.push({
        id: row._id.toString(),
        reference: row.billNumber,
        partyName: row.supplierName,
        date: row.date.toISOString(),
        dueDate: row.dueDate.toISOString(),
        openAmount: fromMinorUnits(row.amountMinor),
      });
    }

    const totalOpenMinor = lines.reduce(
      (sum, line) => sum + toMinorUnits(line.openAmount),
      0,
    );
    const totalPaidMinor = [...paidBySupplier.values()].reduce(
      (sum, value) => sum + value,
      0,
    );

    if (totalPaidMinor > 0 && totalOpenMinor > totalPaidMinor) {
      let remainingPaid = totalPaidMinor;
      const adjusted = lines.map((line) => {
        const lineMinor = toMinorUnits(line.openAmount);
        if (remainingPaid <= 0) {
          return line;
        }
        if (lineMinor <= remainingPaid) {
          remainingPaid -= lineMinor;
          return null;
        }
        const openMinor = lineMinor - remainingPaid;
        remainingPaid = 0;
        return {
          ...line,
          openAmount: fromMinorUnits(openMinor),
        };
      });
      return buildAgingReport(
        asOf,
        adjusted.filter((line) => line !== null),
      );
    }

    return buildAgingReport(asOf, lines);
  }

  private async refreshOverdueStatuses(): Promise<void> {
    const now = new Date();
    await ClientInvoiceModel.updateMany(
      {
        status: InvoiceStatus.ISSUED,
        dueDate: { $lt: now },
        $expr: { $lt: ['$paidMinor', '$amountMinor'] },
      },
      { $set: { status: InvoiceStatus.OVERDUE } },
    ).exec();
  }

  private async supplierOutstandingMinor(supplierId: Types.ObjectId): Promise<number> {
    const [movements, bills, payments] = await Promise.all([
      GoodsMovementModel.find({ supplierId }).exec(),
      SupplierBillModel.find({
        supplierId,
        paymentType: BillPaymentType.CREDIT,
      }).exec(),
      SupplierPaymentModel.find({
        supplierId,
        status: SupplierPaymentStatus.EXECUTED,
      }).exec(),
    ]);

    let outstanding = 0;
    for (const row of movements) {
      outstanding +=
        row.type === VendorLedgerType.RECEIPT
          ? row.amountMinor
          : -row.amountMinor;
    }
    for (const row of bills) {
      outstanding += row.amountMinor;
    }
    for (const row of payments) {
      outstanding -= row.amountMinor;
    }
    return outstanding;
  }

  private toPublicInvoice(row: ClientInvoiceDocument): PublicInvoice {
    const openMinor =
      row.status === InvoiceStatus.VOID || row.status === InvoiceStatus.PAID
        ? 0
        : row.amountMinor - row.paidMinor;
    const now = new Date();
    const isOverdue =
      openMinor > 0 &&
      row.dueDate < now &&
      row.status !== InvoiceStatus.PAID &&
      row.status !== InvoiceStatus.VOID;
    return {
      id: row._id.toString(),
      invoiceNumber: row.invoiceNumber,
      type: row.type,
      status: row.status,
      projectId: row.projectId.toString(),
      projectCode: row.projectCode,
      projectName: row.projectName,
      clientName: row.clientName,
      clientEmail: row.clientEmail ?? null,
      date: row.date.toISOString(),
      dueDate: row.dueDate.toISOString(),
      description: row.description,
      milestoneLabel: row.milestoneLabel ?? null,
      amount: fromMinorUnits(row.amountMinor),
      paidAmount: fromMinorUnits(row.paidMinor),
      openAmount: fromMinorUnits(openMinor),
      journalNumber: row.journalNumber,
      isOverdue,
    };
  }

  private toPublicCollection(row: InvoiceCollectionDocument): PublicCollection {
    return {
      id: row._id.toString(),
      collectionNumber: row.collectionNumber,
      invoiceId: row.invoiceId.toString(),
      invoiceNumber: row.invoiceNumber,
      amount: fromMinorUnits(row.amountMinor),
      date: row.date.toISOString(),
      treasuryAccountCode: row.treasuryAccountCode,
      journalNumber: row.journalNumber,
    };
  }

  private toPublicBill(row: SupplierBillDocument): PublicSupplierBill {
    return {
      id: row._id.toString(),
      billNumber: row.billNumber,
      paymentType: row.paymentType,
      status: row.status,
      supplierId: row.supplierId.toString(),
      supplierNumber: row.supplierNumber,
      supplierName: row.supplierName,
      projectId: row.projectId ? row.projectId.toString() : null,
      projectCode: row.projectCode ?? null,
      projectName: row.projectName ?? null,
      expenseAccountCode: row.expenseAccountCode,
      expenseAccountName: row.expenseAccountName,
      date: row.date.toISOString(),
      dueDate: row.dueDate.toISOString(),
      description: row.description,
      amount: fromMinorUnits(row.amountMinor),
      treasuryAccountCode: row.treasuryAccountCode ?? null,
      journalNumber: row.journalNumber,
    };
  }

  private toPublicPayment(row: SupplierPaymentDocument): PublicSupplierPayment {
    return {
      id: row._id.toString(),
      paymentNumber: row.paymentNumber,
      status: row.status,
      supplierId: row.supplierId.toString(),
      supplierNumber: row.supplierNumber,
      supplierName: row.supplierName,
      amount: fromMinorUnits(row.amountMinor),
      scheduledDate: row.scheduledDate ? row.scheduledDate.toISOString() : null,
      executedDate: row.executedDate ? row.executedDate.toISOString() : null,
      treasuryAccountCode: row.treasuryAccountCode,
      memo: row.memo ?? null,
      journalNumber: row.journalNumber ?? null,
    };
  }

  private assertFinance(actor: AuthenticatedUser): void {
    if (!FINANCE_ROLES.has(actor.role)) {
      throw forbidden('Finance role required');
    }
  }

  /**
   * After a manual journal is posted: create/update AR invoice (1121 debit)
   * and/or AP credit bill (2111 credit). Does not post another journal.
   * Module "Add invoice / Add bill" flows remain separate (system journals).
   */
  async syncFromManualJournal(
    journal: PublicJournal,
    userId: string,
  ): Promise<void> {
    if (journal.source !== 'manual' || journal.status !== 'posted') {
      return;
    }

    const arDebits = journal.lines.filter(
      (line) =>
        line.accountCode === SystemAccountCode.ACCOUNTS_RECEIVABLE &&
        (line.debit ?? 0) > 0,
    );
    const apCredits = journal.lines.filter(
      (line) =>
        line.accountCode === SystemAccountCode.ACCOUNTS_PAYABLE &&
        (line.credit ?? 0) > 0,
    );

    if (arDebits.length > 0) {
      await this.upsertInvoiceFromManualJournal(journal, arDebits, userId);
    }
    if (apCredits.length > 0) {
      await this.upsertBillFromManualJournal(journal, apCredits, userId);
    }
  }

  /**
   * When a posted journal is reversed, void linked unpaid invoice/bill rows
   * so AR/AP lists stay aligned with the GL.
   */
  async assertLinkedJournalReversible(journalId: string): Promise<void> {
    if (!Types.ObjectId.isValid(journalId)) {
      return;
    }
    const journalObjectId = new Types.ObjectId(journalId);

    const invoice = await ClientInvoiceModel.findOne({
      journalId: journalObjectId,
    }).exec();
    if (invoice && invoice.paidMinor > 0) {
      throw badRequest(
        `Cannot reverse journal: invoice ${invoice.invoiceNumber} has collections. Reverse collections first.`,
      );
    }

    const bill = await SupplierBillModel.findOne({
      journalId: journalObjectId,
    }).exec();
    if (bill && bill.status === BillStatus.PAID) {
      throw badRequest(
        `Cannot reverse journal: bill ${bill.billNumber} is paid.`,
      );
    }
  }

  async voidLinkedToJournal(journalId: string, _userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(journalId)) {
      return;
    }
    const journalObjectId = new Types.ObjectId(journalId);

    const invoice = await ClientInvoiceModel.findOne({
      journalId: journalObjectId,
    }).exec();
    if (invoice && invoice.status !== InvoiceStatus.VOID) {
      if (invoice.paidMinor > 0) {
        throw badRequest(
          `Cannot reverse journal: invoice ${invoice.invoiceNumber} has collections. Reverse collections first.`,
        );
      }
      invoice.status = InvoiceStatus.VOID;
      await invoice.save();
    }

    const bill = await SupplierBillModel.findOne({
      journalId: journalObjectId,
    }).exec();
    if (bill && bill.status !== BillStatus.VOID) {
      if (bill.status === BillStatus.PAID) {
        throw badRequest(
          `Cannot reverse journal: bill ${bill.billNumber} is paid.`,
        );
      }
      bill.status = BillStatus.VOID;
      await bill.save();
    }
  }

  private async upsertInvoiceFromManualJournal(
    journal: PublicJournal,
    arDebits: PublicJournal['lines'],
    userId: string,
  ): Promise<void> {
    const customerIds = [
      ...new Set(
        arDebits
          .map((line) => line.entityId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (customerIds.length !== 1) {
      throw badRequest(
        'Manual Client Receivable (1121) journals need exactly one customer entity to create an AR invoice',
      );
    }
    const customerId = customerIds[0]!;
    const customer = await CustomerModel.findById(customerId).exec();
    if (!customer) {
      throw badRequest('Customer not found for Client Receivable line');
    }

    const projectId =
      journal.projectId ||
      arDebits.map((line) => line.projectId).find((id): id is string => Boolean(id));
    if (!projectId) {
      throw badRequest(
        'Set a header or line project when posting Client Receivable (1121) so an AR invoice can be created',
      );
    }
    const project = await this.projectsService.getById(projectId);

    const amountMajor = arDebits.reduce((sum, line) => sum + (line.debit ?? 0), 0);
    const amountMinor = toMinorUnits(amountMajor);
    const date = this.parseDate(journal.date);
    const dueDate = this.addDays(date, 30);
    const description =
      (journal.memo || arDebits[0]?.description || 'Manual AR journal').trim() ||
      'Manual AR journal';

    const journalObjectId = new Types.ObjectId(journal.id);
    const existing = await ClientInvoiceModel.findOne({
      journalId: journalObjectId,
    }).exec();

    if (existing) {
      if (existing.paidMinor > 0) {
        throw badRequest(
          `Invoice ${existing.invoiceNumber} has collections and cannot be updated from the journal`,
        );
      }
      if (existing.status === InvoiceStatus.VOID) {
        existing.status = InvoiceStatus.ISSUED;
      }
      existing.projectId = new Types.ObjectId(project.id);
      existing.projectCode = project.code;
      existing.projectName = project.name;
      existing.clientName = customer.name;
      existing.clientEmail = customer.email ?? undefined;
      existing.date = date;
      existing.dueDate = dueDate;
      existing.description = description.slice(0, 500);
      existing.amountMinor = amountMinor;
      existing.journalNumber = journal.entryNumber;
      await existing.save();
      return;
    }

    const invoiceNumber = await this.nextNumber('invoice', 'INV', date);
    await ClientInvoiceModel.create({
      invoiceNumber,
      type: InvoiceType.LUMP_SUM,
      status: InvoiceStatus.ISSUED,
      projectId: new Types.ObjectId(project.id),
      projectCode: project.code,
      projectName: project.name,
      clientName: customer.name,
      clientEmail: customer.email ?? undefined,
      date,
      dueDate,
      description: description.slice(0, 500),
      amountMinor,
      paidMinor: 0,
      journalId: journalObjectId,
      journalNumber: journal.entryNumber,
      createdBy: new Types.ObjectId(userId),
    });
  }

  private async upsertBillFromManualJournal(
    journal: PublicJournal,
    apCredits: PublicJournal['lines'],
    userId: string,
  ): Promise<void> {
    const supplierIds = [
      ...new Set(
        apCredits
          .map((line) => line.entityId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (supplierIds.length !== 1) {
      throw badRequest(
        'Manual Supplier Payable (2111) journals need exactly one supplier entity to create an AP bill',
      );
    }
    const supplier = await this.findSupplierOrFail(supplierIds[0]!);

    const amountMajor = apCredits.reduce(
      (sum, line) => sum + (line.credit ?? 0),
      0,
    );
    const amountMinor = toMinorUnits(amountMajor);
    const date = this.parseDate(journal.date);
    const dueDate = this.addDays(date, supplier.paymentTermsDays || 30);
    const description =
      (journal.memo || apCredits[0]?.description || 'Manual AP journal').trim() ||
      'Manual AP journal';

    const expenseLine = journal.lines.find(
      (line) =>
        (line.debit ?? 0) > 0 &&
        line.accountCode !== SystemAccountCode.ACCOUNTS_PAYABLE,
    );
    const expenseCode =
      expenseLine?.accountCode?.toUpperCase() || DEFAULT_BILL_EXPENSE_CODE;
    const expenseAccount =
      await this.accountsService.findByCodeOrFail(expenseCode);

    const projectId =
      journal.projectId ||
      expenseLine?.projectId ||
      apCredits.map((line) => line.projectId).find((id): id is string => Boolean(id));
    let projectCode: string | undefined;
    let projectName: string | undefined;
    let projectObjectId: Types.ObjectId | undefined;
    if (projectId) {
      const project = await this.projectsService.getById(projectId);
      projectObjectId = new Types.ObjectId(project.id);
      projectCode = project.code;
      projectName = project.name;
    }

    const journalObjectId = new Types.ObjectId(journal.id);
    const existing = await SupplierBillModel.findOne({
      journalId: journalObjectId,
    }).exec();

    if (existing) {
      if (existing.status === BillStatus.PAID) {
        throw badRequest(
          `Bill ${existing.billNumber} is paid and cannot be updated from the journal`,
        );
      }
      existing.status = BillStatus.OPEN;
      existing.supplierId = supplier._id;
      existing.supplierNumber = supplier.supplierNumber;
      existing.supplierName = supplier.name;
      existing.projectId = projectObjectId;
      existing.projectCode = projectCode;
      existing.projectName = projectName;
      existing.expenseAccountCode = expenseAccount.code;
      existing.expenseAccountName = expenseAccount.name;
      existing.date = date;
      existing.dueDate = dueDate;
      existing.description = description.slice(0, 500);
      existing.amountMinor = amountMinor;
      existing.journalNumber = journal.entryNumber;
      await existing.save();
      return;
    }

    const billNumber = await this.nextNumber('bill', 'BILL', date);
    await SupplierBillModel.create({
      billNumber,
      paymentType: BillPaymentType.CREDIT,
      status: BillStatus.OPEN,
      supplierId: supplier._id,
      supplierNumber: supplier.supplierNumber,
      supplierName: supplier.name,
      projectId: projectObjectId,
      projectCode,
      projectName,
      expenseAccountCode: expenseAccount.code,
      expenseAccountName: expenseAccount.name,
      date,
      dueDate,
      description: description.slice(0, 500),
      amountMinor,
      journalId: journalObjectId,
      journalNumber: journal.entryNumber,
      createdBy: new Types.ObjectId(userId),
    });
  }

  private parseDate(value: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw badRequest('Invalid date');
    }
    return date;
  }

  private addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
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

  private async findInvoiceOrFail(id: string): Promise<ClientInvoiceDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw notFound('Invoice not found');
    }
    const row = await ClientInvoiceModel.findById(id).exec();
    if (!row) {
      throw notFound('Invoice not found');
    }
    return row;
  }

  private async findPaymentOrFail(id: string): Promise<SupplierPaymentDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw notFound('Payment not found');
    }
    const row = await SupplierPaymentModel.findById(id).exec();
    if (!row) {
      throw notFound('Payment not found');
    }
    return row;
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
}
