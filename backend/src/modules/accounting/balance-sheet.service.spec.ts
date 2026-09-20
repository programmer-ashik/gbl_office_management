import {
  assertBalanceSheetEquation,
} from './balance-sheet.service';

describe('BalanceSheet equation', () => {
  it('is balanced when Assets = Liabilities + Equity', () => {
    const result = assertBalanceSheetEquation({
      totalAssets: 1_000_000,
      totalLiabilities: 250_000,
      totalEquity: 750_000,
    });
    expect(result.isBalanced).toBe(true);
    expect(result.difference).toBe(0);
  });

  it('detects imbalance', () => {
    const result = assertBalanceSheetEquation({
      totalAssets: 100_000,
      totalLiabilities: 40_000,
      totalEquity: 50_000,
    });
    expect(result.isBalanced).toBe(false);
    expect(result.difference).toBe(10_000);
  });

  it('holds for opening capital journal shape (cash+bank = capital)', () => {
    // Dr 1111 150000, Dr 1112 850000, Cr 3100 1000000
    const assets = 150_000 + 850_000;
    const liabilities = 0;
    const equity = 1_000_000;
    const result = assertBalanceSheetEquation({
      totalAssets: assets,
      totalLiabilities: liabilities,
      totalEquity: equity,
    });
    expect(result.isBalanced).toBe(true);
  });

  it('holds when net income is included in equity', () => {
    // Assets 100; Liabilities 20; Capital 50; NI 30 → Equity 80
    const result = assertBalanceSheetEquation({
      totalAssets: 100,
      totalLiabilities: 20,
      totalEquity: 50 + 30,
    });
    expect(result.isBalanced).toBe(true);
  });
});
