import { Types } from 'mongoose';
import { Role } from '../../common/enums/role.enum';
import { InvoiceStatus } from '../../common/enums/ar-ap.enum';
import { forbidden } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { fromMinorUnits } from '../../common/utils/money';
import { AccountType } from '../../common/enums/account-type.enum';
import { ClientInvoiceModel } from '../ar-ap/client-invoice.model';
import { SupplierBillModel } from '../ar-ap/supplier-bill.model';
import { BillPaymentType, BillStatus } from '../../common/enums/ar-ap.enum';
import { SupplierPaymentModel } from '../ar-ap/supplier-payment.model';
import { SupplierPaymentStatus } from '../../common/enums/ar-ap.enum';
import { PayrollRunModel } from '../payroll/payroll-run.model';
import { PayrollRunStatus } from '../../common/enums/payroll.enum';
import { ProjectModel } from '../projects/project.model';
import { ProjectStatus } from '../../common/enums/project-status.enum';
import type { LedgerService } from '../accounting/ledger.service';
import type { BankingService } from '../banking/banking.service';
import { LedgerLineModel } from '../accounting/ledger.model';

export type CashFlowWeek = {
  weekStart: string;
  weekLabel: string;
  inflow: number;
  outflow: number;
  net: number;
};

export type CashFlowForecast = {
  asOf: string;
  openingCash: number;
  projectedClosingCash: number;
  totalInflow: number;
  totalOutflow: number;
  weeks: CashFlowWeek[];
  sources: {
    openReceivables: number;
    openPayables: number;
    scheduledSupplierPayments: number;
    draftPayroll: number;
  };
};

export type BurnRateRow = {
  projectId: string;
  projectCode: string;
  projectName: string;
  status: string;
  totalBudget: number;
  totalCost: number;
  remainingBudget: number;
  dailyBurn: number;
  weeklyBurn: number;
  daysElapsed: number;
  estimatedDaysToComplete: number | null;
  projectedEndDate: string | null;
  isOverBudget: boolean;
};

export type FinancialStatements = {
  asOf: string;
  profitAndLoss: {
    revenue: number;
    expenses: number;
    netIncome: number;
    lines: Array<{ code: string; name: string; type: string; amount: number }>;
  };
  balanceSheet: {
    assets: number;
    liabilities: number;
    equity: number;
    lines: Array<{ code: string; name: string; type: string; amount: number }>;
  };
};

export class AnalyticsService {
  constructor(
    private readonly ledgerService: LedgerService,
    private readonly bankingService: BankingService,
  ) {}

