import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { money } from '../types/accounting'
import { PAYROLL_STATUS_LABEL, type PayrollRun } from '../types/payroll'

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
            {row.journalNumber ? ` · ${row.journalNumber}` : null}
          </p>
        </div>
        <Link to="/payroll" className="ghost-link">
          Payroll
        </Link>
      </header>

      <section className="grid">
        <article className="stat-card">
          <h3>Gross</h3>
          <p className="stat-value">{money(row.totalGross)}</p>
        </article>
        <article className="stat-card">
          <h3>Advance deductions</h3>
          <p className="stat-value">{money(row.totalAdvanceDeductions)}</p>
        </article>
        <article className="stat-card">
          <h3>Net pay</h3>
          <p className="stat-value">{money(row.totalNetPay)}</p>
        </article>
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
                      {item.projectCode} · {item.projectName}
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
