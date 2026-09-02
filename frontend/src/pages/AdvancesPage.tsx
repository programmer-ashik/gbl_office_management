import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { Modal, Select } from '../components/ui'
import { money } from '../types/accounting'
import {
  ADVANCE_STATUS_LABEL,
  type Advance,
  type AdvanceProjectOption,
} from '../types/advance'

export function AdvancesPage() {
  const [rows, setRows] = useState<Advance[]>([])
  const [projects, setProjects] = useState<AdvanceProjectOption[]>([])
  const [projectId, setProjectId] = useState('')
  const [amount, setAmount] = useState('')
  const [purpose, setPurpose] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  async function load() {
    const [advances, options] = await Promise.all([
      api.advances(),
      api.advanceProjects(),
    ])
    setRows(advances)
    setProjects(options)
    if (!projectId && options[0]) {
      setProjectId(options[0].id)
    }
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load advances')
    })
  }, [])

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    if (!projectId) return
    setSaving(true)
    setError(null)
    try {
      await api.createAdvance({
        projectId,
        amount: Number(amount),
        purpose,
      })
      setAmount('')
      setPurpose('')
      setModalOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit requisition')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Advance & expense settlement</h1>
        </div>
        <button type="button" onClick={() => setModalOpen(true)}>
          Submit requisition
        </button>
      </header>

      <Modal
        open={modalOpen}
        title="Step 1 · Requisition"
        description="Request cash for a project. Until settlement, the payment is an employee advance asset — not a project expense."
        onClose={() => setModalOpen(false)}
      >
        <form className="stack-form" onSubmit={(event) => void onCreate(event)}>
          <div className="name-row">
            <label>
              Project
              <Select
                value={projectId}
                onChange={setProjectId}
                options={projects.map((project) => ({
                  value: project.id,
                  label: `${project.code} · ${project.name}`,
                }))}
                placeholder="Select project"
                required
              />
            </label>
            <label>
              Amount
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </label>
          </div>
          <label>
            Purpose
            <input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              required
              minLength={5}
            />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={saving || !projectId}>
              {saving ? 'Submitting…' : 'Submit requisition'}
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </Modal>

      <section className="table-card">
        <div className="table-head">
          <h2>Advances</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Project</th>
              <th>Employee</th>
              <th>Requested</th>
              <th>Spent</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link to={`/advances/${row.id}`}>{row.advanceNumber}</Link>
                </td>
                <td>
                  {row.projectCode} · {row.projectName}
                </td>
                <td>{row.employeeName}</td>
                <td>{money(row.requestedAmount)}</td>
                <td>{row.spentAmount === null ? '—' : money(row.spentAmount)}</td>
                <td>
                  <span className={`status-pill status-${row.status}`}>
                    {ADVANCE_STATUS_LABEL[row.status]}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No advances yet.
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
