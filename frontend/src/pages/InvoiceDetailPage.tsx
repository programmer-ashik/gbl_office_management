import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { Select } from '../components/ui'
import { money } from '../types/accounting'
import {
  INVOICE_STATUS_LABEL,
  INVOICE_TYPE_LABEL,
  type ClientInvoice,
  type InvoiceCollection,
} from '../types/ar-ap'
import type { TreasuryAccount } from '../types/banking'
import { MetricCard } from '../components/MetricCard'

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [row, setRow] = useState<ClientInvoice | null>(null)
  const [collections, setCollections] = useState<InvoiceCollection[]>([])
  const [treasury, setTreasury] = useState<TreasuryAccount[]>([])
  const [treasuryId, setTreasuryId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    if (!id) return
    const [invoice, paymentRows, channels] = await Promise.all([
      api.invoice(id),
      api.invoiceCollections(id),
      api.treasury(),
    ])
    setRow(invoice)
    setCollections(paymentRows)
    setTreasury(channels)
    if (!treasuryId && channels[0]) {
      setTreasuryId(channels[0].id)
    }
    if (!amount && invoice.openAmount > 0) {
      setAmount(String(invoice.openAmount))
    }
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load invoice')
    })
  }, [id])

  async function onCollect(event: FormEvent) {
    event.preventDefault()
    if (!id || !treasuryId) return
    setSaving(true)
    setError(null)
    try {
      await api.collectInvoice(id, {
        amount: Number(amount),
        treasuryId,
        date,
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to record collection')
    } finally {
      setSaving(false)
    }
  }

  if (!row) {
    return error ? <p className="form-error">{error}</p> : <p className="muted">Loading…</p>
  }

  const canCollect = row.openAmount > 0 && row.status !== 'paid' && row.status !== 'void'

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{row.invoiceNumber}</p>
          <h1>{row.clientName}</h1>
          <p className="muted">
            {row.projectCode} · {INVOICE_TYPE_LABEL[row.type]}
            {row.milestoneLabel ? ` · ${row.milestoneLabel}` : ''}
          </p>
        </div>
        <Link to="/receivables" className="ghost-link">
          Receivables
        </Link>
      </header>

      <section className="grid metric-card-grid">
        <MetricCard
          variant="blue"
          title="Invoiced"
          value={money(row.amount)}
          meta={`Journal ${row.journalNumber}`}
        />
        <MetricCard
          variant="green"
          title="Collected"
          value={money(row.paidAmount)}
        />
        <MetricCard
          variant="amber"
          title="Open"
          value={money(row.openAmount)}
          meta={
            <span className={`status-pill status-${row.status}`}>
              {INVOICE_STATUS_LABEL[row.status]}
            </span>
          }
        />
      </section>

      {canCollect ? (
        <section className="table-card">
          <h2>Record collection</h2>
          <p className="muted">
            Dr treasury / Cr Accounts Receivable (1100). Partial collections are supported.
          </p>
          <form className="stack-form" onSubmit={(event) => void onCollect(event)}>
            <div className="name-row">
              <label>
                Treasury account
                <Select
                  value={treasuryId}
                  onChange={setTreasuryId}
                  options={treasury.map((channel) => ({
                    value: channel.id,
                    label: `${channel.name} (${channel.glAccountCode})`,
                  }))}
                  placeholder="Select treasury"
                  required
                />
              </label>
              <label>
                Amount
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </label>
              <label>
                Date
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </label>
            </div>
            <button type="submit" disabled={saving || !treasuryId}>
              {saving ? 'Posting…' : 'Record collection'}
            </button>
          </form>
        </section>
      ) : null}

      <section className="table-card">
        <h2>Collections</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Reference</th>
              <th>Treasury</th>
              <th>Journal</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {collections.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.date.slice(0, 10)}</td>
                <td>{entry.collectionNumber}</td>
                <td>{entry.treasuryAccountCode}</td>
                <td>{entry.journalNumber}</td>
                <td>{money(entry.amount)}</td>
              </tr>
            ))}
            {collections.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No collections recorded yet.
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
