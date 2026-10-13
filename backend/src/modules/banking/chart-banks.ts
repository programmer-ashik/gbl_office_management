import { AccountType } from '../../common/enums/account-type.enum';
import { TREASURY_PARENT_CODE, TreasuryKind } from '../../common/enums/treasury-kind.enum';
import { AccountModel } from '../accounting/account.model';

export const BANK_HEADER_CODE = TREASURY_PARENT_CODE[TreasuryKind.COMMERCIAL_BANK];

export type ChartBank = { id: string; code: string; name: string };

/** Postable asset heads anywhere under 1120 Cash at Bank in the chart of accounts. */
export async function chartBankAccounts(
  options: { includeInactive?: boolean } = {},
): Promise<ChartBank[]> {
  const rows = await AccountModel.find({ type: AccountType.ASSET })
    .select('code name parentCode isPostable isActive')
    .lean()
    .exec();
  const children = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.parentCode) continue;
    const list = children.get(row.parentCode) ?? [];
    list.push(row);
    children.set(row.parentCode, list);
  }
  const out: ChartBank[] = [];
  const seen = new Set<string>([BANK_HEADER_CODE]);
  const queue = [BANK_HEADER_CODE];
  while (queue.length > 0) {
    const code = queue.shift()!;
    for (const row of children.get(code) ?? []) {
      if (seen.has(row.code)) continue;
      seen.add(row.code);
      queue.push(row.code);
      if (row.isPostable && (row.isActive || options.includeInactive)) {
        out.push({ id: row._id.toString(), code: row.code, name: row.name });
      }
    }
  }
  return out.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
}

/** Chart of accounts names (and active flag) for the given GL codes. */
export async function chartAccountNames(
  codes: string[],
): Promise<Map<string, { name: string; isActive: boolean }>> {
  if (codes.length === 0) return new Map();
  const rows = await AccountModel.find({ code: { $in: [...new Set(codes)] } })
    .select('code name isActive')
    .lean()
    .exec();
  return new Map(rows.map((row) => [row.code, { name: row.name, isActive: row.isActive }]));
}
