/** In-app handoff: product picker ↔ quotations/new */
export const QUOTATION_PRODUCT_SELECTION_KEY = 'gbl-quotation-product-selection'
export const QUOTATION_CREATE_DRAFT_KEY = 'gbl-quotation-create-draft'

export type QuotationSelectedProduct = {
  productId: string
  productName: string
  unitPrice?: number
}

export type QuotationProductSelectionPayload = {
  ts: number
  products: QuotationSelectedProduct[]
}

export type QuotationCreateDraft = {
  partyType: 'customer' | 'new_customer'
  partyId: string
  clientName: string
  clientPhone: string
  clientCompany: string
  taxRate: string
  notes: string
  terms: string
  lines: Array<{
    key: string
    productId: string
    productName: string
    unitPrice: string
    quantity: string
    discount: string
  }>
}

export function writeQuotationProductSelection(
  products: QuotationSelectedProduct[],
) {
  const payload: QuotationProductSelectionPayload = {
    ts: Date.now(),
    products,
  }
  sessionStorage.setItem(
    QUOTATION_PRODUCT_SELECTION_KEY,
    JSON.stringify(payload),
  )
}

export function readQuotationProductSelection(): QuotationProductSelectionPayload | null {
  try {
    const raw = sessionStorage.getItem(QUOTATION_PRODUCT_SELECTION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as QuotationProductSelectionPayload
  } catch {
    return null
  }
}

export function clearQuotationProductSelection() {
  sessionStorage.removeItem(QUOTATION_PRODUCT_SELECTION_KEY)
}

export function writeQuotationCreateDraft(draft: QuotationCreateDraft) {
  sessionStorage.setItem(QUOTATION_CREATE_DRAFT_KEY, JSON.stringify(draft))
}

export function readQuotationCreateDraft(): QuotationCreateDraft | null {
  try {
    const raw = sessionStorage.getItem(QUOTATION_CREATE_DRAFT_KEY)
    if (!raw) return null
    return JSON.parse(raw) as QuotationCreateDraft
  } catch {
    return null
  }
}

export function clearQuotationCreateDraft() {
  sessionStorage.removeItem(QUOTATION_CREATE_DRAFT_KEY)
}
