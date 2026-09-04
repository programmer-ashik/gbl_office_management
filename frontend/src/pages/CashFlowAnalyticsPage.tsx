import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { money } from '../types/accounting'
import type { CashFlowForecast } from '../types/analytics'
import { Role } from '../types/auth'

export function CashFlowAnalyticsPage() {
  const { user } = useAuth()
  const [cashFlow, setCashFlow] = useState<CashFlowForecast | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isFinance = user?.role === Role.ADMIN || user?.role === Role.ACCOUNTANT

  useEffect(() => {
    if (!isFinance) return
    setError(null)
    api
      .cashFlow()
      .then(setCashFlow)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load cash-flow forecast')
      })
  }, [isFinance])

  const maxFlow = (() => {
    if (!cashFlow?.weeks.length) return 1
    return Math.max(
      1,
      ...cashFlow.weeks.map((week) => Math.max(week.inflow, week.outflow)),
    )
  })()

  if (!user) {
    return null
  }

  if (!isFinance) {
    return (
      <>
        <header className="workspace-header">
          <div>
            <h1>Cash flow & burn rate</h1>
          </div>
        </header>
        <section className="table-card">
          <p className="muted">
            Cash-flow analytics are available to Admin and Accountant roles.
          </p>
          <p className="muted">
            <Link to="/">Back to executive overview</Link>
          </p>
        </section>
      </>
    )
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Cash flow & burn rate</h1>
        </div>
        <Link to="/" className="ghost-link">
          Executive overview
        </Link>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      {cashFlow ? (
        <section className="table-card">
          <div className="table-head">
            <h2>Cash-flow forecast</h2>
            <p className="muted">
              8-week outlook · AR inflows vs AP, scheduled payments & draft payroll · as of{' '}
              {cashFlow.asOf.slice(0, 10)}
            </p>
          </div>
          <section className="grid">
            <article className="stat-card">
              <h3>Opening cash</h3>
              <p className="stat-value">{money(cashFlow.openingCash)}</p>
            </article>
            <article className="stat-card">
              <h3>Projected inflows</h3>
              <p className="stat-value gain">{money(cashFlow.totalInflow)}</p>
              <p className="muted">Open AR {money(cashFlow.sources.openReceivables)}</p>
            </article>
            <article className="stat-card">
              <h3>Projected outflows</h3>
              <p className="stat-value loss">{money(cashFlow.totalOutflow)}</p>
              <p className="muted">
                AP {money(cashFlow.sources.openPayables)} · Scheduled{' '}
                {money(cashFlow.sources.scheduledSupplierPayments)} · Payroll{' '}
                {money(cashFlow.sources.draftPayroll)}
              </p>
            </article>
            <article className="stat-card">
              <h3>Projected close</h3>
              <p
                className={
                  cashFlow.projectedClosingCash < 0 ? 'stat-value loss' : 'stat-value'
                }
              >
                {money(cashFlow.projectedClosingCash)}
              </p>
            </article>
          </section>

          <div className="cashflow-bars">
            {cashFlow.weeks.map((week) => (
              <div key={week.weekStart} className="cashflow-row">
                <span>{week.weekLabel}</span>
                <div className="cashflow-track" aria-hidden>
                  <div
                    className="cashflow-in"
                    style={{ width: `${(week.inflow / maxFlow) * 100}%` }}
                  />
                  <div
                    className="cashflow-out"
                    style={{ width: `${(week.outflow / maxFlow) * 100}%` }}
                  />
                </div>
                <span className={week.net < 0 ? 'loss' : 'gain'}>{money(week.net)}</span>
              </div>
            ))}
          </div>

        </section>
      ) : null}

      {cashFlow ? (
        <section className="grid">
          <article className="stat-card">
            <h3>Open receivables</h3>
            <p className="stat-value">{money(cashFlow.sources.openReceivables)}</p>
          </article>
          <article className="stat-card">
            <h3>Open payables</h3>
            <p className="stat-value">{money(cashFlow.sources.openPayables)}</p>
          </article>
          <article className="stat-card">
            <h3>Scheduled supplier payments</h3>
            <p className="stat-value">
              {money(cashFlow.sources.scheduledSupplierPayments)}
            </p>
          </article>
          <article className="stat-card">
            <h3>Draft payroll</h3>
            <p className="stat-value">{money(cashFlow.sources.draftPayroll)}</p>
          </article>
        </section>
      ) : !error ? (
        <section className="table-card">
          <p className="muted">Loading cash-flow forecast…</p>
        </section>
      ) : null}
    </>
  )
}
