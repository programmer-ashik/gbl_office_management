import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { money } from '../types/accounting'
import type { CashFlowForecast, FinancialStatements } from '../types/analytics'
import { Role } from '../types/auth'
import type { TreasuryAccount } from '../types/banking'

export function DashboardPage() {
  const { user } = useAuth()
  const [treasury, setTreasury] = useState<TreasuryAccount[] | null>(null)
  const [cashFlow, setCashFlow] = useState<CashFlowForecast | null>(null)
  const [statements, setStatements] = useState<FinancialStatements | null>(null)
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)

  const isFinance = user?.role === Role.ADMIN || user?.role === Role.ACCOUNTANT

  useEffect(() => {
    if (!isFinance) return
    api
      .treasury()
      .then(setTreasury)
      .catch(() => setTreasury([]))
  }, [isFinance])

  useEffect(() => {
    if (!isFinance) return
    setAnalyticsError(null)
    void Promise.all([
      api
        .cashFlow()
        .then(setCashFlow)
        .catch((err: unknown) => {
          setAnalyticsError(
            err instanceof Error ? err.message : 'Unable to load cash-flow forecast',
          )
        }),
      api
        .statements()
        .then(setStatements)
        .catch(() => setStatements(null)),
    ])
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

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Executive overview</h1>
        </div>
      </header>

      {treasury ? (
        <section className="grid">
          <article className="stat-card">
            <h3>Cash on hand</h3>
            <p className="stat-value">
              {money(
                treasury
                  .filter((row) => row.kind === 'cash' || row.kind === 'petty_cash')
                  .reduce((sum, row) => sum + row.bookBalance, 0),
              )}
            </p>
            <p className="muted">
              <Link to="/banking">Open banking</Link>
            </p>
          </article>
          <article className="stat-card">
            <h3>Banks & wallets</h3>
            <p className="stat-value">
              {money(
                treasury
                  .filter(
                    (row) =>
                      row.kind === 'commercial_bank' || row.kind === 'mobile_banking',
                  )
                  .reduce((sum, row) => sum + row.bookBalance, 0),
              )}
            </p>
            <p className="muted">{treasury.length} treasury channels</p>
          </article>
          <article className="stat-card">
            <h3>Total liquid</h3>
            <p className="stat-value">
              {money(treasury.reduce((sum, row) => sum + row.bookBalance, 0))}
            </p>
            <p className="muted">Book balances from the ledger</p>
          </article>
        </section>
      ) : null}

      {cashFlow ? (
        <section className="table-card">
          <div className="table-head">
            <h2>Cash-flow forecast</h2>
            <p className="muted">
              8-week outlook · AR inflows vs AP, scheduled payments & draft payroll ·{' '}
              <Link to="/analytics/cash-flow">Open full cash-flow view</Link>
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
                AP {money(cashFlow.sources.openPayables)} · Payroll{' '}
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

      {analyticsError ? <p className="form-error">{analyticsError}</p> : null}

      {statements ? (
        <section className="grid">
          <article className="stat-card">
            <h3>Revenue (P&amp;L)</h3>
            <p className="stat-value gain">{money(statements.profitAndLoss.revenue)}</p>
            <p className="muted">As of {statements.asOf.slice(0, 10)}</p>
          </article>
          <article className="stat-card">
            <h3>Expenses (P&amp;L)</h3>
            <p className="stat-value loss">{money(statements.profitAndLoss.expenses)}</p>
          </article>
          <article className="stat-card">
            <h3>Net income</h3>
            <p
              className={
                statements.profitAndLoss.netIncome < 0
                  ? 'stat-value loss'
                  : 'stat-value gain'
              }
            >
              {money(statements.profitAndLoss.netIncome)}
            </p>
          </article>
          <article className="stat-card">
            <h3>Balance sheet</h3>
            <p className="stat-value">{money(statements.balanceSheet.assets)}</p>
            <p className="muted">
              Assets · Liab. {money(statements.balanceSheet.liabilities)} · Equity{' '}
              {money(statements.balanceSheet.equity)}
            </p>
          </article>
        </section>
      ) : null}

      {!isFinance ? (
        <section className="table-card">
          <h2>Workspace</h2>
          <p className="muted">
            {user.role === Role.PROJECT_MANAGER
              ? 'Open Project Financials for burn rates and budget KPIs, or continue to Projects, Approvals, Advances, Procurement, or Inventory.'
              : 'Request a project advance from Advances. Full financials stay with Admin and Accountant. Open Settings → Profile for your account details.'}
          </p>
        </section>
      ) : null}
    </>
  )
}
