import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { MetricCard } from '../components/MetricCard'
import { Select } from '../components/ui'
import { money } from '../types/accounting'
import { Role } from '../types/auth'
import {
  TREASURY_KIND_LABEL,
  type TreasuryAccount,
} from '../types/banking'
import {
  PO_STATUS_LABEL,
  PURCHASE_DESTINATION_LABEL,
  qty,
  type PurchaseOrder,
} from '../types/procurement'

type PaymentMethod = 'due' | 'cash' | 'bank'

export function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const isFinance = user?.role === Role.ADMIN || user?.role === Role.ACCOUNTANT
  const [row, setRow] = useState<PurchaseOrder | null>(null)
  const [qtyByLine, setQtyByLine] = useState<Record<string, string>>({})
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('due')
  const [treasuryId, setTreasuryId] = useState('')
  const [treasury, setTreasury] = useState<TreasuryAccount[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    if (!id) return
    const order = await api.purchaseOrder(id)
    setRow(order)
    setQtyByLine((current) => {
      const next = { ...current }
      for (const line of order.lines) {
        if (!next[line.id]) {
          next[line.id] = String(line.outstandingQty || '')
        }
      }
      return next
    })
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load purchase order')
    })
  }, [id])

  useEffect(() => {
    if (!isFinance) return
    api
      .treasury()
      .then(setTreasury)
      .catch(() => setTreasury([]))
  }, [isFinance])

  const treasuryOptions = useMemo(() => {
    const filtered = treasury.filter((account) => {
      if (!account.isActive) return false
      if (paymentMethod === 'cash') {
        return account.kind === 'cash' || account.kind === 'petty_cash'
      }
      if (paymentMethod === 'bank') {
        return (
          account.kind === 'commercial_bank' || account.kind === 'mobile_banking'
        )
      }
      return false
    })
    return filtered.map((account) => ({
      value: account.id,
      label: `${account.name} · ${TREASURY_KIND_LABEL[account.kind]} · ${account.glAccountCode}`,
    }))
  }, [treasury, paymentMethod])

  useEffect(() => {
    if (paymentMethod === 'due') {
      setTreasuryId('')
      return
    }
    if (!treasuryOptions.some((opt) => opt.value === treasuryId)) {
      setTreasuryId(treasuryOptions[0]?.value ?? '')
    }
  }, [paymentMethod, treasuryOptions, treasuryId])

  function selectedLines() {
    if (!row) return []
    return row.lines
      .map((line) => ({
        lineId: line.id,
        quantity: Number(qtyByLine[line.id] || 0),
      }))
      .filter((line) => line.quantity > 0)
  }

  async function onReceive(event: FormEvent) {
    event.preventDefault()
    if (!id) return
    setSaving(true)
    setError(null)
    try {
      await api.receiveGoods(id, {
        date,
        paymentMethod,
        treasuryId:
          paymentMethod === 'due' ? undefined : treasuryId || undefined,
        lines: selectedLines(),
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to receive goods')
    } finally {
      setSaving(false)
    }
  }

  async function onReturn() {
    if (!id) return
    setSaving(true)
    setError(null)
    try {
      await api.returnGoods(id, { date, lines: selectedLines() })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to post return')
    } finally {
      setSaving(false)
    }
  }

  async function onCancel() {
    if (!id) return
    setSaving(true)
    setError(null)
    try {
      await api.cancelPurchaseOrder(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to cancel')
    } finally {
      setSaving(false)
    }
  }

  if (!row) {
    return error ? <p className="form-error">{error}</p> : <p className="muted">Loading…</p>
  }

  const canReceive = isFinance && (row.status === 'issued' || row.status === 'partial')
  const canReturn =
    isFinance && row.receivedAmount > 0 && row.status !== 'cancelled'
  const showQty = canReceive || canReturn

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{row.poNumber}</p>
          <h1>{row.supplierName}</h1>
          <p className="muted">
            {PURCHASE_DESTINATION_LABEL[row.destination]}
            {row.projectCode ? ` · ${row.projectCode}` : ''}
            {row.warehouseCode ? ` · ${row.warehouseCode}` : ''}
          </p>
        </div>
        <Link to="/procurement" className="ghost-link">
          All POs
        </Link>
      </header>

      <section className="grid metric-card-grid">
        <MetricCard
          variant="blue"
          title="Ordered"
          value={money(row.orderedAmount)}
          meta={PO_STATUS_LABEL[row.status]}
        />
        <MetricCard
          variant="teal"
          title="Received"
          value={money(row.receivedAmount)}
          meta={`Returns ${money(row.returnedAmount)}`}
        />
        <MetricCard
          variant="amber"
          title="Outstanding payable"
          value={money(row.outstandingPayable)}
          meta="Before supplier payment"
        />
      </section>

      <section className="table-card">
        <h2>Lines</h2>
        <form
          className="stack-form"
          onSubmit={(event) => {
            if (!canReceive) {
              event.preventDefault()
              return
            }
            void onReceive(event)
          }}
        >
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Ordered</th>
                <th>Received</th>
                <th>Returned</th>
                <th>Unit cost</th>
                {showQty ? <th>Qty now</th> : null}
              </tr>
            </thead>
            <tbody>
              {row.lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    {line.sku} · {line.name}
                  </td>
                  <td>
                    {qty(line.quantity)} {line.unit}
                  </td>
                  <td>{qty(line.receivedQty)}</td>
                  <td>{qty(line.returnedQty)}</td>
                  <td>{money(line.unitCost)}</td>
                  {showQty ? (
                    <td>
                      <input
                        inputMode="decimal"
                        value={qtyByLine[line.id] ?? ''}
                        onChange={(e) =>
                          setQtyByLine((current) => ({
                            ...current,
                            [line.id]: e.target.value,
                          }))
                        }
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {showQty ? (
            <>
              <div className="name-row">
                <label>
                  Date
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </label>
                {canReceive ? (
                  <label>
                    Payment method
                    <Select
                      value={paymentMethod}
                      onChange={(value) =>
                        setPaymentMethod(value as PaymentMethod)
                      }
                      options={[
                        { value: 'due', label: 'Due (Accounts payable)' },
                        { value: 'cash', label: 'Cash' },
                        { value: 'bank', label: 'Bank' },
                      ]}
                    />
                  </label>
                ) : null}
              </div>
              {canReceive && paymentMethod !== 'due' ? (
                <label>
                  {paymentMethod === 'cash' ? 'Cash account' : 'Bank account'}
                  <Select
                    value={treasuryId}
                    onChange={setTreasuryId}
                    options={
                      treasuryOptions.length > 0
                        ? treasuryOptions
                        : [{ value: '', label: 'No matching treasury channels' }]
                    }
                    searchable
                  />
                </label>
              ) : null}
              <div className="form-actions">
                {row.receivedAmount === 0 ? (
                  <button type="button" className="ghost" onClick={() => void onCancel()}>
                    Cancel PO
                  </button>
                ) : null}
                {canReturn ? (
                  <button type="button" className="ghost" onClick={() => void onReturn()}>
                    Return to vendor
                  </button>
                ) : null}
                {canReceive ? (
                  <button type="submit" disabled={saving}>
                    {saving ? 'Posting…' : 'Receive goods'}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </form>
      </section>

      {error ? <p className="form-error">{error}</p> : null}
    </>
  )
}
