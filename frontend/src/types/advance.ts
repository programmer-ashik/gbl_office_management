export const AdvanceStatus = {
  PENDING: 'pending',
  REJECTED: 'rejected',
  DISBURSED: 'disbursed',
  SUBMITTED: 'submitted',
  SETTLED: 'settled',
} as const

export type AdvanceStatus = (typeof AdvanceStatus)[keyof typeof AdvanceStatus]

export const ADVANCE_STATUS_LABEL: Record<AdvanceStatus, string> = {
  pending: 'Pending',
  rejected: 'Rejected',
  disbursed: 'Disbursed',
  submitted: 'Submitted',
  settled: 'Settled',
}

export const SettlementCase = {
  EQUAL: 'equal',
  LESS: 'less',
  MORE: 'more',
} as const

export type SettlementCase = (typeof SettlementCase)[keyof typeof SettlementCase]

export const SETTLEMENT_CASE_LABEL: Record<SettlementCase, string> = {
  equal: 'Equal spend',
  less: 'Less spend',
  more: 'More spend',
}

export type Advance = {
  id: string
  advanceNumber: string
  status: AdvanceStatus
  employeeId: string
  employeeName: string
  projectId: string
  projectCode: string
  projectName: string
  requestedAmount: number
  purpose: string
  requestedAt: string
  disbursedAmount: number | null
  disbursedAt: string | null
  treasuryAccountCode: string | null
  disbursementJournalNumber: string | null
  vouchers: Array<{
    accountCode: string
    accountName: string
    amount: number
    description: string | null
  }>
  spentAmount: number | null
  settlementCase: SettlementCase | null
  returnAccountCode: string | null
  settlementJournalNumber: string | null
  settledAt: string | null
  reimbursementDue: number
  reimbursedAmount: number
  reimbursementJournalNumber: string | null
  reimbursedAt: string | null
  rejectionReason: string | null
}

export type EmployeeLedgerStatus =
  | 'DEBIT_BALANCE'
  | 'CREDIT_BALANCE'
  | 'SETTLED'

export type EmployeeLedgerReport = {
  employeeId: string
  employeeName: string
  totalAdvancesGiven: number
  totalExpenseSettled: number
  totalReimbursed: number
  runningBalance: number
  status: EmployeeLedgerStatus
  lines: Array<{
    id: string
    date: string
    journalEntryNumber: string
    accountCode: string
    accountName: string
    description: string
    debit: number
    credit: number
    runningBalance: number
    voucherType: string
    status: EmployeeLedgerStatus
    advanceId: string | null
    canReimburse: boolean
  }>
  openReimbursements: Array<{
    advanceId: string
    advanceNumber: string
    amount: number
  }>
}

export type AdvanceProjectOption = {
  id: string
  code: string
  name: string
  status: string
}

export type ExpenseAccountOption = {
  code: string
  name: string
}
