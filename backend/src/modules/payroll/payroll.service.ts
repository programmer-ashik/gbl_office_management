import { Types } from 'mongoose';
import { AdvanceStatus } from '../../common/enums/advance-status.enum';
import { PayrollRunStatus } from '../../common/enums/payroll.enum';
import { Role } from '../../common/enums/role.enum';
import { badRequest, forbidden, notFound } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { fromMinorUnits, toMinorUnits } from '../../common/utils/money';
import { fromMilliQty, toMilliQty } from '../../common/utils/quantity';
import { CounterModel } from '../accounting/counter.model';
import type { JournalService } from '../accounting/journal.service';
import { AdvanceModel } from '../advances/advance.model';
import type { BankingService } from '../banking/banking.service';
import type { ProjectsService } from '../projects/projects.service';
import type { UsersService } from '../users/users.service';
import {
  allocateLaborByTime,
  buildPayrollJournalLines,
  proposeAdvanceDeductions,
} from './allocation';
import type {
  CreateTimeLogDto,
  DisbursePayrollDto,
  GeneratePayrollDto,
  UpsertSalaryStructureDto,
} from './dto/payroll.dto';
import {
  PayrollRunModel,
  type PayrollRunDocument,
} from './payroll-run.model';
import {
  SalaryStructureModel,
  type SalaryStructureDocument,
} from './salary-structure.model';
import { TimeLogModel, type TimeLogDocument } from './time-log.model';

const FINANCE_ROLES = new Set([Role.ADMIN, Role.ACCOUNTANT]);

export type PublicSalaryStructure = {
  id: string;
  employeeId: string;
  employeeName: string;
  basic: number;
  allowances: Array<{ name: string; amount: number }>;
  deductions: Array<{ name: string; amount: number }>;
  gross: number;
  structuralDeductions: number;
  isActive: boolean;
};

export type PublicTimeLog = {
  id: string;
  employeeId: string;
  employeeName: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  periodYear: number;
  periodMonth: number;
  unit: string;
  quantity: number;
  notes: string | null;
};

export type PublicPayrollRun = {
  id: string;
  sheetNumber: string;
  status: PayrollRunStatus;
  periodYear: number;
  periodMonth: number;
  totalGross: number;
  totalStructuralDeductions: number;
  totalAdvanceDeductions: number;
  totalNetPay: number;
  journalNumber: string | null;
  disbursedAt: string | null;
  lines: Array<{
    employeeId: string;
    employeeName: string;
    basic: number;
    allowances: number;
    structuralDeductions: number;
    gross: number;
    advanceDeductions: Array<{
      advanceId: string;
      advanceNumber: string;
      amount: number;
    }>;
    totalAdvanceDeductions: number;
    netPay: number;
    allocations: Array<{
      projectId: string;
      projectCode: string;
      projectName: string;
      quantity: number;
      amount: number;
    }>;
  }>;
};

export class PayrollService {
  constructor(
    private readonly journalService: JournalService,
    private readonly projectsService: ProjectsService,
    private readonly bankingService: BankingService,
    private readonly usersService: UsersService,
  ) {}

  async listEmployees(actor: AuthenticatedUser) {
    this.assertFinance(actor);
    const users = await this.usersService.findAll(500);
    return users
      .filter((row) => row.isActive)
      .map((row) => ({
        id: row.id,
        name: `${row.firstName} ${row.lastName}`,
        email: row.email,
        role: row.role,
      }));
  }

  async listSalaryStructures(
    actor: AuthenticatedUser,
  ): Promise<PublicSalaryStructure[]> {
    this.assertFinance(actor);
    const rows = await SalaryStructureModel.find({ isActive: true })
      .sort({ employeeName: 1 })
      .exec();
    return rows.map((row) => this.toPublicSalaryStructure(row));
  }

  async upsertSalaryStructure(
    dto: UpsertSalaryStructureDto,
    actor: AuthenticatedUser,
  ): Promise<PublicSalaryStructure> {
    this.assertFinance(actor);
    const employee = await this.usersService.findByIdOrFail(dto.employeeId);
    const basicMinor = toMinorUnits(dto.basic);
    const allowances = (dto.allowances ?? []).map((row) => ({
      name: row.name.trim(),
      amountMinor: toMinorUnits(row.amount),
    }));
    const deductions = (dto.deductions ?? []).map((row) => ({
      name: row.name.trim(),
      amountMinor: toMinorUnits(row.amount),
    }));

    const employeeName = `${employee.firstName} ${employee.lastName}`;
    const row = await SalaryStructureModel.findOneAndUpdate(
      { employeeId: employee._id },
      {
        employeeId: employee._id,
        employeeName,
        basicMinor,
        allowances,
        deductions,
        isActive: true,
      },
      { upsert: true, new: true },
    ).exec();

    return this.toPublicSalaryStructure(row!);
  }

