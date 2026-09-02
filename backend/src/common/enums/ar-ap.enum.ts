export enum InvoiceType {
  MILESTONE = 'milestone',
  LUMP_SUM = 'lump_sum',
}

export enum InvoiceStatus {
  ISSUED = 'issued',
  PARTIAL = 'partial',
  PAID = 'paid',
  OVERDUE = 'overdue',
  VOID = 'void',
}

export enum BillPaymentType {
  CASH = 'cash',
  CREDIT = 'credit',
}

export enum BillStatus {
  PAID = 'paid',
  OPEN = 'open',
}

export enum SupplierPaymentStatus {
  SCHEDULED = 'scheduled',
  EXECUTED = 'executed',
  CANCELLED = 'cancelled',
}

export enum ApLedgerEntryType {
  RECEIPT = 'receipt',
  RETURN = 'return',
  BILL = 'bill',
  PAYMENT = 'payment',
}

export enum ArLedgerEntryType {
  INVOICE = 'invoice',
  COLLECTION = 'collection',
}

export type AgingBucketKey =
  | 'current'
  | 'days_1_30'
  | 'days_31_60'
  | 'days_61_90'
  | 'days_90_plus';
