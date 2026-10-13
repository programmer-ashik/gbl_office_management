import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from '../../api/client'
import { money } from '../../types/accounting'
import type { SupplierBill } from '../../types/ar-ap'
import type { Supplier } from '../../types/procurement'
import type { Project } from '../../types/project'
import { ReportExportMenu } from '../../components/ReportExportMenu'

type Filters = {
  fromDate: string
  toDate: string
  supplierId: string
  projectId: string
}

export function PurchaseInvoiceReportPage() {
  const [bills, setBills] = useState<SupplierBill[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [filters, setFilters] = useState<Filters>({
    fromDate: '',
    toDate: '',
    supplierId: '',
    projectId: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.supplierBills(),
      api.suppliers().catch(() => [] as Supplier[]),
      api.projects().catch(() => [] as Project[]),
    ])
      .then(([billRows, supplierRows, projectRows]) => {
        setBills(Array.isArray(billRows) ? billRows : [])
        setSuppliers(supplierRows)
        setProjects(projectRows)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load report')
      })
      .finally(() => setLoading(false))
  }, [])

  const rows = useMemo(() => {
    return bills.filter((row) => {
      const day = row.date.slice(0, 10)
      if (filters.fromDate && day < filters.fromDate) return false
      if (filters.toDate && day > filters.toDate) return false
      if (filters.supplierId && row.supplierId !== filters.supplierId) return false
      if (filters.projectId && row.projectId !== filters.projectId) return false
      return true
    })
  }, [bills, filters])

  const total = rows.reduce((sum, row) => sum + (row.amount ?? 0), 0)

  function exportPayload() {
    return {
      title: 'Purchase Invoice Record',
      filters: [
        { label: 'From', value: filters.fromDate || '—' },
        { label: 'To', value: filters.toDate || '—' },
        {
          label: 'Supplier',
          value:
            suppliers.find((row) => row.id === filters.supplierId)?.name ??
            'All',
        },
        {
          label: 'Project',
          value:
            projects.find((row) => row.id === filters.projectId)?.name ?? 'All',
        },
      ],
      headers: ['Bill', 'Date', 'Supplier', 'Project', 'Type', 'Amount'],
      rows: rows.map((row) => [
        row.billNumber,
        row.date.slice(0, 10),
        row.supplierName,
        row.projectName ?? '—',
        row.paymentType,
        money(row.amount),
      ]),
      totals: [['', '', '', '', 'Total', money(total)]],
    }
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Purchase Invoice Record</h1>
          <p className="muted">Supplier bills from accounts payable.</p>
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
              value={filters.fromDate}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, fromDate: e.target.value }))
              }
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={filters.toDate}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, toDate: e.target.value }))
              }
            />
          </label>
          <label>
            Supplier
            <select
              value={filters.supplierId}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, supplierId: e.target.value }))
              }
            >
              <option value="">All suppliers</option>
              {suppliers.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Project
            <select
              value={filters.projectId}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, projectId: e.target.value }))
              }
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
              <th>Bill</th>
              <th>Date</th>
              <th>Supplier</th>
              <th>Project</th>
              <th>Type</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.billNumber}</td>
                <td>{row.date.slice(0, 10)}</td>
                <td>{row.supplierName}</td>
                <td>{row.projectName ?? '—'}</td>
                <td>{row.paymentType}</td>
                <td className="num">{money(row.amount)}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No bills match these filters.
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
