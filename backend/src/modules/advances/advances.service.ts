import { Types } from 'mongoose';
import { AccountType } from '../../common/enums/account-type.enum';
import {
  AdvanceStatus,
  SettlementCase,
} from '../../common/enums/advance-status.enum';
import { ApprovalEntityType } from '../../common/enums/governance.enum';
import { Role } from '../../common/enums/role.enum';
import { badRequest, forbidden, notFound } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { fromMinorUnits, toMinorUnits } from '../../common/utils/money';
import { AccountsService } from '../accounting/accounts.service';
import { CounterModel } from '../accounting/counter.model';
import type { JournalService } from '../accounting/journal.service';
import type { ApprovalService } from '../governance/approval.service';
import type { BankingService } from '../banking/banking.service';
import type { ProjectsService } from '../projects/projects.service';
import type { UsersService } from '../users/users.service';
import { AdvanceModel, type AdvanceDocument } from './advance.model';
import {
  ADVANCE_ASSET_CODE,
  EMPLOYEE_PAYABLE_CODE,
  assertExpenseAccount,
  buildReimbursementJournalLines,
  buildSettlementJournalLines,
  classifySettlement,
} from './settlement';
import { JournalEntityType } from '../accounting/journal.enums';
import { LedgerLineModel } from '../accounting/ledger.model';
import type {
  ConfirmSettlementDto,
  CreateAdvanceDto,
  DisburseAdvanceDto,
  ReimburseAdvanceDto,
  SubmitSettlementDto,
} from './dto/advance.dto';

const FINANCE_ROLES = new Set([Role.ADMIN, Role.ACCOUNTANT]);

export type PublicAdvance = {
  id: string;
  advanceNumber: string;
  status: AdvanceStatus;
  employeeId: string;
  employeeName: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  requestedAmount: number;
  purpose: string;
  requestedAt: string;
  disbursedAmount: number | null;
  disbursedAt: string | null;
  treasuryAccountCode: string | null;
  disbursementJournalNumber: string | null;
  vouchers: Array<{
    accountCode: string;
    accountName: string;
    amount: number;
    description: string | null;
  }>;
  spentAmount: number | null;
  settlementCase: SettlementCase | null;
  returnAccountCode: string | null;
  settlementJournalNumber: string | null;
  settledAt: string | null;
  reimbursementDue: number;
  reimbursedAmount: number;
  reimbursementJournalNumber: string | null;
  reimbursedAt: string | null;
  rejectionReason: string | null;
};

export type EmployeeLedgerStatus =
  | 'DEBIT_BALANCE'
  | 'CREDIT_BALANCE'
  | 'SETTLED';

export type EmployeeLedgerLine = {
  id: string;
  date: string;
  journalEntryNumber: string;
  accountCode: string;
  accountName: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  voucherType: string;
  status: EmployeeLedgerStatus;
  advanceId: string | null;
  canReimburse: boolean;
};

export type EmployeeLedgerReport = {
  employeeId: string;
  employeeName: string;
  totalAdvancesGiven: number;
  totalExpenseSettled: number;
  totalReimbursed: number;
  runningBalance: number;
  status: EmployeeLedgerStatus;
  lines: EmployeeLedgerLine[];
  openReimbursements: Array<{
    advanceId: string;
    advanceNumber: string;
    amount: number;
  }>;
};

export class AdvancesService {
  constructor(
    private readonly journalService: JournalService,
    private readonly projectsService: ProjectsService,
    private readonly accountsService: AccountsService,
    private readonly bankingService: BankingService,
    private readonly usersService: UsersService,
    private readonly approvalService?: ApprovalService,
  ) {}

