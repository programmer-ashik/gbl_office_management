import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { MetricCard } from '../components/MetricCard'
import { money } from '../types/accounting'
import {
  AP_LEDGER_LABEL,
  type ApLedgerEntryType,
  type VendorLedger,
} from '../types/ar-ap'

function ledgerTypeLabel(type: ApLedgerEntryType | string): string {
  return AP_LEDGER_LABEL[type as ApLedgerEntryType] ?? type
}

export function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [row, setRow] = useState<VendorLedger | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .vendorLedger(id)
      .then((data) => {
        if (!cancelled) setRow(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setRow(null)
          setError(
            err instanceof Error ? err.message : 'Unable to load vendor ledger',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading && !row) {
    return <p className="muted">Loading…</p>
  }

  if (!row) {
    return error ? <p className="form-error">{error}</p> : <p className="muted">Loading…</p>
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{row.supplier.supplierNumber}</p>
          <h1>{row.supplier.name}</h1>
          <p className="muted">{row.supplier.paymentTermsDays}-day terms</p>
        </div>
        <div className="form-actions">
          <Link
            to={`/ledgers/2111?entityType=supplier&entityId=${encodeURIComponent(row.supplier.id)}`}
            className="ghost-link"
          >
            GL · Supplier Payables (2111)
          </Link>
          <Link to="/payables" className="ghost-link">
            Payables
          </Link>
          <Link to="/procurement" className="ghost-link">
            Procurement
          </Link>
        </div>
      </header>

      <section className="grid metric-card-grid">
        <MetricCard
          variant="blue"
          title="Purchases (GRN)"
          value={money(row.purchased ?? 0)}
        />
        <MetricCard
          variant="amber"
          title="Returns"
          value={money(row.returned ?? 0)}
        />
        <MetricCard
          variant="purple"
          title="Credit bills"
          value={money(row.billed ?? 0)}
        />
        <MetricCard variant="green" title="Paid" value={money(row.paid ?? 0)} />
        <MetricCard
          variant="red"
          title="Outstanding"
          value={money(row.outstanding ?? 0)}
          meta={<Link to="/payables">Schedule payment</Link>}
        />
      </section>

      <section className="table-card">
        <h2>Vendor ledger</h2>
        <p className="muted">
          Includes goods receipts, supplier bills (from Payables → Add bill), and
          payments. Bills post expense (often 5240) and{' '}
          <Link
            to={`/ledgers/2111?entityType=supplier&entityId=${encodeURIComponent(row.supplier.id)}`}
          >
            2111 Supplier Payables
          </Link>
          ; cash bills clear 2111 in the same journal (still visible there).
        </p>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Reference</th>
              <th>PO</th>
              <th>Journal</th>
              <th>Amount</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {row.entries.map((entry) => (
              <tr key={`${entry.type}-${entry.id}`}>
                <td>{entry.date.slice(0, 10)}</td>
                <td>{ledgerTypeLabel(entry.type)}</td>
                <td>{entry.reference}</td>
                <td>{entry.poNumber ?? '—'}</td>
                <td>{entry.journalNumber}</td>
                <td>{money(entry.amount ?? 0)}</td>
                <td>{money(entry.runningOutstanding ?? 0)}</td>
              </tr>
            ))}
            {row.entries.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  No receipts, bills, or payments yet for this supplier.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {error ? <p className="form-error">{error}</p> : null}
    </>
  )
}