  async cashFlowForecast(actor: AuthenticatedUser): Promise<CashFlowForecast> {
    this.assertFinance(actor);
    const asOf = new Date();
    const treasury = await this.bankingService.list();
    const openingCash = treasury.reduce((sum, row) => sum + row.bookBalance, 0);

    const [invoices, openBills, scheduledPayments, draftPayroll] =
      await Promise.all([
        ClientInvoiceModel.find({
          status: {
            $in: [
              InvoiceStatus.ISSUED,
              InvoiceStatus.PARTIAL,
              InvoiceStatus.OVERDUE,
            ],
          },
        }).exec(),
        SupplierBillModel.find({
          paymentType: BillPaymentType.CREDIT,
          status: BillStatus.OPEN,
        }).exec(),
        SupplierPaymentModel.find({
          status: SupplierPaymentStatus.SCHEDULED,
        }).exec(),
        PayrollRunModel.find({ status: PayrollRunStatus.DRAFT }).exec(),
      ]);

    const weeks = this.buildEmptyWeeks(asOf, 8);
    let openReceivables = 0;
    for (const invoice of invoices) {
      const open = invoice.amountMinor - invoice.paidMinor;
      if (open <= 0) continue;
      openReceivables += open;
      const week = this.findWeek(weeks, invoice.dueDate, asOf);
      week.inflowMinor += open;
    }

    let openPayables = 0;
    for (const bill of openBills) {
      openPayables += bill.amountMinor;
      const week = this.findWeek(weeks, bill.dueDate, asOf);
      week.outflowMinor += bill.amountMinor;
    }

    let scheduledSupplierPayments = 0;
    for (const payment of scheduledPayments) {
      scheduledSupplierPayments += payment.amountMinor;
      const when = payment.scheduledDate ?? asOf;
      const week = this.findWeek(weeks, when, asOf);
      week.outflowMinor += payment.amountMinor;
    }

    let draftPayrollMinor = 0;
    for (const run of draftPayroll) {
      draftPayrollMinor += run.totalNetPayMinor;
      const payDate = new Date(
        Date.UTC(run.periodYear, run.periodMonth, 0),
      );
      const week = this.findWeek(weeks, payDate, asOf);
      week.outflowMinor += run.totalNetPayMinor;
    }

    const mapped = weeks.map((week) => ({
      weekStart: week.start.toISOString(),
      weekLabel: week.label,
      inflow: fromMinorUnits(week.inflowMinor),
      outflow: fromMinorUnits(week.outflowMinor),
      net: fromMinorUnits(week.inflowMinor - week.outflowMinor),
    }));

    const totalInflow = mapped.reduce((sum, row) => sum + row.inflow, 0);
    const totalOutflow = mapped.reduce((sum, row) => sum + row.outflow, 0);

    return {
      asOf: asOf.toISOString(),
      openingCash,
      projectedClosingCash: Number(
        (openingCash + totalInflow - totalOutflow).toFixed(2),
      ),
      totalInflow: Number(totalInflow.toFixed(2)),
      totalOutflow: Number(totalOutflow.toFixed(2)),
      weeks: mapped,
      sources: {
        openReceivables: fromMinorUnits(openReceivables),
        openPayables: fromMinorUnits(openPayables),
        scheduledSupplierPayments: fromMinorUnits(scheduledSupplierPayments),
        draftPayroll: fromMinorUnits(draftPayrollMinor),
      },
    };
  }

  async burnRates(actor: AuthenticatedUser): Promise<BurnRateRow[]> {
    if (
      actor.role !== Role.ADMIN &&
      actor.role !== Role.ACCOUNTANT &&
      actor.role !== Role.PROJECT_MANAGER
    ) {
      throw forbidden('You do not have permission to view burn rates');
    }

    const filter =
      actor.role === Role.PROJECT_MANAGER
        ? { managerId: new Types.ObjectId(actor.userId) }
        : {
            status: {
              $in: [
                ProjectStatus.PLANNING,
                ProjectStatus.ACTIVE,
                ProjectStatus.ON_HOLD,
              ],
            },
          };

    const projects = await ProjectModel.find(filter)
      .sort({ code: 1 })
      .exec();

    const asOf = new Date();
    const rows: BurnRateRow[] = [];

    for (const project of projects) {
      const lines = await LedgerLineModel.find({
        projectId: project._id,
      }).exec();
      const expenseMinor = lines
        .filter((line) => line.accountType === AccountType.EXPENSE)
        .reduce((sum, line) => sum + line.debitMinor - line.creditMinor, 0);
      const totalCost = fromMinorUnits(Math.max(0, expenseMinor));
      const totalBudget = fromMinorUnits(project.totalBudgetMinor);
      const start = project.startDate;
      const daysElapsed = Math.max(
        1,
        Math.floor(
          (Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()) -
            Date.UTC(
              start.getUTCFullYear(),
              start.getUTCMonth(),
              start.getUTCDate(),
            )) /
            86_400_000,
        ) + 1,
      );
      const dailyBurn = totalCost / daysElapsed;
      const remainingBudget = totalBudget - totalCost;
      const estimatedDaysToComplete =
        dailyBurn > 0 && remainingBudget > 0
          ? Math.ceil(remainingBudget / dailyBurn)
          : remainingBudget <= 0
            ? 0
            : null;
      const projectedEndDate =
        estimatedDaysToComplete !== null
          ? new Date(
              asOf.getTime() + estimatedDaysToComplete * 86_400_000,
            ).toISOString()
          : null;

      rows.push({
        projectId: project._id.toString(),
        projectCode: project.code,
        projectName: project.name,
        status: project.status,
        totalBudget,
        totalCost: Number(totalCost.toFixed(2)),
        remainingBudget: Number(remainingBudget.toFixed(2)),
        dailyBurn: Number(dailyBurn.toFixed(2)),
        weeklyBurn: Number((dailyBurn * 7).toFixed(2)),
        daysElapsed,
        estimatedDaysToComplete,
        projectedEndDate,
        isOverBudget: totalCost > totalBudget,
      });
    }

