import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { money } from '../types/accounting'
import type { BurnRateRow } from '../types/analytics'
import { Role } from '../types/auth'
import type { Project } from '../types/project'
import { ClampText } from '../components/ClampText'
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
          <div className="table-scroll">
            <table className="fixed-table">
              <colgroup>
                <col style={{ width: '28%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '14%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Project</th>
                  <th className="num">Budget</th>
                  <th className="num">Cost</th>
                  <th className="num">Daily</th>
                  <th className="num">Weekly</th>
                  <th className="num">Days left</th>
                  <th>Projected end</th>
                </tr>
              </thead>
              <tbody>
                {burnRates.map((row) => (
                  <tr key={row.projectId}>
                    <td>
                      <div className="cell-with-flag">
                        <ClampText title={row.projectName}>
                          <Link to={`/projects/${row.projectId}`}>
                            {row.projectName}
                          </Link>
                        </ClampText>
                        {row.isOverBudget ? (
                          <span className="badge-bad budget-flag">Over</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="num">{money(row.totalBudget)}</td>
                    <td className="num">{money(row.totalCost)}</td>
                    <td className="num">{money(row.dailyBurn)}</td>
                    <td className="num">{money(row.weeklyBurn)}</td>
                    <td className="num">
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
          </div>
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
          <div className="table-scroll">
            <table className="fixed-table">
              <colgroup>
                <col style={{ width: '40%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '12%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Project</th>
                  <th className="num">Budget</th>
                  <th className="num">Actual cost</th>
                  <th className="num">Remaining</th>
                  <th className="num">Used</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td>
                      <div className="cell-with-flag">
                        <ClampText title={`${project.code} · ${project.name}`}>
                          <Link to={`/projects/${project.id}`}>
                            {project.code} · {project.name}
                          </Link>
                        </ClampText>
                        {project.financials.isOverBudget ? (
                          <span className="badge-bad budget-flag">Over</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="num">{money(project.financials.totalBudget)}</td>
                    <td className="num">{money(project.financials.totalCost)}</td>
                    <td className="num">{money(project.financials.budgetRemaining)}</td>
                    <td className="num">
                      {project.financials.budgetUsedPct === null
                        ? '—'
                        : `${project.financials.budgetUsedPct.toFixed(0)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  )
}
