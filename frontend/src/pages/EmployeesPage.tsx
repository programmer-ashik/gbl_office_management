import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import {
  EmployeeProfileFields,
  LoginAccountFields,
  emptyLogin,
  emptyProfile,
  profileBody,
  type EmployeeProfileValues,
  type LoginAccountValues,
} from '../components/EmployeeForms'
import { Modal } from '../components/ui'
import { money } from '../types/accounting'
import { ROLE_LABEL, Role } from '../types/auth'
import type { Employee } from '../types/employee'

/** Staff directory for payroll / advances. Software access is optional per employee. */
export function EmployeesPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState<Employee[]>([])
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [profile, setProfile] = useState<EmployeeProfileValues>(emptyProfile())
  const [grantAccess, setGrantAccess] = useState(false)
  const [login, setLogin] = useState<LoginAccountValues>(emptyLogin())

  const canAdd = user?.role === Role.ADMIN

  async function load() {
    setRows(await api.employees())
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load employees')
    })
  }, [])

  function closeModal() {
    setModalOpen(false)
    setFormError(null)
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      const body = profileBody(profile)
      await api.createEmployee(
        grantAccess
          ? {
              ...body,
              createAccount: true,
              email: login.email.trim(),
              password: login.password,
              role: login.role as Role,
            }
          : { ...body, createAccount: false },
      )
      setProfile(emptyProfile())
      setLogin(emptyLogin())
      setGrantAccess(false)
      setModalOpen(false)
      await load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to add employee')
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
        description="HR record for payroll, advances, and project work. A software login is optional."
        onClose={closeModal}
      >
        <form className="stack-form" onSubmit={(event) => void onCreate(event)}>
          <EmployeeProfileFields
            values={profile}
            onChange={(patch) => setProfile((prev) => ({ ...prev, ...patch }))}
            hideEmail={grantAccess}
          />
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={grantAccess}
              onChange={(e) => {
                setGrantAccess(e.target.checked)
                if (e.target.checked && !login.email && profile.email) {
                  setLogin((prev) => ({ ...prev, email: profile.email }))
                }
              }}
            />
            Grant Software Access
          </label>
          {grantAccess ? (
            <fieldset className="employee-access-fields">
              <legend>Login account</legend>
              <LoginAccountFields
                values={login}
                onChange={(patch) => setLogin((prev) => ({ ...prev, ...patch }))}
              />
            </fieldset>
          ) : (
            <p className="field-hint">
              Without access the employee can still be paid, given advances, and
              tagged on journals. You can create a login later.
            </p>
          )}
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Create employee'}
            </button>
          </div>
          {formError ? <p className="form-error">{formError}</p> : null}
        </form>
      </Modal>

      <section className="table-card">
        <div className="table-head">
          <h2>Directory</h2>
          <p className="muted">HR records, with or without a software login</p>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Designation</th>
              <th>Phone</th>
              <th className="num">Salary</th>
              <th className="num" title="Posted to salary heads (e.g. 5230), tagged to this employee">
                Salary drawn
              </th>
              <th className="num" title="Posted to conveyance heads (e.g. 5141), tagged to this employee">
                Conveyance
              </th>
              <th>Software access</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link to={`/employees/${row.id}`}>
                    {row.firstName} {row.lastName}
                  </Link>
                </td>
                <td>{row.designation ?? '—'}</td>
                <td>{row.phone ?? '—'}</td>
                <td className="num">{row.salary != null ? money(row.salary) : '—'}</td>
                <td className="num">
                  {row.expenses?.salary ? money(row.expenses.salary) : '—'}
                </td>
                <td className="num">
                  {row.expenses?.conveyance ? money(row.expenses.conveyance) : '—'}
                </td>
                <td>
                  {row.account ? (
                    <>
                      {ROLE_LABEL[row.account.role]}
                      <span className="muted"> · {row.account.email}</span>
                      {row.account.isActive ? null : (
                        <span className="status-pill is-off"> Login disabled</span>
                      )}
                    </>
                  ) : (
                    <span className="muted">No login</span>
                  )}
                </td>
                <td>{row.isActive ? 'Active' : 'Inactive'}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted">
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
