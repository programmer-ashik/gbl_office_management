import { AccountType } from '../../common/enums/account-type.enum';
import { fromMinorUnits } from '../../common/utils/money';
import { AccountModel } from './account.model';
import { LedgerLineModel } from './ledger.model';
import { SystemAccountCode } from './system-account-codes';

export type BalanceSheetLine = {
  code: string;
  name: string;
  parentCode: string | null;
  balance: number;
  isHeader: boolean;
  isPostable: boolean;
  depth: number;
};

export type BalanceSheetSection = {
  id: string;
  title: string;
  total: number;
  lines: BalanceSheetLine[];
};

export type BalanceSheetReport = {
  asOf: string;
  assets: {
    current: BalanceSheetSection;
    fixed: BalanceSheetSection;
    total: number;
  };
  liabilities: {
    current: BalanceSheetSection;
    longTerm: BalanceSheetSection;
    total: number;
  };
  equity: {
    section: BalanceSheetSection;
    retainedEarnings: number;
    netIncome: number;
    total: number;
  };
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
  difference: number;
};

type AccountRow = {
  code: string;
  name: string;
  type: AccountType;
  parentCode?: string;
  isPostable: boolean;
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function signedBalanceMinor(
  type: AccountType,
  debitMinor: number,
  creditMinor: number,
): number {
  const raw = debitMinor - creditMinor;
  return type === AccountType.ASSET || type === AccountType.EXPENSE ? raw : -raw;
}

function depthOf(
  code: string,
  byCode: Map<string, AccountRow>,
  seen = new Set<string>(),
): number {
  if (seen.has(code)) return 0;
  seen.add(code);
  const row = byCode.get(code);
  if (!row?.parentCode) return 0;
  return 1 + depthOf(row.parentCode, byCode, seen);
}

function isUnderParent(
  code: string,
  parentCode: string,
  byCode: Map<string, AccountRow>,
): boolean {
  let current: string | undefined = code;
  const seen = new Set<string>();
  while (current) {
    if (current === parentCode) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    current = byCode.get(current)?.parentCode;
  }
  return false;
}

function buildSection(
  id: string,
  title: string,
  rootCode: string,
  accounts: AccountRow[],
  byCode: Map<string, AccountRow>,
  balances: Map<string, number>,
): BalanceSheetSection {
  const members = accounts
    .filter(
      (account) =>
        account.code === rootCode || isUnderParent(account.code, rootCode, byCode),
    )
    .sort((a, b) => a.code.localeCompare(b.code));

  const lines: BalanceSheetLine[] = members.map((account) => {
    const own = balances.get(account.code) ?? 0;
    // Header total = sum of postable descendants (and self if postable)
    let balance = account.isPostable ? own : 0;
    if (!account.isPostable) {
      balance = members
        .filter(
          (child) =>
            child.isPostable &&
            (child.code === account.code ||
              isUnderParent(child.code, account.code, byCode)),
        )
        .reduce((sum, child) => sum + (balances.get(child.code) ?? 0), 0);
    }
    return {
      code: account.code,
      name: account.name,
      parentCode: account.parentCode ?? null,
      balance: round2(balance),
      isHeader: !account.isPostable,
      isPostable: account.isPostable,
      depth: depthOf(account.code, byCode),
    };
  });

  const total = round2(
    members
      .filter((account) => account.isPostable)
      .reduce((sum, account) => sum + (balances.get(account.code) ?? 0), 0),
  );

  return { id, title, total, lines };
}

export class BalanceSheetService {
  async generate(asOf = new Date()): Promise<BalanceSheetReport> {
    const end = new Date(asOf);
    if (Number.isNaN(end.getTime())) {
      throw new Error('Invalid asOf date');
    }
    end.setUTCHours(23, 59, 59, 999);

    const [accounts, aggregates] = await Promise.all([
      AccountModel.find({ isActive: true }).sort({ code: 1 }).lean().exec(),
      LedgerLineModel.aggregate<{
        _id: string;
        debitMinor: number;
        creditMinor: number;
      }>([
        { $match: { date: { $lte: end } } },
        {
          $group: {
            _id: '$accountCode',
            debitMinor: { $sum: '$debitMinor' },
            creditMinor: { $sum: '$creditMinor' },
          },
        },
      ]),
    ]);

    const accountRows: AccountRow[] = accounts.map((account) => ({
      code: account.code,
      name: account.name,
      type: account.type as AccountType,
      parentCode: account.parentCode,
      isPostable: account.isPostable,
    }));
    const byCode = new Map(accountRows.map((row) => [row.code, row]));

    const balances = new Map<string, number>();
    for (const row of accountRows) {
      const agg = aggregates.find((item) => item._id === row.code);
      const debit = agg?.debitMinor ?? 0;
      const credit = agg?.creditMinor ?? 0;
      balances.set(
        row.code,
        fromMinorUnits(signedBalanceMinor(row.type, debit, credit)),
      );
    }

    const currentAssets = buildSection(
      'current_assets',
      'Current Assets',
      '1100',
      accountRows.filter((row) => row.type === AccountType.ASSET),
      byCode,
      balances,
    );
    const fixedAssets = buildSection(
      'fixed_assets',
      'Fixed Assets',
      '1200',
      accountRows.filter((row) => row.type === AccountType.ASSET),
      byCode,
      balances,
    );

    // Include any other asset roots under 1000 not in 1100/1200
    const otherAssetTotal = round2(
      accountRows
        .filter(
          (row) =>
            row.type === AccountType.ASSET &&
            row.isPostable &&
            !isUnderParent(row.code, '1100', byCode) &&
            !isUnderParent(row.code, '1200', byCode) &&
            row.code !== '1000',
        )
        .reduce((sum, row) => sum + (balances.get(row.code) ?? 0), 0),
    );

    const totalAssets = round2(
      currentAssets.total + fixedAssets.total + otherAssetTotal,
    );

    const currentLiabilities = buildSection(
      'current_liabilities',
      'Current Liabilities',
      '2100',
      accountRows.filter((row) => row.type === AccountType.LIABILITY),
      byCode,
      balances,
    );
    const longTermLiabilities = buildSection(
      'long_term_liabilities',
      'Long-Term Liabilities',
      '2200',
      accountRows.filter((row) => row.type === AccountType.LIABILITY),
      byCode,
      balances,
    );
    const totalLiabilities = round2(
      currentLiabilities.total + longTermLiabilities.total,
    );

    const revenueTotal = round2(
      accountRows
        .filter((row) => row.type === AccountType.REVENUE && row.isPostable)
        .reduce((sum, row) => sum + (balances.get(row.code) ?? 0), 0),
    );
    const expenseTotal = round2(
      accountRows
        .filter((row) => row.type === AccountType.EXPENSE && row.isPostable)
        .reduce((sum, row) => sum + (balances.get(row.code) ?? 0), 0),
    );
    const netIncome = round2(revenueTotal - expenseTotal);

    const equityAccounts = accountRows.filter(
      (row) => row.type === AccountType.EQUITY,
    );

    const equitySection = buildSection(
      'equity',
      'Equity',
      '3000',
      equityAccounts,
      byCode,
      balances,
    );

    // Present computed net income / retained earnings for the period
    const retainedEarnings = round2(
      (balances.get(SystemAccountCode.RETAINED_EARNINGS) ?? 0) + netIncome,
    );

    const equityLines: BalanceSheetLine[] = [
      ...equitySection.lines.filter(
        (line) => line.code !== SystemAccountCode.RETAINED_EARNINGS,
      ),
      {
        code: SystemAccountCode.RETAINED_EARNINGS,
        name: 'Retained Earnings (incl. current net income)',
        parentCode: '3000',
        balance: retainedEarnings,
        isHeader: false,
        isPostable: true,
        depth: 1,
      },
    ];

    // Avoid double-counting: equity total = posted equity excluding 3200 + RE line
    // (3200 balance is inside retainedEarnings together with NI)
    const equityWithout3200 = round2(
      equityAccounts
        .filter(
          (row) =>
            row.isPostable && row.code !== SystemAccountCode.RETAINED_EARNINGS,
        )
        .reduce((sum, row) => sum + (balances.get(row.code) ?? 0), 0),
    );
    const totalEquity = round2(equityWithout3200 + retainedEarnings);

    const totalLiabilitiesAndEquity = round2(totalLiabilities + totalEquity);
    const difference = round2(totalAssets - totalLiabilitiesAndEquity);

    return {
      asOf: end.toISOString(),
      assets: {
        current: currentAssets,
        fixed: fixedAssets,
        total: totalAssets,
      },
      liabilities: {
        current: currentLiabilities,
        longTerm: longTermLiabilities,
        total: totalLiabilities,
      },
      equity: {
        section: {
          id: 'equity',
          title: 'Equity',
          total: totalEquity,
          lines: equityLines,
        },
        retainedEarnings,
        netIncome,
        total: totalEquity,
      },
      totalLiabilitiesAndEquity,
      isBalanced: Math.abs(difference) < 0.005,
      difference,
    };
  }
}

/** Pure helper for unit tests without Mongo. */
export function assertBalanceSheetEquation(input: {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}): { isBalanced: boolean; difference: number } {
  const difference = round2(
    input.totalAssets - (input.totalLiabilities + input.totalEquity),
  );
  return {
    isBalanced: Math.abs(difference) < 0.005,
    difference,
  };
}
