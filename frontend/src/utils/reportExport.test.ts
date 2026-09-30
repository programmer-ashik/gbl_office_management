import { describe, expect, it } from 'vitest'
import { type ReportExport } from './reportExport'

describe('report export payload', () => {
  it('keeps filter labels in the export contract', () => {
    const payload: ReportExport = {
      title: 'Purchase Invoice Record',
      filters: [{ label: 'From', value: '2026-01-01' }],
      headers: ['Bill'],
      rows: [['BILL-1']],
    }
    expect(payload.filters[0]?.label).toBe('From')
    expect(payload.rows).toHaveLength(1)
  })
})
