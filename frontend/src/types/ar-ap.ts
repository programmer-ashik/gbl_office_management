export const InvoiceType = {
  MILESTONE: 'milestone',
  LUMP_SUM: 'lump_sum',
} as const
export type InvoiceType = (typeof InvoiceType)[keyof typeof InvoiceType]
export const INVOICE_TYPE_LABEL: Record<InvoiceType, string> = {
  milestone: 'Milestone',
  lump_sum: 'Lump sum',
}

export const InvoiceStatus = {
  ISSUED: 'issued',
  PARTIAL: 'partial',
  PAID: 'paid',
  OVERDUE: 'overdue',
  VOID: 'void',
} as const
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus]
export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  issued: 'Issued',
  partial: 'Partial',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
}

export const BillPaymentType = {
  CASH: 'cash',
  CREDIT: 'credit',
} as const
export type BillPaymentType = (typeof BillPaymentType)[keyof typeof BillPaymentType]
export const BILL_PAYMENT_LABEL: Record<BillPaymentType, string> = {
  cash: 'Cash',
  credit: 'Credit',
}

export const BillStatus = {
  PAID: 'paid',
  OPEN: 'open',
  VOID: 'void',
} as const
export type BillStatus = (typeof BillStatus)[keyof typeof BillStatus]

export const SupplierPaymentStatus = {
  SCHEDULED: 'scheduled',
  EXECUTED: 'executed',
  CANCELLED: 'cancelled',
} as const
export type SupplierPaymentStatus =
  (typeof SupplierPaymentStatus)[keyof typeof SupplierPaymentStatus]
export const PAYMENT_STATUS_LABEL: Record<SupplierPaymentStatus, string> = {
  scheduled: 'Scheduled',
  executed: 'Executed',
  cancelled: 'Cancelled',
}

export const ApLedgerEntryType = {
  RECEIPT: 'receipt',
  RETURN: 'return',
  BILL: 'bill',
  PAYMENT: 'payment',
} as const
export type ApLedgerEntryType =
  (typeof ApLedgerEntryType)[keyof typeof ApLedgerEntryType]
export const AP_LEDGER_LABEL: Record<ApLedgerEntryType, string> = {
  receipt: 'Goods receipt',
  return: 'Return',
  bill: 'Supplier bill',
  payment: 'Payment',
}

export type ClientInvoice = {
  id: string
  invoiceNumber: string
  type: InvoiceType
  status: InvoiceStatus
  projectId: string
  projectCode: string
  projectName: string
  clientName: string
  clientEmail: string | null
  date: string
  dueDate: string
  description: string
  milestoneLabel: string | null
  amount: number
  paidAmount: number
  openAmount: number
  journalNumber: string
  isOverdue: boolean
}

export type InvoiceCollection = {
  id: string
  collectionNumber: string
  invoiceId: string
  invoiceNumber: string
  amount: number
  date: string
  treasuryAccountCode: string
  journalNumber: string
}

export type SupplierBill = {
  id: string
  billNumber: string
  paymentType: BillPaymentType
  status: BillStatus
  supplierId: string
  supplierNumber: string
  supplierName: string
  projectId: string | null
  projectCode: string | null
  projectName: string | null
  expenseAccountCode: string
  expenseAccountName: string
  date: string
  dueDate: string
  description: string
  amount: number
  treasuryAccountCode: string | null
  journalNumber: string
}

export type SupplierPayment = {
  id: string
  paymentNumber: string
  status: SupplierPaymentStatus
  supplierId: string
  supplierNumber: string
  supplierName: string
  amount: number
  scheduledDate: string | null
  executedDate: string | null
  treasuryAccountCode: string
  memo: string | null
  journalNumber: string | null
}

export type OverdueNotice = {
  invoiceId: string
  invoiceNumber: string
  projectCode: string
  clientName: string
  clientEmail: string | null
  dueDate: string
  daysPastDue: number
  openAmount: number
}

export type AgingBucketKey =
  | 'current'
  | 'days_1_30'
  | 'days_31_60'
  | 'days_61_90'
  | 'days_90_plus'

export type AgingLine = {
  id: string
  reference: string
  partyName: string
  date: string
  dueDate: string
  daysPastDue: number
  bucket: AgingBucketKey
  openAmount: number
}

export type AgingBucket = {
  key: AgingBucketKey
  label: string
  amount: number
  lines: AgingLine[]
}

export type AgingReport = {
  asOf: string
  total: number
  buckets: AgingBucket[]
}

export type VendorLedger = {
  supplier: {
    id: string
    supplierNumber: string
    name: string
    paymentTermsDays: number
  }
  purchased: number
  returned: number
  billed: number
  paid: number
  outstanding: number
  entries: Array<{
    id: string
    date: string
    type: ApLedgerEntryType
    reference: string
    poNumber: string | null
    journalNumber: string
    amount: number
    runningOutstanding: number
  }>
}
