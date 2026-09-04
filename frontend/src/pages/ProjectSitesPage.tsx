import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import {
  PROJECT_STATUS_LABEL,
  type Project,
} from '../types/project'

export function ProjectSitesPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .projects()
      .then(setProjects)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load projects')
      })
  }, [])

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Site & material view</h1>
        </div>
      </header>

      <section className="table-card">
        <div className="table-head">
          <h2>Projects</h2>
          <p className="muted">
            Site and material mapping is tracked through purchase orders and inventory
            movements tagged to each project. Open procurement or inventory for
            allocation detail.
          </p>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Status</th>
              <th>Client</th>
              <th>Links</th>
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
                <td>{project.client.name}</td>
                <td>
                  <Link to={`/projects/${project.id}`}>Detail</Link>
                  {' · '}
                  <Link to="/procurement">Procurement</Link>
                  {' · '}
                  <Link to="/inventory">Inventory</Link>
                </td>
              </tr>
            ))}
            {projects.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
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
