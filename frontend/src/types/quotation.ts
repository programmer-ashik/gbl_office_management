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
  dataSheetUrl: string | null
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

/**
 * Gross-up tax (back calculation): VAT is taxRate% of the grand total.
 *   divisor    = (100 − taxRate) ÷ 100
 *   grandTotal = subTotal ÷ divisor
 *   taxAmount  = grandTotal − subTotal
 * Mirrors backend quotations.service.ts grossUpTotalsMinor.
 */
export function quotationTotalsPreview(subTotal: number, taxRate: number) {
  const round2 = (value: number) =>
    Math.round((value + Number.EPSILON) * 100) / 100
  const sub = round2(subTotal)
  const divisor = (100 - Math.max(taxRate || 0, 0)) / 100
  const grandTotal = divisor > 0 ? round2(sub / divisor) : sub
  const taxAmount = round2(grandTotal - sub)
  return { subTotal: sub, taxAmount, grandTotal }
}

export function lineTotalPreview(
  unitPrice: number,
  quantity: number,
  discount = 0,
): number {
  const gross = unitPrice * quantity
  return Number((gross * (1 - discount / 100)).toFixed(2))
}
