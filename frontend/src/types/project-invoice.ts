export type InvoiceTextAlign = 'left' | 'center' | 'right'

export type InvoiceLine = {
  id: string
  title: string
  description: string
  unitPrice: number
  quantity: number
  fontSize: number
  bold: boolean
  color: string
  align: InvoiceTextAlign
}

export type InvoiceTextBox = {
  id: string
  text: string
  x: number
  y: number
  width: number
  fontSize: number
  bold: boolean
  color: string
  align: InvoiceTextAlign
}

export type ProjectInvoiceDraft = {
  /** Heading printed at the top of the sheet and PDF. */
  documentTitle: string
  invoiceNumber: string
  invoiceId: string | null
  date: string
  dueDate: string
  currency: string
  currencyCode: string
  companyName: string
  companyAddress: string
  companyEmail: string
  companyPhone: string
  logoUrl: string | null
  billToName: string
  client: string
  phone: string
  email: string
  address: string
  taxRate: number
  discountRate: number
  /** Flat = VAT added on top. Reverse = gross-up: net ÷ ((100 − rate) ÷ 100). */
  percentMode: 'flat' | 'reverse'
  note: string
  showPaymentMethods: boolean
  paymentPaypal: string
  acceptCard: boolean
  authorizedLabel: string
  authorizedName: string
  authorizedTitle: string
  useDigitalSignature: boolean
  digitalSignatureDataUrl: string | null
  columnWidths: {
    item: number
    description: number
    unitPrice: number
    quantity: number
    total: number
  }
  lines: InvoiceLine[]
  textBoxes: InvoiceTextBox[]
}

export const INVOICE_CURRENCIES = [
  { code: 'USD', label: 'USD — US Dollar', symbol: 'US $', pdfSymbol: 'USD' },
  { code: 'BDT', label: 'BDT — Bangladeshi Taka', symbol: '৳', pdfSymbol: 'BDT' },
  { code: 'EUR', label: 'EUR — Euro', symbol: '€', pdfSymbol: 'EUR' },
  { code: 'GBP', label: 'GBP — British Pound', symbol: '£', pdfSymbol: 'GBP' },
  { code: 'AED', label: 'AED — UAE Dirham', symbol: 'AED', pdfSymbol: 'AED' },
  { code: 'SAR', label: 'SAR — Saudi Riyal', symbol: 'SAR', pdfSymbol: 'SAR' },
  { code: 'INR', label: 'INR — Indian Rupee', symbol: '₹', pdfSymbol: 'INR' },
  { code: 'CAD', label: 'CAD — Canadian Dollar', symbol: 'CA $', pdfSymbol: 'CAD' },
  { code: 'AUD', label: 'AUD — Australian Dollar', symbol: 'AU $', pdfSymbol: 'AUD' },
] as const

export type InvoiceCurrencyCode =
  (typeof INVOICE_CURRENCIES)[number]['code']

export function invoiceCurrencyByCode(code: string) {
  return (
    INVOICE_CURRENCIES.find((row) => row.code === code) ??
    INVOICE_CURRENCIES[0]
  )
}

