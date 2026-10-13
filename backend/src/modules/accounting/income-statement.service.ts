import { Types } from 'mongoose';
import { AccountType } from '../../common/enums/account-type.enum';
import { badRequest } from '../../common/errors/app-error';
import { fromMinorUnits } from '../../common/utils/money';
import { rollupBalances } from './account-rollup';
import { AccountModel } from './account.model';
import { JournalType } from './journal.enums';
import { JournalEntryModel } from './journal-entry.model';
import { NO_PROJECT } from './journal.service';
import { LedgerLineModel } from './ledger.model';

export type IncomeStatementLine = {
  code: string;
  name: string;
  parentCode: string | null;
  amount: number;
  isHeader: boolean;
  isPostable: boolean;
  depth: number;
};

export type IncomeStatementSection = {
  id: string;
  title: string;
  total: number;
  lines: IncomeStatementLine[];
};

export type IncomeStatementReport = {
  fromDate: string | null;
  toDate: string;
  /** A project id, `none` (office, no project) or null (whole company). */
  projectId: string | null;
  revenue: IncomeStatementSection;
  directCosts: IncomeStatementSection;
  grossProfit: number;
  operatingExpenses: IncomeStatementSection;
  operatingProfit: number;
  otherIncome: IncomeStatementSection;
  otherExpenses: IncomeStatementSection;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
};

/** Chart heads the statement is laid out by (see chart_of_accounts.json). */
const OTHER_INCOME_ROOT = '4200';
const DIRECT_COST_ROOT = '5100';
const OPERATING_EXPENSE_ROOT = '5200';

type AccountRow = {
  code: string;
  name: string;
  type: AccountType;
  parentCode?: string;
  isPostable: boolean;
  isActive: boolean;
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function isUnder(code: string, root: string, byCode: Map<string, AccountRow>): boolean {
  let current: string | undefined = code;
  const seen = new Set<string>();
  while (current) {
    if (current === root) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    current = byCode.get(current)?.parentCode;
  }
  return false;
}

function depthOf(code: string, byCode: Map<string, AccountRow>): number {
  let depth = 0;
  let current = byCode.get(code)?.parentCode;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    depth += 1;
    current = byCode.get(current)?.parentCode;
  }
  return depth;
}

function buildSection(
  id: string,
  title: string,
  members: AccountRow[],
  byCode: Map<string, AccountRow>,
  amounts: Map<string, number>,
): IncomeStatementSection {
  // Top-level REVENUE / EXPENSES heads span several sections, so they are left out.
  const rows = members
    .filter((row) => Boolean(row.parentCode))
    .sort((a, b) => a.code.localeCompare(b.code));
  const rolled = rollupBalances(
    rows.map((row) => ({
      code: row.code,
      parentCode: row.parentCode,
      isPostable: row.isPostable,
    })),
    amounts,
  );
  const lines: IncomeStatementLine[] = [];
  for (const row of rows) {
    const amount = round2(rolled.get(row.code) ?? 0);
    if (!row.isActive && Math.abs(amount) < 0.005) continue;
    lines.push({
      code: row.code,
      name: row.name,
      parentCode: row.parentCode ?? null,
      amount,
      isHeader: !row.isPostable,
      isPostable: row.isPostable,
      depth: Math.max(0, depthOf(row.code, byCode) - 1),
    });
  }
  const total = round2(
    rows
      .filter((row) => row.isPostable)
      .reduce((sum, row) => sum + (amounts.get(row.code) ?? 0), 0),
  );
  return { id, title, total, lines };
}

