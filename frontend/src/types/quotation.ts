export const QuotationStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const

export type QuotationStatus =
  (typeof QuotationStatus)[keyof typeof QuotationStatus]

export const QUOTATION_STATUS_LABEL: Record<QuotationStatus, string> = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
}

export type QuotationItem = {
  id: string
  productId: string | null
  productName: string
  unitPrice: number
  quantity: number
  discount: number
  lineTotal: number
}

export type Quotation = {
  id: string
  quotationNumber: string
  projectId: string | null
  projectCode: string | null
  projectName: string | null
  createdBy: string
  createdByName: string
  clientInfo: {
    name: string
    phone: string | null
    company: string | null
  }
  items: QuotationItem[]
  subTotal: number
  taxRate: number
  taxAmount: number
  grandTotal: number
  status: QuotationStatus
  notes: string | null
  terms: string | null
  createdAt: string
  updatedAt: string
}

export type CreateQuotationBody = {
  projectId?: string
  clientInfo: {
    name: string
    phone?: string
    company?: string
  }
  items: Array<{
    productId?: string
    productName: string
    unitPrice: number
    quantity: number
    discount?: number
  }>
  taxRate?: number
  notes?: string
  terms?: string
  status?: QuotationStatus
}

export function lineTotalPreview(
  unitPrice: number,
  quantity: number,
  discount = 0,
): number {
  const gross = unitPrice * quantity
  return Number((gross * (1 - discount / 100)).toFixed(2))
}
