import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { MetricCard } from '../components/MetricCard'
import { Modal, Select } from '../components/ui'
import { money } from '../types/accounting'
import { Role } from '../types/auth'
import {
  BILL_PAYMENT_LABEL,
  PAYMENT_STATUS_LABEL,
  type SupplierBill,
  type SupplierPayment,
} from '../types/ar-ap'
import {
  TREASURY_KIND_LABEL,
  type TreasuryAccount,
} from '../types/banking'
import type { Supplier } from '../types/procurement'

function asList<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : []
}

function formatDate(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '—'
}

function treasuryOptionLabel(row: TreasuryAccount): string {
  const kind = TREASURY_KIND_LABEL[row.kind] ?? row.kind
  return `${row.name} · ${kind} · ${row.glAccountCode} · ${money(row.bookBalance ?? 0)}`
}

type PayableConfirm = {
  kind: 'schedule' | 'execute'
  paymentId?: string
  supplierId: string
  supplierName: string
  outstanding: number
  amount: number
  warning: string | null
  needsOverride: boolean
}

export function PayablesPage() {
  const { user } = useAuth()
  const canOverridePayable = user?.role === Role.ADMIN

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
  const [loading, setLoading] = useState(true)
  const [payableConfirm, setPayableConfirm] = useState<PayableConfirm | null>(null)
  const [overrideReason, setOverrideReason] = useState('')
  const [confirmError, setConfirmError] = useState<string | null>(null)

  async function load() {
    const [billRows, paymentRows, supplierRows, channels] = await Promise.all([
      api.supplierBills(),
      api.supplierPayments(),
      api.suppliers(),
      api.treasury(),
    ])
    const billsList = asList<SupplierBill>(billRows)
    const paymentsList = asList<SupplierPayment>(paymentRows)
    const supplierList = asList<Supplier>(supplierRows)
    const treasuryList = asList<TreasuryAccount>(channels)

    setBills(billsList)
    setPayments(paymentsList)
    setSuppliers(supplierList)
    setTreasury(treasuryList)
    if (!supplierId && supplierList[0]) {
      setSupplierId(supplierList[0].id)
    }
    const preferredCash =
      treasuryList.find(
        (row) =>
          row.isActive &&
          (row.kind === 'cash' ||
            row.kind === 'petty_cash' ||
            row.glAccountCode === '1111'),
      ) ?? treasuryList.find((row) => row.isActive)
    if (!billTreasuryId && preferredCash) {
      setBillTreasuryId(preferredCash.id)
    }
    if (!payTreasuryId && preferredCash) {
      setPayTreasuryId(preferredCash.id)
    }
  }

  useEffect(() => {
    setLoading(true)
    load()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load payables')
      })
      .finally(() => setLoading(false))
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
    const amount = Number(payAmount)
    if (!(amount > 0)) {
      setError('Enter a valid payment amount')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const ledger = await api.vendorLedger(supplierId)
      const outstanding = ledger.outstanding ?? 0
      const supplierName =
        ledger.supplier?.name ||
        suppliers.find((row) => row.id === supplierId)?.name ||
        'Supplier'
      let warning: string | null = null
      let needsOverride = false
      if (outstanding <= 0) {
        warning =
          'This supplier has no outstanding payable to us. Payment/journal entry cannot be made without an outstanding payable.'
        needsOverride = true
      } else if (amount > outstanding) {
        warning = `Supplier's outstanding payable is ${money(outstanding)}, but you are entering ${money(amount)}. You cannot pay more than the outstanding payable.`
        needsOverride = true
      }
      setOverrideReason('')
      setConfirmError(null)
      setPayableConfirm({
        kind: 'schedule',
        supplierId,
        supplierName,
        outstanding,
        amount,
        warning,
        needsOverride,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load supplier payable')
    } finally {
      setSaving(false)
    }
  }

  async function onExecute(paymentId: string) {
    const payment = payments.find((row) => row.id === paymentId)
    if (!payment) return
    setSaving(true)
    setError(null)
    try {
      const ledger = await api.vendorLedger(payment.supplierId)
      const outstanding = ledger.outstanding ?? 0
      const amount = payment.amount
      let warning: string | null = null
      let needsOverride = false
      if (outstanding <= 0) {
        warning =
          'This supplier has no outstanding payable to us. Payment/journal entry cannot be made without an outstanding payable.'
        needsOverride = true
      } else if (amount > outstanding) {
        warning = `Supplier's outstanding payable is ${money(outstanding)}, but you are entering ${money(amount)}. You cannot pay more than the outstanding payable.`
        needsOverride = true
      }
      setOverrideReason('')
      setConfirmError(null)
      setPayableConfirm({
        kind: 'execute',
        paymentId,
        supplierId: payment.supplierId,
        supplierName: payment.supplierName,
        outstanding,
        amount,
        warning,
        needsOverride,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load supplier payable')
    } finally {
      setSaving(false)
    }
  }

  async function confirmPayableAction() {
    if (!payableConfirm) return
    if (payableConfirm.needsOverride && !canOverridePayable) {
      setConfirmError(payableConfirm.warning)
      return
    }
    if (payableConfirm.needsOverride && overrideReason.trim().length < 5) {
      setConfirmError('Override reason is required (at least 5 characters).')
      return
    }
    setSaving(true)
    setConfirmError(null)
    setError(null)
    try {
      const override =
        payableConfirm.needsOverride && canOverridePayable
          ? {
              overridePayable: true,
              overrideReason: overrideReason.trim(),
            }
          : {}
      if (payableConfirm.kind === 'schedule') {
        await api.scheduleSupplierPayment({
          supplierId: payableConfirm.supplierId,
          amount: payableConfirm.amount,
          treasuryId: payTreasuryId,
          scheduledDate: payScheduledDate,
          memo: payMemo || undefined,
          ...override,
        })
        setPayAmount('')
        setPayMemo('')
        setPayModalOpen(false)
      } else if (payableConfirm.paymentId) {
        await api.executeSupplierPayment(payableConfirm.paymentId, {
          date: executeDate,
          ...override,
        })
      }
      setPayableConfirm(null)
      setOverrideReason('')
      await load()
    } catch (err) {
      setConfirmError(
        err instanceof Error ? err.message : 'Unable to complete payment action',
      )
    } finally {
      setSaving(false)
    }
  }

  const scheduled = payments.filter((row) => row.status === 'scheduled')
  const openBills = bills.filter((row) => row.status === 'open')
  const openBillTotal = openBills.reduce((sum, row) => sum + (row.amount ?? 0), 0)
  const supplierOptions = suppliers.map((row) => ({
    value: row.id,
    label: `${row.supplierNumber} · ${row.name}`,
  }))
  const supplierNameOptions = suppliers.map((row) => ({
    value: row.id,
    label: row.name,
  }))
  const treasuryOptions = useMemo(
    () =>
      treasury
        .filter((row) => row.isActive)
        .map((row) => ({
          value: row.id,
          label: treasuryOptionLabel(row),
        })),
    [treasury],
  )

  const selectedBillTreasury = useMemo(
    () => treasury.find((row) => row.id === billTreasuryId),
    [treasury, billTreasuryId],
  )

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

      <section className="grid metric-card-grid">
        <MetricCard
          variant="amber"
          title="Open AP bills"
          value={money(openBillTotal)}
          meta="Credit bills outstanding (2111)"
        />
        <MetricCard
          variant="blue"
          title="Bills"
          value={bills.length}
          meta="Cash and credit supplier bills"
        />
        <MetricCard
          variant="teal"
          title="Payments"
          value={payments.length}
          meta={`${scheduled.length} scheduled`}
        />
      </section>

      <Modal
        open={billModalOpen}
        title="Supplier bill"
        description="Credit bills: Dr expense (5240) / Cr 2111. Cash bills: Dr expense / Cr 2111 then Dr 2111 / Cr bank (paid immediately — still visible on 2111). GRN receipts also credit 2111."
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
                  searchable
                  placeholder="Select treasury (Hand cash / Bank)"
                  required
                />
                {selectedBillTreasury ? (
                  <span className="muted">
                    Pays from {selectedBillTreasury.name} (
                    {selectedBillTreasury.glAccountCode}) — balance{' '}
                    {money(selectedBillTreasury.bookBalance ?? 0)}. Cash bills
                    credit this account.
                  </span>
                ) : null}
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
                searchable
                placeholder="Select treasury (Hand cash / Bank)"
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
              {saving ? 'Checking…' : 'Review & schedule'}
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </Modal>

      <Modal
        open={Boolean(payableConfirm)}
        title={
          payableConfirm?.kind === 'execute'
            ? 'Confirm supplier payment'
            : 'Confirm schedule payment'
        }
        description="Review outstanding payable before saving."
        onClose={() => {
          if (saving) return
          setPayableConfirm(null)
          setOverrideReason('')
          setConfirmError(null)
        }}
      >
        {payableConfirm ? (
          <div className="stack-form">
            <p>
              <strong>Supplier:</strong> {payableConfirm.supplierName}
            </p>
            <p>
              <strong>Current outstanding payable:</strong>{' '}
              {money(payableConfirm.outstanding)}
            </p>
            <p>
              <strong>Entry amount:</strong> {money(payableConfirm.amount)}
            </p>
            <p>
              <strong>Remaining payable after entry:</strong>{' '}
              {money(
                Math.max(0, payableConfirm.outstanding - payableConfirm.amount),
              )}
            </p>
            {payableConfirm.warning ? (
              <p className="form-error">{payableConfirm.warning}</p>
            ) : (
              <p className="muted">Amount is within outstanding payable.</p>
            )}
            {payableConfirm.needsOverride && canOverridePayable ? (
              <label>
                Admin override reason
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  rows={3}
                  required
                  minLength={5}
                  placeholder="Why is this payment allowed?"
                />
              </label>
            ) : null}
            {payableConfirm.needsOverride && !canOverridePayable ? (
              <p className="form-error">
                Only an Admin can override this block.
              </p>
            ) : null}
            {confirmError ? <p className="form-error">{confirmError}</p> : null}
            <div className="form-actions">
              <button
                type="button"
                className="ghost"
                disabled={saving}
                onClick={() => {
                  setPayableConfirm(null)
                  setOverrideReason('')
                  setConfirmError(null)
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  saving ||
                  (payableConfirm.needsOverride && !canOverridePayable)
                }
                onClick={() => void confirmPayableAction()}
              >
                {saving
                  ? 'Saving…'
                  : payableConfirm.needsOverride
                    ? 'Override & continue'
                    : payableConfirm.kind === 'execute'
                      ? 'Confirm execute'
                      : 'Confirm schedule'}
              </button>
            </div>
          </div>
        ) : null}
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
                  <td>{formatDate(row.scheduledDate)}</td>
                  <td>{money(row.amount ?? 0)}</td>
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
                <td>{BILL_PAYMENT_LABEL[row.paymentType] ?? row.paymentType}</td>
                <td>{formatDate(row.dueDate)}</td>
                <td>{money(row.amount ?? 0)}</td>
                <td>
                  <span className={`status-pill status-${row.status}`}>
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
            {bills.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  {loading
                    ? 'Loading bills…'
                    : error
                      ? 'Unable to load bills. Check the error below.'
                      : 'No supplier bills yet. Use Add bill, or receive a PO to accrue AP.'}
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
                    {PAYMENT_STATUS_LABEL[row.status] ?? row.status}
                  </span>
                </td>
                <td>{formatDate(row.executedDate)}</td>
                <td>{money(row.amount ?? 0)}</td>
              </tr>
            ))}
            {payments.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  {loading
                    ? 'Loading payments…'
                    : 'No payments yet. Schedule a payment against open supplier balances.'}
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
