import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { Select } from '../components/ui'
import { money } from '../types/accounting'
import {
  PAYROLL_STATUS_LABEL,
  type PayrollRun,
} from '../types/payroll'
import type { TreasuryAccount } from '../types/banking'
import { MetricCard } from '../components/MetricCard'

export function PayrollProcessPage() {
  const [runs, setRuns] = useState<PayrollRun[]>([])
  const [treasury, setTreasury] = useState<TreasuryAccount[]>([])
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear())
  const [periodMonth, setPeriodMonth] = useState(new Date().getMonth() + 1)
  const [treasuryId, setTreasuryId] = useState('')
  const [disburseDate, setDisburseDate] = useState(
    new Date().toISOString().slice(0, 10),
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    const [runRows, channels] = await Promise.all([
      api.payrollRuns(),
      api.treasury(),
    ])
    setRuns(runRows)
    setTreasury(channels)
    if (!treasuryId && channels[0]) setTreasuryId(channels[0].id)
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load payroll')
    })
  }, [])

  const periodRun = runs.find(
    (row) =>
      row.periodYear === periodYear && row.periodMonth === periodMonth,
  )

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

  async function onPost(runId: string) {
    setSaving(true)
    setError(null)
    try {
      await api.postPayroll(runId)
      await load()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to post monthly payroll',
      )
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
      await api.downloadPayrollSalarySlipsPdf(runId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to disburse payroll')
    } finally {
      setSaving(false)
    }
  }

  const treasuryOptions = treasury.map((row) => ({
    value: row.id,
    label: row.name,
  }))

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Monthly payroll process</h1>
          <p className="muted">
            Generate preview → Post accrual (Dr 5120/5230) → Disburse from
            treasury (Dr 2121) + salary slips.
          </p>
        </div>
        <div className="form-actions">
          <Link className="ghost-link" to="/payroll/structures">
            Salary structures
          </Link>
          <Link className="ghost-link" to="/payroll/time">
            Time logs
          </Link>
          <Link className="ghost-link" to="/settings/payroll">
            Payroll rules
          </Link>
        </div>
      </header>

      <section className="grid metric-card-grid">
        <MetricCard
          variant="blue"
          title="Gross (period)"
          value={periodRun ? money(periodRun.totalGross) : '—'}
        />
        <MetricCard
          variant="amber"
          title="Advances"
          value={periodRun ? money(periodRun.totalAdvanceDeductions) : '—'}
        />
        <MetricCard
          variant="green"
          title="Net pay"
          value={periodRun ? money(periodRun.totalNetPay) : '—'}
        />
      </section>

      <section className="table-card">
        <h2>Select period</h2>
        <div className="name-row">
          <label>
            Year
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
        </div>

        {!periodRun ? (
          <div className="form-actions">
            <button type="button" disabled={saving} onClick={() => void onGenerate()}>
              {saving ? 'Generating…' : 'Generate payroll preview'}
            </button>
          </div>
        ) : (
          <>
            <p className="muted">
              Sheet {periodRun.sheetNumber} ·{' '}
              <span className={`status-pill status-${periodRun.status}`}>
                {PAYROLL_STATUS_LABEL[periodRun.status]}
              </span>
              {periodRun.accrualJournalNumber
                ? ` · Accrual ${periodRun.accrualJournalNumber}`
                : ''}
              {periodRun.journalNumber
                ? ` · Payout ${periodRun.journalNumber}`
                : ''}
            </p>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th className="num">Gross</th>
                    <th className="num">PF / Tax / Adv</th>
                    <th className="num">Open advances</th>
                    <th className="num">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {periodRun.lines.map((line) => (
                    <tr key={line.employeeId}>
                      <td>{line.employeeName}</td>
                      <td className="num">{money(line.gross)}</td>
                      <td className="num">
                        {money(
                          (line.providentFund ?? 0) +
                            (line.taxDeduction ?? 0) +
                            (line.structureAdvance ?? 0),
                        )}
                      </td>
                      <td className="num">
                        {money(line.totalAdvanceDeductions)}
                      </td>
                      <td className="num">{money(line.netPay)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {periodRun.status === 'draft' ? (
              <div className="form-actions">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void onPost(periodRun.id)}
                >
                  {saving ? 'Posting…' : 'Post Monthly Payroll'}
                </button>
              </div>
            ) : null}

            {periodRun.status === 'posted' ? (
              <>
                <div className="name-row">
                  <label>
                    Payout date
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
                <div className="form-actions">
                  <button
                    type="button"
                    disabled={saving || !treasuryId}
                    onClick={() => void onDisburse(periodRun.id)}
                  >
                    {saving ? 'Disbursing…' : 'Execute Disbursement'}
                  </button>
                </div>
              </>
            ) : null}

            {periodRun.status === 'disbursed' ? (
              <div className="form-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() =>
                    void api.downloadPayrollSalarySlipsPdf(periodRun.id)
                  }
                >
                  Download salary slips PDF
                </button>
                <Link className="ghost-link" to={`/payroll/${periodRun.id}`}>
                  View run detail
                </Link>
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="table-card">
        <h2>All payroll runs</h2>
        <table>
          <thead>
            <tr>
              <th>Sheet</th>
              <th>Period</th>
              <th>Gross</th>
              <th>Net</th>
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

      {error ? <p className="form-error">{error}</p> : null}
    </>
  )
}
