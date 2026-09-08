/** In-app handoff: product picker ↔ procurement/new */
export const PO_PRODUCT_SELECTION_KEY = 'gbl-po-product-selection'
export const PO_CREATE_DRAFT_KEY = 'gbl-po-create-draft'

export type PoSelectedProduct = {
  productId: string
  productName: string
  unitPrice?: number
}

export type PoProductSelectionPayload = {
  ts: number
  products: PoSelectedProduct[]
}

export type PoCreateDraft = {
  supplierId: string
  destination: string
  projectId: string
  warehouseId: string
  date: string
  notes: string
  lines: Array<{
    key: string
    itemId: string
    productName: string
    quantity: string
    unitCost: string
  }>
}

export function writePoProductSelection(products: PoSelectedProduct[]) {
  const payload: PoProductSelectionPayload = {
    ts: Date.now(),
    products,
  }
  sessionStorage.setItem(PO_PRODUCT_SELECTION_KEY, JSON.stringify(payload))
}

export function readPoProductSelection(): PoProductSelectionPayload | null {
  try {
    const raw = sessionStorage.getItem(PO_PRODUCT_SELECTION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PoProductSelectionPayload
  } catch {
    return null
  }
}

export function clearPoProductSelection() {
  sessionStorage.removeItem(PO_PRODUCT_SELECTION_KEY)
}

export function writePoCreateDraft(draft: PoCreateDraft) {
  sessionStorage.setItem(PO_CREATE_DRAFT_KEY, JSON.stringify(draft))
}

export function readPoCreateDraft(): PoCreateDraft | null {
  try {
    const raw = sessionStorage.getItem(PO_CREATE_DRAFT_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PoCreateDraft
  } catch {
    return null
  }
}

export function clearPoCreateDraft() {
  sessionStorage.removeItem(PO_CREATE_DRAFT_KEY)
}
