import { AccountModel } from './account.model';

/**
 * Postable codes a filter on `code` covers: the code itself when it is postable,
 * else every postable descendant (any depth, inactive heads included for history).
 * Returns null when the account does not exist.
 */
export async function postableCodesUnder(code: string): Promise<string[] | null> {
  const root = code.trim().toUpperCase();
  const rows = await AccountModel.find({})
    .select('code parentCode isPostable')
    .lean()
    .exec();
  const self = rows.find((row) => row.code === root);
  if (!self) return null;
  if (self.isPostable) return [root];

  const children = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.parentCode) continue;
    const list = children.get(row.parentCode) ?? [];
    list.push(row);
    children.set(row.parentCode, list);
  }
  const out: string[] = [];
  const seen = new Set<string>([root]);
  const queue = [root];
  while (queue.length > 0) {
    for (const row of children.get(queue.shift()!) ?? []) {
      if (seen.has(row.code)) continue;
      seen.add(row.code);
      if (row.isPostable) out.push(row.code);
      else queue.push(row.code);
    }
  }
  return out;
}