  toPublic(row: AdvanceDocument): PublicAdvance {
    const disbursedMinor = row.disbursedMinor ?? 0;
    const spentMinor = row.spentMinor ?? 0;
    const reimbursedMinor = row.reimbursedMinor ?? 0;
    const excessMinor =
      row.settlementCase === SettlementCase.MORE && spentMinor > disbursedMinor
        ? spentMinor - disbursedMinor
        : 0;
    const reimbursementDue = Math.max(0, excessMinor - reimbursedMinor);

    return {
      id: row._id.toString(),
      advanceNumber: row.advanceNumber,
      status: row.status,
      employeeId: row.employeeId.toString(),
      employeeName: row.employeeName,
      projectId: row.projectId.toString(),
      projectCode: row.projectCode,
      projectName: row.projectName,
      requestedAmount: fromMinorUnits(row.requestedMinor),
      purpose: row.purpose,
      requestedAt: row.requestedAt.toISOString(),
      disbursedAmount:
        row.disbursedMinor !== undefined
          ? fromMinorUnits(row.disbursedMinor)
          : null,
      disbursedAt: row.disbursedAt ? row.disbursedAt.toISOString() : null,
      treasuryAccountCode: row.treasuryAccountCode ?? null,
      disbursementJournalNumber: row.disbursementJournalNumber ?? null,
      vouchers: row.vouchers.map((line) => ({
        accountCode: line.accountCode,
        accountName: line.accountName,
        amount: fromMinorUnits(line.amountMinor),
        description: line.description ?? null,
      })),
      spentAmount:
        row.spentMinor !== undefined ? fromMinorUnits(row.spentMinor) : null,
      settlementCase: row.settlementCase ?? null,
      returnAccountCode: row.returnAccountCode ?? null,
      settlementJournalNumber: row.settlementJournalNumber ?? null,
      settledAt: row.settledAt ? row.settledAt.toISOString() : null,
      reimbursementDue: fromMinorUnits(reimbursementDue),
      reimbursedAmount: fromMinorUnits(reimbursedMinor),
      reimbursementJournalNumber: row.reimbursementJournalNumber ?? null,
      reimbursedAt: row.reimbursedAt ? row.reimbursedAt.toISOString() : null,
      rejectionReason: row.rejectionReason ?? null,
    };
  }

  async projectOptions(actor?: AuthenticatedUser) {
    return this.projectsService.listOptions(actor);
  }

  async expenseAccountOptions() {
    const accounts = await this.accountsService.list(AccountType.EXPENSE);
    return accounts
      .filter((account) => account.isActive && account.isPostable)
      .map((account) => ({
        code: account.code,
        name: account.name,
      }));
  }

  async create(
    dto: CreateAdvanceDto,
    actor: AuthenticatedUser,
  ): Promise<PublicAdvance> {
    const employeeId = this.resolveEmployeeId(dto.employeeId, actor);
    const employee = await this.usersService.findByIdOrFail(employeeId);
    if (!employee.isActive) {
      throw badRequest('Employee is inactive');
    }
    const project = await this.projectsService.findByIdOrFail(dto.projectId);
    if (actor.role === Role.PROJECT_MANAGER) {
      this.projectsService.assertCanAccessProject(actor, project);
    }
    const requestedAt = new Date();
    const created = await AdvanceModel.create({
      advanceNumber: await this.nextNumber(requestedAt),
      status: AdvanceStatus.PENDING,
      employeeId: employee._id,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      projectId: project._id,
      projectCode: project.code,
      projectName: project.name,
      requestedMinor: toMinorUnits(dto.amount),
      purpose: dto.purpose.trim(),
      requestedAt,
      vouchers: [],
    });
    return this.toPublic(created);
  }

  async list(actor: AuthenticatedUser): Promise<PublicAdvance[]> {
    let filter: Record<string, unknown> = {};
    if (this.isFinance(actor)) {
      filter = {};
    } else if (actor.role === Role.PROJECT_MANAGER) {
      const projectIds = await this.projectsService.managedProjectIds(actor);
      filter = {
        $or: [
          { employeeId: new Types.ObjectId(actor.userId) },
          { projectId: { $in: projectIds } },
        ],
      };
    } else {
      filter = { employeeId: new Types.ObjectId(actor.userId) };
    }
    const rows = await AdvanceModel.find(filter)
      .sort({ requestedAt: -1, advanceNumber: -1 })
      .exec();
    return rows.map((row) => this.toPublic(row));
  }

  async getById(id: string, actor: AuthenticatedUser): Promise<PublicAdvance> {
    return this.toPublic(await this.findVisibleOrFail(id, actor));
  }

