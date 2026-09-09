export const TreasuryKind = {
  COMMERCIAL_BANK: 'commercial_bank',
  CASH: 'cash',
  PETTY_CASH: 'petty_cash',
  MOBILE_BANKING: 'mobile_banking',
} as const

export type TreasuryKind = (typeof TreasuryKind)[keyof typeof TreasuryKind]

export const TREASURY_KIND_LABEL: Record<TreasuryKind, string> = {
  commercial_bank: 'Commercial bank',
  cash: 'Hand cash',
  petty_cash: 'Petty cash',
  mobile_banking: 'Mobile banking',
}

export const TransferKind = {
  WITHDRAWAL: 'withdrawal',
  DEPOSIT: 'deposit',
  TRANSFER: 'transfer',
} as const

export type TransferKind = (typeof TransferKind)[keyof typeof TransferKind]

export const TRANSFER_KIND_LABEL: Record<TransferKind, string> = {
  withdrawal: 'Withdrawal',
  deposit: 'Deposit',
  transfer: 'Transfer',
}

export type TreasuryAccount = {
  id: string
  name: string
  kind: TreasuryKind
  institution: string | null
  accountNumber: string | null
  glAccountCode: string
  currency: string
  isActive: boolean
  isSystem: boolean
  bookBalance: number
}

export type FundTransfer = {
  id: string
  transferNumber: string
  kind: TransferKind
  date: string
  amount: number
  memo: string
  reference: string | null
  fromTreasuryId: string
  toTreasuryId: string
  fromAccountCode: string
  toAccountCode: string
  journalEntryId: string
  journalEntryNumber: string
}

export type StatementLine = {
  id: string
  date: string
  description: string
  amount: number
  debit: number
  credit: number
  reference: string | null
  status: string
  matchedLedgerLineId: string | null
  reconciledDate: string | null
}

export type Reconciliation = {
  id: string
  reconciliationNumber: string
  treasuryAccountId: string
  glAccountCode: string
  asOf: string
  openingBalance: number | null
  statementBalance: number
  bookBalance: number
  calculatedBookBalance: number
  uncollectedDeposits: number
  unpresentedCheques: number
  difference: number
  fileName: string | null
  status: string
  displayStatus: 'draft' | 'partially_reconciled' | 'reconciled'
  matchedCount: number
  unmatchedStatementCount: number
  isReconciled: boolean
  lines: StatementLine[]
  unmatchedBook: Array<{
    id: string
    date: string
    entryNumber: string
    memo: string
    reference: string | null
    debit: number
    credit: number
  }>
}

export type BankAdjustKind = 'bank_charge' | 'bank_interest'
