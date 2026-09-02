import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { Modal } from '../components/ui'
import { money } from '../types/accounting'
import {
  PROJECT_STATUS_LABEL,
  type CreateProjectBody,
  type Project,
} from '../types/project'

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [clientName, setClientName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState('')
  const [contractValue, setContractValue] = useState('')
  const [totalBudget, setTotalBudget] = useState('')
  const [description, setDescription] = useState('')

  async function load() {
    const rows = await api.projects()
    setProjects(rows)
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load projects')
    })
  }, [])

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const body: CreateProjectBody = {
        name,
        client: {
          name: clientName,
          contactName: contactName || undefined,
          email: email || undefined,
          phone: phone || undefined,
        },
        startDate,
        endDate: endDate || undefined,
        contractValue: Number(contractValue),
        totalBudget: Number(totalBudget),
        description: description || undefined,
      }
      await api.createProject(body)
      setName('')
      setClientName('')
      setContactName('')
      setEmail('')
      setPhone('')
      setEndDate('')
      setContractValue('')
      setTotalBudget('')
      setDescription('')
      setModalOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create project')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Project management</h1>
        </div>
        <button type="button" onClick={() => setModalOpen(true)}>
          Add project
        </button>
      </header>

      <Modal
        open={modalOpen}
        title="New project"
        onClose={() => setModalOpen(false)}
        wide
      >
        <form className="stack-form" onSubmit={(event) => void onCreate(event)}>
          <div className="name-row">
            <label>
              Project name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Client
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                required
              />
            </label>
          </div>
          <div className="name-row">
            <label>
              Contact
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          </div>
          <div className="name-row">
            <label>
              Phone
              <input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label>
              Description
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          </div>
          <div className="name-row">
            <label>
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </label>
            <label>
              End date
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
          </div>
          <div className="name-row">
            <label>
              Contract value
              <input
                inputMode="decimal"
                value={contractValue}
                onChange={(e) => setContractValue(e.target.value)}
                required
              />
            </label>
            <label>
              Total budget
              <input
                inputMode="decimal"
                value={totalBudget}
                onChange={(e) => setTotalBudget(e.target.value)}
                required
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Create project'}
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </Modal>

      <section className="table-card">
        <div className="table-head">
          <h2>Projects</h2>
          <p className="muted">Budget used and profit update from tagged journals.</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Client</th>
              <th>Status</th>
              <th>Budget used</th>
              <th>Net profit</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id}>
                <td>{project.code}</td>
                <td>
                  <Link to={`/projects/${project.id}`}>{project.name}</Link>
                </td>
                <td>{project.client.name}</td>
                <td>
                  <span className={`status-pill status-${project.status}`}>
                    {PROJECT_STATUS_LABEL[project.status]}
                  </span>
                </td>
                <td>
                  {project.financials.budgetUsedPct === null
                    ? money(project.financials.totalCost)
                    : `${project.financials.budgetUsedPct.toFixed(0)}%`}
                  {project.financials.isOverBudget ? (
                    <span className="badge-bad budget-flag">Over</span>
                  ) : null}
                </td>
                <td className={project.financials.netProfit < 0 ? 'loss' : 'gain'}>
                  {money(project.financials.netProfit)}
                </td>
              </tr>
            ))}
            {projects.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No projects yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {!modalOpen && error ? <p className="form-error">{error}</p> : null}
    </>
  )
}