  async reject(
    id: string,
    actor: AuthenticatedUser,
    reason?: string,
  ): Promise<PublicAdvance> {
    this.assertFinance(actor);
    const row = await this.findByIdOrFail(id);
    if (row.status !== AdvanceStatus.PENDING) {
      throw badRequest('Only a pending requisition can be rejected');
    }
    row.status = AdvanceStatus.REJECTED;
    row.rejectionReason = reason?.trim();
    await row.save();
    return this.toPublic(row);
  }

  async disburse(
    id: string,
    dto: DisburseAdvanceDto,
    actor: AuthenticatedUser,
  ): Promise<PublicAdvance | { requiresApproval: true; approval: unknown }> {
    this.assertFinance(actor);
    const row = await this.findByIdOrFail(id);
    if (row.status !== AdvanceStatus.PENDING) {
      throw badRequest('Only a pending requisition can be disbursed');
    }

    const amount = fromMinorUnits(row.requestedMinor);
    if (this.approvalService && actor.role !== Role.ADMIN) {
      const gate = await this.approvalService.requireApprovedOrCreate(
        {
          entityType: ApprovalEntityType.ADVANCE_DISBURSE,
          amount,
          summary: `Disburse advance ${row.advanceNumber}`,
          projectId: row.projectId.toString(),
          projectCode: row.projectCode,
          payload: {
            advanceId: row._id.toString(),
            treasuryId: dto.treasuryId,
            date: dto.date,
            memo: dto.memo,
          },
        },
        actor,
        dto.approvalId,
      );
      if (!gate.allowed) {
        return { requiresApproval: true, approval: gate.approval };
      }
    }

    const treasury = await this.bankingService.requireActive(dto.treasuryId);
    const date = new Date(dto.date);
    if (Number.isNaN(date.getTime())) {
      throw badRequest('Invalid disbursement date');
    }

    const journal = await this.journalService.post(
      {
        date: date.toISOString(),
        memo: dto.memo?.trim() || `Advance ${row.advanceNumber} disbursed`,
        reference: row.advanceNumber,
        projectId: row.projectId.toString(),
        lines: [
          {
            accountCode: ADVANCE_ASSET_CODE,
            debit: amount,
            description: `Advance to ${row.employeeName}`,
            projectId: row.projectId.toString(),
            entityType: JournalEntityType.EMPLOYEE,
            entityId: row.employeeId.toString(),
          },
          {
            accountCode: treasury.glAccountCode,
            credit: amount,
            description: `Disburse ${row.advanceNumber}`,
          },
        ],
      },
      actor.userId,
      'system',
    );

    row.status = AdvanceStatus.DISBURSED;
    row.disbursedMinor = row.requestedMinor;
    row.disbursedAt = date;
    row.disbursedBy = new Types.ObjectId(actor.userId);
    row.treasuryId = new Types.ObjectId(treasury.id);
    row.treasuryAccountCode = treasury.glAccountCode;
    row.disbursementJournalId = new Types.ObjectId(journal.id);
    row.disbursementJournalNumber = journal.entryNumber;
    await row.save();

    if (this.approvalService && dto.approvalId) {
      await this.approvalService.markExecuted(
        dto.approvalId,
        actor,
        row.advanceNumber,
      );
    }

    return this.toPublic(row);
  }

  async submitSettlement(
    id: string,
    dto: SubmitSettlementDto,
    actor: AuthenticatedUser,
  ): Promise<PublicAdvance> {
    const row = await this.findVisibleOrFail(id, actor);
    if (row.status !== AdvanceStatus.DISBURSED) {
      throw badRequest('Vouchers can only be submitted against a disbursed advance');
    }
    if (!this.isFinance(actor) && row.employeeId.toString() !== actor.userId) {
      throw forbidden('You can only settle your own advance');
    }

    const vouchers = await this.prepareVouchers(dto.lines ?? []);
    const spentMinor = vouchers.reduce((sum, line) => sum + line.amountMinor, 0);
    classifySettlement(row.disbursedMinor ?? row.requestedMinor, spentMinor);

    row.vouchers = vouchers;
    row.spentMinor = spentMinor;
    row.submittedAt = new Date();
    row.status = AdvanceStatus.SUBMITTED;
    await row.save();
    return this.toPublic(row);
  }

