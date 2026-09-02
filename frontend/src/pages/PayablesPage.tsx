import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { Modal, Select } from '../components/ui'
import { money } from '../types/accounting'
import {
  BILL_PAYMENT_LABEL,
  PAYMENT_STATUS_LABEL,
  type SupplierBill,
  type SupplierPayment,
} from '../types/ar-ap'
import type { TreasuryAccount } from '../types/banking'
import type { Supplier } from '../types/procurement'

export function PayablesPage() {
  const [bills, setBills] = useState<SupplierBill[]>([])
  const [payments, setPayments] = useState<SupplierPayment[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [treasury, setTreasury] = useState<TreasuryAccount[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [billType, setBillType] = useState<'cash' | 'credit'>('credit')
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10))
  const [billDueDate, setBillDueDate] = useState('')
  const [billAmount, setBillAmount] = useState('')
  const [billDescription, setBillDescription] = useState('')
  const [billTreasuryId, setBillTreasuryId] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payTreasuryId, setPayTreasuryId] = useState('')
  const [payScheduledDate, setPayScheduledDate] = useState(
    new Date().toISOString().slice(0, 10),
  )
  const [payMemo, setPayMemo] = useState('')
  const [executeDate, setExecuteDate] = useState(new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [billModalOpen, setBillModalOpen] = useState(false)
  const [payModalOpen, setPayModalOpen] = useState(false)

  async function load() {
    const [billRows, paymentRows, supplierRows, channels] = await Promise.all([
      api.supplierBills(),
      api.supplierPayments(),
      api.suppliers(),
      api.treasury(),
    ])
    setBills(billRows)
    setPayments(paymentRows)
    setSuppliers(supplierRows)
    setTreasury(channels)
    if (!supplierId && supplierRows[0]) {
      setSupplierId(supplierRows[0].id)
    }
    if (!billTreasuryId && channels[0]) {
      setBillTreasuryId(channels[0].id)
    }
    if (!payTreasuryId && channels[0]) {
      setPayTreasuryId(channels[0].id)
    }
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load payables')
    })
  }, [])

  async function onCreateBill(event: FormEvent) {
    event.preventDefault()
    if (!supplierId) return
    if (billType === 'cash' && !billTreasuryId) return
    setSaving(true)
    setError(null)
    try {
      await api.createSupplierBill({
        supplierId,
        paymentType: billType,
        date: billDate,
        dueDate: billType === 'credit' ? billDueDate || undefined : undefined,
        amount: Number(billAmount),
        description: billDescription,
        treasuryId: billType === 'cash' ? billTreasuryId : undefined,
      })
      setBillAmount('')
      setBillDescription('')
      setBillModalOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to record bill')
    } finally {
      setSaving(false)
    }
  }

  async function onSchedulePayment(event: FormEvent) {
    event.preventDefault()
    if (!supplierId || !payTreasuryId) return
    setSaving(true)
    setError(null)
    try {
      await api.scheduleSupplierPayment({
        supplierId,
        amount: Number(payAmount),
        treasuryId: payTreasuryId,
        scheduledDate: payScheduledDate,
        memo: payMemo || undefined,
      })
      setPayAmount('')
      setPayMemo('')
      setPayModalOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to schedule payment')
    } finally {
      setSaving(false)
    }
  }

  async function onExecute(paymentId: string) {
    setSaving(true)
    setError(null)
    try {
      await api.executeSupplierPayment(paymentId, { date: executeDate })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to execute payment')
    } finally {
      setSaving(false)
    }
  }

  const scheduled = payments.filter((row) => row.status === 'scheduled')
  const supplierOptions = suppliers.map((row) => ({
    value: row.id,
    label: `${row.supplierNumber} · ${row.name}`,
  }))
  const supplierNameOptions = suppliers.map((row) => ({
    value: row.id,
    label: row.name,
  }))
  const treasuryOptions = treasury.map((row) => ({
    value: row.id,
    label: row.name,
  }))

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Supplier bills & payments</h1>
        </div>
        <div className="form-actions">
          <Link to="/aging" className="ghost-link">
            Aging reports
          </Link>
          <button type="button" className="ghost" onClick={() => setPayModalOpen(true)}>
            Schedule payment
          </button>
          <button type="button" onClick={() => setBillModalOpen(true)}>
            Add bill
          </button>
        </div>
      </header>

      <Modal
        open={billModalOpen}
        title="Supplier bill"
        description="Credit bills accrue AP (2000). Cash bills pay immediately from treasury. GRN receipts from procurement also build AP."
        onClose={() => setBillModalOpen(false)}
        wide
      >
        <form className="stack-form" onSubmit={(event) => void onCreateBill(event)}>
          <div className="name-row">
            <label>
              Supplier
              <Select
                value={supplierId}
                onChange={setSupplierId}
                options={supplierOptions}
                placeholder="Select supplier"
                required
              />
            </label>
            <label>
              Payment
              <Select
                value={billType}
                onChange={(value) => setBillType(value as typeof billType)}
                options={[
                  { value: 'credit', label: 'Credit (AP)' },
                  { value: 'cash', label: 'Cash (immediate)' },
                ]}
              />
            </label>
            <label>
              Date
              <input
                type="date"
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
                required
              />
            </label>
          </div>
          <div className="name-row">
            {billType === 'credit' ? (
              <label>
                Due date
                <input
                  type="date"
                  value={billDueDate}
                  onChange={(e) => setBillDueDate(e.target.value)}
                />
              </label>
            ) : (
              <label>
                Treasury
                <Select
                  value={billTreasuryId}
                  onChange={setBillTreasuryId}
                  options={treasuryOptions}
                  placeholder="Select treasury"
                  required
                />
              </label>
            )}
            <label>
              Amount
              <input
                inputMode="decimal"
                value={billAmount}
                onChange={(e) => setBillAmount(e.target.value)}
                required
              />
            </label>
          </div>
          <label>
            Description
            <input
              value={billDescription}
              onChange={(e) => setBillDescription(e.target.value)}
              required
            />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={saving || !supplierId}>
              {saving ? 'Saving…' : 'Record bill'}
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </Modal>

      <Modal
        open={payModalOpen}
        title="Schedule supplier payment"
        description="Clears vendor outstanding (GRN + credit bills) with Dr AP / Cr treasury on execution."
        onClose={() => setPayModalOpen(false)}
        wide
      >
        <form className="stack-form" onSubmit={(event) => void onSchedulePayment(event)}>
          <div className="name-row">
            <label>
              Supplier
              <Select
                value={supplierId}
                onChange={setSupplierId}
                options={supplierNameOptions}
                placeholder="Select supplier"
                required
              />
            </label>
            <label>
              Amount
              <input
                inputMode="decimal"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                required
              />
            </label>
            <label>
              Treasury
              <Select
                value={payTreasuryId}
                onChange={setPayTreasuryId}
                options={treasuryOptions}
                placeholder="Select treasury"
                required
              />
            </label>
          </div>
          <div className="name-row">
            <label>
              Scheduled date
              <input
                type="date"
                value={payScheduledDate}
                onChange={(e) => setPayScheduledDate(e.target.value)}
              />
            </label>
            <label>
              Memo
              <input value={payMemo} onChange={(e) => setPayMemo(e.target.value)} />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" disabled={saving || !supplierId || !payTreasuryId}>
              {saving ? 'Scheduling…' : 'Schedule payment'}
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </Modal>

      {scheduled.length > 0 ? (
        <section className="table-card">
          <h2>Scheduled payments</h2>
          <div className="name-row">
            <label>
              Execute date
              <input
                type="date"
                value={executeDate}
                onChange={(e) => setExecuteDate(e.target.value)}
              />
            </label>
          </div>
          <table>
            <thead>
              <tr>
                <th>Payment</th>
                <th>Supplier</th>
                <th>Scheduled</th>
                <th>Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {scheduled.map((row) => (
                <tr key={row.id}>
                  <td>{row.paymentNumber}</td>
                  <td>
                    <Link to={`/suppliers/${row.supplierId}`}>{row.supplierName}</Link>
                  </td>
                  <td>{row.scheduledDate?.slice(0, 10) ?? '—'}</td>
                  <td>{money(row.amount)}</td>
                  <td>
                    <button
                      type="button"
                      className="ghost"
                      disabled={saving}
                      onClick={() => void onExecute(row.id)}
                    >
                      Execute
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="table-card">
        <h2>Recent bills</h2>
        <table>
          <thead>
            <tr>
              <th>Bill</th>
              <th>Supplier</th>
              <th>Type</th>
              <th>Due</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {bills.map((row) => (
              <tr key={row.id}>
                <td>{row.billNumber}</td>
                <td>
                  <Link to={`/suppliers/${row.supplierId}`}>{row.supplierName}</Link>
                </td>
                <td>{BILL_PAYMENT_LABEL[row.paymentType]}</td>
                <td>{row.dueDate.slice(0, 10)}</td>
                <td>{money(row.amount)}</td>
                <td>{row.status}</td>
              </tr>
            ))}
            {bills.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No supplier bills yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="table-card">
        <h2>Payment history</h2>
        <table>
          <thead>
            <tr>
              <th>Payment</th>
              <th>Supplier</th>
              <th>Status</th>
              <th>Executed</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((row) => (
              <tr key={row.id}>
                <td>{row.paymentNumber}</td>
                <td>{row.supplierName}</td>
                <td>
                  <span className={`status-pill status-${row.status}`}>
                    {PAYMENT_STATUS_LABEL[row.status]}
                  </span>
                </td>
                <td>{row.executedDate?.slice(0, 10) ?? '—'}</td>
                <td>{money(row.amount)}</td>
              </tr>
            ))}
            {payments.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No payments yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {!billModalOpen && !payModalOpen && error ? (
        <p className="form-error">{error}</p>
      ) : null}
    </>
  )
}
