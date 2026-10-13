import { badRequest } from '../../common/errors/app-error';

/** Shown when a journal line targets a header (grouping) account. */
export const HEADER_TRANSACTION_ERROR =
  'Transactions cannot be posted directly to a Header account. Please select a specific Postable sub-account.';

export type RollupAccount = {
  code: string;
  parentCode?: string | null;
  isPostable: boolean;
};

/**
 * Postable accounts keep their own balance.
 * Header accounts return the sum of postable descendants (not their own lines).
 */
export function rollupBalances(
  accounts: RollupAccount[],
  ownBalances: Map<string, number>,
): Map<string, number> {
  const byCode = new Map(accounts.map((account) => [account.code, account]));
  const childrenOf = new Map<string, string[]>();
  for (const account of accounts) {
    if (!account.parentCode) continue;
    const list = childrenOf.get(account.parentCode) ?? [];
    list.push(account.code);
    childrenOf.set(account.parentCode, list);
  }

  const memo = new Map<string, number>();

  const visit = (code: string, stack: Set<string>): number => {
    const cached = memo.get(code);
    if (cached !== undefined) return cached;
    if (stack.has(code)) return 0;
    stack.add(code);
    const account = byCode.get(code);
    const children = childrenOf.get(code) ?? [];
    const childSum = children.reduce(
      (sum, child) => sum + visit(child, stack),
      0,
    );
    stack.delete(code);
    const total = account?.isPostable
      ? (ownBalances.get(code) ?? 0)
      : childSum;
    memo.set(code, total);
    return total;
  };

  for (const account of accounts) {
    visit(account.code, new Set());
  }
  return memo;
}

export function assertAccountIsPostable(account: {
  code: string;
  isPostable: boolean;
}): void {
  if (!account.isPostable) {
    throw badRequest(HEADER_TRANSACTION_ERROR);
  }
}
