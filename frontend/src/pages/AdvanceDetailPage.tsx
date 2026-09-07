import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Select } from '../components/ui'
import { money } from '../types/accounting'
import {
  ADVANCE_STATUS_LABEL,
  SETTLEMENT_CASE_LABEL,
  type Advance,
  type ExpenseAccountOption,
} from '../types/advance'
import { Role } from '../types/auth'
import type { TreasuryAccount } from '../types/banking'
import { MetricCard } from '../components/MetricCard'

type VoucherDraft = { accountCode: string; amount: string; description: string }

const emptyVoucher = (): VoucherDraft => ({
  accountCode: '',
  amount: '',
  description: '',
})

export function AdvanceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [row, setRow] = useState<Advance | null>(null)
  const [treasury, setTreasury] = useState<TreasuryAccount[]>([])
  const [expenses, setExpenses] = useState<ExpenseAccountOption[]>([])
  const [treasuryId, setTreasuryId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [vouchers, setVouchers] = useState<VoucherDraft[]>([emptyVoucher()])
  const [returnTreasuryId, setReturnTreasuryId] = useState('')
  const [ocrHint, setOcrHint] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const isFinance = user?.role === Role.ADMIN || user?.role === Role.ACCOUNTANT
  const isOwner = Boolean(user && row && user.id === row.employeeId)

  async function load() {
    if (!id) {
      return
    }
    const advance = await api.advance(id)
    setRow(advance)
    const [channels, accounts] = await Promise.all([
      isFinance ? api.treasury() : Promise.resolve([] as TreasuryAccount[]),
      api.expenseAccounts(),
    ])
    setTreasury(channels)
    setExpenses(accounts)
    if (!treasuryId && channels[0]) {
      setTreasuryId(channels[0].id)
      setReturnTreasuryId(channels[0].id)
    }
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load advance')
    })
  }, [id, isFinance])

  const spent = useMemo(
    () =>
      vouchers.reduce((sum, line) => sum + (Number(line.amount) || 0), 0),
    [vouchers],
  )

  async function onDisburse(event: FormEvent) {
    event.preventDefault()
    if (!id || !treasuryId) return
    setSaving(true)
    setError(null)
    try {
      await api.disburseAdvance(id, { treasuryId, date })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to disburse')
    } finally {
      setSaving(false)
    }
  }

  async function onReject() {
    if (!id) return
    setSaving(true)
    setError(null)
    try {
      await api.rejectAdvance(id, 'Requisition declined')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reject')
    } finally {
      setSaving(false)
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!id) return
    setSaving(true)
    setError(null)
    try {
      await api.submitSettlement(
        id,
        vouchers
          .filter((line) => line.accountCode && line.amount)
          .map((line) => ({
            accountCode: line.accountCode,
            amount: Number(line.amount),
            description: line.description || undefined,
          })),
      )
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit settlement')
    } finally {
      setSaving(false)
    }
  }

  async function onConfirm() {
    if (!id) return
    setSaving(true)
    setError(null)
    try {
      const spentAmount = row?.spentAmount ?? 0
      const advanced = row?.disbursedAmount ?? row?.requestedAmount ?? 0
      await api.confirmSettlement(id, {
        returnTreasuryId:
          spentAmount < advanced ? returnTreasuryId || undefined : undefined,
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to confirm settlement')
    } finally {
      setSaving(false)
    }
  }

  async function onScanReceipt() {
    setSaving(true)
    setError(null)
    try {
      const result = await api.scanReceipt({ textHint: ocrHint })
      setVouchers(
        result.lines.map((line) => ({
          accountCode: line.accountCode,
          amount: String(line.amount),
          description: line.description,
        })),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR scan failed')
    } finally {
      setSaving(false)
    }
  }

  if (!row) {
    return error ? <p className="form-error">{error}</p> : <p className="muted">Loading…</p>
  }

  const treasuryOptions = treasury.map((account) => ({
    value: account.id,
    label: `${account.glAccountCode} · ${account.name} (${money(account.bookBalance)})`,
  }))
  const returnTreasuryOptions = treasury.map((account) => ({
    value: account.id,
    label: `${account.glAccountCode} · ${account.name}`,
  }))
  const expenseOptions = expenses.map((account) => ({
    value: account.code,
    label: `${account.code} · ${account.name}`,
  }))

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{row.advanceNumber}</p>
          <h1>{row.projectName}</h1>
          <p className="muted">
            {row.employeeName} · {row.projectName}
          </p>
        </div>
        <Link to="/advances" className="ghost-link">
          All advances
        </Link>
      </header>

      <section className="grid metric-card-grid">
        <MetricCard
          variant="blue"
          title="Requested"
          value={money(row.requestedAmount)}
          meta={row.purpose}
        />
        <MetricCard
          variant="purple"
          title="Status"
          value={ADVANCE_STATUS_LABEL[row.status]}
          meta={
            row.settlementCase
              ? SETTLEMENT_CASE_LABEL[row.settlementCase]
              : 'Awaiting the next step'
          }
        />
        <MetricCard
          variant="teal"
          title="Spent"
          value={row.spentAmount === null ? '—' : money(row.spentAmount)}
          meta={row.disbursementJournalNumber ?? 'Not disbursed'}
        />
      </section>

      {isFinance && row.status === 'pending' ? (
        <section className="table-card">
          <h2>Step 2 · Disburse</h2>
          <p className="muted">
            Pay from cash, bank, or mobile wallet. This debits Employee Advances
            (1300), not a project expense.
          </p>
          <form className="stack-form" onSubmit={(event) => void onDisburse(event)}>
            <div className="name-row">
              <label>
                Pay from
                <Select
                  value={treasuryId}
                  onChange={setTreasuryId}
                  options={treasuryOptions}
                  placeholder="Select treasury"
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
            <div className="form-actions">
              <button type="button" className="ghost" onClick={() => void onReject()}>
                Reject
              </button>
              <button type="submit" disabled={saving || !treasuryId}>
                {saving ? 'Posting…' : 'Disburse advance'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {(isOwner || isFinance) && row.status === 'disbursed' ? (
        <section className="table-card">
          <h2>Step 3 · Submit vouchers</h2>
          <p className="muted">
            Equal spend closes the advance. Less spend returns cash. More spend
            credits Employee Payables (2100). Expense hits the project only after
            confirmation.
          </p>
          <div className="name-row">
            <label>
              OCR receipt hint (mock)
              <input
                value={ocrHint}
                onChange={(e) => setOcrHint(e.target.value)}
                placeholder="e.g. Travel taxi fare 975.25"
              />
            </label>
            <button
              type="button"
              className="ghost"
              disabled={saving || !ocrHint.trim()}
              onClick={() => void onScanReceipt()}
            >
              Scan &amp; auto-fill
            </button>
          </div>
          <form className="stack-form" onSubmit={(event) => void onSubmit(event)}>
            <table>
              <thead>
                <tr>
                  <th>Expense account</th>
                  <th>Amount</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {vouchers.map((line, index) => (
                  <tr key={index}>
                    <td>
                      <Select
                        value={line.accountCode}
                        onChange={(value) =>
                          setVouchers((current) =>
                            current.map((item, i) =>
                              i === index ? { ...item, accountCode: value } : item,
                            ),
                          )
                        }
                        options={expenseOptions}
                        placeholder="Select"
                      />
                    </td>
                    <td>
                      <input
                        inputMode="decimal"
                        value={line.amount}
                        onChange={(e) =>
                          setVouchers((current) =>
                            current.map((item, i) =>
                              i === index ? { ...item, amount: e.target.value } : item,
                            ),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={line.description}
                        onChange={(e) =>
                          setVouchers((current) =>
                            current.map((item, i) =>
                              i === index
                                ? { ...item, description: e.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">
              Voucher total {money(spent)} vs advance{' '}
              {money(row.disbursedAmount ?? row.requestedAmount)}
            </p>
            {spent > (row.disbursedAmount ?? row.requestedAmount) ? (
              <div className="callout callout-info">
                Actual spent exceeds advance by{' '}
                {money(spent - (row.disbursedAmount ?? row.requestedAmount))}.
                This excess amount will be credited to Employee Payable as
                Reimbursement Due.
              </div>
            ) : null}
            <div className="form-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setVouchers((current) => [...current, emptyVoucher()])}
              >
                Add line
              </button>
              <button type="submit" disabled={saving}>
                {saving ? 'Submitting…' : 'Submit settlement'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {isFinance && row.status === 'submitted' ? (
        <section className="table-card">
          <h2>Confirm settlement</h2>
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Amount</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {row.vouchers.map((line, index) => (
                <tr key={`${line.accountCode}-${index}`}>
                  <td>
                    {line.accountCode} · {line.accountName}
                  </td>
                  <td>{money(line.amount)}</td>
                  <td>{line.description ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(row.spentAmount ?? 0) < (row.disbursedAmount ?? row.requestedAmount) ? (
            <label>
              Return unspent to
              <Select
                value={returnTreasuryId}
                onChange={setReturnTreasuryId}
                options={returnTreasuryOptions}
                placeholder="Select treasury"
              />
            </label>
          ) : null}
          {(row.spentAmount ?? 0) > (row.disbursedAmount ?? row.requestedAmount) ? (
            <div className="callout callout-info">
              Actual spent exceeds advance by{' '}
              {money(
                (row.spentAmount ?? 0) -
                  (row.disbursedAmount ?? row.requestedAmount),
              )}
              . Confirming will credit Employee Payable (2121) for the excess.
            </div>
          ) : null}
          <div className="form-actions">
            <button type="button" disabled={saving} onClick={() => void onConfirm()}>
              {saving ? 'Posting…' : 'Confirm and post journals'}
            </button>
          </div>
        </section>
      ) : null}

      {row.status === 'settled' ? (
        <section className="table-card">
          <h2>Posted settlement</h2>
          <p className="muted">
            {row.settlementJournalNumber} ·{' '}
            {row.settlementCase ? SETTLEMENT_CASE_LABEL[row.settlementCase] : ''}
          </p>
          {row.reimbursementDue > 0 ? (
            <>
              <div className="callout callout-warn">
                Reimbursement due {money(row.reimbursementDue)}. Pay from the
                employee ledger or use the button below.
              </div>
              {isFinance ? (
                <div className="form-actions">
                  <Link
                    className="action-link"
                    to={`/employees/${row.employeeId}/ledger`}
                  >
                    Open employee ledger
                  </Link>
                </div>
              ) : null}
            </>
          ) : null}
          {row.reimbursedAmount > 0 ? (
            <p className="muted">
              Reimbursed {money(row.reimbursedAmount)}
              {row.reimbursementJournalNumber
                ? ` · ${row.reimbursementJournalNumber}`
                : ''}
            </p>
          ) : null}
        </section>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}
    </>
  )
}
