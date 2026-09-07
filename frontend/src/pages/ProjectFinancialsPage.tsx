import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { money } from '../types/accounting'
import type { BurnRateRow } from '../types/analytics'
import { Role } from '../types/auth'
import type { Project } from '../types/project'
import { MetricCard } from '../components/MetricCard'

export function ProjectFinancialsPage() {
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [burnRates, setBurnRates] = useState<BurnRateRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canAccess =
    user?.role === Role.ADMIN ||
    user?.role === Role.ACCOUNTANT ||
    user?.role === Role.PROJECT_MANAGER

  useEffect(() => {
    if (!canAccess) return
    setError(null)
    void Promise.all([
      api
        .projects()
        .then(setProjects)
        .catch((err: unknown) => {
          setProjects([])
          setError(err instanceof Error ? err.message : 'Unable to load projects')
        }),
      api
        .burnRate()
        .then(setBurnRates)
        .catch(() => setBurnRates([])),
    ])
  }, [canAccess])

  if (!user) {
    return null
  }

  if (!canAccess) {
    return (
      <>
        <header className="workspace-header">
          <div>
            <h1>Project financials</h1>
          </div>
        </header>
        <section className="table-card">
          <p className="muted">
            Project financials are available to Admin, Accountant, and Project Manager
            roles.
          </p>
        </section>
      </>
    )
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Project financials</h1>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      {projects ? (
        <section className="grid metric-card-grid">
          <MetricCard
            variant="blue"
            title="Projects"
            value={projects.length}
            meta={<Link to="/projects">Open project register</Link>}
          />
          <MetricCard
            variant="amber"
            title="Over budget"
            value={
              projects.filter((project) => project.financials.isOverBudget).length
            }
            meta="Cost above the project budget threshold"
          />
          <MetricCard
            variant="green"
            title="Net profit (all)"
            value={money(
              projects.reduce(
                (sum, project) => sum + project.financials.netProfit,
                0,
              ),
            )}
            meta="From journals tagged to projects"
          />
        </section>
      ) : null}

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
                      {row.projectName}
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
                    {row.projectedEndDate ? row.projectedEndDate.slice(0, 10) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : burnRates ? (
        <section className="table-card">
          <p className="muted">No burn-rate data yet.</p>
        </section>
      ) : null}

      {projects && projects.length > 0 ? (
        <section className="table-card">
          <div className="table-head">
            <h2>Budget vs actual</h2>
            <p className="muted">Contract budget against recognized cost</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Budget</th>
                <th>Actual cost</th>
                <th>Remaining</th>
                <th>Used</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td>
                    <Link to={`/projects/${project.id}`}>
                      {project.code} · {project.name}
                    </Link>
                    {project.financials.isOverBudget ? (
                      <span className="badge-bad budget-flag">Over</span>
                    ) : null}
                  </td>
                  <td>{money(project.financials.totalBudget)}</td>
                  <td>{money(project.financials.totalCost)}</td>
                  <td>{money(project.financials.budgetRemaining)}</td>
                  <td>
                    {project.financials.budgetUsedPct === null
                      ? '—'
                      : `${project.financials.budgetUsedPct.toFixed(0)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  )
}
