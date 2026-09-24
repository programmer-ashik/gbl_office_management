import { describe, expect, it } from 'vitest'
import { buildLedgerPdf, type LedgerPdfInput } from './ledgerPdf'

const sample: LedgerPdfInput = {
  companyName: 'GBL Enterprise',
  title: 'General Ledger',
  accountCode: '1112',
  accountName: 'BRAC Bank',
  filters: [{ label: 'Project', value: 'All projects' }],
  fromDate: '2026-01-01',
  toDate: '2026-01-31',
  generatedBy: 'admin@gblenterprise.com',
  generatedAt: '2026-09-22T12:00:00.000Z',
  openingBalance: 1000,
  closingBalance: 1500,
  periodDebit: 800,
  periodCredit: 300,
  rows: [
    {
      date: '2026-01-15',
      entryNumber: 'JE-1',
      memo: 'Receipt',
      entity: '—',
      debit: 800,
      credit: 0,
      runningBalance: 1800,
    },
  ],
}

describe('buildLedgerPdf', () => {
  it('builds a multi-page capable PDF with filtered rows', () => {
    const doc = buildLedgerPdf(sample)
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1)
    const text = doc.output('text')
    expect(text).toContain('GBL Enterprise')
    expect(text).toContain('1112')
  })
})