  async confirmSettlement(
    id: string,
    dto: ConfirmSettlementDto,
    actor: AuthenticatedUser,
  ): Promise<PublicAdvance> {
    this.assertFinance(actor);
    const row = await this.findByIdOrFail(id);
    if (row.status !== AdvanceStatus.SUBMITTED) {
      throw badRequest('Only a submitted settlement can be confirmed');
    }

    const advancedMinor = row.disbursedMinor ?? row.requestedMinor;
    const spentMinor = row.spentMinor ?? 0;
    const settlementCase = classifySettlement(advancedMinor, spentMinor);

    let returnAccountCode = row.treasuryAccountCode;
    let returnTreasuryId = row.treasuryId;
    if (settlementCase === SettlementCase.LESS) {
      const returnId = dto.returnTreasuryId ?? row.treasuryId?.toString();
      if (!returnId) {
        throw badRequest('Choose a cash or bank account for the unspent return');
      }
      const treasury = await this.bankingService.requireActive(returnId);
      returnAccountCode = treasury.glAccountCode;
      returnTreasuryId = new Types.ObjectId(treasury.id);
    }

    const { lines } = buildSettlementJournalLines({
      projectId: row.projectId.toString(),
      employeeId: row.employeeId.toString(),
      advancedMinor,
      vouchers: row.vouchers,
      returnAccountCode:
        settlementCase === SettlementCase.LESS ? returnAccountCode : undefined,
    });

    const date = dto.date ? new Date(dto.date) : new Date();
    if (Number.isNaN(date.getTime())) {
      throw badRequest('Invalid settlement date');
    }

    const journal = await this.journalService.post(
      {
        date: date.toISOString(),
        memo: `Advance ${row.advanceNumber} settlement (${settlementCase})`,
        reference: row.advanceNumber,
        projectId: row.projectId.toString(),
        journalType:
          settlementCase === SettlementCase.MORE
            ? 'employee_settlement'
            : 'employee_settlement',
        lines,
      },
      actor.userId,
      'system',
    );

    row.status = AdvanceStatus.SETTLED;
    row.settlementCase = settlementCase;
    row.returnTreasuryId = returnTreasuryId;
    row.returnAccountCode =
      settlementCase === SettlementCase.LESS ? returnAccountCode : undefined;
    row.settlementJournalId = new Types.ObjectId(journal.id);
    row.settlementJournalNumber = journal.entryNumber;
    row.settledAt = date;
    row.settledBy = new Types.ObjectId(actor.userId);
    row.reimbursedMinor = 0;
    await row.save();
    return this.toPublic(row);
  }

  async reimburse(
    id: string,
    dto: ReimburseAdvanceDto,
    actor: AuthenticatedUser,
  ): Promise<PublicAdvance> {
    this.assertFinance(actor);
    const row = await this.findByIdOrFail(id);
    if (row.status !== AdvanceStatus.SETTLED) {
      throw badRequest('Only a settled advance can be reimbursed');
    }
    if (row.settlementCase !== SettlementCase.MORE) {
      throw badRequest('Reimbursement applies only when spend exceeded the advance');
    }

    const advancedMinor = row.disbursedMinor ?? row.requestedMinor;
    const spentMinor = row.spentMinor ?? 0;
    const excessMinor = Math.max(0, spentMinor - advancedMinor);
    const already = row.reimbursedMinor ?? 0;
    const dueMinor = excessMinor - already;
    if (dueMinor <= 0) {
      throw badRequest('No reimbursement is due on this advance');
    }

    const treasury = await this.bankingService.requireActive(dto.treasuryId);
    const date = dto.date ? new Date(dto.date) : new Date();
    if (Number.isNaN(date.getTime())) {
      throw badRequest('Invalid reimbursement date');
    }

    const journal = await this.journalService.post(
      {
        date: date.toISOString(),
        memo:
          dto.memo?.trim() ||
          `Reimburse excess on advance ${row.advanceNumber}`,
        reference: row.advanceNumber,
        projectId: row.projectId.toString(),
        journalType: 'employee_settlement',
        lines: buildReimbursementJournalLines({
          employeeId: row.employeeId.toString(),
          amountMinor: dueMinor,
          treasuryAccountCode: treasury.glAccountCode,
          description: `Reimburse ${row.employeeName} · ${row.advanceNumber}`,
        }),
      },
      actor.userId,
      'system',
    );

    row.reimbursedMinor = already + dueMinor;
    row.reimbursedAt = date;
    row.reimbursedBy = new Types.ObjectId(actor.userId);
    row.reimbursementTreasuryId = new Types.ObjectId(treasury.id);
    row.reimbursementAccountCode = treasury.glAccountCode;
    row.reimbursementJournalId = new Types.ObjectId(journal.id);
    row.reimbursementJournalNumber = journal.entryNumber;
    await row.save();
    return this.toPublic(row);
  }

