/** Cross-tab handoff: quotation product picker → quotations/new */
export const QUOTATION_PRODUCT_SELECTION_KEY = 'gbl-quotation-product-selection'

export type QuotationSelectedProduct = {
  productId: string
  productName: string
  unitPrice?: number
}

export type QuotationProductSelectionPayload = {
  ts: number
  products: QuotationSelectedProduct[]
}

export function writeQuotationProductSelection(
  products: QuotationSelectedProduct[],
) {
  const payload: QuotationProductSelectionPayload = {
    ts: Date.now(),
    products,
  }
  localStorage.setItem(QUOTATION_PRODUCT_SELECTION_KEY, JSON.stringify(payload))
}

export function readQuotationProductSelection(): QuotationProductSelectionPayload | null {
  try {
    const raw = localStorage.getItem(QUOTATION_PRODUCT_SELECTION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as QuotationProductSelectionPayload
  } catch {
    return null
  }
}

export function clearQuotationProductSelection() {
  localStorage.removeItem(QUOTATION_PRODUCT_SELECTION_KEY)
}