export function formatInvoiceMoney(
  value: number,
  currencyCodeOrSymbol?: string,
): string {
  const amount = value.toLocaleString('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  if (!currencyCodeOrSymbol) return amount
  const known = invoiceCurrencyByCode(currencyCodeOrSymbol)
  if (known.code === currencyCodeOrSymbol) {
    return `${known.symbol} ${amount}`
  }
  return `${currencyCodeOrSymbol} ${amount}`
}

/** ASCII-safe labels for jsPDF (Helvetica cannot render ৳, ₹, etc.). */
export function formatInvoiceMoneyForPdf(
  value: number,
  currencyCode?: string,
): string {
  const amount = value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  if (!currencyCode) return amount
  const known = invoiceCurrencyByCode(currencyCode)
  return `${known.pdfSymbol} ${amount}`
}

export function newLineId(): string {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function newTextBoxId(): string {
  return `box-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function emptyInvoiceLine(
  partial?: Partial<InvoiceLine>,
): InvoiceLine {
  return {
    id: newLineId(),
    title: 'Project deliverable',
    description: '',
    unitPrice: 0,
    quantity: 1,
    fontSize: 13,
    bold: false,
    color: '#1a1a1a',
    align: 'left',
    ...partial,
  }
}

export function materialSpecDescription(parts: {
  brand?: string | null
  model?: string | null
  countryOfOrigin?: string | null
}): string {
  const bits = [parts.brand, parts.model, parts.countryOfOrigin]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
  return bits.length > 0 ? bits.join(', ') : ''
}

export function linesFromProjectMaterials(
  materials: Array<{
    name: string
    brand?: string | null
    model?: string | null
    countryOfOrigin?: string | null
    unitCost: number
    quantity: number
  }>,
  fallback?: { title: string; description: string; unitPrice: number },
): InvoiceLine[] {
  if (materials.length === 0) {
    return [
      emptyInvoiceLine({
        title: fallback?.title ?? 'Project deliverable',
        description: fallback?.description ?? '',
        unitPrice: fallback?.unitPrice ?? 0,
        quantity: 1,
        bold: true,
      }),
    ]
  }
  return materials.map((row) =>
    emptyInvoiceLine({
      title: row.name,
      description: materialSpecDescription(row),
      unitPrice: row.unitCost,
      quantity: row.quantity,
      bold: true,
    }),
  )
}

export function lineTotal(line: InvoiceLine): number {
  return Number((line.unitPrice * line.quantity).toFixed(2))
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** Same VAT & Tax rate quotations use (net 100 → tax 17.65 → total 117.65). */
export const DEFAULT_INVOICE_VAT_RATE = 15

/** Quotation gross-up: grand = net ÷ ((100 − rate) ÷ 100), tax = grand − net. */
export function grossUpTotals(netAmount: number, vatRate: number) {
  const net = round2(netAmount)
  const divisor = (100 - Math.max(vatRate || 0, 0)) / 100
  const grandTotal = divisor > 0 ? round2(net / divisor) : net
  return { net, taxAmount: round2(grandTotal - net), grandTotal }
}

/**
 * Both modes:
 *   discount      = subtotal × discountRate ÷ 100
 *   taxableAmount = subtotal − discount          (known net amount)
 * Flat (VAT added on top):
 *   taxAmount  = taxableAmount × vatRate ÷ 100
 *   grandTotal = taxableAmount + taxAmount
 * Reverse (gross-up — VAT is vatRate% of the grand total):
 *   divisor    = (100 − vatRate) ÷ 100
 *   grandTotal = taxableAmount ÷ divisor
 *   taxAmount  = grandTotal − taxableAmount
 */
export function invoiceTotals(draft: ProjectInvoiceDraft) {
  const subtotal = round2(
    draft.lines.reduce((sum, line) => sum + lineTotal(line), 0),
  )
  const mode = draft.percentMode === 'flat' ? 'flat' : 'reverse'
  const vatRate = Math.max(Number(draft.taxRate) || 0, 0)
  const discountRate = Math.max(Number(draft.discountRate) || 0, 0)

  const discount = round2((subtotal * discountRate) / 100)
  const taxableAmount = round2(subtotal - discount)

  const grandTotal =
    mode === 'reverse'
      ? grossUpTotals(taxableAmount, vatRate).grandTotal
      : round2(taxableAmount + (taxableAmount * vatRate) / 100)
  const taxAmount = round2(grandTotal - taxableAmount)

  return {
    subtotal,
    discount,
    taxableAmount,
    taxAmount,
    grandTotal,
    percentMode: mode,
  }
}

export type InvoiceSummaryRow = {
  label: string
  amount: number
  negative?: boolean
}

/** Summary rows shared by the on-screen invoice and the PDF (no "reverse" wording). */
export function invoiceSummaryRows(
  draft: ProjectInvoiceDraft,
): InvoiceSummaryRow[] {
  const totals = invoiceTotals(draft)
  const rows: InvoiceSummaryRow[] = [
    { label: 'SUBTOTAL', amount: totals.subtotal },
  ]
  rows.push({
    label: `Discount (${draft.discountRate || 0}%)`,
    amount: totals.discount,
    negative: true,
  })
  if (totals.discount > 0) {
    rows.push({ label: 'Taxable amount', amount: totals.taxableAmount })
  }
  rows.push({
    label: `VAT & Tax (${draft.taxRate || 0}%)`,
    amount: totals.taxAmount,
  })
  return rows
}

export function draftStorageKey(projectId: string): string {
  return `gbl-project-invoice:v9:${projectId}`
}

/**
 * Prefer v9; fall back to prior keys so existing local drafts still load.
 * Older drafts may carry flat tax, so they move to the quotation gross-up.
 */
export function readStoredInvoiceDraft(projectId: string): string | null {
  const current = localStorage.getItem(draftStorageKey(projectId))
  if (current) return current
  const legacyKeys = [
    `gbl-project-invoice:v8:${projectId}`,
    `gbl-project-invoice:v7:${projectId}`,
    `gbl-project-invoice:v6:${projectId}`,
    `gbl-project-invoice:v5:${projectId}`,
  ]
  for (const key of legacyKeys) {
    const raw = localStorage.getItem(key)
    if (!raw) continue
    try {
      return JSON.stringify({ ...JSON.parse(raw), percentMode: 'reverse' })
    } catch {
      return raw
    }
  }
  return null
}

export const defaultColumnWidths = {
  item: 22,
  description: 30,
  unitPrice: 16,
  quantity: 14,
  total: 18,
} as const

export const DEFAULT_INVOICE_TITLE = 'INVOICE / BILL'

export const INVOICE_TITLE_OPTIONS = [
  'INVOICE / BILL',
  'INVOICE',
  'BILL',
  'TAX INVOICE',
  'PROFORMA INVOICE',
] as const

export const DEFAULT_INVOICE_NOTE =
  'ALL PAYMENTS MUST BE MADE IN FULL WITHIN 30 DAYS. CONTACT FOR SUPPORT. THANK YOU FOR YOUR BUSINESS.'

export function defaultInvoiceExtras(): Pick<
  ProjectInvoiceDraft,
  | 'documentTitle'
  | 'showPaymentMethods'
  | 'paymentPaypal'
  | 'acceptCard'
  | 'authorizedLabel'
  | 'authorizedName'
  | 'authorizedTitle'
  | 'useDigitalSignature'
  | 'digitalSignatureDataUrl'
  | 'note'
> {
  return {
    documentTitle: DEFAULT_INVOICE_TITLE,
    note: DEFAULT_INVOICE_NOTE,
    showPaymentMethods: false,
    paymentPaypal: '',
    acceptCard: true,
    authorizedLabel: 'Authorized Signature',
    authorizedName: '',
    authorizedTitle: 'Authorized Officer',
    useDigitalSignature: false,
    digitalSignatureDataUrl: null,
  }
}

export function normalizeInvoiceDraft(
  raw: ProjectInvoiceDraft,
): ProjectInvoiceDraft {
  const extras = defaultInvoiceExtras()
  const currency =
    raw.currencyCode
      ? invoiceCurrencyByCode(raw.currencyCode)
      : INVOICE_CURRENCIES.find((row) => row.symbol === raw.currency) ??
        invoiceCurrencyByCode('USD')
  return {
    ...extras,
    ...raw,
    currencyCode: currency.code,
    currency: currency.symbol,
    percentMode: raw.percentMode === 'flat' ? 'flat' : 'reverse',
    taxRate: Number.isFinite(Number(raw.taxRate))
      ? Number(raw.taxRate)
      : DEFAULT_INVOICE_VAT_RATE,
    documentTitle:
      typeof raw.documentTitle === 'string' ? raw.documentTitle : extras.documentTitle,
    note: raw.note?.trim() ? raw.note : extras.note,
    showPaymentMethods: Boolean(raw.showPaymentMethods),
    acceptCard: raw.acceptCard !== false,
    authorizedLabel: raw.authorizedLabel || extras.authorizedLabel,
    authorizedName: raw.authorizedName ?? '',
    authorizedTitle: raw.authorizedTitle || extras.authorizedTitle,
    useDigitalSignature: Boolean(raw.useDigitalSignature),
    digitalSignatureDataUrl: raw.digitalSignatureDataUrl ?? null,
    columnWidths: {
      ...defaultColumnWidths,
      ...(raw.columnWidths ?? {}),
    },
    lines: (raw.lines ?? []).map((line) => ({
      ...emptyInvoiceLine(),
      ...line,
      id: line.id || newLineId(),
    })),
    textBoxes: raw.textBoxes ?? [],
  }
}
