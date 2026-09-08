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
  buildAccrualJournalLines,
  buildDisbursementJournalLines,
  proposeAdvanceDeductions,
} from './allocation';
import {
  buildPayrollSlipsPdf,
  buildSalarySlipPdf,
} from './salary-slip-pdf';
import type {
  CreateTimeLogDto,
  DisbursePayrollDto,
  GeneratePayrollDto,
  PreviewSalaryBreakdownDto,
  UpdatePayrollSettingsDto,
  UpsertSalaryStructureDto,
} from './dto/payroll.dto';
import {
  PayrollSettingsModel,
  PAYROLL_SETTINGS_KEY,
} from './payroll-settings.model';
import {
  PayrollRunModel,
  type PayrollRunDocument,
} from './payroll-run.model';
import {
  SalaryStructureModel,
  type SalaryStructureDocument,
} from './salary-structure.model';
import { TimeLogModel, type TimeLogDocument } from './time-log.model';
import {
  breakdownToLegacyComponents,
  calculateSalaryBreakdown,
  DEFAULT_PAYROLL_RULE_CONFIG,
  type PayrollRuleConfig,
  type SalaryBreakdownResult,
} from './salary-breakdown';
import {
  ConveyanceType,
  MedicalAllowanceType,
} from '../../common/enums/payroll.enum';

const FINANCE_ROLES = new Set([Role.ADMIN, Role.ACCOUNTANT]);

export type PublicPayrollSettings = PayrollRuleConfig;

