import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { money } from '../types/accounting'
import type {
  BurnRateRow,
  CashFlowForecast,
  FinancialStatements,
} from '../types/analytics'
import { ROLE_LABEL, Role, type HealthStatus, type PublicUser } from '../types/auth'
import type { Project } from '../types/project'
import type { TreasuryAccount } from '../types/banking'

export function DashboardPage() {
  const { user } = useAuth()
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [users, setUsers] = useState<PublicUser[] | null>(null)
  const [usersError, setUsersError] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [treasury, setTreasury] = useState<TreasuryAccount[] | null>(null)
  const [cashFlow, setCashFlow] = useState<CashFlowForecast | null>(null)
  const [burnRates, setBurnRates] = useState<BurnRateRow[] | null>(null)
  const [statements, setStatements] = useState<FinancialStatements | null>(null)
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)

  const isFinance = user?.role === Role.ADMIN || user?.role === Role.ACCOUNTANT
  const canSeeProjects =
    user?.role === Role.ADMIN ||
    user?.role === Role.ACCOUNTANT ||
    user?.role === Role.PROJECT_MANAGER

  useEffect(() => {
    api
      .health()
      .then(setHealth)
      .catch(() => setHealth(null))
  }, [])

  useEffect(() => {
    if (user?.role !== Role.ADMIN) return
    api
      .users()
      .then(setUsers)
      .catch((err: unknown) => {
        setUsersError(err instanceof Error ? err.message : 'Unable to load users')
      })
  }, [user?.role])

  useEffect(() => {
    if (!canSeeProjects) return
    api
      .projects()
      .then(setProjects)
      .catch(() => setProjects([]))
  }, [canSeeProjects])

  useEffect(() => {
    if (!isFinance) return
    api
      .treasury()
      .then(setTreasury)
      .catch(() => setTreasury([]))
  }, [isFinance])

  useEffect(() => {
    if (!canSeeProjects) return
    setAnalyticsError(null)
    const tasks: Promise<void>[] = [
      api
        .burnRate()
        .then(setBurnRates)
        .catch(() => setBurnRates([])),
    ]
    if (isFinance) {
      tasks.push(
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
      )
    }
    void Promise.all(tasks)
  }, [canSeeProjects, isFinance])

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

      <section className="grid">
        <article className="stat-card">
          <h3>Authentication</h3>
          <p className="stat-value">Active</p>
          <p className="muted">JWT access token + rotating refresh token</p>
        </article>
        <article className="stat-card">
          <h3>Database</h3>
          <p className="stat-value">
            {health?.database.connected ? 'Connected' : 'Checking…'}
          </p>
          <p className="muted">
            Replica set transactions {health?.database.ping ? 'ready' : 'pending'}
          </p>
        </article>
        <article className="stat-card">
          <h3>Your role</h3>
          <p className="stat-value">{ROLE_LABEL[user.role]}</p>
          <p className="muted">{user.email}</p>
        </article>
      </section>

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
              8-week outlook · AR inflows vs AP, scheduled payments & draft payroll
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

      {burnRates && burnRates.length > 0 ? (
        <section className="table-card">
          <div className="table-head">
            <h2>Project burn rate</h2>
            <p className="muted">Daily/weekly spend vs budget runway</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Budget</th>
                <th>Cost</th>
                <th>Daily</th>
                <th>Weekly</th>
                <th>Days left</th>
                <th>Projected end</th>
              </tr>
            </thead>
            <tbody>
              {burnRates.map((row) => (
                <tr key={row.projectId}>
                  <td>
                    <Link to={`/projects/${row.projectId}`}>
                      {row.projectCode} · {row.projectName}
                    </Link>
                    {row.isOverBudget ? (
                      <span className="badge-bad budget-flag">Over</span>
                    ) : null}
                  </td>
                  <td>{money(row.totalBudget)}</td>
                  <td>{money(row.totalCost)}</td>
                  <td>{money(row.dailyBurn)}</td>
                  <td>{money(row.weeklyBurn)}</td>
                  <td>
                    {row.estimatedDaysToComplete === null
                      ? '—'
                      : row.estimatedDaysToComplete}
                  </td>
                  <td>
                    {row.projectedEndDate
                      ? row.projectedEndDate.slice(0, 10)
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

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

      {projects ? (
        <section className="grid">
          <article className="stat-card">
            <h3>Projects</h3>
            <p className="stat-value">{projects.length}</p>
            <p className="muted">
              <Link to="/projects">Open project register</Link>
            </p>
          </article>
          <article className="stat-card">
            <h3>Over budget</h3>
            <p className="stat-value">
              {projects.filter((project) => project.financials.isOverBudget).length}
            </p>
            <p className="muted">Cost above the project budget threshold</p>
          </article>
          <article className="stat-card">
            <h3>Net profit (all)</h3>
            <p className="stat-value">
              {money(
                projects.reduce((sum, project) => sum + project.financials.netProfit, 0),
              )}
            </p>
            <p className="muted">From journals tagged to projects</p>
          </article>
        </section>
      ) : null}

      {user.role === Role.ADMIN ? (
        <section className="table-card">
          <div className="table-head">
            <h2>Users</h2>
            <p className="muted">Admin-only directory (RBAC enforced)</p>
          </div>
          {usersError ? <p className="form-error">{usersError}</p> : null}
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.firstName} {row.lastName}
                  </td>
                  <td>{row.email}</td>
                  <td>{ROLE_LABEL[row.role]}</td>
                  <td>{row.isActive ? 'Active' : 'Disabled'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : !isFinance ? (
        <section className="table-card">
          <h2>Workspace</h2>
          <p className="muted">
            {user.role === Role.PROJECT_MANAGER
              ? 'Review burn rates above, then open assigned Projects, Approvals, Advances, Procurement, or Inventory.'
              : 'Request a project advance from Advances. Full financials stay with Admin and Accountant.'}
          </p>
        </section>
      ) : null}
    </>
  )
}
