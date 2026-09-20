import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import { BalanceSheetDocument } from '../components/BalanceSheetDocument'
import type { BalanceSheetReport } from '../types/accounting'
import {
  defaultBalanceSheetTemplate,
  hydrateClientTemplate,
  type BalanceSheetTemplate,
} from '../types/report-template'
import {
  downloadBalanceSheetCsv,
  downloadBalanceSheetPdf,
} from '../utils/balanceSheetExport'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function endOfLastMonthIso(): string {
  const now = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))
  return d.toISOString().slice(0, 10)
}

function endOfLastQuarterIso(): string {
  const now = new Date()
  const month = now.getUTCMonth()
  const quarterStart = Math.floor(month / 3) * 3
  const d = new Date(Date.UTC(now.getUTCFullYear(), quarterStart, 0))
  return d.toISOString().slice(0, 10)
}

export function BalanceSheetPage() {
  const [asOfDate, setAsOfDate] = useState(todayIso)
  const [report, setReport] = useState<BalanceSheetReport | null>(null)
  const [template, setTemplate] = useState<BalanceSheetTemplate>(
    defaultBalanceSheetTemplate(),
  )
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async (date: string) => {
    setLoading(true)
    setError(null)
    try {
      const [nextReport, nextTemplate] = await Promise.all([
        api.balanceSheet(date),
        api.balanceSheetTemplate(),
      ])
      setReport(nextReport)
      setTemplate(
        hydrateClientTemplate(nextTemplate, defaultBalanceSheetTemplate()),
      )
    } catch (err: unknown) {
      setReport(null)
      setError(
        err instanceof Error ? err.message : 'Unable to load balance sheet',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(asOfDate)
  }, [asOfDate, load])

  async function onPdf() {
    if (!report) return
    setExporting(true)
    try {
      await downloadBalanceSheetPdf(report, template)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'PDF export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Statement of Financial Position</h1>
          <p className="muted">Balance sheet as of a selected date</p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            disabled={!report || exporting}
            onClick={() => void onPdf()}
          >
            Export PDF
          </button>
          <button
            type="button"
            disabled={!report}
            onClick={() => report && downloadBalanceSheetCsv(report, template)}
          >
            Export Excel
          </button>
        </div>
      </header>

      <form
        className="filter-bar"
        onSubmit={(event) => {
          event.preventDefault()
          void load(asOfDate)
        }}
      >
        <label>
          As of date
          <input
            type="date"
            value={asOfDate}
            onChange={(event) => setAsOfDate(event.target.value)}
          />
        </label>
        <button type="button" onClick={() => setAsOfDate(todayIso())}>
          Today
        </button>
        <button type="button" onClick={() => setAsOfDate(endOfLastMonthIso())}>
          End of last month
        </button>
        <button
          type="button"
          onClick={() => setAsOfDate(endOfLastQuarterIso())}
        >
          End of last quarter
        </button>
        {loading ? <span className="muted">Loading…</span> : null}
      </form>

      {error ? <p className="form-error">{error}</p> : null}

      {report ? (
        <BalanceSheetDocument report={report} template={template} />
      ) : null}
    </>
  )
}
