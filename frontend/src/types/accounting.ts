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
  OTHER: 'other',
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
  /** Salary / conveyance heads: journal lines are tagged with an employee. */
  employeeExpenseKind?: EmployeeExpenseKind | null
  /** Journal lines on this account pick a party from this list. */
  partyType?: AccountPartyType | null
  /** Header only: Post journal lists it and asks which sub-account the line is for. */
  journalPicker?: boolean
}

export type AccountPartyType = 'customer' | 'supplier' | 'employee' | 'other'

export const ACCOUNT_PARTY_TYPE_LABELS: Record<AccountPartyType, string> = {
  customer: 'Customers',
  supplier: 'Suppliers',
  employee: 'Employees',
  other: 'Other parties',
}

export type AccountSplitBody = {
  children: Array<{ code: string; name: string }>
  /** Sub-account that receives the balance already posted to the account. */
  historyTo?: string
}

export type AccountSplitPlan = {
  account: { code: string; name: string; type: string; parentCode: string | null }
  alreadyHeader: boolean
  alreadyDone: boolean
  errors: string[]
  warnings: string[]
  children: Array<{ code: string; name: string }>
  childrenToCreate: string[]
  historyTo: string | null
  reclasses: Array<{
    journalEntryId: string
    entryNumber: string
    date: string
    projectId: string | null
    employeeId: string | null
    amount: number
    reference: string
  }>
  totalToMove: number
  unpostedJournals: Array<{ entryNumber: string; status: string }>
}

export type AccountSplitResult = AccountSplitPlan & {
  postedReclasses: Array<{ reference: string; entryNumber: string }>
  headerOwnBalanceAfter: number
}

export type EmployeeExpenseKind = 'salary' | 'conveyance'

export const EMPLOYEE_EXPENSE_KIND_LABELS: Record<EmployeeExpenseKind, string> = {
  salary: 'Salary',
  conveyance: 'Conveyance',
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
  /** Stored type, or the category the API inferred for system/general journals. */
  effectiveType?: string
  /** Every Type-filter category the journal belongs to. */
  typeTags?: string[]
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
  chequeNumber?: string | null
  /** YYYY-MM-DD */
  chequeDate?: string | null
  isPdc?: boolean
  pdcStatus?: PdcStatus
  intendedBankAccountId?: string | null
  intendedBankAccountCode?: string | null
  pdcDirection?: PdcDirection | null
  pdcClearingEntryId?: string | null
  pdcClearsEntryId?: string | null
  pdcSettledAt?: string | null
  pdcBounceReason?: string | null
  lines: JournalLine[]
}

export type PdcStatus = 'None' | 'Pending' | 'Cleared' | 'Bounced'
export type PdcDirection = 'receipt' | 'payment'

/** Cheque register row: journal + derived cheque summary. */
export type ChequeRegisterRow = JournalEntry & {
  chequeAmount: number
  direction: PdcDirection | null
  bankAccountCode: string | null
  bankAccountName: string | null
  partyName: string | null
  partyType: string | null
  clearingEntryNumber: string | null
  reversalEntryNumber: string | null
}

export type ChequeActionResult = {
  pdc: JournalEntry
  clearingJournal?: JournalEntry
  reversal?: JournalEntry
}

export type ChequeLeafStatus = 'available' | 'issued' | 'cancelled'

/** A company chequebook registered for one of our own bank accounts. */
export type ChequeBook = {
  id: string
  treasuryId: string
  bankAccountCode: string
  bankName: string
  bookName: string
  prefix: string
  startNumber: string
  endNumber: string
  leafCount: number
  receivedDate: string | null
  notes: string | null
  availableCount: number
  issuedCount: number
  cancelledCount: number
  nextAvailable: string | null
  createdAt: string | null
}

export type ChequeLeaf = {
  id: string
  bookId: string
  bookName: string
  treasuryId: string
  bankAccountCode: string
  bankName: string
  chequeNumber: string
  sequence: number
  status: ChequeLeafStatus
  journalId: string | null
  journalNumber: string | null
  journalStatus: string | null
  pdcStatus: string | null
  issuedAt: string | null
  payeeName: string | null
  amount: number | null
  chequeDate: string | null
  cancelReason: string | null
  cancelledAt: string | null
}

export type CreateChequeBookBody = {
  treasuryId: string
  bookName?: string
  prefix?: string
  startNumber: string
  leafCount: number
  receivedDate?: string
  notes?: string
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
    counterpart?: string | null
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
  /** Show the project picker (optional, "None" allowed) even when not required. */
  projectOptional?: boolean
  label: string
}

