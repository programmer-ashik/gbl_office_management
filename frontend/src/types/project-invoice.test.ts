import { describe, expect, it } from 'vitest'
import { quotationTotalsPreview } from './quotation'
import {
  DEFAULT_INVOICE_VAT_RATE,
  emptyInvoiceLine,
  grossUpTotals,
  invoiceSummaryRows,
  invoiceTotals,
  normalizeInvoiceDraft,
  type ProjectInvoiceDraft,
} from './project-invoice'

function draft(overrides: Partial<ProjectInvoiceDraft> = {}): ProjectInvoiceDraft {
  return normalizeInvoiceDraft({
    invoiceNumber: 'DRAFT-P1',
    invoiceId: null,
    date: '2026-09-29',
    dueDate: '2026-10-29',
    currency: '$',
    currencyCode: 'USD',
    companyName: 'GBL',
    companyAddress: '',
    companyEmail: '',
    companyPhone: '',
    logoUrl: null,
    billToName: 'Client',
    client: 'Client',
    phone: '',
    email: '',
    address: '',
    taxRate: DEFAULT_INVOICE_VAT_RATE,
    discountRate: 0,
    percentMode: 'reverse',
    lines: [emptyInvoiceLine({ title: 'Item', description: '', unitPrice: 100, quantity: 1 })],
    textBoxes: [],
    ...overrides,
  } as ProjectInvoiceDraft)
}

describe('project invoice gross-up VAT & Tax', () => {
  it('price 100 at 15% gives VAT & Tax 17.65 and total 117.65', () => {
    const totals = invoiceTotals(draft())
    expect(totals.subtotal).toBe(100)
    expect(totals.taxAmount).toBe(17.65)
    expect(totals.grandTotal).toBe(117.65)
  })

  it('matches the quotation gross-up for the same amounts', () => {
    for (const [net, rate] of [
      [100, 15],
      [109_000, 15],
      [2_345.67, 7.5],
      [50, 0],
    ] as const) {
      const quote = quotationTotalsPreview(net, rate)
      const invoice = grossUpTotals(net, rate)
      expect(invoice.taxAmount).toBe(quote.taxAmount)
      expect(invoice.grandTotal).toBe(quote.grandTotal)
    }
  })

  it('applies the discount before grossing up', () => {
    const totals = invoiceTotals(draft({ discountRate: 10 }))
    expect(totals.taxableAmount).toBe(90)
    expect(totals.grandTotal).toBe(105.88)
    expect(totals.taxAmount).toBe(15.88)
  })

  it('defaults a missing tax rate to 15% and labels the row VAT & Tax', () => {
    const legacy = draft({ taxRate: undefined as unknown as number })
    expect(legacy.taxRate).toBe(15)
    const taxRow = invoiceSummaryRows(legacy).find((row) => row.label.startsWith('VAT & Tax'))
    expect(taxRow).toEqual({ label: 'VAT & Tax (15%)', amount: 17.65 })
  })

  it('multiplies quantity × unit price before the gross-up', () => {
    const totals = invoiceTotals(
      draft({
        lines: [
          emptyInvoiceLine({ title: 'A', description: '', unitPrice: 100, quantity: 3 }),
          emptyInvoiceLine({ title: 'B', description: '', unitPrice: 50, quantity: 2 }),
        ],
      }),
    )
    expect(totals.subtotal).toBe(400)
    expect(totals.taxAmount).toBe(70.59)
    expect(totals.grandTotal).toBe(470.59)
  })
})
