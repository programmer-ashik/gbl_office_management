/** Journal classification — does not replace dedicated AR/AP/advance modules. */
export const JournalType = {
  GENERAL: 'general',
  SALES: 'sales',
  PURCHASE: 'purchase',
  CUSTOMER_RECEIPT: 'customer_receipt',
  SUPPLIER_PAYMENT: 'supplier_payment',
  EMPLOYEE_ADVANCE: 'employee_advance',
  EMPLOYEE_SETTLEMENT: 'employee_settlement',
  EXPENSE: 'expense',
  BANK_DEPOSIT: 'bank_deposit',
  BANK_WITHDRAWAL: 'bank_withdrawal',
  CASH_RECEIPT: 'cash_receipt',
  CASH_PAYMENT: 'cash_payment',
  INTERNAL_TRANSFER: 'internal_transfer',
  PROJECT_COST: 'project_cost',
  PROJECT_REVENUE: 'project_revenue',
  PAYROLL_ADJUSTMENT: 'payroll_adjustment',
  OPENING_BALANCE: 'opening_balance',
  YEAR_END_CLOSING: 'year_end_closing',
  OTHER_INCOME: 'other_income',
  OTHER_EXPENSE: 'other_expense',
} as const

export type JournalType = (typeof JournalType)[keyof typeof JournalType]

export const JOURNAL_TYPE_VALUES = Object.values(JournalType)

export const JournalStatus = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  POSTED: 'posted',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  REVERSED: 'reversed',
} as const

export type JournalStatus = (typeof JournalStatus)[keyof typeof JournalStatus]

export const JOURNAL_STATUS_VALUES = Object.values(JournalStatus)

/** Sub-ledger party on a journal line (GL account + entity). */
export const JournalEntityType = {
  CUSTOMER: 'customer',
  SUPPLIER: 'supplier',
  EMPLOYEE: 'employee',
  TREASURY: 'treasury',
} as const

export type JournalEntityType =
  (typeof JournalEntityType)[keyof typeof JournalEntityType]

export const JOURNAL_ENTITY_TYPE_VALUES = Object.values(JournalEntityType)