  async listTimeLogs(
    periodYear: number,
    periodMonth: number,
    actor: AuthenticatedUser,
  ): Promise<PublicTimeLog[]> {
    this.assertFinance(actor);
    const rows = await TimeLogModel.find({ periodYear, periodMonth })
      .sort({ employeeName: 1, projectCode: 1 })
      .exec();
    return rows.map((row) => this.toPublicTimeLog(row));
  }

  async createTimeLog(
    dto: CreateTimeLogDto,
    actor: AuthenticatedUser,
  ): Promise<PublicTimeLog> {
    this.assertFinance(actor);
    const employee = await this.usersService.findByIdOrFail(dto.employeeId);
    const project = await this.projectsService.getById(dto.projectId);
    const quantityMilli = toMilliQty(dto.quantity);

    const created = await TimeLogModel.create({
      employeeId: employee._id,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      projectId: new Types.ObjectId(project.id),
      projectCode: project.code,
      projectName: project.name,
      periodYear: dto.periodYear,
      periodMonth: dto.periodMonth,
      unit: dto.unit,
      quantityMilli,
      notes: dto.notes?.trim(),
      createdBy: new Types.ObjectId(actor.userId),
    });
    return this.toPublicTimeLog(created);
  }

  async listRuns(actor: AuthenticatedUser): Promise<PublicPayrollRun[]> {
    this.assertFinance(actor);
    const rows = await PayrollRunModel.find()
      .sort({ periodYear: -1, periodMonth: -1 })
      .exec();
    return rows.map((row) => this.toPublicPayrollRun(row));
  }

  async getRun(id: string, actor: AuthenticatedUser): Promise<PublicPayrollRun> {
    this.assertFinance(actor);
    return this.toPublicPayrollRun(await this.findRunOrFail(id));
  }

  async generateRun(
    dto: GeneratePayrollDto,
    actor: AuthenticatedUser,
  ): Promise<PublicPayrollRun> {
    this.assertFinance(actor);
    const existing = await PayrollRunModel.findOne({
      periodYear: dto.periodYear,
      periodMonth: dto.periodMonth,
    }).exec();
    if (existing) {
      throw badRequest('Payroll for this period already exists');
    }

    const structures = await SalaryStructureModel.find({ isActive: true }).exec();
    if (structures.length === 0) {
      throw badRequest('No active salary structures found');
    }

    const lines = [];
    for (const structure of structures) {
      lines.push(await this.buildPayrollLine(structure, dto.periodYear, dto.periodMonth));
    }

    const totalGrossMinor = lines.reduce((sum, row) => sum + row.grossMinor, 0);
    const totalStructuralDeductionMinor = lines.reduce(
      (sum, row) => sum + row.structuralDeductionMinor,
      0,
    );
    const totalAdvanceDeductionMinor = lines.reduce(
      (sum, row) => sum + row.totalAdvanceDeductionMinor,
      0,
    );
    const totalNetPayMinor = lines.reduce((sum, row) => sum + row.netPayMinor, 0);

    const created = await PayrollRunModel.create({
      sheetNumber: await this.nextNumber('payroll', 'PAY'),
      status: PayrollRunStatus.DRAFT,
      periodYear: dto.periodYear,
      periodMonth: dto.periodMonth,
      lines,
      totalGrossMinor,
      totalStructuralDeductionMinor,
      totalAdvanceDeductionMinor,
      totalNetPayMinor,
      createdBy: new Types.ObjectId(actor.userId),
    });
    return this.toPublicPayrollRun(created);
  }

