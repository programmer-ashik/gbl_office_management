import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { MetricCard } from '../components/MetricCard'
import { Select } from '../components/ui'
import { money, type IncomeStatementReport } from '../types/accounting'
import type { Project } from '../types/project'
import {
  defaultBalanceSheetTemplate,
  hydrateClientTemplate,
  resolveAssetUrl,
  type BalanceSheetTemplate,
} from '../types/report-template'
import {
  INCOME_STATEMENT_TITLE,
  downloadIncomeStatementCsv,
  downloadIncomeStatementPdf,
  incomeStatementPeriod,
  incomeStatementRows,
} from '../utils/incomeStatementExport'

const NO_PROJECT = 'none'

const iso = (date: Date) => date.toISOString().slice(0, 10)

function presets() {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const q = Math.floor(m / 3) * 3
  return {
    thisMonth: { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(now) },
    lastMonth: {
      from: iso(new Date(Date.UTC(y, m - 1, 1))),
      to: iso(new Date(Date.UTC(y, m, 0))),
    },
    thisQuarter: { from: iso(new Date(Date.UTC(y, q, 1))), to: iso(now) },
    thisYear: { from: iso(new Date(Date.UTC(y, 0, 1))), to: iso(now) },
    lastYear: {
      from: iso(new Date(Date.UTC(y - 1, 0, 1))),
      to: iso(new Date(Date.UTC(y - 1, 11, 31))),
    },
  }
}

