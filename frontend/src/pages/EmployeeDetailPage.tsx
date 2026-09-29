import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import {
  EmployeeProfileFields,
  LoginAccountFields,
  emptyLogin,
  profileBody,
  profileFromEmployee,
  type EmployeeProfileValues,
  type LoginAccountValues,
} from '../components/EmployeeForms'
import { Modal } from '../components/ui'
import { money } from '../types/accounting'
import { ROLE_LABEL, Role } from '../types/auth'
import type { Employee } from '../types/employee'

export function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const isAdmin = user?.role === Role.ADMIN
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [profile, setProfile] = useState<EmployeeProfileValues | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [accessOpen, setAccessOpen] = useState(false)
  const [login, setLogin] = useState<LoginAccountValues>(emptyLogin())
  const [accessSaving, setAccessSaving] = useState(false)
  const [accessError, setAccessError] = useState<string | null>(null)

  function apply(row: Employee) {
    setEmployee(row)
    setProfile(profileFromEmployee(row))
  }

  useEffect(() => {
    if (!id) return
    let cancelled = false
    api
      .employee(id)
      .then((row) => {
        if (!cancelled) apply(row)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load employee')
        }
      })
    return () => {
      cancelled = true
    }
  }, [id])

  async function onSave(event: FormEvent) {
    event.preventDefault()
    if (!id || !profile) return
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      apply(await api.updateEmployee(id, profileBody(profile)))
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update employee')
    } finally {
      setSaving(false)
    }
  }

  async function onToggleActive() {
    if (!id || !employee) return
    setError(null)
    try {
      apply(await api.updateEmployee(id, { isActive: !employee.isActive }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update status')
    }
  }

  function openAccess() {
    setLogin(emptyLogin(employee?.email ?? ''))
    setAccessError(null)
    setAccessOpen(true)
  }

  async function onGrantAccess(event: FormEvent) {
    event.preventDefault()
    if (!id) return
    setAccessSaving(true)
    setAccessError(null)
    try {
      apply(
        await api.grantEmployeeAccess(id, {
          email: login.email.trim(),
          password: login.password,
          role: login.role as Role,
        }),
      )
      setAccessOpen(false)
    } catch (err) {
      setAccessError(
        err instanceof Error ? err.message : 'Unable to create login account',
      )
    } finally {
      setAccessSaving(false)
    }
  }

  if (!employee || !profile) {
    return error ? <p className="form-error">{error}</p> : <p className="muted">Loading…</p>
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{employee.designation ?? 'Employee'}</p>
          <h1>{employee.name}</h1>
          <p className="muted">
            {employee.isActive ? 'Active' : 'Inactive'}
            {employee.joinDate ? ` · joined ${employee.joinDate}` : ''}
            {employee.salary != null ? ` · salary ${money(employee.salary)}` : ''}
          </p>
        </div>
        <div className="form-actions">
          <Link to={`/employees/${employee.id}/ledger`} className="ghost-link">
            Advance ledger
          </Link>
          <Link to="/employees" className="ghost-link">
            All employees
          </Link>
        </div>
      </header>

      <section className="table-card">
        <div className="table-head">
          <h2>Software access</h2>
          {employee.account ? (
            <span className={employee.account.isActive ? 'status-pill is-ok' : 'status-pill is-off'}>
              {employee.account.isActive ? 'Login active' : 'Login disabled'}
            </span>
          ) : (
            <span className="status-pill is-off">No login</span>
          )}
        </div>
        {employee.account ? (
          <p className="muted">
            Signs in as <strong>{employee.account.email}</strong> with the{' '}
            {ROLE_LABEL[employee.account.role]} role.{' '}
            {isAdmin ? (
              <Link to="/settings/users">Manage in Users &amp; Permissions</Link>
            ) : null}
          </p>
        ) : (
          <>
            <p className="muted">
              This employee has no software login. Payroll, advances, and
              journals work without one.
            </p>
            {isAdmin ? (
              <div className="form-actions">
                <button type="button" onClick={openAccess}>
                  Create Login Account
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      <Modal
        open={accessOpen}
        title="Create login account"
        description={`Creates a software login for ${employee.name} and links it to this employee.`}
        onClose={() => setAccessOpen(false)}
      >
        <form className="stack-form" onSubmit={(event) => void onGrantAccess(event)}>
          <LoginAccountFields
            values={login}
            onChange={(patch) => setLogin((prev) => ({ ...prev, ...patch }))}
          />
          <div className="form-actions">
            <button type="submit" disabled={accessSaving}>
              {accessSaving ? 'Creating…' : 'Create login'}
            </button>
          </div>
          {accessError ? <p className="form-error">{accessError}</p> : null}
        </form>
      </Modal>

      <section className="table-card">
        <div className="table-head">
          <h2>Edit employee</h2>
          {isAdmin ? (
            <button type="button" className="ghost" onClick={() => void onToggleActive()}>
              {employee.isActive ? 'Mark inactive' : 'Mark active'}
            </button>
          ) : null}
        </div>
        <form className="stack-form" onSubmit={(event) => void onSave(event)}>
          <EmployeeProfileFields
            values={profile}
            onChange={(patch) => {
              setSaved(false)
              setProfile((prev) => (prev ? { ...prev, ...patch } : prev))
            }}
            disabled={!isAdmin}
          />
          {isAdmin ? (
            <div className="form-actions">
              <button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              {saved ? <span className="muted">Saved</span> : null}
            </div>
          ) : null}
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </section>
    </>
  )
}
