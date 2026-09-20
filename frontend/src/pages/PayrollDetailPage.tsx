import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { money } from '../types/accounting'
import { PAYROLL_STATUS_LABEL, type PayrollRun } from '../types/payroll'
import { MetricCard } from '../components/MetricCard'

export function PayrollDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [row, setRow] = useState<PayrollRun | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    api
      .payrollRun(id)
      .then(setRow)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load payroll run')
      })
  }, [id])

  if (!row) {
    return error ? <p className="form-error">{error}</p> : <p className="muted">Loading…</p>
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{row.sheetNumber}</p>
          <h1>
            {row.periodYear}-{String(row.periodMonth).padStart(2, '0')} payroll
          </h1>
          <p className="muted">
            <span className={`status-pill status-${row.status}`}>
              {PAYROLL_STATUS_LABEL[row.status]}
            </span>
            {row.accrualJournalNumber
              ? ` · Accrual ${row.accrualJournalNumber}`
              : null}
            {row.journalNumber ? ` · Payout ${row.journalNumber}` : null}
          </p>
        </div>
        <div className="form-actions">
          {row.status === 'disbursed' ? (
            <button
              type="button"
              className="ghost"
              onClick={() => void api.downloadPayrollSalarySlipsPdf(row.id)}
            >
              Salary slips PDF
            </button>
          ) : null}
          <Link to="/payroll/process" className="ghost-link">
            Process payroll
          </Link>
        </div>
      </header>

      <section className="grid metric-card-grid">
        <MetricCard variant="blue" title="Gross" value={money(row.totalGross)} />
        <MetricCard
          variant="amber"
          title="Advance deductions"
          value={money(row.totalAdvanceDeductions)}
        />
        <MetricCard variant="green" title="Net pay" value={money(row.totalNetPay)} />
      </section>

      {row.lines.map((line) => (
        <section key={line.employeeId} className="table-card">
          <h2>{line.employeeName}</h2>
          <p className="muted">
            Gross {money(line.gross)} · Deductions {money(line.structuralDeductions)} ·
            Advances {money(line.totalAdvanceDeductions)} · Net {money(line.netPay)}
          </p>
          {line.advanceDeductions.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Advance</th>
                  <th>Deducted</th>
                </tr>
              </thead>
              <tbody>
                {line.advanceDeductions.map((item) => (
                  <tr key={item.advanceId}>
                    <td>{item.advanceNumber}</td>
                    <td>{money(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Days/hours</th>
                <th>Labor cost</th>
              </tr>
            </thead>
            <tbody>
              {line.allocations.map((item) => (
                <tr key={item.projectId}>
                  <td>
                    <Link to={`/projects/${item.projectId}`}>
                      {item.projectName}
                    </Link>
                  </td>
                  <td>{item.quantity}</td>
                  <td>{money(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {error ? <p className="form-error">{error}</p> : null}
    </>
  )
}
