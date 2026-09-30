import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from '../../api/client'
import { money } from '../../types/accounting'
import type { ClientInvoice } from '../../types/ar-ap'
import type { Project } from '../../types/project'
import { ReportExportMenu } from '../../components/ReportExportMenu'

export function SalesInvoiceReportPage() {
  const [invoices, setInvoices] = useState<ClientInvoice[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [projectId, setProjectId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.invoices(),
      api.projects().catch(() => [] as Project[]),
    ])
      .then(([invoiceRows, projectRows]) => {
        setInvoices(Array.isArray(invoiceRows) ? invoiceRows : [])
        setProjects(projectRows)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load report')
      })
      .finally(() => setLoading(false))
  }, [])

  const rows = useMemo(() => {
    return invoices.filter((row) => {
      const day = row.date.slice(0, 10)
      if (fromDate && day < fromDate) return false
      if (toDate && day > toDate) return false
      if (projectId && row.projectId !== projectId) return false
      return true
    })
  }, [invoices, fromDate, toDate, projectId])

  const total = rows.reduce((sum, row) => sum + (row.amount ?? 0), 0)

  function exportPayload() {
    return {
      title: 'Sales Invoice',
      filters: [
        { label: 'From', value: fromDate || '—' },
        { label: 'To', value: toDate || '—' },
        {
          label: 'Project',
          value: projects.find((row) => row.id === projectId)?.name ?? 'All',
        },
      ],
      headers: ['Invoice', 'Date', 'Client', 'Project', 'Status', 'Amount'],
      rows: rows.map((row) => [
        row.invoiceNumber,
        row.date.slice(0, 10),
        row.clientName,
        row.projectName,
        row.status,
        money(row.amount),
      ]),
      totals: [['', '', '', '', 'Total', money(total)]],
    }
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Sales Invoice</h1>
          <p className="muted">Client invoices from receivables.</p>
        </div>
        <ReportExportMenu payload={exportPayload} disabled={loading} />
      </header>
      <section className="table-card">
        <form
          className="filter-bar"
          onSubmit={(event: FormEvent) => event.preventDefault()}
        >
          <label>
            From
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </label>
          <label>
            Project
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">All projects</option>
              {projects.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
        </form>
        {error ? <p className="form-error">{error}</p> : null}
        {loading ? <p className="muted">Loading…</p> : null}
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Date</th>
              <th>Client</th>
              <th>Project</th>
              <th>Status</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.invoiceNumber}</td>
                <td>{row.date.slice(0, 10)}</td>
                <td>{row.clientName}</td>
                <td>{row.projectName}</td>
                <td>{row.status}</td>
                <td className="num">{money(row.amount)}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No invoices match these filters.
                </td>
              </tr>
            ) : null}
            <tr>
              <td colSpan={5}>Total</td>
              <td className="num">{money(total)}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </>
  )
}