  async getEmployeeLedger(
    employeeId: string,
    actor: AuthenticatedUser,
  ): Promise<EmployeeLedgerReport> {
    this.assertCanViewEmployeeLedger(employeeId, actor);
    if (!Types.ObjectId.isValid(employeeId)) {
      throw notFound('Employee not found');
    }
    const employee = await this.usersService.findByIdOrFail(employeeId);
    const employeeOid = new Types.ObjectId(employeeId);

    const advances = await AdvanceModel.find({ employeeId: employeeOid })
      .sort({ requestedAt: 1 })
      .exec();

    const ledgerRows = await LedgerLineModel.find({
      entityType: JournalEntityType.EMPLOYEE,
      entityId: employeeOid,
      accountCode: { $in: [ADVANCE_ASSET_CODE, EMPLOYEE_PAYABLE_CODE] },
    })
      .sort({ date: 1, journalEntryNumber: 1, createdAt: 1 })
      .exec();

    const byJournal = new Map(
      advances.flatMap((adv) => {
        const pairs: Array<[string, AdvanceDocument]> = [];
        if (adv.disbursementJournalNumber) {
          pairs.push([adv.disbursementJournalNumber, adv]);
        }
        if (adv.settlementJournalNumber) {
          pairs.push([adv.settlementJournalNumber, adv]);
        }
        if (adv.reimbursementJournalNumber) {
          pairs.push([adv.reimbursementJournalNumber, adv]);
        }
        return pairs;
      }),
    );

    let runningMinor = 0;
    const lines: EmployeeLedgerLine[] = [];

    for (const row of ledgerRows) {
      runningMinor += row.debitMinor - row.creditMinor;
      const linked = byJournal.get(row.journalEntryNumber);
      const status = this.balanceStatus(runningMinor);
      const openDue =
        linked &&
        linked.settlementCase === SettlementCase.MORE &&
        (linked.spentMinor ?? 0) - (linked.disbursedMinor ?? 0) -
          (linked.reimbursedMinor ?? 0) >
          0;

      lines.push({
        id: row._id.toString(),
        date: row.date.toISOString(),
        journalEntryNumber: row.journalEntryNumber,
        accountCode: row.accountCode,
        accountName: row.accountName,
        description: row.memo,
        debit: fromMinorUnits(row.debitMinor),
        credit: fromMinorUnits(row.creditMinor),
        runningBalance: fromMinorUnits(runningMinor),
        voucherType: this.voucherTypeLabel(row.accountCode, row.debitMinor, row.creditMinor),
        status,
        advanceId: linked ? linked._id.toString() : null,
        canReimburse: Boolean(openDue && runningMinor < 0 && this.isFinance(actor)),
      });
    }

    const totalAdvancesGiven = fromMinorUnits(
      advances.reduce((sum, row) => sum + (row.disbursedMinor ?? 0), 0),
    );
    const totalExpenseSettled = fromMinorUnits(
      advances.reduce((sum, row) => sum + (row.spentMinor ?? 0), 0),
    );
    const totalReimbursed = fromMinorUnits(
      advances.reduce((sum, row) => sum + (row.reimbursedMinor ?? 0), 0),
    );

    const openReimbursements = advances
      .filter((row) => row.settlementCase === SettlementCase.MORE)
      .map((row) => {
        const due =
          (row.spentMinor ?? 0) -
          (row.disbursedMinor ?? 0) -
          (row.reimbursedMinor ?? 0);
        return {
          advanceId: row._id.toString(),
          advanceNumber: row.advanceNumber,
          amount: fromMinorUnits(Math.max(0, due)),
        };
      })
      .filter((row) => row.amount > 0);

    return {
      employeeId,
      employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
      totalAdvancesGiven,
      totalExpenseSettled,
      totalReimbursed,
      runningBalance: fromMinorUnits(runningMinor),
      status: this.balanceStatus(runningMinor),
      lines,
      openReimbursements,
    };
  }

