export enum AccountType {
  ASSET = 'asset',
  LIABILITY = 'liability',
  EQUITY = 'equity',
  REVENUE = 'revenue',
  EXPENSE = 'expense',
}

export type NormalBalance = 'debit' | 'credit';

export function normalBalanceOf(type: AccountType): NormalBalance {
  return type === AccountType.ASSET || type === AccountType.EXPENSE
    ? 'debit'
    : 'credit';
}
