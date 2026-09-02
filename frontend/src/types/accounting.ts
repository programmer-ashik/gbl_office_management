export const AccountType = {
  ASSET: 'asset',
  LIABILITY: 'liability',
  EQUITY: 'equity',
  REVENUE: 'revenue',
  EXPENSE: 'expense',
} as const

export type AccountType = (typeof AccountType)[keyof typeof AccountType]

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expenses',
}

export type Account = {
  id: string
  code: string
  name: string
  type: AccountType
  normalBalance: 'debit' | 'credit'
  parentCode: string | null
  description: string | null
  isSystem: boolean
  isPostable: boolean
  isActive: boolean
}

export type JournalLine = {
  accountCode: string
  accountName: string
  debit: number
  credit: number
  description: string | null
  projectId: string | null
}

export type JournalEntry = {
  id: string
  entryNumber: string
  date: string
  memo: string
  reference: string | null
  status: string
  source: string
  projectId: string | null
  totalDebit: number
  totalCredit: number
  postedAt: string
  lines: JournalLine[]
}

export type TrialBalanceRow = {
  accountCode: string
  accountName: string
  type: AccountType
  debitColumn: number
  creditColumn: number
  balance: number
}

export type TrialBalance = {
  asOf: string
  rows: TrialBalanceRow[]
  totalDebit: number
  totalCredit: number
  isBalanced: boolean
}

export type AccountLedger = {
  account: {
    accountCode: string
    accountName: string
    type: AccountType
    balance: number
  }
  entries: Array<{
    id: string
    date: string
    entryNumber: string
    memo: string
    debit: number
    credit: number
  }>
}

export function money(value: number): string {
  return value.toLocaleString('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
