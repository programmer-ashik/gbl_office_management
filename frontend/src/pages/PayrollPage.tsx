import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { Modal, Select } from '../components/ui'
import { money } from '../types/accounting'
import {
  PAYROLL_STATUS_LABEL,
  type PayrollEmployee,
  type PayrollRun,
  type SalaryStructure,
  type TimeLog,
} from '../types/payroll'
import type { Project } from '../types/project'
import type { TreasuryAccount } from '../types/banking'

export function PayrollPage() {
  const [employees, setEmployees] = useState<PayrollEmployee[]>([])
  const [structures, setStructures] = useState<SalaryStructure[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([])
  const [runs, setRuns] = useState<PayrollRun[]>([])
  const [treasury, setTreasury] = useState<TreasuryAccount[]>([])
  const [employeeId, setEmployeeId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [basic, setBasic] = useState('')
  const [allowanceName, setAllowanceName] = useState('Site allowance')
  const [allowanceAmount, setAllowanceAmount] = useState('')
  const [deductionName, setDeductionName] = useState('Tax')
  const [deductionAmount, setDeductionAmount] = useState('')
  const [periodYear, setPeriodYear] = useState(2026)
  const [periodMonth, setPeriodMonth] = useState(9)
  const [quantity, setQuantity] = useState('')
  const [treasuryId, setTreasuryId] = useState('')
  const [disburseDate, setDisburseDate] = useState(new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [structureModalOpen, setStructureModalOpen] = useState(false)
  const [timeModalOpen, setTimeModalOpen] = useState(false)

  async function load() {
    const [employeeRows, structureRows, projectRows, runRows, channels, logs] =
      await Promise.all([
        api.payrollEmployees(),
        api.salaryStructures(),
        api.projects(),
        api.payrollRuns(),
        api.treasury(),
        api.timeLogs(periodYear, periodMonth),
      ])
    setEmployees(employeeRows)
    setStructures(structureRows)
    setProjects(projectRows)
    setRuns(runRows)
    setTreasury(channels)
    setTimeLogs(logs)
    if (!employeeId && employeeRows[0]) {
      setEmployeeId(employeeRows[0].id)
    }
    if (!projectId && projectRows[0]) {
      setProjectId(projectRows[0].id)
    }
    if (!treasuryId && channels[0]) {
      setTreasuryId(channels[0].id)
    }
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load payroll')
    })
  }, [periodYear, periodMonth])

  async function onSaveStructure(event: FormEvent) {
    event.preventDefault()
    if (!employeeId) return
    setSaving(true)
    setError(null)
    try {
      await api.upsertSalaryStructure({
        employeeId,
        basic: Number(basic),
        allowances: allowanceAmount
          ? [{ name: allowanceName, amount: Number(allowanceAmount) }]
          : [],
        deductions: deductionAmount
          ? [{ name: deductionName, amount: Number(deductionAmount) }]
          : [],
      })
      setStructureModalOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save salary structure')
    } finally {
      setSaving(false)
    }
  }

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
      setTimeModalOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to log time')
    } finally {
      setSaving(false)
    }
  }

  async function onGenerate() {
    setSaving(true)
    setError(null)
    try {
      await api.generatePayroll({ periodYear, periodMonth })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate payroll')
    } finally {
      setSaving(false)
    }
  }

  async function onDisburse(runId: string) {
    setSaving(true)
    setError(null)
    try {
      await api.disbursePayroll(runId, { treasuryId, date: disburseDate })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to disburse payroll')
    } finally {
      setSaving(false)
    }
  }

  const draftRun = runs.find(
    (row) =>
      row.status === 'draft' &&
      row.periodYear === periodYear &&
      row.periodMonth === periodMonth,
  )

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
    label: row.name,
  }))

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Salary sheets & project labor allocation</h1>
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => setStructureModalOpen(true)}
          >
            Add salary structure
          </button>
          <button type="button" onClick={() => setTimeModalOpen(true)}>
            Add time log
          </button>
        </div>
      </header>

      <section className="grid">
        <article className="stat-card">
          <h3>Salary structures</h3>
          <p className="stat-value">{structures.length}</p>
        </article>
        <article className="stat-card">
          <h3>Time logs</h3>
          <p className="stat-value">{timeLogs.length}</p>
          <p className="muted">
            {periodYear}-{String(periodMonth).padStart(2, '0')}
          </p>
        </article>
        <article className="stat-card">
          <h3>Payroll runs</h3>
          <p className="stat-value">{runs.length}</p>
        </article>
      </section>

      <Modal
        open={structureModalOpen}
        title="Salary structure"
        description="Basic pay, allowances, and fixed deductions per employee."
        onClose={() => setStructureModalOpen(false)}
        wide
      >
        <form className="stack-form" onSubmit={(event) => void onSaveStructure(event)}>
          <div className="name-row">
            <label>
              Employee
              <Select
                value={employeeId}
                onChange={setEmployeeId}
                options={employeeOptions}
                placeholder="Select employee"
                required
              />
            </label>
            <label>
              Basic salary
              <input
                inputMode="decimal"
                value={basic}
                onChange={(e) => setBasic(e.target.value)}
                required
              />
            </label>
          </div>
          <div className="name-row">
            <label>
              Allowance
              <input value={allowanceName} onChange={(e) => setAllowanceName(e.target.value)} />
            </label>
            <label>
              Amount
              <input
                inputMode="decimal"
                value={allowanceAmount}
                onChange={(e) => setAllowanceAmount(e.target.value)}
              />
            </label>
            <label>
              Deduction
              <input value={deductionName} onChange={(e) => setDeductionName(e.target.value)} />
            </label>
            <label>
              Amount
              <input
                inputMode="decimal"
                value={deductionAmount}
                onChange={(e) => setDeductionAmount(e.target.value)}
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" disabled={saving || !employeeId}>
              {saving ? 'Saving…' : 'Save structure'}
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </Modal>

      <Modal
        open={timeModalOpen}
        title="Project time log"
        description="Labor cost is allocated to projects in proportion to logged days or hours."
        onClose={() => setTimeModalOpen(false)}
        wide
      >
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
      </Modal>

      <section className="table-card">
        <h2>Generate salary sheet</h2>
        <p className="muted">
          Auto-deducts open employee advances (1300) and allocates gross pay to projects
          (Dr 5100).
        </p>
        <div className="name-row">
          <button type="button" disabled={saving || Boolean(draftRun)} onClick={() => void onGenerate()}>
            {draftRun ? 'Sheet already generated' : 'Generate payroll'}
          </button>
        </div>
        {draftRun ? (
          <>
            <div className="name-row">
              <label>
                Disburse date
                <input
                  type="date"
                  value={disburseDate}
                  onChange={(e) => setDisburseDate(e.target.value)}
                />
              </label>
              <label>
                Treasury
                <Select
                  value={treasuryId}
                  onChange={setTreasuryId}
                  options={treasuryOptions}
                  placeholder="Select treasury"
                />
              </label>
            </div>
            <button type="button" disabled={saving} onClick={() => void onDisburse(draftRun.id)}>
              {saving ? 'Posting…' : 'Execute disbursement'}
            </button>
          </>
        ) : null}
      </section>

      <section className="table-card">
        <h2>Salary structures on file</h2>
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Basic</th>
              <th>Gross</th>
              <th>Deductions</th>
            </tr>
          </thead>
          <tbody>
            {structures.map((row) => (
              <tr key={row.id}>
                <td>{row.employeeName}</td>
                <td>{money(row.basic)}</td>
                <td>{money(row.gross)}</td>
                <td>{money(row.structuralDeductions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="table-card">
        <h2>Payroll runs</h2>
        <table>
          <thead>
            <tr>
              <th>Sheet</th>
              <th>Period</th>
              <th>Gross</th>
              <th>Advances</th>
              <th>Net pay</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link to={`/payroll/${row.id}`}>{row.sheetNumber}</Link>
                </td>
                <td>
                  {row.periodYear}-{String(row.periodMonth).padStart(2, '0')}
                </td>
                <td>{money(row.totalGross)}</td>
                <td>{money(row.totalAdvanceDeductions)}</td>
                <td>{money(row.totalNetPay)}</td>
                <td>
                  <span className={`status-pill status-${row.status}`}>
                    {PAYROLL_STATUS_LABEL[row.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {!structureModalOpen && !timeModalOpen && error ? (
        <p className="form-error">{error}</p>
      ) : null}
    </>
  )
}
