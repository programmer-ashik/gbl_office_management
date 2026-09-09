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

export const JOURNAL_TYPE_LABEL: Record<JournalType, string> = {
  general: 'General Journal',
  sales: 'Sales / Receivable',
  purchase: 'Purchase / Payable',
  customer_receipt: 'Customer Receipt',
  supplier_payment: 'Supplier Payment',
  employee_advance: 'Employee Advance',
  employee_settlement: 'Employee Settlement',
  expense: 'Expense',
  bank_deposit: 'Bank Deposit',
  bank_withdrawal: 'Bank Withdrawal',
  cash_receipt: 'Cash Receipt',
  cash_payment: 'Cash Payment',
  internal_transfer: 'Internal Transfer',
  project_cost: 'Project Cost',
  project_revenue: 'Project Revenue',
  payroll_adjustment: 'Payroll Adjustment',
  opening_balance: 'Opening Balance',
  year_end_closing: 'Year-End Closing',
  other_income: 'Other Income',
  other_expense: 'Other Expense',
}

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

export const JOURNAL_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  posted: 'Posted',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  reversed: 'Reversed',
}

export const JournalEntityType = {
  CUSTOMER: 'customer',
  SUPPLIER: 'supplier',
  EMPLOYEE: 'employee',
  TREASURY: 'treasury',
} as const

export type JournalEntityType =
  (typeof JournalEntityType)[keyof typeof JournalEntityType]

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
  entityType: string | null
  entityId: string | null
  entityName: string | null
}

export type JournalEntry = {
  id: string
  entryNumber: string
  date: string
  memo: string
  reference: string | null
  journalType: string
  status: string
  source: string
  projectId: string | null
  totalDebit: number
  totalCredit: number
  postedAt: string | null
  createdBy: string | null
  approvedBy: string | null
  approvedAt: string | null
  reversedByEntryId: string | null
  reversesEntryId: string | null
  lines: JournalLine[]
}

export type JournalSummary = {
  total: number
  draft: number
  pendingApproval: number
  posted: number
  reversed: number
  totalDebit: number
  totalCredit: number
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

export type BalanceSheetLine = {
  code: string
  name: string
  parentCode: string | null
  balance: number
  isHeader: boolean
  isPostable: boolean
  depth: number
  isParty?: boolean
  entityType?: string | null
  entityId?: string | null
}

export type BalanceSheetSection = {
  id: string
  title: string
  total: number
  lines: BalanceSheetLine[]
}

export type BalanceSheetReport = {
  asOf: string
  assets: {
    current: BalanceSheetSection
    fixed: BalanceSheetSection
    total: number
  }
  liabilities: {
    current: BalanceSheetSection
    longTerm: BalanceSheetSection
    total: number
  }
  equity: {
    section: BalanceSheetSection
    retainedEarnings: number
    netIncome: number
    total: number
  }
  totalLiabilitiesAndEquity: number
  isBalanced: boolean
  difference: number
}

export type AccountLedger = {
  account: {
    accountCode: string
    accountName: string
    type: AccountType
    balance: number
    normalBalance?: 'debit' | 'credit'
  }
  openingBalance: number
  closingBalance: number
  periodDebit: number
  periodCredit: number
  fromDate: string | null
  toDate: string | null
  entries: Array<{
    id: string
    date: string
    entryNumber: string
    journalEntryId?: string
    memo: string
    description: string
    reference: string | null
    debit: number
    credit: number
    runningBalance?: number
    entityType?: string | null
    entityId?: string | null
    entityName?: string | null
    projectId?: string | null
  }>
}

export type Customer = {
  id: string
  customerNumber: string
  name: string
  contactName: string | null
  email: string | null
  phone: string | null
  address: string | null
  isActive: boolean
}

export type DimensionRule = {
  entityType: JournalEntityType | null
  entityRequired: boolean
  projectRequired: boolean
  label: string
}

const DIMENSION_RULES: Record<string, DimensionRule> = {
  '1121': {
    entityType: JournalEntityType.CUSTOMER,
    entityRequired: true,
    projectRequired: false,
    label: 'Customer',
  },
  '2111': {
    entityType: JournalEntityType.SUPPLIER,
    entityRequired: true,
    projectRequired: false,
    label: 'Supplier',
  },
  '2113': {
    entityType: JournalEntityType.SUPPLIER,
    entityRequired: true,
    projectRequired: false,
    label: 'Supplier',
  },
  '1131': {
    entityType: JournalEntityType.EMPLOYEE,
    entityRequired: true,
    projectRequired: true,
    label: 'Employee',
  },
  '2121': {
    entityType: JournalEntityType.EMPLOYEE,
    entityRequired: true,
    projectRequired: false,
    label: 'Employee',
  },
  '5110': {
    entityType: null,
    entityRequired: false,
    projectRequired: true,
    label: 'Project',
  },
  '5120': {
    entityType: null,
    entityRequired: false,
    projectRequired: true,
    label: 'Project',
  },
  '5130': {
    entityType: null,
    entityRequired: false,
    projectRequired: true,
    label: 'Project',
  },
  '5140': {
    entityType: null,
    entityRequired: false,
    projectRequired: true,
    label: 'Project',
  },
  '1111': {
    entityType: JournalEntityType.TREASURY,
    entityRequired: false,
    projectRequired: false,
    label: 'Treasury',
  },
  '1112': {
    entityType: JournalEntityType.TREASURY,
    entityRequired: false,
    projectRequired: false,
    label: 'Treasury',
  },
  '1113': {
    entityType: JournalEntityType.TREASURY,
    entityRequired: false,
    projectRequired: false,
    label: 'Treasury',
  },
  '1114': {
    entityType: JournalEntityType.TREASURY,
    entityRequired: false,
    projectRequired: false,
    label: 'Treasury',
  },
}

export function dimensionRuleForAccount(accountCode: string): DimensionRule {
  return (
    DIMENSION_RULES[accountCode] ?? {
      entityType: null,
      entityRequired: false,
      projectRequired: false,
      label: '',
    }
  )
}

export type JournalWriteBody = {
  date: string
  memo: string
  reference?: string
  journalType?: string
  intent?: 'draft' | 'post'
  projectId?: string
  lines: Array<{
    accountCode: string
    debit?: number
    credit?: number
    description?: string
    projectId?: string
    entityType?: string
    entityId?: string
  }>
}

export function money(value: number): string {
  return value.toLocaleString('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
