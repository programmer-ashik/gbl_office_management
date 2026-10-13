import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { Modal, Select } from '../components/ui'
import { money } from '../types/accounting'
import {
  INVOICE_STATUS_LABEL,
  INVOICE_TYPE_LABEL,
  type ClientInvoice,
  type CustomerOpeningDue,
  type OverdueNotice,
} from '../types/ar-ap'
import type { TreasuryAccount } from '../types/banking'
import type { Project } from '../types/project'
import { MetricCard } from '../components/MetricCard'

function asList<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : []
}

function formatDate(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '—'
}

export function ReceivablesPage() {
  const [rows, setRows] = useState<ClientInvoice[]>([])
  const [overdue, setOverdue] = useState<OverdueNotice[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [type, setType] = useState<'milestone' | 'lump_sum'>('milestone')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [milestoneLabel, setMilestoneLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [openingDues, setOpeningDues] = useState<CustomerOpeningDue[]>([])
  const [treasuries, setTreasuries] = useState<TreasuryAccount[]>([])
  const [receiveFor, setReceiveFor] = useState<CustomerOpeningDue | null>(null)
  const [receiveAmount, setReceiveAmount] = useState('')
  const [receiveTreasuryId, setReceiveTreasuryId] = useState('')
  const [receiveDate, setReceiveDate] = useState(
    new Date().toISOString().slice(0, 10),
  )
  const [receiveError, setReceiveError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function load() {
    const [invoices, notices, projectRows, dues, treasuryRows] =
      await Promise.all([
        api.invoices(),
        api.overdueInvoices(),
        api.projects(),
        api.customerOpeningDues(),
        api.treasury(),
      ])
    const invoiceRows = asList<ClientInvoice>(invoices)
    const overdueRows = asList<OverdueNotice>(notices)
    const projectList = asList<Project>(projectRows)
    setRows(invoiceRows)
    setOverdue(overdueRows)
    setProjects(projectList)
    setOpeningDues(asList<CustomerOpeningDue>(dues))
    setTreasuries(
      asList<TreasuryAccount>(treasuryRows).filter((row) => row.isActive),
    )
    if (!projectId && projectList[0]) {
      setProjectId(projectList[0].id)
    }
  }

  useEffect(() => {
    setLoading(true)
    load()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load receivables')
      })
      .finally(() => setLoading(false))
  }, [])

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    if (!projectId) return
    setSaving(true)
    setError(null)
    try {
      await api.createInvoice({
        projectId,
        type,
        date,
        dueDate,
        amount: Number(amount),
        description,
        milestoneLabel: type === 'milestone' ? milestoneLabel : undefined,
      })
      setAmount('')
      setDescription('')
      setMilestoneLabel('')
      setModalOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create invoice')
    } finally {
      setSaving(false)
    }
  }

  function openReceive(due: CustomerOpeningDue) {
    setReceiveFor(due)
    setReceiveAmount(String(due.openAmount))
    setReceiveTreasuryId((current) => current || treasuries[0]?.id || '')
    setReceiveDate(new Date().toISOString().slice(0, 10))
    setReceiveError(null)
  }

  async function onReceive(event: FormEvent) {
    event.preventDefault()
    if (!receiveFor) return
    const amountValue = Number(receiveAmount)
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setReceiveError('Enter a positive amount')
      return
    }
    setSaving(true)
    setReceiveError(null)
    try {
      await api.receiveCustomerOpeningDue(receiveFor.customerId, {
        amount: amountValue,
        treasuryId: receiveTreasuryId,
        date: receiveDate,
      })
      setNotice(
        `Received ${money(amountValue)} from ${receiveFor.customerName} against the opening balance.`,
      )
      setReceiveFor(null)
      await load()
    } catch (err) {
      setReceiveError(
        err instanceof Error ? err.message : 'Unable to record receipt',
      )
    } finally {
      setSaving(false)
    }
  }

  const openingOpenTotal = openingDues.reduce(
    (sum, row) => sum + (row.openAmount ?? 0),
    0,
  )
  const openTotal =
    rows.reduce((sum, row) => sum + (row.openAmount ?? 0), 0) + openingOpenTotal

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Client invoicing & collections</h1>
        </div>
        <div className="form-actions">
          <Link to="/aging" className="ghost-link">
            Aging reports
          </Link>
          <button type="button" onClick={() => setModalOpen(true)}>
            Add invoice
          </button>
        </div>
      </header>

      <section className="grid metric-card-grid">
        <MetricCard
          variant="teal"
          title="Open AR"
          value={money(openTotal)}
          meta={
            openingOpenTotal > 0
              ? `Includes ${money(openingOpenTotal)} opening dues (1151)`
              : 'Outstanding client balances (1151)'
          }
        />
        <MetricCard
          variant="red"
          title="Overdue"
          value={overdue.length}
          meta="Invoices past due date"
        />
        <MetricCard
          variant="blue"
          title="Invoices"
          value={rows.length}
          meta="Milestone and lump-sum billing"
        />
      </section>

      {notice ? <p className="form-success">{notice}</p> : null}

      {openingDues.length > 0 ? (
        <section className="table-card">
          <h2>Opening balance dues</h2>
          <p className="muted">
            Customer dues carried in from your old books. They have no invoice
            here, so record money received with Receive.
          </p>
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Opening date</th>
                <th>Journal</th>
                <th>Opening</th>
                <th>Received</th>
                <th>Open</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {openingDues.map((row) => (
                <tr key={row.customerId}>
                  <td>{row.customerName}</td>
                  <td>{formatDate(row.openingDate)}</td>
                  <td>{row.journalNumber}</td>
                  <td>{money(row.openingAmount)}</td>
                  <td>{money(row.receivedAmount)}</td>
                  <td>{money(row.openAmount)}</td>
                  <td>
                    {row.openAmount > 0 ? (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => openReceive(row)}
                      >
                        Receive
                      </button>
                    ) : (
                      <span className="status-pill status-paid">Settled</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <Modal
        open={receiveFor !== null}
        title={
          receiveFor
            ? `Receive opening due · ${receiveFor.customerName}`
            : 'Receive opening due'
        }
        description="Posts Dr cash/bank / Cr Accounts Receivable (1151) for this customer."
        onClose={() => setReceiveFor(null)}
      >
        <form className="stack-form" onSubmit={(event) => void onReceive(event)}>
          <div className="name-row">
            <label>
              Amount
              <input
                inputMode="decimal"
                value={receiveAmount}
                onChange={(e) => setReceiveAmount(e.target.value)}
                required
              />
            </label>
            <label>
              Date
              <input
                type="date"
                value={receiveDate}
                onChange={(e) => setReceiveDate(e.target.value)}
                required
              />
            </label>
          </div>
          <label>
            Received into
            <Select
              value={receiveTreasuryId}
              onChange={setReceiveTreasuryId}
              options={treasuries.map((row) => ({
                value: row.id,
                label: `${row.glAccountCode} · ${row.name}`,
              }))}
              placeholder="Select cash / bank"
              required
            />
          </label>
          {receiveFor ? (
            <p className="muted">
              Open opening balance: {money(receiveFor.openAmount)}
            </p>
          ) : null}
          <div className="form-actions">
            <button type="submit" disabled={saving || !receiveTreasuryId}>
              {saving ? 'Posting…' : 'Record receipt'}
            </button>
          </div>
          {receiveError ? <p className="form-error">{receiveError}</p> : null}
        </form>
      </Modal>

      {overdue.length > 0 ? (
        <section className="table-card">
          <h2>Overdue notifications</h2>
          <p className="muted">
            Clients with open balances past the due date. Use the email on file for
            follow-up.
          </p>
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Project</th>
                <th>Client</th>
                <th>Due</th>
                <th>Days late</th>
                <th>Open</th>
              </tr>
            </thead>
            <tbody>
              {overdue.map((row) => (
                <tr key={row.invoiceId}>
                  <td>
                    <Link to={`/receivables/${row.invoiceId}`}>{row.invoiceNumber}</Link>
                  </td>
                  <td>{row.projectName ?? row.projectCode}</td>
                  <td>
                    {row.clientName}
                    {row.clientEmail ? (
                      <span className="muted"> · {row.clientEmail}</span>
                    ) : null}
                  </td>
                  <td>{formatDate(row.dueDate)}</td>
                  <td>{row.daysPastDue}</td>
                  <td>{money(row.openAmount ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <Modal
        open={modalOpen}
        title="New client invoice"
        description="Posts Dr Accounts Receivable (1151) / Cr Project Revenue (4110) on issue."
        onClose={() => setModalOpen(false)}
        wide
      >
        <form className="stack-form" onSubmit={(event) => void onCreate(event)}>
          <div className="name-row">
            <label>
              Project
              <Select
                value={projectId}
                onChange={setProjectId}
                options={projects.map((project) => ({
                  value: project.id,
                  label: `${project.code} · ${project.name}`,
                }))}
                placeholder="Select project"
                required
              />
            </label>
            <label>
              Type
              <Select
                value={type}
                onChange={(value) => setType(value as typeof type)}
                options={[
                  { value: 'milestone', label: 'Milestone' },
                  { value: 'lump_sum', label: 'Lump sum' },
                ]}
              />
            </label>
          </div>
          <div className="name-row">
            <label>
              Invoice date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>
            <label>
              Due date
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
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
          </div>
          {type === 'milestone' ? (
            <label>
              Milestone label
              <input
                value={milestoneLabel}
                onChange={(e) => setMilestoneLabel(e.target.value)}
                placeholder="e.g. Foundation complete"
              />
            </label>
          ) : null}
          <label>
            Description
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={saving || !projectId}>
              {saving ? 'Issuing…' : 'Issue invoice'}
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </Modal>

      <section className="table-card">
        <h2>Invoices</h2>
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Project</th>
              <th>Client</th>
              <th>Type</th>
              <th>Due</th>
              <th>Amount</th>
              <th>Open</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link to={`/receivables/${row.id}`}>{row.invoiceNumber}</Link>
                </td>
                <td>{row.projectName}</td>
                <td>{row.clientName}</td>
                <td>{INVOICE_TYPE_LABEL[row.type] ?? row.type}</td>
                <td>{formatDate(row.dueDate)}</td>
                <td>{money(row.amount ?? 0)}</td>
                <td>{money(row.openAmount ?? 0)}</td>
                <td>
                  <span className={`status-pill status-${row.status}`}>
                    {INVOICE_STATUS_LABEL[row.status] ?? row.status}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted">
                  {loading
                    ? 'Loading invoices…'
                    : error
                      ? 'Unable to load invoices. Check the error below.'
                      : 'No invoices yet. Use Add invoice to issue one against a project.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {!modalOpen && error ? <p className="form-error">{error}</p> : null}
    </>
  )
}
