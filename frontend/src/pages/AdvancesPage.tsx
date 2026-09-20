import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { ActionMenu, Select } from '../components/ui'
import { money } from '../types/accounting'
import {
  ADVANCE_STATUS_LABEL,
  type Advance,
  type AdvanceProjectOption,
} from '../types/advance'
import type { PublicUser } from '../types/auth'

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  ...Object.entries(ADVANCE_STATUS_LABEL).map(([value, label]) => ({
    value,
    label,
  })),
]

export function AdvancesPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Advance[]>([])
  const [total, setTotal] = useState(0)
  const [projects, setProjects] = useState<AdvanceProjectOption[]>([])
  const [employees, setEmployees] = useState<PublicUser[]>([])
  const [projectId, setProjectId] = useState('')
  const [amount, setAmount] = useState('')
  const [purpose, setPurpose] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  async function load() {
    const [advances, options, staff] = await Promise.all([
      api.advances({
        projectId: projectFilter || undefined,
        employeeId: employeeFilter || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        status: statusFilter || undefined,
        page: 1,
        pageSize: 100,
      }),
      api.advanceProjects(),
      api.employees().catch(() => [] as PublicUser[]),
    ])
    setRows(advances.items)
    setTotal(advances.total)
    setProjects(options)
    setEmployees(staff)
    if (!projectId && options[0]) {
      setProjectId(options[0].id)
    }
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load advances')
    })
  }, [projectFilter, employeeFilter, startDate, endDate, statusFilter])

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

  async function onExportProjectReport() {
    if (!projectFilter) {
      setError('Select a project filter before exporting the project advance report.')
      return
    }
    setExporting(true)
    setError(null)
    try {
      await api.downloadProjectAdvanceReportPdf({
        projectId: projectFilter,
        employeeId: employeeFilter || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to export project report')
    } finally {
      setExporting(false)
    }
  }

  const projectOptions = projects.map((project) => ({
    value: project.id,
    label: `${project.code} · ${project.name}`,
  }))

  const employeeOptions = useMemo(
    () =>
      employees.map((row) => ({
        value: row.id,
        label: `${row.firstName} ${row.lastName}`,
      })),
    [employees],
  )

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Advance requisitions</h1>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="ghost"
            disabled={exporting || !projectFilter}
            onClick={() => void onExportProjectReport()}
            title={
              projectFilter
                ? 'Export PDF for the selected project filter'
                : 'Select a project in the filter bar first'
            }
          >
            {exporting ? 'Exporting…' : 'Export Project Advance Report (PDF)'}
          </button>
          <Link to="/advances/settlements" className="action-link">
            Expense settlements
          </Link>
        </div>
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
          <p className="muted">
            {rows.length} shown · {total} total matching filters
          </p>
        </div>
        <form className="filter-bar" onSubmit={(event) => event.preventDefault()}>
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
          <label>
            Employee
            <Select
              value={employeeFilter}
              onChange={setEmployeeFilter}
              options={[
                { value: '', label: 'All employees' },
                ...employeeOptions,
              ]}
              searchable
            />
          </label>
          <label>
            From
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
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
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setStatusFilter('')
              setProjectFilter('')
              setEmployeeFilter('')
              setStartDate('')
              setEndDate('')
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
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link to={`/advances/${row.id}`}>{row.advanceNumber}</Link>
                </td>
                <td>
                  {row.projectName}
                </td>
                <td>{row.employeeName}</td>
                <td>{money(row.requestedAmount)}</td>
                <td>{row.spentAmount === null ? '—' : money(row.spentAmount)}</td>
                <td>
                  <span className={`status-pill status-${row.status}`}>
                    {ADVANCE_STATUS_LABEL[row.status]}
                  </span>
                </td>
                <td>
                  <ActionMenu
                    items={[
                      {
                        label: 'Open detail',
                        onSelect: () => navigate(`/advances/${row.id}`),
                      },
                      {
                        label: 'Download Single Voucher PDF',
                        onSelect: () => {
                          void api.downloadAdvancePdf(row.id).catch((err: unknown) => {
                            setError(
                              err instanceof Error
                                ? err.message
                                : 'Unable to download voucher PDF',
                            )
                          })
                        },
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
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
