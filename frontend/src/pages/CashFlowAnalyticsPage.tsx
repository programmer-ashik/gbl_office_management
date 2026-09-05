import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { MetricCard } from '../components/MetricCard'
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
          <section className="grid metric-card-grid">
            <MetricCard
              variant="blue"
              title="Opening cash"
              value={money(cashFlow.openingCash)}
            />
            <MetricCard
              variant="green"
              title="Projected inflows"
              value={money(cashFlow.totalInflow)}
              valueTone="up"
              meta={`Open AR ${money(cashFlow.sources.openReceivables)}`}
            />
            <MetricCard
              variant="red"
              title="Projected outflows"
              value={money(cashFlow.totalOutflow)}
              valueTone="down"
              meta={
                <>
                  AP {money(cashFlow.sources.openPayables)} · Scheduled{' '}
                  {money(cashFlow.sources.scheduledSupplierPayments)} · Payroll{' '}
                  {money(cashFlow.sources.draftPayroll)}
                </>
              }
            />
            <MetricCard
              variant="amber"
              title="Projected close"
              value={money(cashFlow.projectedClosingCash)}
              valueTone={cashFlow.projectedClosingCash < 0 ? 'down' : 'default'}
            />
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
        <section className="grid metric-card-grid">
          <MetricCard
            variant="green"
            title="Open receivables"
            value={money(cashFlow.sources.openReceivables)}
            valueTone="up"
          />
          <MetricCard
            variant="red"
            title="Open payables"
            value={money(cashFlow.sources.openPayables)}
            valueTone="down"
          />
          <MetricCard
            variant="amber"
            title="Scheduled supplier payments"
            value={money(cashFlow.sources.scheduledSupplierPayments)}
          />
          <MetricCard
            variant="purple"
            title="Draft payroll"
            value={money(cashFlow.sources.draftPayroll)}
          />
        </section>
      ) : !error ? (
        <section className="table-card">
          <p className="muted">Loading cash-flow forecast…</p>
        </section>
      ) : null}
    </>
  )
}
