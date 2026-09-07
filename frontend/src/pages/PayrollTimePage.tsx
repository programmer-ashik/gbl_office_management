import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { Select } from '../components/ui'
import type { PayrollEmployee, TimeLog } from '../types/payroll'
import type { Project } from '../types/project'
import { MetricCard } from '../components/MetricCard'

export function PayrollTimePage() {
  const [employees, setEmployees] = useState<PayrollEmployee[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([])
  const [employeeId, setEmployeeId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [periodYear, setPeriodYear] = useState(2026)
  const [periodMonth, setPeriodMonth] = useState(9)
  const [quantity, setQuantity] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    const [employeeRows, projectRows, logs] = await Promise.all([
      api.payrollEmployees(),
      api.projects(),
      api.timeLogs(periodYear, periodMonth),
    ])
    setEmployees(employeeRows)
    setProjects(projectRows)
    setTimeLogs(logs)
    if (!employeeId && employeeRows[0]) {
      setEmployeeId(employeeRows[0].id)
    }
    if (!projectId && projectRows[0]) {
      setProjectId(projectRows[0].id)
    }
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load time logs')
    })
  }, [periodYear, periodMonth])

  async function onLogTime(event: FormEvent) {
    event.preventDefault()
    if (!employeeId || !projectId) return
    setSaving(true)
    setError(null)
    try {
      await api.createTimeLog({
        employeeId,
        projectId,
        periodYear,
        periodMonth,
        unit: 'days',
        quantity: Number(quantity),
      })
      setQuantity('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to log time')
    } finally {
      setSaving(false)
    }
  }

  const employeeOptions = employees.map((row) => ({
    value: row.id,
    label: row.name,
  }))
  const projectOptions = projects.map((row) => ({
    value: row.id,
    label: `${row.code} · ${row.name}`,
  }))

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Attendance & time</h1>
        </div>
        <Link to="/payroll" className="ghost-link">
          Salary disbursement
        </Link>
      </header>

      <section className="grid metric-card-grid">
        <MetricCard
          variant="blue"
          title="Time logs"
          value={timeLogs.length}
          meta={`${periodYear}-${String(periodMonth).padStart(2, '0')}`}
        />
        <MetricCard
          variant="teal"
          title="Employees"
          value={employees.length}
          meta="Available for labor allocation"
        />
        <MetricCard
          variant="purple"
          title="Projects"
          value={projects.length}
          meta="Sites receiving labor cost"
        />
      </section>

      <section className="table-card">
        <div className="table-head">
          <h2>Log project time</h2>
          <p className="muted">
            Labor cost is allocated to projects in proportion to logged days
          </p>
        </div>
        <form className="stack-form" onSubmit={(event) => void onLogTime(event)}>
          <div className="name-row">
            <label>
              Period year
              <input
                type="number"
                value={periodYear}
                onChange={(e) => setPeriodYear(Number(e.target.value))}
              />
            </label>
            <label>
              Month
              <input
                type="number"
                min={1}
                max={12}
                value={periodMonth}
                onChange={(e) => setPeriodMonth(Number(e.target.value))}
              />
            </label>
            <label>
              Employee
              <Select
                value={employeeId}
                onChange={setEmployeeId}
                options={employeeOptions}
                placeholder="Select employee"
                searchable
                required
              />
            </label>
            <label>
              Project
              <Select
                value={projectId}
                onChange={setProjectId}
                options={projectOptions}
                placeholder="Select project"
                searchable
                required
              />
            </label>
            <label>
              Days
              <input
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" disabled={saving || !employeeId || !projectId}>
              {saving ? 'Saving…' : 'Log time'}
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </section>

      <section className="table-card">
        <div className="table-head">
          <h2>Time logs</h2>
          <p className="muted">
            Period {periodYear}-{String(periodMonth).padStart(2, '0')}
          </p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Project</th>
              <th>Unit</th>
              <th>Quantity</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {timeLogs.map((row) => (
              <tr key={row.id}>
                <td>{row.employeeName}</td>
                <td>
                  {row.projectName}
                </td>
                <td>{row.unit}</td>
                <td>{row.quantity}</td>
                <td>{row.notes ?? '—'}</td>
              </tr>
            ))}
            {timeLogs.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No time logs for this period.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </>
  )
}