    return rows;
  }

  async financialStatements(
    actor: AuthenticatedUser,
  ): Promise<FinancialStatements> {
    this.assertFinance(actor);
    const trial = await this.ledgerService.trialBalance();
    const pnlLines = trial.rows
      .filter(
        (row) =>
          row.type === AccountType.REVENUE || row.type === AccountType.EXPENSE,
      )
      .map((row) => ({
        code: row.accountCode,
        name: row.accountName,
        type: row.type,
        amount: row.balance,
      }));
    const revenue = pnlLines
      .filter((row) => row.type === AccountType.REVENUE)
      .reduce((sum, row) => sum + row.amount, 0);
    const expenses = pnlLines
      .filter((row) => row.type === AccountType.EXPENSE)
      .reduce((sum, row) => sum + row.amount, 0);

    const bsLines = trial.rows
      .filter(
        (row) =>
          row.type === AccountType.ASSET ||
          row.type === AccountType.LIABILITY ||
          row.type === AccountType.EQUITY,
      )
      .map((row) => ({
        code: row.accountCode,
        name: row.accountName,
        type: row.type,
        amount: row.balance,
      }));
    const assets = bsLines
      .filter((row) => row.type === AccountType.ASSET)
      .reduce((sum, row) => sum + row.amount, 0);
    const liabilities = bsLines
      .filter((row) => row.type === AccountType.LIABILITY)
      .reduce((sum, row) => sum + row.amount, 0);
    const equity = bsLines
      .filter((row) => row.type === AccountType.EQUITY)
      .reduce((sum, row) => sum + row.amount, 0);

    return {
      asOf: trial.asOf,
      profitAndLoss: {
        revenue: Number(revenue.toFixed(2)),
        expenses: Number(expenses.toFixed(2)),
        netIncome: Number((revenue - expenses).toFixed(2)),
        lines: pnlLines,
      },
      balanceSheet: {
        assets: Number(assets.toFixed(2)),
        liabilities: Number(liabilities.toFixed(2)),
        equity: Number((equity + (revenue - expenses)).toFixed(2)),
        lines: bsLines,
      },
    };
  }

  private assertFinance(actor: AuthenticatedUser): void {
    if (actor.role !== Role.ADMIN && actor.role !== Role.ACCOUNTANT) {
      throw forbidden('Finance role required');
    }
  }

  private buildEmptyWeeks(asOf: Date, count: number) {
    const start = new Date(
      Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()),
    );
    const day = start.getUTCDay();
    start.setUTCDate(start.getUTCDate() - day);
    const weeks = [];
    for (let i = 0; i < count; i++) {
      const weekStart = new Date(start);
      weekStart.setUTCDate(start.getUTCDate() + i * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
      weeks.push({
        start: weekStart,
        end: weekEnd,
        label: `${weekStart.toISOString().slice(5, 10)} → ${weekEnd.toISOString().slice(5, 10)}`,
        inflowMinor: 0,
        outflowMinor: 0,
      });
    }
    return weeks;
  }

  private findWeek(
    weeks: Array<{
      start: Date;
      end: Date;
      inflowMinor: number;
      outflowMinor: number;
    }>,
    date: Date,
    asOf: Date,
  ) {
    const target = date < asOf ? asOf : date;
    for (const week of weeks) {
      if (target >= week.start && target <= week.end) {
        return week;
      }
    }
    return weeks[weeks.length - 1]!;
  }
}
