import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { ExpandableText } from '../components/ExpandableText'
import { MetricCard } from '../components/MetricCard'
import { Modal, Select } from '../components/ui'
import { money } from '../types/accounting'
import type { EmployeeLedgerReport } from '../types/advance'
import type { TreasuryAccount } from '../types/banking'
import { Role } from '../types/auth'

function statusBadgeClass(status: EmployeeLedgerReport['status']) {
  if (status === 'DEBIT_BALANCE') return 'ledger-badge is-debit'
  if (status === 'CREDIT_BALANCE') return 'ledger-badge is-credit'
  return 'ledger-badge is-settled'
}

function statusLabel(status: EmployeeLedgerReport['status']) {
  if (status === 'DEBIT_BALANCE') return 'Debit balance · Unsettled advance'
  if (status === 'CREDIT_BALANCE') return 'Credit balance · Reimbursement due'
  return 'Settled'
}

export function EmployeeLedgerPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const isFinance = user?.role === Role.ADMIN || user?.role === Role.ACCOUNTANT
  const [report, setReport] = useState<EmployeeLedgerReport | null>(null)
  const [treasury, setTreasury] = useState<TreasuryAccount[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [advanceId, setAdvanceId] = useState('')
  const [treasuryId, setTreasuryId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  async function load() {
    if (!id) return
    const data = await api.employeeLedger(id)
    setReport(data)
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load employee ledger')
    })
  }, [id])

  useEffect(() => {
    if (!isFinance) return
    api
      .treasury()
      .then((rows) => {
        setTreasury(rows.filter((row) => row.isActive))
      })
      .catch(() => setTreasury([]))
  }, [isFinance])

  const treasuryOptions = useMemo(
    () =>
      treasury.map((row) => ({
        value: row.id,
        label: `${row.name} · ${row.glAccountCode}`,
      })),
    [treasury],
  )

  function openReimburse(nextAdvanceId: string) {
    setAdvanceId(nextAdvanceId)
    setTreasuryId(treasuryOptions[0]?.value ?? '')
    setModalOpen(true)
  }

  async function onReimburse(event: FormEvent) {
    event.preventDefault()
    if (!advanceId || !treasuryId) return
    setSaving(true)
    setError(null)
    try {
      await api.reimburseAdvance(advanceId, { treasuryId, date })
      setModalOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to pay reimbursement')
    } finally {
      setSaving(false)
    }
  }

  if (!report) {
    return error ? <p className="form-error">{error}</p> : <p className="muted">Loading…</p>
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Employee sub-ledger</p>
          <h1>{report.employeeName}</h1>
          <p className="muted">Advances, settlements, and reimbursements</p>
        </div>
        <Link to="/employees" className="ghost-link">
          Employees
        </Link>
      </header>

      <section className="grid metric-card-grid">
        <MetricCard
          variant="blue"
          title="Total advances given"
          value={money(report.totalAdvancesGiven)}
        />
        <MetricCard
          variant="teal"
          title="Expense vouchers settled"
          value={money(report.totalExpenseSettled)}
        />
        <MetricCard
          variant="purple"
          title="Reimbursed"
          value={money(report.totalReimbursed)}
        />
        <article className={`metric-card metric-card--amber`}>
          <header className="metric-card-banner">
            <h3 className="metric-card-title">Net running balance</h3>
            <span className="metric-card-badge" aria-hidden>
              ৳
            </span>
          </header>
          <div className="metric-card-body">
            <p className="metric-card-value">{money(report.runningBalance)}</p>
            <div className="metric-card-meta">
              <span className={statusBadgeClass(report.status)}>
                {statusLabel(report.status)}
              </span>
            </div>
          </div>
        </article>
      </section>

      <section className="table-card">
        <div className="table-head">
          <h2>Sub-ledger statement</h2>
          <p className="muted">{report.lines.length} posted lines</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Ref # / Type</th>
              <th>Description</th>
              <th>Debit</th>
              <th>Credit</th>
              <th>Running balance</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {report.lines.map((line) => (
              <tr key={line.id}>
                <td>{line.date.slice(0, 10)}</td>
                <td>
                  {line.journalEntryNumber}
                  <div className="muted">{line.voucherType}</div>
                </td>
                <td>
                  <ExpandableText text={line.description} maxChars={48} />
                  <div className="muted">
                    {line.accountCode} · {line.accountName}
                  </div>
                </td>
                <td>{line.debit ? money(line.debit) : '—'}</td>
                <td>{line.credit ? money(line.credit) : '—'}</td>
                <td>{money(line.runningBalance)}</td>
                <td>
                  <span className={statusBadgeClass(line.status)}>
                    {line.status === 'SETTLED'
                      ? 'Settled'
                      : line.status === 'DEBIT_BALANCE'
                        ? 'Debit'
                        : 'Credit'}
                  </span>
                </td>
                <td>
                  {line.canReimburse && line.advanceId ? (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => openReimburse(line.advanceId!)}
                    >
                      Pay reimbursement
                    </button>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
            {report.lines.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted">
                  No advance sub-ledger activity for this employee yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {report.openReimbursements.length > 0 && isFinance ? (
        <section className="table-card">
          <div className="table-head">
            <h2>Open reimbursements</h2>
          </div>
          <table>
            <thead>
              <tr>
                <th>Advance</th>
                <th>Due</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {report.openReimbursements.map((row) => (
                <tr key={row.advanceId}>
                  <td>
                    <Link to={`/advances/${row.advanceId}`}>{row.advanceNumber}</Link>
                  </td>
                  <td>{money(row.amount)}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => openReimburse(row.advanceId)}
                    >
                      Pay reimbursement
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <Modal
        open={modalOpen}
        title="Pay reimbursement"
        description="Posts a new journal: Dr Employee Payables / Cr Cash or Bank."
        onClose={() => setModalOpen(false)}
      >
        <form className="stack-form" onSubmit={(event) => void onReimburse(event)}>
          <label>
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          <label>
            Pay from
            <Select
              value={treasuryId}
              onChange={setTreasuryId}
              options={
                treasuryOptions.length > 0
                  ? treasuryOptions
                  : [{ value: '', label: 'No treasury channels' }]
              }
              searchable
            />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={saving || !treasuryId}>
              {saving ? 'Posting…' : 'Confirm payout'}
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </Modal>

      {!modalOpen && error ? <p className="form-error">{error}</p> : null}
    </>
  )
}
