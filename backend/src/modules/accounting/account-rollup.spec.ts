import { AppError } from '../../common/errors/app-error';
import { prepareJournalLines } from './journal.service';
import {
  loadChartOfAccountsJson,
  normalizeChartOfAccounts,
} from './coa-from-json';
import {
  HEADER_TRANSACTION_ERROR,
  assertAccountIsPostable,
  rollupBalances,
  type RollupAccount,
} from './account-rollup';

function cashTree(): RollupAccount[] {
  return normalizeChartOfAccounts(loadChartOfAccountsJson())
    .filter((row) => ['1110', '1111', '1120', '1121', '1122', '1123', '1131', '1132'].includes(row.code))
    .map((row) => ({
      code: row.code,
      parentCode: row.parentCode ?? null,
      isPostable: row.isPostable,
    }));
}

describe('cash and bank account hierarchy', () => {
  const tree = cashTree();

  it('builds the nested header and postable structure from the chart', () => {
    const byCode = new Map(tree.map((row) => [row.code, row]));
    expect(byCode.get('1110')).toMatchObject({ parentCode: '1100', isPostable: false });
    expect(byCode.get('1111')).toMatchObject({ parentCode: '1110', isPostable: true });
    expect(byCode.get('1120')).toMatchObject({ parentCode: '1110', isPostable: false });
    expect(byCode.get('1121')).toMatchObject({ parentCode: '1120', isPostable: true });
    expect(byCode.get('1122')).toMatchObject({ parentCode: '1120', isPostable: true });
    expect(byCode.get('1123')).toMatchObject({ parentCode: '1120', isPostable: true });
    expect(byCode.get('1131')).toMatchObject({ parentCode: '1110', isPostable: true });
    expect(byCode.get('1132')).toMatchObject({ parentCode: '1110', isPostable: true });

    const chart = normalizeChartOfAccounts(loadChartOfAccountsJson());
    expect(chart.find((row) => row.code === '1151')).toMatchObject({
      name: 'Client Receivables',
      parentCode: '1150',
      isPostable: true,
    });
    expect(chart.find((row) => row.code === '1161')).toMatchObject({
      name: 'Advance to Staff',
      parentCode: '1160',
      isPostable: true,
    });
    expect(chart.some((row) => ['1114', '1115', '1119', '1130'].includes(row.code))).toBe(
      false,
    );
  });

  it('allows a journal line on a postable bank account', () => {
    const dbbl = tree.find((row) => row.code === '1121')!;
    expect(() => assertAccountIsPostable(dbbl)).not.toThrow();
    const result = prepareJournalLines([
      { accountCode: '1121', debit: 500 },
      { accountCode: '3100', credit: 500 },
    ]);
    expect(result.prepared.map((line) => line.accountCode)).toContain('1121');
  });

  it('rejects a transaction posted to a header account', () => {
    const cashInBank = tree.find((row) => row.code === '1120')!;
    expect(() => assertAccountIsPostable(cashInBank)).toThrow(AppError);
    try {
      assertAccountIsPostable(cashInBank);
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).message).toBe(HEADER_TRANSACTION_ERROR);
    }
  });

  it('rolls child bank balances up to the Cash in Bank header', () => {
    const own = new Map<string, number>([
      ['1111', 100],
      ['1121', 400],
      ['1122', 250],
      ['1123', 50],
      ['1131', 20],
      ['1132', 30],
    ]);
    const rolled = rollupBalances(tree, own);
    expect(rolled.get('1121')).toBe(400);
    expect(rolled.get('1122')).toBe(250);
    expect(rolled.get('1123')).toBe(50);
    expect(rolled.get('1120')).toBe(700);
    expect(rolled.get('1110')).toBe(850);
    expect(rolled.get('1131')).toBe(20);
    expect(rolled.get('1132')).toBe(30);
  });
});
