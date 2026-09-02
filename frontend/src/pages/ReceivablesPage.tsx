import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { Modal, Select } from '../components/ui'
import { money } from '../types/accounting'
import {
  INVOICE_STATUS_LABEL,
  INVOICE_TYPE_LABEL,
  type ClientInvoice,
  type OverdueNotice,
} from '../types/ar-ap'
import type { Project } from '../types/project'

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

  async function load() {
    const [invoices, notices, projectRows] = await Promise.all([
      api.invoices(),
      api.overdueInvoices(),
      api.projects(),
    ])
    setRows(invoices)
    setOverdue(notices)
    setProjects(projectRows)
    if (!projectId && projectRows[0]) {
      setProjectId(projectRows[0].id)
    }
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load receivables')
    })
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

  const openTotal = rows.reduce((sum, row) => sum + row.openAmount, 0)

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

      <section className="grid">
        <article className="stat-card">
          <h3>Open AR</h3>
          <p className="stat-value">{money(openTotal)}</p>
          <p className="muted">Outstanding client balances (1100)</p>
        </article>
        <article className="stat-card">
          <h3>Overdue</h3>
          <p className="stat-value">{overdue.length}</p>
          <p className="muted">Invoices past due date</p>
        </article>
        <article className="stat-card">
          <h3>Invoices</h3>
          <p className="stat-value">{rows.length}</p>
          <p className="muted">Milestone and lump-sum billing</p>
        </article>
      </section>

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
                  <td>{row.projectCode}</td>
                  <td>
                    {row.clientName}
                    {row.clientEmail ? (
                      <span className="muted"> · {row.clientEmail}</span>
                    ) : null}
                  </td>
                  <td>{row.dueDate.slice(0, 10)}</td>
                  <td>{row.daysPastDue}</td>
                  <td>{money(row.openAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <Modal
        open={modalOpen}
        title="New client invoice"
        description="Posts Dr Accounts Receivable (1100) / Cr Project Revenue (4000) on issue."
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
                <td>{row.projectCode}</td>
                <td>{row.clientName}</td>
                <td>{INVOICE_TYPE_LABEL[row.type]}</td>
                <td>{row.dueDate.slice(0, 10)}</td>
                <td>{money(row.amount)}</td>
                <td>{money(row.openAmount)}</td>
                <td>
                  <span className={`status-pill status-${row.status}`}>
                    {INVOICE_STATUS_LABEL[row.status]}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted">
                  No invoices yet.
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