export type PublicSalaryStructure = {
  id: string;
  employeeId: string;
  employeeName: string;
  basic: number;
  allowances: Array<{ name: string; amount: number }>;
  deductions: Array<{ name: string; amount: number }>;
  gross: number;
  grossSalary: number;
  customBreakdownApplied: boolean;
  breakdown: {
    basicSalary: number;
    houseRent: number;
    medicalAllowance: number;
    conveyanceAllowance: number;
    otherAllowances: number;
  };
  deductionsDetail: {
    providentFund: number;
    taxDeduction: number;
    advanceAdjustment: number;
  };
  netPayable: number;
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
  accrualJournalNumber: string | null;
  postedAt: string | null;
  journalNumber: string | null;
  disbursedAt: string | null;
  treasuryAccountCode: string | null;
  lines: Array<{
    employeeId: string;
    employeeName: string;
    basic: number;
    allowances: number;
    structuralDeductions: number;
    providentFund: number;
    taxDeduction: number;
    structureAdvance: number;
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

  async getPayrollSettings(
    actor: AuthenticatedUser,
  ): Promise<PublicPayrollSettings> {
    this.assertFinance(actor);
    return this.loadPayrollSettings();
  }

  async updatePayrollSettings(
    dto: UpdatePayrollSettingsDto,
    actor: AuthenticatedUser,
  ): Promise<PublicPayrollSettings> {
    if (actor.role !== Role.ADMIN) {
      throw forbidden('Only admin can update payroll settings');
    }
    const row = await PayrollSettingsModel.findOneAndUpdate(
      { key: PAYROLL_SETTINGS_KEY },
      {
        key: PAYROLL_SETTINGS_KEY,
        basicPercentOfGross: dto.basicPercentOfGross,
        houseRentPercentOfBasic: dto.houseRentPercentOfBasic,
        medicalType: dto.medicalType,
        medicalValue: dto.medicalValue,
        conveyanceType: dto.conveyanceType,
        conveyanceValue: dto.conveyanceValue,
      },
      { upsert: true, new: true },
    ).exec();
    return this.toPublicPayrollSettings(row!);
  }

  async previewSalaryBreakdown(
    dto: PreviewSalaryBreakdownDto,
    actor: AuthenticatedUser,
  ): Promise<SalaryBreakdownResult> {
    this.assertFinance(actor);
    const config = await this.loadPayrollSettings();
    return this.resolveBreakdown(dto.grossSalary, config, dto);
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
    const employeeName = `${employee.firstName} ${employee.lastName}`;
    const config = await this.loadPayrollSettings();

    let breakdown: SalaryBreakdownResult;
    if (dto.grossSalary != null && dto.grossSalary > 0) {
      breakdown = this.resolveBreakdown(dto.grossSalary, config, dto);
    } else if (dto.basic != null && dto.basic > 0) {
      // Legacy path: basic + free-form allowances/deductions
      const allowances = (dto.allowances ?? []).map((row) => ({
        name: row.name.trim(),
        amount: row.amount,
      }));
      const deductions = (dto.deductions ?? []).map((row) => ({
        name: row.name.trim(),
        amount: row.amount,
      }));
      const allowanceTotal = allowances.reduce((s, r) => s + r.amount, 0);
      const deductionTotal = deductions.reduce((s, r) => s + r.amount, 0);
      const gross = dto.basic + allowanceTotal;
      const house = allowances.find((a) => /house/i.test(a.name))?.amount ?? 0;
      const medical =
        allowances.find((a) => /medical/i.test(a.name))?.amount ?? 0;
      const conveyance =
        allowances.find((a) => /conveyance|transport/i.test(a.name))?.amount ??
        0;
      const other = Math.max(
        0,
        allowanceTotal - house - medical - conveyance,
      );
      breakdown = {
        grossSalary: gross,
        basicSalary: dto.basic,
        houseRent: house,
        medicalAllowance: medical,
        conveyanceAllowance: conveyance,
        otherAllowances: other,
        providentFund:
          deductions.find((d) => /provident|pf/i.test(d.name))?.amount ?? 0,
        taxDeduction:
          deductions.find((d) => /tax|ait/i.test(d.name))?.amount ?? 0,
        advanceAdjustment:
          deductions.find((d) => /advance/i.test(d.name))?.amount ?? 0,
        netPayable: gross - deductionTotal,
      };
    } else {
      throw badRequest('grossSalary (or legacy basic) is required');
    }

    const useCustom = Boolean(
      dto.customBreakdownApplied ?? dto.customOverride,
    );
    const legacy = breakdownToLegacyComponents(breakdown);
    const row = await SalaryStructureModel.findOneAndUpdate(
      { employeeId: employee._id },
      {
        employeeId: employee._id,
        employeeName,
        grossSalaryMinor: toMinorUnits(breakdown.grossSalary),
        customBreakdownApplied: useCustom,
        breakdown: {
          basicSalaryMinor: toMinorUnits(breakdown.basicSalary),
          houseRentMinor: toMinorUnits(breakdown.houseRent),
          medicalAllowanceMinor: toMinorUnits(breakdown.medicalAllowance),
          conveyanceAllowanceMinor: toMinorUnits(
            breakdown.conveyanceAllowance,
          ),
          otherAllowancesMinor: toMinorUnits(breakdown.otherAllowances),
        },
        deductionDetail: {
          providentFundMinor: toMinorUnits(breakdown.providentFund),
          taxDeductionMinor: toMinorUnits(breakdown.taxDeduction),
          advanceAdjustmentMinor: toMinorUnits(breakdown.advanceAdjustment),
        },
        netPayableMinor: toMinorUnits(breakdown.netPayable),
        basicMinor: toMinorUnits(legacy.basic),
        allowances: legacy.allowances.map((item) => ({
          name: item.name,
          amountMinor: toMinorUnits(item.amount),
        })),
        deductions: legacy.deductions.map((item) => ({
          name: item.name,
          amountMinor: toMinorUnits(item.amount),
        })),
        isActive: true,
      },
      { upsert: true, new: true },
    ).exec();

    return this.toPublicSalaryStructure(row!);
  }

  private resolveBreakdown(
    grossSalary: number,
    config: PayrollRuleConfig,
    dto: {
      customBreakdownApplied?: boolean;
      customOverride?: boolean;
      breakdown?: {
        basicSalary?: number;
        houseRent?: number;
        medicalAllowance?: number;
        conveyanceAllowance?: number;
        otherAllowances?: number;
      };
      deductionsDetail?: {
        providentFund?: number;
        taxDeduction?: number;
        advanceAdjustment?: number;
      };
    },
  ): SalaryBreakdownResult {
    const useCustom = Boolean(
      dto.customBreakdownApplied ?? dto.customOverride,
    );
    return calculateSalaryBreakdown(
      grossSalary,
      config,
      useCustom
        ? {
            basicSalary: dto.breakdown?.basicSalary,
            houseRent: dto.breakdown?.houseRent,
            medicalAllowance: dto.breakdown?.medicalAllowance,
            conveyanceAllowance: dto.breakdown?.conveyanceAllowance,
            otherAllowances: dto.breakdown?.otherAllowances,
            providentFund: dto.deductionsDetail?.providentFund,
            taxDeduction: dto.deductionsDetail?.taxDeduction,
            advanceAdjustment: dto.deductionsDetail?.advanceAdjustment,
          }
        : {
            providentFund: dto.deductionsDetail?.providentFund,
            taxDeduction: dto.deductionsDetail?.taxDeduction,
            advanceAdjustment: dto.deductionsDetail?.advanceAdjustment,
          },
    );
  }

  private async loadPayrollSettings(): Promise<PayrollRuleConfig> {
    const row = await PayrollSettingsModel.findOne({
      key: PAYROLL_SETTINGS_KEY,
    }).exec();
    if (!row) {
      return { ...DEFAULT_PAYROLL_RULE_CONFIG };
    }
    return this.toPublicPayrollSettings(row);
  }

  private toPublicPayrollSettings(row: {
    basicPercentOfGross: number;
    houseRentPercentOfBasic: number;
    medicalType: MedicalAllowanceType;
    medicalValue: number;
    conveyanceType: ConveyanceType;
    conveyanceValue: number;
  }): PublicPayrollSettings {
    return {
      basicPercentOfGross: row.basicPercentOfGross,
      houseRentPercentOfBasic: row.houseRentPercentOfBasic,
      medicalType: row.medicalType,
      medicalValue: row.medicalValue,
      conveyanceType: row.conveyanceType,
      conveyanceValue: row.conveyanceValue,
    };
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

  /** Step 1 — Post accrual journal (draft → posted). */
  async postRun(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<PublicPayrollRun> {
    this.assertFinance(actor);
    const run = await this.findRunOrFail(id);
    if (run.status !== PayrollRunStatus.DRAFT) {
      throw badRequest('Only draft payroll runs can be posted');
    }

    const journalLines = run.lines.flatMap((line) =>
      buildAccrualJournalLines({
        employeeId: line.employeeId.toString(),
        employeeName: line.employeeName,
        allocations: line.allocations.map((row) => ({
          projectId: row.projectId.toString(),
          projectCode: row.projectCode,
          projectName: row.projectName,
          quantityMilli: row.quantityMilli,
          amountMinor: row.amountMinor,
        })),
        grossMinor: line.grossMinor,
        advanceDeductions: line.advanceDeductions.map((row) => ({
          advanceId: row.advanceId.toString(),
          advanceNumber: row.advanceNumber,
          projectId: row.projectId.toString(),
          amountMinor: row.amountMinor,
        })),
        structureAdvanceMinor: line.structureAdvanceMinor ?? 0,
        providentFundMinor: line.providentFundMinor ?? 0,
        taxDeductionMinor: line.taxDeductionMinor ?? 0,
        netPayMinor: line.netPayMinor,
      }),
    );

    const journal = await this.journalService.post(
      {
        date: new Date().toISOString(),
        memo: `Payroll accrual ${run.sheetNumber} · ${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}`,
        reference: run.sheetNumber,
        lines: journalLines,
      },
      actor.userId,
      'system',
    );

    const postedAt = new Date();
    for (const line of run.lines) {
      for (const deduction of line.advanceDeductions) {
        const advance = await AdvanceModel.findById(deduction.advanceId).exec();
        if (!advance) continue;
        const deducted =
          (advance.payrollDeductedMinor ?? 0) + deduction.amountMinor;
        advance.payrollDeductedMinor = deducted;
        const outstanding = (advance.disbursedMinor ?? 0) - deducted;
        if (outstanding <= 0) {
          advance.status = AdvanceStatus.SETTLED;
          advance.spentMinor = advance.disbursedMinor;
          advance.settledAt = postedAt;
          advance.settledBy = new Types.ObjectId(actor.userId);
        }
        await advance.save();
      }
    }

    run.status = PayrollRunStatus.POSTED;
    run.accrualJournalId = new Types.ObjectId(journal.id);
    run.accrualJournalNumber = journal.entryNumber;
    run.postedAt = postedAt;
    run.postedBy = new Types.ObjectId(actor.userId);
    await run.save();

    return this.toPublicPayrollRun(run);
  }

  /** Step 2 — Pay net salaries from treasury (posted → disbursed). */
  async disburseRun(
    id: string,
    dto: DisbursePayrollDto,
    actor: AuthenticatedUser,
  ): Promise<PublicPayrollRun> {
    this.assertFinance(actor);
    const run = await this.findRunOrFail(id);
    if (run.status !== PayrollRunStatus.POSTED) {
      throw badRequest(
        'Post monthly payroll (accrual) before executing disbursement',
      );
    }
    const treasury = await this.bankingService.requireActive(dto.treasuryId);
    const date = this.parseDate(dto.date);

    const journalLines = run.lines.flatMap((line) =>
      buildDisbursementJournalLines({
        employeeId: line.employeeId.toString(),
        employeeName: line.employeeName,
        netPayMinor: line.netPayMinor,
        treasuryAccountCode: treasury.glAccountCode,
      }),
    );

    if (journalLines.length === 0) {
      throw badRequest('Nothing to disburse — net pay is zero for all lines');
    }

    const journal = await this.journalService.post(
      {
        date: date.toISOString(),
        memo: `Payroll disbursement ${run.sheetNumber} · ${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}`,
        reference: run.sheetNumber,
        lines: journalLines,
      },
      actor.userId,
      'system',
    );

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

  async buildSalarySlipPdfBuffer(
    runId: string,
    employeeId: string | undefined,
    actor: AuthenticatedUser,
  ): Promise<{ buffer: Buffer; filename: string }> {
    this.assertFinance(actor);
    const run = await this.findRunOrFail(runId);
    if (run.status !== PayrollRunStatus.DISBURSED) {
      throw badRequest('Salary slips are available after disbursement');
    }
    if (employeeId) {
      return buildSalarySlipPdf(run, employeeId);
    }
    return buildPayrollSlipsPdf(run);
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
    const providentFundMinor =
      structure.deductionDetail?.providentFundMinor ??
      structure.deductions
        .filter((d) => /provident|pf/i.test(d.name))
        .reduce((s, d) => s + d.amountMinor, 0);
    const taxDeductionMinor =
      structure.deductionDetail?.taxDeductionMinor ??
      structure.deductions
        .filter((d) => /tax|ait/i.test(d.name))
        .reduce((s, d) => s + d.amountMinor, 0);
    const structureAdvanceMinor =
      structure.deductionDetail?.advanceAdjustmentMinor ??
      structure.deductions
        .filter((d) => /advance/i.test(d.name))
        .reduce((s, d) => s + d.amountMinor, 0);
    const structuralDeductionMinor =
      providentFundMinor + taxDeductionMinor + structureAdvanceMinor;
    const grossMinor =
      structure.grossSalaryMinor ?? structure.basicMinor + allowancesMinor;

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
      providentFundMinor,
      taxDeductionMinor,
      structureAdvanceMinor,
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
    const grossFromLegacy = fromMinorUnits(row.basicMinor + allowancesMinor);
    const grossSalary = row.grossSalaryMinor != null
      ? fromMinorUnits(row.grossSalaryMinor)
      : grossFromLegacy;

    const breakdown = row.breakdown
      ? {
          basicSalary: fromMinorUnits(row.breakdown.basicSalaryMinor),
          houseRent: fromMinorUnits(row.breakdown.houseRentMinor),
          medicalAllowance: fromMinorUnits(
            row.breakdown.medicalAllowanceMinor,
          ),
          conveyanceAllowance: fromMinorUnits(
            row.breakdown.conveyanceAllowanceMinor,
          ),
          otherAllowances: fromMinorUnits(row.breakdown.otherAllowancesMinor),
        }
      : {
          basicSalary: fromMinorUnits(row.basicMinor),
          houseRent: 0,
          medicalAllowance: 0,
          conveyanceAllowance: 0,
          otherAllowances: fromMinorUnits(allowancesMinor),
        };

    const deductionsDetail = row.deductionDetail
      ? {
          providentFund: fromMinorUnits(
            row.deductionDetail.providentFundMinor,
          ),
          taxDeduction: fromMinorUnits(row.deductionDetail.taxDeductionMinor),
          advanceAdjustment: fromMinorUnits(
            row.deductionDetail.advanceAdjustmentMinor,
          ),
        }
      : {
          providentFund: 0,
          taxDeduction: 0,
          advanceAdjustment: 0,
        };

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
      gross: grossSalary,
      grossSalary,
      customBreakdownApplied: Boolean(row.customBreakdownApplied),
      breakdown,
      deductionsDetail,
      netPayable:
        row.netPayableMinor != null
          ? fromMinorUnits(row.netPayableMinor)
          : fromMinorUnits(
              row.basicMinor + allowancesMinor - structuralDeductionMinor,
            ),
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
      accrualJournalNumber: row.accrualJournalNumber ?? null,
      postedAt: row.postedAt ? row.postedAt.toISOString() : null,
      journalNumber: row.journalNumber ?? null,
      disbursedAt: row.disbursedAt ? row.disbursedAt.toISOString() : null,
      treasuryAccountCode: row.treasuryAccountCode ?? null,
      lines: row.lines.map((line) => ({
        employeeId: line.employeeId.toString(),
        employeeName: line.employeeName,
        basic: fromMinorUnits(line.basicMinor),
        allowances: fromMinorUnits(line.allowancesMinor),
        structuralDeductions: fromMinorUnits(line.structuralDeductionMinor),
        providentFund: fromMinorUnits(line.providentFundMinor ?? 0),
        taxDeduction: fromMinorUnits(line.taxDeductionMinor ?? 0),
        structureAdvance: fromMinorUnits(line.structureAdvanceMinor ?? 0),
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
