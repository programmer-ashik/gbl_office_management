import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { Select } from '../components/ui'
import type {
  PayrollEmployee,
  SalaryFacility,
  TimeLog,
} from '../types/payroll'
import type { Project } from '../types/project'
import type { TreasuryAccount } from '../types/banking'
import { MetricCard } from '../components/MetricCard'
import { MONTH_OPTIONS, monthLabel } from '../utils/months'
import { money } from '../types/accounting'

export function PayrollTimePage() {
  const [employees, setEmployees] = useState<PayrollEmployee[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [treasury, setTreasury] = useState<TreasuryAccount[]>([])
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([])
  const [facilities, setFacilities] = useState<SalaryFacility[]>([])
  const [employeeId, setEmployeeId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [timeKind, setTimeKind] = useState<'project' | 'administrative'>(
    'project',
  )
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear())
  const [periodMonth, setPeriodMonth] = useState(new Date().getMonth() + 1)
  const [quantity, setQuantity] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [facEmployeeId, setFacEmployeeId] = useState('')
  const [facKind, setFacKind] = useState<'salary_advance' | 'salary_loan'>(
    'salary_advance',
  )
  const [facPrincipal, setFacPrincipal] = useState('')
  const [facInstallment, setFacInstallment] = useState('')
  const [facCount, setFacCount] = useState('3')
  const [facTreasuryId, setFacTreasuryId] = useState('')
  const [facDate, setFacDate] = useState(new Date().toISOString().slice(0, 10))
  const [facPurpose, setFacPurpose] = useState('')

  async function load() {
    const [employeeRows, projectRows, logs, channels, facilityRows] =
      await Promise.all([
        api.payrollEmployees(),
        api.projects(),
        api.timeLogs(periodYear, periodMonth),
        api.treasury(),
        api.salaryFacilities(),
      ])
    setEmployees(employeeRows)
    setProjects(projectRows)
    setTimeLogs(logs)
    setTreasury(channels)
    setFacilities(facilityRows)
    if (!employeeId && employeeRows[0]) setEmployeeId(employeeRows[0].id)
    if (!facEmployeeId && employeeRows[0]) setFacEmployeeId(employeeRows[0].id)
    if (!projectId && projectRows[0]) setProjectId(projectRows[0].id)
    if (!facTreasuryId && channels[0]) setFacTreasuryId(channels[0].id)
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load time logs')
    })
  }, [periodYear, periodMonth])

  async function onLogTime(event: FormEvent) {
    event.preventDefault()
    if (!employeeId) return
    if (timeKind === 'project' && !projectId) return
    setSaving(true)
    setError(null)
    try {
      await api.createTimeLog({
        employeeId,
        kind: timeKind,
        projectId: timeKind === 'project' ? projectId : undefined,
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

  async function onCreateFacility(event: FormEvent) {
    event.preventDefault()
    if (!facEmployeeId || !facTreasuryId) return
    setSaving(true)
    setError(null)
    try {
      await api.createSalaryFacility({
        employeeId: facEmployeeId,
        kind: facKind,
        principal: Number(facPrincipal),
        installment: Number(facInstallment),
        installmentCount: Number(facCount),
        treasuryId: facTreasuryId,
        date: facDate,
        purpose: facPurpose,
      })
      setFacPrincipal('')
      setFacInstallment('')
      setFacPurpose('')
      await load()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to create salary facility',
      )
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
  const treasuryOptions = treasury.map((row) => ({
    value: row.id,
    label: `${row.name} · ${row.glAccountCode}`,
  }))

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Attendance, advances & loans</h1>
          <p className="muted">
            Log project or administrative time · Disburse salary advances and
            loans with installment recovery
          </p>
        </div>
        <Link to="/payroll/process" className="ghost-link">
          Process payroll
        </Link>
      </header>

      <section className="grid metric-card-grid">
        <MetricCard
          variant="blue"
          title="Time logs"
          value={timeLogs.length}
          meta={`${monthLabel(periodMonth)} ${periodYear}`}
        />
        <MetricCard
          variant="amber"
          title="Active facilities"
          value={facilities.filter((f) => f.status === 'active').length}
          meta="Salary advances & loans"
        />
        <MetricCard
          variant="teal"
          title="Outstanding"
          value={money(
            facilities
              .filter((f) => f.status === 'active')
              .reduce((s, f) => s + f.outstanding, 0),
          )}
          meta="To recover from salary"
        />
      </section>

      <section className="table-card">
        <div className="table-head">
          <h2>Log time</h2>
          <p className="muted">
            Project days allocate labor to 5120 · Administrative days keep cost
            on HQ salary (5230)
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
              <Select
                value={String(periodMonth)}
                onChange={(value) => setPeriodMonth(Number(value))}
                options={[...MONTH_OPTIONS]}
                placeholder="Select month"
              />
            </label>
            <label>
              Time type
              <Select
                value={timeKind}
                onChange={(value) =>
                  setTimeKind(value as 'project' | 'administrative')
                }
                options={[
                  { value: 'project', label: 'Project time' },
                  { value: 'administrative', label: 'Administrative / HQ' },
                ]}
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
            {timeKind === 'project' ? (
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
            ) : null}
            <label>
              Days
              <input
                type="number"
                min={0.25}
                step={0.25}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </label>
          </div>
          <div className="form-actions">
            <button
              type="submit"
              disabled={
                saving ||
                !employeeId ||
                (timeKind === 'project' && !projectId)
              }
            >
              {saving ? 'Saving…' : 'Log time'}
            </button>
          </div>
        </form>
      </section>

      <section className="table-card">
        <div className="table-head">
          <h2>
            Time logs · {monthLabel(periodMonth)} {periodYear}
          </h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Type</th>
              <th>Project / HQ</th>
              <th>Days</th>
            </tr>
          </thead>
          <tbody>
            {timeLogs.map((row) => (
              <tr key={row.id}>
                <td>{row.employeeName}</td>
                <td>
                  {row.kind === 'administrative' ? 'Administrative' : 'Project'}
                </td>
                <td>
                  {row.projectCode} · {row.projectName}
                </td>
                <td>{row.quantity}</td>
              </tr>
            ))}
            {timeLogs.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  No time logs for this period.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="table-card">
        <div className="table-head">
          <h2>Salary advance / loan</h2>
          <p className="muted">
            Disburses from treasury (Dr 1131 / Cr cash). Monthly payroll recovers
            the installment — slip shows the reason; less cash paid out increases
            retained balance.
          </p>
        </div>
        <form
          className="stack-form"
          onSubmit={(event) => void onCreateFacility(event)}
        >
          <div className="name-row">
            <label>
              Type
              <Select
                value={facKind}
                onChange={(value) =>
                  setFacKind(value as 'salary_advance' | 'salary_loan')
                }
                options={[
                  { value: 'salary_advance', label: 'Salary advance' },
                  { value: 'salary_loan', label: 'Salary loan' },
                ]}
              />
            </label>
            <label>
              Employee
              <Select
                value={facEmployeeId}
                onChange={setFacEmployeeId}
                options={employeeOptions}
                searchable
                required
              />
            </label>
            <label>
              Principal
              <input
                inputMode="decimal"
                value={facPrincipal}
                onChange={(e) => setFacPrincipal(e.target.value)}
                required
              />
            </label>
            <label>
              Monthly installment
              <input
                inputMode="decimal"
                value={facInstallment}
                onChange={(e) => setFacInstallment(e.target.value)}
                required
              />
            </label>
            <label>
              Installments
              <input
                type="number"
                min={1}
                max={60}
                value={facCount}
                onChange={(e) => setFacCount(e.target.value)}
                required
              />
            </label>
            <label>
              Pay from
              <Select
                value={facTreasuryId}
                onChange={setFacTreasuryId}
                options={treasuryOptions}
                required
              />
            </label>
            <label>
              Date
              <input
                type="date"
                value={facDate}
                onChange={(e) => setFacDate(e.target.value)}
                required
              />
            </label>
            <label>
              Purpose / reason
              <input
                value={facPurpose}
                onChange={(e) => setFacPurpose(e.target.value)}
                placeholder="Shown on salary slip"
                required
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" disabled={saving || !facEmployeeId}>
              {saving ? 'Saving…' : 'Disburse advance / loan'}
            </button>
          </div>
        </form>

        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Kind</th>
              <th>Employee</th>
              <th>Principal</th>
              <th>Installment</th>
              <th>Outstanding</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {facilities.map((row) => (
              <tr key={row.id}>
                <td>{row.facilityNumber}</td>
                <td>
                  {row.kind === 'salary_loan' ? 'Loan' : 'Advance'}
                </td>
                <td>{row.employeeName}</td>
                <td>{money(row.principal)}</td>
                <td>{money(row.installment)}</td>
                <td>{money(row.outstanding)}</td>
                <td>{row.status}</td>
              </tr>
            ))}
            {facilities.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  No salary advances or loans yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {error ? <p className="form-error">{error}</p> : null}
    </>
  )
}
