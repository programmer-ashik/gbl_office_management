import { AccountType } from '../../common/enums/account-type.enum';
import { computeProjectFinancials } from './profitability';

describe('computeProjectFinancials', () => {
  it('returns empty metrics and is not over budget with no activity', () => {
    const result = computeProjectFinancials(1_000_000, 400_000, []);
    expect(result.recognizedRevenue).toBe(0);
    expect(result.totalCost).toBe(0);
    expect(result.grossProfit).toBe(0);
    expect(result.netProfit).toBe(0);
    expect(result.isOverBudget).toBe(false);
    expect(result.budgetRemaining).toBe(4000);
    expect(result.contractRemaining).toBe(10000);
    expect(result.grossMarginPct).toBeNull();
  });

  it('computes gross and net profit from tagged revenue and costs', () => {
    const result = computeProjectFinancials(5_000_000, 2_000_000, [
      {
        accountCode: '4110',
        accountName: 'Project Revenue',
        accountType: AccountType.REVENUE,
        debitMinor: 0,
        creditMinor: 3_000_000,
      },
      {
        accountCode: '5110',
        accountName: 'Raw Material Expenses',
        accountType: AccountType.EXPENSE,
        debitMinor: 800_000,
        creditMinor: 0,
      },
      {
        accountCode: '5120',
        accountName: 'Direct Project Labor / Site Salary',
        accountType: AccountType.EXPENSE,
        debitMinor: 400_000,
        creditMinor: 0,
      },
      {
        accountCode: '5240',
        accountName: 'Office Petty Cash Expenses',
        accountType: AccountType.EXPENSE,
        debitMinor: 50_000,
        creditMinor: 0,
      },
    ]);

    expect(result.recognizedRevenue).toBe(30000);
    expect(result.directCost).toBe(12000);
    expect(result.otherExpense).toBe(500);
    expect(result.totalCost).toBe(12500);
    expect(result.grossProfit).toBe(18000);
    expect(result.netProfit).toBe(17500);
    expect(result.grossMarginPct).toBe(60);
    expect(result.netMarginPct).toBe(58.33);
    expect(result.isOverBudget).toBe(false);
    expect(result.budgetUsedPct).toBe(62.5);
    expect(result.contractRemaining).toBe(20000);
  });

  it('ignores asset lines such as employee advances', () => {
    const result = computeProjectFinancials(100_000, 50_000, [
      {
        accountCode: '1131',
        accountName: 'Employee Advances',
        accountType: AccountType.ASSET,
        debitMinor: 20_000,
        creditMinor: 0,
      },
      {
        accountCode: '5110',
        accountName: 'Project Materials',
        accountType: AccountType.EXPENSE,
        debitMinor: 10_000,
        creditMinor: 0,
      },
    ]);

    expect(result.totalCost).toBe(100);
    expect(result.netProfit).toBe(-100);
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0].accountCode).toBe('5110');
  });

  it('flags over-budget when actual cost exceeds the threshold', () => {
    const result = computeProjectFinancials(200_000, 50_000, [
      {
        accountCode: '5110',
        accountName: 'Project Materials',
        accountType: AccountType.EXPENSE,
        debitMinor: 60_000,
        creditMinor: 0,
      },
    ]);

    expect(result.isOverBudget).toBe(true);
    expect(result.budgetRemaining).toBe(-100);
    expect(result.budgetUsedPct).toBe(120);
  });
});
