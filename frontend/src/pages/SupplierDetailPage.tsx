import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { money } from '../types/accounting'
import { VENDOR_LEDGER_LABEL, type VendorLedger } from '../types/procurement'

export function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [row, setRow] = useState<VendorLedger | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    api
      .vendorLedger(id)
      .then(setRow)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load vendor ledger')
      })
  }, [id])

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
        <Link to="/procurement" className="ghost-link">
          Procurement
        </Link>
      </header>

      <section className="grid">
        <article className="stat-card">
          <h3>Purchases (GRN)</h3>
          <p className="stat-value">{money(row.purchased)}</p>
        </article>
        <article className="stat-card">
          <h3>Returns</h3>
          <p className="stat-value">{money(row.returned)}</p>
        </article>
        <article className="stat-card">
          <h3>Credit bills</h3>
          <p className="stat-value">{money(row.billed)}</p>
        </article>
        <article className="stat-card">
          <h3>Paid</h3>
          <p className="stat-value">{money(row.paid)}</p>
        </article>
        <article className="stat-card">
          <h3>Outstanding</h3>
          <p className="stat-value">{money(row.outstanding)}</p>
          <p className="muted">
            <Link to="/payables">Schedule payment</Link>
          </p>
        </article>
      </section>

      <section className="table-card">
        <h2>Vendor ledger</h2>
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
              <tr key={entry.id}>
                <td>{entry.date.slice(0, 10)}</td>
                <td>{VENDOR_LEDGER_LABEL[entry.type]}</td>
                <td>{entry.reference}</td>
                <td>{entry.poNumber ?? '—'}</td>
                <td>{entry.journalNumber}</td>
                <td>{money(entry.amount)}</td>
                <td>{money(entry.runningOutstanding)}</td>
              </tr>
            ))}
            {row.entries.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  No receipts or returns yet.
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