  async disburseRun(
    id: string,
    dto: DisbursePayrollDto,
    actor: AuthenticatedUser,
  ): Promise<PublicPayrollRun> {
    this.assertFinance(actor);
    const run = await this.findRunOrFail(id);
    if (run.status !== PayrollRunStatus.DRAFT) {
      throw badRequest('Only draft payroll runs can be disbursed');
    }
    const treasury = await this.bankingService.requireActive(dto.treasuryId);
    const date = this.parseDate(dto.date);

    const journalLines = run.lines.flatMap((line) =>
      buildPayrollJournalLines({
        allocations: line.allocations.map((row) => ({
          projectId: row.projectId.toString(),
          projectCode: row.projectCode,
          projectName: row.projectName,
          quantityMilli: row.quantityMilli,
          amountMinor: row.amountMinor,
        })),
        advanceDeductions: line.advanceDeductions.map((row) => ({
          advanceId: row.advanceId.toString(),
          advanceNumber: row.advanceNumber,
          projectId: row.projectId.toString(),
          amountMinor: row.amountMinor,
        })),
        structuralDeductionMinor: line.structuralDeductionMinor,
        netPayMinor: line.netPayMinor,
        treasuryAccountCode: treasury.glAccountCode,
        employeeName: line.employeeName,
      }),
    );

    const journal = await this.journalService.post(
      {
        date: date.toISOString(),
        memo: `Payroll ${run.sheetNumber} · ${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}`,
        reference: run.sheetNumber,
        lines: journalLines,
      },
      actor.userId,
      'system',
    );

    for (const line of run.lines) {
      for (const deduction of line.advanceDeductions) {
        const advance = await AdvanceModel.findById(deduction.advanceId).exec();
        if (!advance) {
          continue;
        }
        const deducted = (advance.payrollDeductedMinor ?? 0) + deduction.amountMinor;
        advance.payrollDeductedMinor = deducted;
        const outstanding =
          (advance.disbursedMinor ?? 0) - deducted;
        if (outstanding <= 0) {
          advance.status = AdvanceStatus.SETTLED;
          advance.spentMinor = advance.disbursedMinor;
          advance.settledAt = date;
          advance.settledBy = new Types.ObjectId(actor.userId);
        }
        await advance.save();
      }
    }

    run.status = PayrollRunStatus.DISBURSED;
    run.treasuryId = new Types.ObjectId(treasury.id);
    run.treasuryAccountCode = treasury.glAccountCode;
    run.journalId = new Types.ObjectId(journal.id);
    run.journalNumber = journal.entryNumber;
    run.disbursedAt = date;
    run.disbursedBy = new Types.ObjectId(actor.userId);
    await run.save();

    return this.toPublicPayrollRun(run);
  }

  private async buildPayrollLine(
    structure: SalaryStructureDocument,
    periodYear: number,
    periodMonth: number,
  ) {
    const allowancesMinor = structure.allowances.reduce(
      (sum, row) => sum + row.amountMinor,
      0,
    );
    const structuralDeductionMinor = structure.deductions.reduce(
      (sum, row) => sum + row.amountMinor,
      0,
    );
    const grossMinor = structure.basicMinor + allowancesMinor;

    const logs = await TimeLogModel.find({
      employeeId: structure.employeeId,
      periodYear,
      periodMonth,
    }).exec();
    const allocations = allocateLaborByTime({
      grossMinor,
      logs: logs.map((row) => ({
        projectId: row.projectId.toString(),
        projectCode: row.projectCode,
        projectName: row.projectName,
        quantityMilli: row.quantityMilli,
      })),
    });

    const advances = await AdvanceModel.find({
      employeeId: structure.employeeId,
      status: AdvanceStatus.DISBURSED,
    })
      .sort({ disbursedAt: 1 })
      .exec();

    const advanceProposal = proposeAdvanceDeductions({
      grossMinor,
      structuralDeductionMinor,
      advances: advances
        .map((row) => ({
          advanceId: row._id.toString(),
          advanceNumber: row.advanceNumber,
          projectId: row.projectId.toString(),
          outstandingMinor:
            (row.disbursedMinor ?? 0) - (row.payrollDeductedMinor ?? 0),
        }))
        .filter((row) => row.outstandingMinor > 0),
    });

    return {
      employeeId: structure.employeeId,
      employeeName: structure.employeeName,
      basicMinor: structure.basicMinor,
      allowancesMinor,
      structuralDeductionMinor,
      grossMinor,
      advanceDeductions: advanceProposal.deductions.map((row) => ({
        advanceId: new Types.ObjectId(row.advanceId),
        advanceNumber: row.advanceNumber,
        projectId: new Types.ObjectId(row.projectId),
        amountMinor: row.amountMinor,
      })),
      totalAdvanceDeductionMinor: advanceProposal.totalAdvanceDeductionMinor,
      netPayMinor: advanceProposal.netPayMinor,
      allocations: allocations.map((row) => ({
        projectId: new Types.ObjectId(row.projectId),
        projectCode: row.projectCode,
        projectName: row.projectName,
        quantityMilli: row.quantityMilli,
        amountMinor: row.amountMinor,
      })),
    };
  }

