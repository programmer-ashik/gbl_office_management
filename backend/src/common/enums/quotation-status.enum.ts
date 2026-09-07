export enum QuotationStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export const QUOTATION_STATUS_LABEL: Record<QuotationStatus, string> = {
  [QuotationStatus.DRAFT]: 'Draft',
  [QuotationStatus.SENT]: 'Sent',
  [QuotationStatus.APPROVED]: 'Approved',
  [QuotationStatus.REJECTED]: 'Rejected',
}
