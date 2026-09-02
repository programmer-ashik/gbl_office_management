import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { money } from '../types/accounting'
import type { AgingReport } from '../types/ar-ap'

export function AgingPage() {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10))
  const [ar, setAr] = useState<AgingReport | null>(null)
  const [ap, setAp] = useState<AgingReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const [arReport, apReport] = await Promise.all([
      api.arAging(asOf),
      api.apAging(asOf),
    ])
    setAr(arReport)
    setAp(apReport)
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load aging reports')
    })
  }, [asOf])

  function renderReport(title: string, report: AgingReport | null) {
    if (!report) {
      return null
    }
    return (
      <section className="table-card">
        <div className="table-head">
          <h2>{title}</h2>
          <p className="muted">As of {report.asOf.slice(0, 10)} · Total {money(report.total)}</p>
        </div>
        <div className="grid">
          {report.buckets.map((bucket) => (
            <article key={bucket.key} className="stat-card">
              <h3>{bucket.label}</h3>
              <p className="stat-value">{money(bucket.amount)}</p>
              <p className="muted">{bucket.lines.length} open items</p>
            </article>
          ))}
        </div>
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Party</th>
              <th>Due</th>
              <th>Days late</th>
              <th>Bucket</th>
              <th>Open</th>
            </tr>
          </thead>
          <tbody>
            {report.buckets.flatMap((bucket) =>
              bucket.lines.map((line) => (
                <tr key={`${bucket.key}-${line.id}`}>
                  <td>{line.reference}</td>
                  <td>{line.partyName}</td>
                  <td>{line.dueDate.slice(0, 10)}</td>
                  <td>{line.daysPastDue}</td>
                  <td>{bucket.label}</td>
                  <td>{money(line.openAmount)}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </section>
    )
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>AR & AP aging</h1>
        </div>
        <div className="header-actions">
          <Link to="/receivables" className="ghost-link">
            Receivables
          </Link>
          <Link to="/payables" className="ghost-link">
            Payables
          </Link>
        </div>
      </header>

      <section className="table-card">
        <label>
          As-of date
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </label>
      </section>

      {renderReport('Accounts receivable aging', ar)}
      {renderReport('Accounts payable aging', ap)}

      {error ? <p className="form-error">{error}</p> : null}
    </>
  )
}