  private toPublicSalaryStructure(
    row: SalaryStructureDocument,
  ): PublicSalaryStructure {
    const allowancesMinor = row.allowances.reduce(
      (sum, item) => sum + item.amountMinor,
      0,
    );
    const structuralDeductionMinor = row.deductions.reduce(
      (sum, item) => sum + item.amountMinor,
      0,
    );
    return {
      id: row._id.toString(),
      employeeId: row.employeeId.toString(),
      employeeName: row.employeeName,
      basic: fromMinorUnits(row.basicMinor),
      allowances: row.allowances.map((item) => ({
        name: item.name,
        amount: fromMinorUnits(item.amountMinor),
      })),
      deductions: row.deductions.map((item) => ({
        name: item.name,
        amount: fromMinorUnits(item.amountMinor),
      })),
      gross: fromMinorUnits(row.basicMinor + allowancesMinor),
      structuralDeductions: fromMinorUnits(structuralDeductionMinor),
      isActive: row.isActive,
    };
  }

  private toPublicTimeLog(row: TimeLogDocument): PublicTimeLog {
    return {
      id: row._id.toString(),
      employeeId: row.employeeId.toString(),
      employeeName: row.employeeName,
      projectId: row.projectId.toString(),
      projectCode: row.projectCode,
      projectName: row.projectName,
      periodYear: row.periodYear,
      periodMonth: row.periodMonth,
      unit: row.unit,
      quantity: fromMilliQty(row.quantityMilli),
      notes: row.notes ?? null,
    };
  }

  private toPublicPayrollRun(row: PayrollRunDocument): PublicPayrollRun {
    return {
      id: row._id.toString(),
      sheetNumber: row.sheetNumber,
      status: row.status,
      periodYear: row.periodYear,
      periodMonth: row.periodMonth,
      totalGross: fromMinorUnits(row.totalGrossMinor),
      totalStructuralDeductions: fromMinorUnits(row.totalStructuralDeductionMinor),
      totalAdvanceDeductions: fromMinorUnits(row.totalAdvanceDeductionMinor),
      totalNetPay: fromMinorUnits(row.totalNetPayMinor),
      journalNumber: row.journalNumber ?? null,
      disbursedAt: row.disbursedAt ? row.disbursedAt.toISOString() : null,
      lines: row.lines.map((line) => ({
        employeeId: line.employeeId.toString(),
        employeeName: line.employeeName,
        basic: fromMinorUnits(line.basicMinor),
        allowances: fromMinorUnits(line.allowancesMinor),
        structuralDeductions: fromMinorUnits(line.structuralDeductionMinor),
        gross: fromMinorUnits(line.grossMinor),
        advanceDeductions: line.advanceDeductions.map((item) => ({
          advanceId: item.advanceId.toString(),
          advanceNumber: item.advanceNumber,
          amount: fromMinorUnits(item.amountMinor),
        })),
        totalAdvanceDeductions: fromMinorUnits(line.totalAdvanceDeductionMinor),
        netPay: fromMinorUnits(line.netPayMinor),
        allocations: line.allocations.map((item) => ({
          projectId: item.projectId.toString(),
          projectCode: item.projectCode,
          projectName: item.projectName,
          quantity: fromMilliQty(item.quantityMilli),
          amount: fromMinorUnits(item.amountMinor),
        })),
      })),
    };
  }

  private assertFinance(actor: AuthenticatedUser): void {
    if (!FINANCE_ROLES.has(actor.role)) {
      throw forbidden('Finance role required');
    }
  }

  private parseDate(value: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw badRequest('Invalid date');
    }
    return date;
  }

  private async nextNumber(key: string, prefix: string): Promise<string> {
    const year = new Date().getUTCFullYear();
    const counter = await CounterModel.findOneAndUpdate(
      { key: `${key}:${year}` },
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    );
    const seq = counter?.seq ?? 1;
    return `${prefix}-${year}-${String(seq).padStart(5, '0')}`;
  }

  private async findRunOrFail(id: string): Promise<PayrollRunDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw notFound('Payroll run not found');
    }
    const row = await PayrollRunModel.findById(id).exec();
    if (!row) {
      throw notFound('Payroll run not found');
    }
    return row;
  }
}