const DIMENSION_RULES: Record<string, DimensionRule> = {
  '1151': {
    entityType: JournalEntityType.CUSTOMER,
    entityRequired: true,
    projectRequired: false,
    projectOptional: true,
    label: 'Customer',
  },
  '2111': {
    entityType: JournalEntityType.SUPPLIER,
    entityRequired: true,
    projectRequired: false,
    projectOptional: true,
    label: 'Supplier',
  },
  '2113': {
    entityType: JournalEntityType.SUPPLIER,
    entityRequired: true,
    projectRequired: false,
    projectOptional: true,
    label: 'Supplier',
  },
  '1161': {
    entityType: JournalEntityType.EMPLOYEE,
    entityRequired: true,
    projectRequired: false,
    projectOptional: true,
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
  '1121': {
    entityType: JournalEntityType.TREASURY,
    entityRequired: false,
    projectRequired: false,
    label: 'Treasury',
  },
  '1122': {
    entityType: JournalEntityType.TREASURY,
    entityRequired: false,
    projectRequired: false,
    label: 'Treasury',
  },
  '1123': {
    entityType: JournalEntityType.TREASURY,
    entityRequired: false,
    projectRequired: false,
    label: 'Treasury',
  },
  '1131': {
    entityType: JournalEntityType.TREASURY,
    entityRequired: false,
    projectRequired: false,
    label: 'Treasury',
  },
  '1132': {
    entityType: JournalEntityType.TREASURY,
    entityRequired: false,
    projectRequired: false,
    label: 'Treasury',
  },
}

const PARTY_LINE_LABELS: Record<AccountPartyType, string> = {
  customer: 'Customer',
  supplier: 'Supplier',
  employee: 'Employee',
  other: 'Party',
}

/** Direct Project Cost (COGS). Every head opened under it needs a project. */
export const PROJECT_COST_GROUP_CODE = '5100'

type AccountTreeNode = Pick<Account, 'code' | 'parentCode'> &
  Partial<Pick<Account, 'employeeExpenseKind' | 'partyType'>>

type AccountTree =
  | ReadonlyMap<string, AccountTreeNode>
  | ReadonlyArray<AccountTreeNode>

function accountTreeMap(
  accounts: AccountTree,
): ReadonlyMap<string, AccountTreeNode> {
  return 'get' in accounts
    ? accounts
    : new Map(accounts.map((row) => [row.code, row]))
}

/** True when the account's parent chain reaches 5100, at any depth. */
export function isProjectCostAccount(
  accountCode: string,
  accounts: AccountTree,
): boolean {
  const byCode = accountTreeMap(accounts)
  const seen = new Set<string>()
  let parent = byCode.get(accountCode)?.parentCode ?? null
  while (parent && !seen.has(parent)) {
    if (parent === PROJECT_COST_GROUP_CODE) return true
    seen.add(parent)
    parent = byCode.get(parent)?.parentCode ?? null
  }
  return false
}

export function dimensionRuleForAccount(
  accountCode: string,
  accounts?: AccountTree,
): DimensionRule {
  let rule: DimensionRule = DIMENSION_RULES[accountCode] ?? {
    entityType: null,
    entityRequired: false,
    projectRequired: false,
    label: '',
  }
  if (!accounts) return rule
  const partyType = accountTreeMap(accounts).get(accountCode)?.partyType
  if (!rule.entityType && partyType) {
    rule = {
      ...rule,
      entityType: partyType,
      entityRequired: false,
      projectOptional: true,
      label: PARTY_LINE_LABELS[partyType],
    }
  }
  if (
    !rule.entityType &&
    accountTreeMap(accounts).get(accountCode)?.employeeExpenseKind
  ) {
    rule = {
      ...rule,
      entityType: JournalEntityType.EMPLOYEE,
      entityRequired: false,
      label: 'Employee',
    }
  }
  if (!rule.projectRequired && isProjectCostAccount(accountCode, accounts)) {
    rule = { ...rule, projectRequired: true, label: rule.label || 'Project' }
  }
  return rule
}

export type JournalWriteBody = {
  date: string
  memo: string
  reference?: string
  journalType?: string
  intent?: 'draft' | 'post'
  projectId?: string
  approvalId?: string
  overrideSupplierPayable?: boolean
  overrideReason?: string
  chequeNumber?: string
  /** A date after today posts the bank side to PDC Receivable / Payable. */
  chequeDate?: string
  /** Company chequebook leaf being issued; the server marks it used on posting. */
  chequeLeafId?: string
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

export const JOURNAL_LINE_DESCRIPTION_MAX = 400

/** Date and line notes are the only fields a posted journal can change. */
export type PostedJournalDetailsBody = {
  date?: string
  lines?: Array<{ index: number; description?: string }>
}

export type PostedJournalEditability = {
  id: string
  editable: boolean
  dateLockedReason: string | null
}

export function money(value: number): string {
  return value.toLocaleString('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
