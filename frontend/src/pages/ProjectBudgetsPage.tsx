import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { money } from '../types/accounting'
import {
  PROJECT_STATUS_LABEL,
  type Project,
} from '../types/project'

export function ProjectBudgetsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .projects()
      .then(setProjects)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load project budgets')
      })
  }, [])

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Project budgets</h1>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="table-card">
        <div className="table-head">
          <h2>Budget vs actual</h2>
          <p className="muted">Contract value, budget, cost, and remaining runway</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Status</th>
              <th>Contract</th>
              <th>Budget</th>
              <th>Cost</th>
              <th>Remaining</th>
              <th>Used %</th>
              <th>Flag</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id}>
                <td>{project.code}</td>
                <td>
                  <Link to={`/projects/${project.id}`}>{project.name}</Link>
                </td>
                <td>
                  <span className={`status-pill status-${project.status}`}>
                    {PROJECT_STATUS_LABEL[project.status]}
                  </span>
                </td>
                <td>{money(project.contractValue)}</td>
                <td>{money(project.totalBudget)}</td>
                <td>{money(project.financials.totalCost)}</td>
                <td>{money(project.financials.budgetRemaining)}</td>
                <td>
                  {project.financials.budgetUsedPct === null
                    ? '—'
                    : `${project.financials.budgetUsedPct.toFixed(0)}%`}
                </td>
                <td>
                  {project.financials.isOverBudget ? (
                    <span className="badge-bad budget-flag">Over</span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            ))}
            {projects.length === 0 ? (
              <tr>
                <td colSpan={9} className="muted">
                  No projects yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </>
  )
}