export class IncomeStatementService {
  async generate(input: {
    fromDate?: Date;
    toDate?: Date;
    projectId?: string;
  }): Promise<IncomeStatementReport> {
    const end = input.toDate ? new Date(input.toDate) : new Date();
    if (Number.isNaN(end.getTime())) throw badRequest('Invalid toDate');
    end.setUTCHours(23, 59, 59, 999);
    const start = input.fromDate ? new Date(input.fromDate) : null;
    if (start && Number.isNaN(start.getTime())) throw badRequest('Invalid fromDate');
    if (start && start > end) throw badRequest('fromDate must be on or before toDate');

    const projectId = input.projectId?.trim() || null;
    if (projectId && projectId !== NO_PROJECT && !Types.ObjectId.isValid(projectId)) {
      throw badRequest('Invalid projectId');
    }

    // Closing entries zero the P&L into retained earnings; the statement reads around them.
    const closingIds = (
      await JournalEntryModel.find({ journalType: JournalType.YEAR_END_CLOSING })
        .select('_id')
        .lean()
        .exec()
    ).map((row) => row._id);

    const accounts = await AccountModel.find({
      type: { $in: [AccountType.REVENUE, AccountType.EXPENSE] },
    })
      .lean()
      .exec();

    const match: Record<string, unknown> = {
      accountCode: { $in: accounts.map((account) => account.code) },
      date: start ? { $gte: start, $lte: end } : { $lte: end },
    };
    if (closingIds.length > 0) match.journalEntryId = { $nin: closingIds };
    if (projectId === NO_PROJECT) match.projectId = null;
    else if (projectId) match.projectId = new Types.ObjectId(projectId);

    const aggregates = await LedgerLineModel.aggregate<{
      _id: string;
      debitMinor: number;
      creditMinor: number;
    }>([
      { $match: match },
      {
        $group: {
          _id: '$accountCode',
          debitMinor: { $sum: '$debitMinor' },
          creditMinor: { $sum: '$creditMinor' },
        },
      },
    ]);

    const rows: AccountRow[] = accounts.map((account) => ({
      code: account.code,
      name: account.name,
      type: account.type as AccountType,
      parentCode: account.parentCode,
      isPostable: account.isPostable,
      isActive: account.isActive !== false,
    }));
    const byCode = new Map(rows.map((row) => [row.code, row]));
    const amounts = new Map<string, number>();
    for (const agg of aggregates) {
      const row = byCode.get(agg._id);
      if (!row) continue;
      const net =
        row.type === AccountType.REVENUE
          ? agg.creditMinor - agg.debitMinor
          : agg.debitMinor - agg.creditMinor;
      amounts.set(row.code, fromMinorUnits(net));
    }

    const revenueRows = rows.filter((row) => row.type === AccountType.REVENUE);
    const expenseRows = rows.filter((row) => row.type === AccountType.EXPENSE);
    const under = (root: string) => (row: AccountRow) => isUnder(row.code, root, byCode);

    const revenue = buildSection(
      'revenue',
      'Revenue',
      revenueRows.filter((row) => !under(OTHER_INCOME_ROOT)(row)),
      byCode,
      amounts,
    );
    const otherIncome = buildSection(
      'other_income',
      'Other Income',
      revenueRows.filter(under(OTHER_INCOME_ROOT)),
      byCode,
      amounts,
    );
    const directCosts = buildSection(
      'direct_costs',
      'Direct Project Cost (COGS)',
      expenseRows.filter(under(DIRECT_COST_ROOT)),
      byCode,
      amounts,
    );
    const operatingExpenses = buildSection(
      'operating_expenses',
      'Operating & Office Overhead Expenses',
      expenseRows.filter(under(OPERATING_EXPENSE_ROOT)),
      byCode,
      amounts,
    );
    const otherExpenses = buildSection(
      'other_expenses',
      'Other Expenses',
      expenseRows.filter(
        (row) => !under(DIRECT_COST_ROOT)(row) && !under(OPERATING_EXPENSE_ROOT)(row),
      ),
      byCode,
      amounts,
    );

    const grossProfit = round2(revenue.total - directCosts.total);
    const operatingProfit = round2(grossProfit - operatingExpenses.total);
    const netProfit = round2(operatingProfit + otherIncome.total - otherExpenses.total);

    return {
      fromDate: start ? start.toISOString() : null,
      toDate: end.toISOString(),
      projectId,
      revenue,
      directCosts,
      grossProfit,
      operatingExpenses,
      operatingProfit,
      otherIncome,
      otherExpenses,
      totalRevenue: round2(revenue.total + otherIncome.total),
      totalExpenses: round2(
        directCosts.total + operatingExpenses.total + otherExpenses.total,
      ),
      netProfit,
    };
  }
}