  private balanceStatus(runningMinor: number): EmployeeLedgerStatus {
    if (runningMinor > 0) return 'DEBIT_BALANCE';
    if (runningMinor < 0) return 'CREDIT_BALANCE';
    return 'SETTLED';
  }

  private voucherTypeLabel(
    accountCode: string,
    debitMinor: number,
    creditMinor: number,
  ): string {
    if (accountCode === ADVANCE_ASSET_CODE && debitMinor > 0) {
      return 'Advance disbursement';
    }
    if (accountCode === ADVANCE_ASSET_CODE && creditMinor > 0) {
      return 'Advance settlement';
    }
    if (accountCode === EMPLOYEE_PAYABLE_CODE && creditMinor > 0) {
      return 'Reimbursement due';
    }
    if (accountCode === EMPLOYEE_PAYABLE_CODE && debitMinor > 0) {
      return 'Reimbursement payout';
    }
    return 'Employee ledger';
  }

  private assertCanViewEmployeeLedger(
    employeeId: string,
    actor: AuthenticatedUser,
  ): void {
    if (this.isFinance(actor) || actor.userId === employeeId) {
      return;
    }
    throw forbidden('You do not have access to this employee ledger');
  }

  private async prepareVouchers(lines: SubmitSettlementDto['lines']) {
    if (lines.length === 0) {
      return [];
    }
    const codes = lines.map((line) => line.accountCode.trim().toUpperCase());
    const accounts = await this.accountsService.findPostableByCodes(codes);
    const byCode = new Map(accounts.map((account) => [account.code, account]));
    return lines.map((line) => {
      const code = line.accountCode.trim().toUpperCase();
      const account = byCode.get(code)!;
      assertExpenseAccount(account.type, code);
      return {
        accountCode: account.code,
        accountName: account.name,
        amountMinor: toMinorUnits(line.amount),
        description: line.description?.trim(),
      };
    });
  }

  private resolveEmployeeId(
    requestedId: string | undefined,
    actor: AuthenticatedUser,
  ): string {
    if (!requestedId || requestedId === actor.userId) {
      return actor.userId;
    }
    if (!this.isFinance(actor) && actor.role !== Role.PROJECT_MANAGER) {
      throw forbidden('You can only request an advance for yourself');
    }
    return requestedId;
  }

  private isFinance(actor: AuthenticatedUser): boolean {
    return FINANCE_ROLES.has(actor.role);
  }

  private assertFinance(actor: AuthenticatedUser): void {
    if (!this.isFinance(actor)) {
      throw forbidden('You do not have permission to perform this action');
    }
  }

  private async findByIdOrFail(id: string): Promise<AdvanceDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw notFound('Advance not found');
    }
    const row = await AdvanceModel.findById(id).exec();
    if (!row) {
      throw notFound('Advance not found');
    }
    return row;
  }

  private async findVisibleOrFail(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<AdvanceDocument> {
    const row = await this.findByIdOrFail(id);
    if (this.isFinance(actor)) {
      return row;
    }
    if (row.employeeId.toString() === actor.userId) {
      return row;
    }
    if (actor.role === Role.PROJECT_MANAGER) {
      await this.projectsService.assertCanAccessProjectId(
        actor,
        row.projectId.toString(),
      );
      return row;
    }
    throw forbidden('You do not have access to this advance');
  }

  private async nextNumber(date: Date): Promise<string> {
    const year = date.getUTCFullYear();
    const counter = await CounterModel.findOneAndUpdate(
      { key: `advance:${year}` },
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    );
    const seq = counter?.seq ?? 1;
    return `ADV-${year}-${String(seq).padStart(5, '0')}`;
  }
}