export function IncomeStatementPage() {
  const initial = presets().thisYear
  const [fromDate, setFromDate] = useState(initial.from)
  const [toDate, setToDate] = useState(initial.to)
  const [projectId, setProjectId] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [report, setReport] = useState<IncomeStatementReport | null>(null)
  const [template, setTemplate] = useState<BalanceSheetTemplate>(
    defaultBalanceSheetTemplate(),
  )
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    api
      .projects()
      .then(setProjects)
      .catch(() => setProjects([]))
    api
      .balanceSheetTemplate()
      .then((next) =>
        setTemplate(hydrateClientTemplate(next, defaultBalanceSheetTemplate())),
      )
      .catch(() => undefined)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setReport(
        await api.incomeStatement({
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          projectId: projectId || undefined,
        }),
      )
    } catch (err: unknown) {
      setReport(null)
      setError(err instanceof Error ? err.message : 'Unable to load income statement')
    } finally {
      setLoading(false)
    }
  }, [fromDate, toDate, projectId])

  useEffect(() => {
    void load()
  }, [load])

  const projectOptions = useMemo(
    () => [
      { value: '', label: 'Whole company' },
      { value: NO_PROJECT, label: 'No project (office)', keywords: 'none office overhead' },
      ...projects.map((project) => ({
        value: project.id,
        label: `${project.code} · ${project.name}`,
      })),
    ],
    [projects],
  )
  const scopeLabel =
    projectOptions.find((row) => row.value === projectId)?.label ?? 'Whole company'

  function applyPreset(range: { from: string; to: string }) {
    setFromDate(range.from)
    setToDate(range.to)
  }

  async function onPdf() {
    if (!report) return
    setExporting(true)
    try {
      await downloadIncomeStatementPdf(report, template, scopeLabel)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'PDF export failed')
    } finally {
      setExporting(false)
    }
  }

  const range = presets()
  const logo = resolveAssetUrl(template.companyLogoUrl)
  const ledgerQuery = new URLSearchParams()
  if (fromDate) ledgerQuery.set('fromDate', fromDate)
  if (toDate) ledgerQuery.set('toDate', toDate)
  const ledgerSuffix = ledgerQuery.toString() ? `?${ledgerQuery}` : ''

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Income Statement</h1>
          <p className="muted">Profit or loss for a selected period</p>
        </div>
        <div className="header-actions">
          <button type="button" disabled={!report || exporting} onClick={() => void onPdf()}>
            Export PDF
          </button>
          <button
            type="button"
            disabled={!report}
            onClick={() =>
              report &&
              downloadIncomeStatementCsv(report, template.headerConfig.companyName, scopeLabel)
            }
          >
            Export Excel
          </button>
        </div>
      </header>

      <form
        className="filter-bar"
        onSubmit={(event) => {
          event.preventDefault()
          void load()
        }}
      >
        <label>
          From date
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label>
          To date
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>
        <label>
          Project
          <Select
            value={projectId}
            onChange={setProjectId}
            options={projectOptions}
            searchable
            portal
          />
        </label>
        <button type="button" onClick={() => applyPreset(range.thisMonth)}>
          This month
        </button>
        <button type="button" onClick={() => applyPreset(range.lastMonth)}>
          Last month
        </button>
        <button type="button" onClick={() => applyPreset(range.thisQuarter)}>
          This quarter
        </button>
        <button type="button" onClick={() => applyPreset(range.thisYear)}>
          This year
        </button>
        <button type="button" onClick={() => applyPreset(range.lastYear)}>
          Last year
        </button>
        {loading ? <span className="muted">Loading…</span> : null}
      </form>

      {error ? <p className="form-error">{error}</p> : null}

      {report ? (
        <div className="bs-report bs-document bs-statement">
          {logo ? (
            <div className="bs-logo-block bs-logo-center">
              <img src={logo} alt="Company logo" className="bs-logo-img" />
            </div>
          ) : null}
          <header className="bs-doc-header">
            <h2 className="bs-doc-company">{template.headerConfig.companyName}</h2>
            <p className="bs-doc-title">{INCOME_STATEMENT_TITLE}</p>
            {template.headerConfig.address ? (
              <p className="muted bs-doc-meta">{template.headerConfig.address}</p>
            ) : null}
            <p className="muted bs-doc-meta">{incomeStatementPeriod(report)}</p>
            <p className="muted bs-doc-meta">{scopeLabel}</p>
          </header>

          <section className="grid metric-card-grid bs-kpi-grid">
            <MetricCard variant="green" title="Total Revenue" value={money(report.totalRevenue)} />
            <MetricCard variant="red" title="Total Expenses" value={money(report.totalExpenses)} />
            <MetricCard variant="teal" title="Gross Profit" value={money(report.grossProfit)} />
            <MetricCard
              variant="purple"
              title={report.netProfit < 0 ? 'Net Loss' : 'Net Profit'}
              value={money(report.netProfit)}
            />
          </section>

          <div className="table-card bs-column">
            <table className="bs-table">
              <colgroup>
                <col className="bs-col-account" />
                <col className="bs-col-amount" />
              </colgroup>
              <tbody>
                {incomeStatementRows(report).map((row, index) => {
                  const key = `${row.kind}-${row.code || row.name}-${index}`
                  if (row.kind === 'section') {
                    return (
                      <tr key={key} className="bs-statement-section">
                        <td colSpan={2}>{row.name}</td>
                      </tr>
                    )
                  }
                  if (row.kind === 'subtotal' || row.kind === 'total') {
                    return (
                      <tr key={key} className={`bs-statement-${row.kind}`}>
                        <td>{row.name}</td>
                        <td className="bs-amount">{money(row.amount ?? 0)}</td>
                      </tr>
                    )
                  }
                  const depth = Math.min(row.depth, 4)
                  const label = (
                    <>
                      <span className="bs-code">{row.code}</span>
                      <span className="bs-name">{row.name}</span>
                    </>
                  )
                  return (
                    <tr
                      key={key}
                      className={`${row.kind === 'header' ? 'bs-header-row' : 'bs-line-row'} bs-depth-${depth}`}
                    >
                      <td className="bs-cell-account">
                        {row.kind === 'line' ? (
                          <Link
                            to={`/ledgers/${row.code}${ledgerSuffix}`}
                            className="bs-drill"
                          >
                            {label}
                          </Link>
                        ) : (
                          label
                        )}
                      </td>
                      <td
                        className={
                          row.kind === 'header' ? 'bs-amount bs-amount-category' : 'bs-amount'
                        }
                      >
                        {money(row.amount ?? 0)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  )
}
