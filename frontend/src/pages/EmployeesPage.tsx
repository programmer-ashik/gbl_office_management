import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Modal, Select } from '../components/ui'
import { ROLE_LABEL, Role, type PublicUser } from '../types/auth'

const ROLE_OPTIONS = [
  { value: Role.EMPLOYEE, label: ROLE_LABEL[Role.EMPLOYEE] },
  { value: Role.PROJECT_MANAGER, label: ROLE_LABEL[Role.PROJECT_MANAGER] },
  { value: Role.ACCOUNTANT, label: ROLE_LABEL[Role.ACCOUNTANT] },
]

export function EmployeesPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState<PublicUser[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [role, setRole] = useState<string>(Role.EMPLOYEE)

  const canAdd = user?.role === Role.ADMIN

  async function load() {
    const data = await api.employees()
    setRows(data)
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load employees')
    })
  }, [])

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api.createEmployee({
        email,
        password,
        firstName,
        lastName,
        role: role as Role,
      })
      setEmail('')
      setPassword('')
      setFirstName('')
      setLastName('')
      setRole(Role.EMPLOYEE)
      setModalOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add employee')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Employees</h1>
        </div>
        {canAdd ? (
          <button type="button" onClick={() => setModalOpen(true)}>
            Add employee
          </button>
        ) : null}
      </header>

      <Modal
        open={modalOpen}
        title="Add employee"
        description="Creates a login for payroll, advances, and project work."
        onClose={() => setModalOpen(false)}
      >
        <form className="stack-form" onSubmit={(event) => void onCreate(event)}>
          <div className="name-row">
            <label>
              First name
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </label>
            <label>
              Last name
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </label>
          </div>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Temporary password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          <label>
            Role
            <Select
              value={role}
              onChange={setRole}
              options={ROLE_OPTIONS}
              placeholder="Select role"
              portal={false}
            />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Create employee'}
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </Modal>

      <section className="table-card">
        <div className="table-head">
          <h2>Directory</h2>
          <p className="muted">Employees, project managers, and accountants</p>
        </div>
        {error && !modalOpen ? <p className="form-error">{error}</p> : null}
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
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link to={`/employees/${row.id}/ledger`}>
                    {row.firstName} {row.lastName}
                  </Link>
                </td>
                <td>{row.email}</td>
                <td>{ROLE_LABEL[row.role]}</td>
                <td>{row.isActive ? 'Active' : 'Disabled'}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  No employees yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </>
  )
}
