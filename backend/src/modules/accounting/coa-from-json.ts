import { readFileSync } from 'fs';
import { join } from 'path';
import {
  AccountType,
  normalBalanceOf,
} from '../../common/enums/account-type.enum';

export type ChartOfAccountsJsonRow = {
  code: string;
  name: string;
  type: string;
  isHeader: boolean;
  parentCode: string | null;
};

export type NormalizedSeedAccount = {
  code: string;
  name: string;
  type: AccountType;
  parentCode?: string;
  description?: string;
  isSystem: boolean;
  isPostable: boolean;
  isActive: boolean;
  normalBalance: 'debit' | 'credit';
};

function mapType(raw: string): AccountType {
  const key = raw.trim().toLowerCase();
  switch (key) {
    case 'asset':
      return AccountType.ASSET;
    case 'liability':
      return AccountType.LIABILITY;
    case 'equity':
      return AccountType.EQUITY;
    case 'revenue':
    case 'income':
      return AccountType.REVENUE;
    case 'expense':
      return AccountType.EXPENSE;
    default:
      throw new Error(`Unknown account type "${raw}"`);
  }
}

/** Contra-asset accounts carry a credit normal balance. */
const CREDIT_NORMAL_CODES = new Set(['1129', '1290']);

export function resolveChartOfAccountsPath(): string {
  const candidates = [
    join(process.cwd(), 'chart_of_accounts.json'),
    join(process.cwd(), '..', 'chart_of_accounts.json'),
    join(__dirname, '../../../../chart_of_accounts.json'),
    join(__dirname, '../../../chart_of_accounts.json'),
  ];
  for (const path of candidates) {
    try {
      readFileSync(path, 'utf8');
      return path;
    } catch {
      /* try next */
    }
  }
  throw new Error(
    'chart_of_accounts.json not found (expected at project root)',
  );
}

export function loadChartOfAccountsJson(
  filePath = resolveChartOfAccountsPath(),
): ChartOfAccountsJsonRow[] {
  const raw = JSON.parse(readFileSync(filePath, 'utf8')) as ChartOfAccountsJsonRow[];
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('chart_of_accounts.json is empty or invalid');
  }
  return raw;
}

export function normalizeChartOfAccounts(
  rows: ChartOfAccountsJsonRow[],
): NormalizedSeedAccount[] {
  const byCode = new Map<string, ChartOfAccountsJsonRow>();
  for (const row of rows) {
    const code = row.code.trim().toUpperCase();
    if (byCode.has(code)) {
      throw new Error(`Duplicate account code in JSON: ${code}`);
    }
    byCode.set(code, { ...row, code });
  }

  for (const row of byCode.values()) {
    if (row.parentCode) {
      const parent = row.parentCode.trim().toUpperCase();
      if (!byCode.has(parent)) {
        throw new Error(
          `Account ${row.code} references missing parentCode ${parent}`,
        );
      }
      if (parent === row.code) {
        throw new Error(`Account ${row.code} cannot be its own parent`);
      }
    }
  }

  // Parents before children (stable topological order by code depth / parent chain)
  const depth = (code: string, seen = new Set<string>()): number => {
    if (seen.has(code)) {
      throw new Error(`Circular parentCode reference at ${code}`);
    }
    seen.add(code);
    const row = byCode.get(code)!;
    if (!row.parentCode) return 0;
    return 1 + depth(row.parentCode.trim().toUpperCase(), seen);
  };

  return [...byCode.values()]
    .sort((a, b) => depth(a.code) - depth(b.code) || a.code.localeCompare(b.code))
    .map((row) => {
      const type = mapType(row.type);
      const normalBalance = CREDIT_NORMAL_CODES.has(row.code)
        ? 'credit'
        : normalBalanceOf(type);
      return {
        code: row.code,
        name: row.name.trim(),
        type,
        parentCode: row.parentCode
          ? row.parentCode.trim().toUpperCase()
          : undefined,
        description: row.isHeader ? 'Header account (non-postable)' : undefined,
        isSystem: true,
        isPostable: !row.isHeader,
        isActive: true,
        normalBalance,
      };
    });
}
