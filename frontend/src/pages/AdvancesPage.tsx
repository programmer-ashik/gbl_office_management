import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { Select } from '../components/ui'
import { money } from '../types/accounting'
import {
  ADVANCE_STATUS_LABEL,
  type Advance,
  type AdvanceProjectOption,
} from '../types/advance'

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  ...Object.entries(ADVANCE_STATUS_LABEL).map(([value, label]) => ({
    value,
    label,
  })),
]

export function AdvancesPage() {
  const [rows, setRows] = useState<Advance[]>([])
  const [projects, setProjects] = useState<AdvanceProjectOption[]>([])
  const [projectId, setProjectId] = useState('')
  const [amount, setAmount] = useState('')
  const [purpose, setPurpose] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    const [advances, options] = await Promise.all([
      api.advances(),
      api.advanceProjects(),
    ])
    setRows(advances)
    setProjects(options)
    if (!projectId && options[0]) {
      setProjectId(options[0].id)
    }
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load advances')
    })
  }, [])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false
      if (projectFilter && row.projectId !== projectFilter) return false
      if (!needle) return true
      const haystack = [
        row.advanceNumber,
        row.projectCode,
        row.projectName,
        row.employeeName,
        row.purpose,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  }, [rows, statusFilter, projectFilter, search])

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    if (!projectId) return
    setSaving(true)
    setError(null)
    try {
      await api.createAdvance({
        projectId,
        amount: Number(amount),
        purpose,
      })
      setAmount('')
      setPurpose('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit requisition')
    } finally {
      setSaving(false)
    }
  }

  const projectOptions = projects.map((project) => ({
    value: project.id,
    label: `${project.code} · ${project.name}`,
  }))

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Advance requisitions</h1>
        </div>
        <Link to="/advances/settlements" className="action-link">
          Expense settlements
        </Link>
      </header>

      <section className="table-card">
        <div className="table-head">
          <h2>Submit requisition</h2>
          <p className="muted">
            Request cash for a project. Until settlement, the payment is an employee
            advance asset — not a project expense.
          </p>
        </div>
        <form className="stack-form" onSubmit={(event) => void onCreate(event)}>
          <div className="name-row">
            <label>
              Project
              <Select
                value={projectId}
                onChange={setProjectId}
                options={projectOptions}
                searchable
                placeholder="Select project"
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
          <label>
            Purpose
            <input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              required
              minLength={5}
            />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={saving || !projectId}>
              {saving ? 'Submitting…' : 'Submit requisition'}
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </section>

      <section className="table-card">
        <div className="table-head">
          <h2>Requisition register</h2>
          <p className="muted">{filtered.length} of {rows.length} shown</p>
        </div>
        <form className="filter-bar" onSubmit={(event) => event.preventDefault()}>
          <label>
            Search
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Number, project, employee…"
            />
          </label>
          <label>
            Status
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              options={STATUS_OPTIONS}
              searchable
            />
          </label>
          <label>
            Project
            <Select
              value={projectFilter}
              onChange={setProjectFilter}
              options={[
                { value: '', label: 'All projects' },
                ...projectOptions,
              ]}
              searchable
            />
          </label>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setSearch('')
              setStatusFilter('')
              setProjectFilter('')
            }}
          >
            Clear
          </button>
        </form>
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Project</th>
              <th>Employee</th>
              <th>Requested</th>
              <th>Spent</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link to={`/advances/${row.id}`}>{row.advanceNumber}</Link>
                </td>
                <td>
                  {row.projectCode} · {row.projectName}
                </td>
                <td>{row.employeeName}</td>
                <td>{money(row.requestedAmount)}</td>
                <td>{row.spentAmount === null ? '—' : money(row.spentAmount)}</td>
                <td>
                  <span className={`status-pill status-${row.status}`}>
                    {ADVANCE_STATUS_LABEL[row.status]}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No requisitions match the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </>
  )
}
