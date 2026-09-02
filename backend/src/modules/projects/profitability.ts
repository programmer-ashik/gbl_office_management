import { AccountType } from '../../common/enums/account-type.enum';
import { fromMinorUnits } from '../../common/utils/money';

/** Materials and labor are treated as direct/project COGS for gross profit. */
export const DIRECT_COST_ACCOUNT_CODES = new Set(['5000', '5100']);

export type AccountRollup = {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  debitMinor: number;
  creditMinor: number;
};

export type CostBreakdownRow = {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  amount: number;
  isDirectCost: boolean;
};

export type ProjectFinancials = {
  recognizedRevenue: number;
  directCost: number;
  otherExpense: number;
  totalCost: number;
  grossProfit: number;
  netProfit: number;
  grossMarginPct: number | null;
  netMarginPct: number | null;
  contractValue: number;
  totalBudget: number;
  budgetRemaining: number;
  budgetUsedPct: number | null;
  isOverBudget: boolean;
  contractRemaining: number;
  breakdown: CostBreakdownRow[];
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator === 0) {
    return null;
  }
  return round2((numerator / denominator) * 100);
}

export function computeProjectFinancials(
  contractValueMinor: number,
  totalBudgetMinor: number,
  rollups: AccountRollup[],
): ProjectFinancials {
  let revenueMinor = 0;
  let directCostMinor = 0;
  let otherExpenseMinor = 0;
  const breakdown: CostBreakdownRow[] = [];

  for (const row of rollups) {
    if (row.accountType === AccountType.REVENUE) {
      const amountMinor = row.creditMinor - row.debitMinor;
      revenueMinor += amountMinor;
      if (amountMinor !== 0) {
        breakdown.push({
          accountCode: row.accountCode,
          accountName: row.accountName,
          accountType: row.accountType,
          amount: fromMinorUnits(amountMinor),
          isDirectCost: false,
        });
      }
      continue;
    }

    if (row.accountType !== AccountType.EXPENSE) {
      continue;
    }

    const amountMinor = row.debitMinor - row.creditMinor;
    if (amountMinor === 0) {
      continue;
    }

    const isDirectCost = DIRECT_COST_ACCOUNT_CODES.has(row.accountCode);
    if (isDirectCost) {
      directCostMinor += amountMinor;
    } else {
      otherExpenseMinor += amountMinor;
    }

    breakdown.push({
      accountCode: row.accountCode,
      accountName: row.accountName,
      accountType: row.accountType,
      amount: fromMinorUnits(amountMinor),
      isDirectCost,
    });
  }

  const totalCostMinor = directCostMinor + otherExpenseMinor;
  const grossProfitMinor = revenueMinor - directCostMinor;
  const netProfitMinor = revenueMinor - totalCostMinor;
  const recognizedRevenue = fromMinorUnits(revenueMinor);
  const directCost = fromMinorUnits(directCostMinor);
  const otherExpense = fromMinorUnits(otherExpenseMinor);
  const totalCost = fromMinorUnits(totalCostMinor);
  const contractValue = fromMinorUnits(contractValueMinor);
  const totalBudget = fromMinorUnits(totalBudgetMinor);

  breakdown.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  return {
    recognizedRevenue,
    directCost,
    otherExpense,
    totalCost,
    grossProfit: fromMinorUnits(grossProfitMinor),
    netProfit: fromMinorUnits(netProfitMinor),
    grossMarginPct: pct(fromMinorUnits(grossProfitMinor), recognizedRevenue),
    netMarginPct: pct(fromMinorUnits(netProfitMinor), recognizedRevenue),
    contractValue,
    totalBudget,
    budgetRemaining: round2(totalBudget - totalCost),
    budgetUsedPct: pct(totalCost, totalBudget),
    isOverBudget: totalCostMinor > totalBudgetMinor,
    contractRemaining: round2(contractValue - recognizedRevenue),
    breakdown,
  };
}

export function emptyFinancials(
  contractValueMinor: number,
  totalBudgetMinor: number,
): ProjectFinancials {
  return computeProjectFinancials(contractValueMinor, totalBudgetMinor, []);
}
