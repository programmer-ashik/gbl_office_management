import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { ActionMenu, Modal, Select } from '../components/ui'
import { ROLE_LABEL, Role, type PublicUser } from '../types/auth'
import {
  allPermissionOptions,
  effectiveAllowedIds,
  grantedPermissionLabels,
} from '../utils/rolePermissions'

const CREATE_ROLE_OPTIONS = [
  { value: Role.EMPLOYEE, label: ROLE_LABEL[Role.EMPLOYEE] },
  { value: Role.PROJECT_MANAGER, label: ROLE_LABEL[Role.PROJECT_MANAGER] },
  { value: Role.ACCOUNTANT, label: ROLE_LABEL[Role.ACCOUNTANT] },
]

const PERMISSION_ROLE_OPTIONS = [
  ...CREATE_ROLE_OPTIONS,
  { value: Role.ADMIN, label: ROLE_LABEL[Role.ADMIN] },
]

export function UsersPermissionsPage() {
  const { user, applyUser } = useAuth()
  const [rows, setRows] = useState<PublicUser[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<PublicUser | null>(null)
  const [accessTarget, setAccessTarget] = useState<PublicUser | null>(null)
  const [allowedIds, setAllowedIds] = useState<Set<string>>(new Set())
  const [accessSaving, setAccessSaving] = useState(false)
  const [accessError, setAccessError] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')
  const [resetSaving, setResetSaving] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [defaultPassword, setDefaultPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [role, setRole] = useState<string>(Role.EMPLOYEE)

  const accessCatalog = useMemo(() => allPermissionOptions(), [])

  async function load() {
    const data = await api.users()
    setRows(data)
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load users')
    })
  }, [])

  function openAccess(row: PublicUser) {
    const effective = effectiveAllowedIds(
      row.role,
      row.allowedPermissions,
      row.deniedPermissions ?? [],
    )
    if (effective == null) {
      // Unconfigured: pre-check this role's default work areas.
      const roleLabels = new Set(grantedPermissionLabels(row.role, null, []))
      setAllowedIds(
        new Set(
          allPermissionOptions()
            .filter((opt) => roleLabels.has(opt.label))
            .map((opt) => opt.id),
        ),
      )
    } else {
      setAllowedIds(new Set(effective))
    }
    setAccessError(null)
    setAccessTarget(row)
  }

  function toggleAllowed(id: string) {
    setAllowedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function onSaveAccess(event: FormEvent) {
    event.preventDefault()
    if (!accessTarget) return
    setAccessSaving(true)
    setAccessError(null)
    try {
      const updated = await api.updateUserPermissions(
        accessTarget.id,
        [...allowedIds],
      )
      setRows((current) =>
        current.map((row) => (row.id === updated.id ? updated : row)),
      )
      applyUser(updated)
      setAccessTarget(null)
    } catch (err) {
      setAccessError(
        err instanceof Error ? err.message : 'Unable to save permissions',
      )
    } finally {
      setAccessSaving(false)
    }
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api.createEmployee({
        email,
        default_password: defaultPassword,
        firstName,
        lastName,
        role: role as Role,
      })
      setEmail('')
      setDefaultPassword('')
      setFirstName('')
      setLastName('')
      setRole(Role.EMPLOYEE)
      setModalOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create user')
    } finally {
      setSaving(false)
    }
  }

  async function onChangeRole(id: string, nextRole: Role) {
    setBusyId(id)
    setError(null)
    try {
      const updated = await api.updateUserRole(id, nextRole)
      setRows((current) =>
        current.map((row) => (row.id === id ? updated : row)),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update role')
      await load().catch(() => undefined)
    } finally {
      setBusyId(null)
    }
  }

  async function onToggleActive(row: PublicUser) {
    setBusyId(row.id)
    setError(null)
    try {
      const updated = await api.updateUserStatus(row.id, !row.isActive)
      setRows((current) =>
        current.map((item) => (item.id === row.id ? updated : item)),
      )
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to update access status',
      )
    } finally {
      setBusyId(null)
    }
  }

  async function onResetPassword(event: FormEvent) {
    event.preventDefault()
    if (!resetTarget) return
    if (resetPassword !== resetConfirm) {
      setResetError('Passwords do not match')
      return
    }
    setResetSaving(true)
    setResetError(null)
    try {
      await api.resetUserPassword(resetTarget.id, resetPassword)
      setResetTarget(null)
      setResetPassword('')
      setResetConfirm('')
    } catch (err) {
      setResetError(
        err instanceof Error ? err.message : 'Unable to reset password',
      )
    } finally {
      setResetSaving(false)
    }
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Users &amp; Permissions</h1>
          <p className="muted">
            Create accounts, assign roles, and control which areas each user can
            open.
          </p>
        </div>
        <button type="button" onClick={() => setModalOpen(true)}>
          Add user
        </button>
      </header>

      <Modal
        open={modalOpen}
        title="Add user"
        description="Creates a login with a default password and permission role."
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
            Default password
            <input
              type="password"
              value={defaultPassword}
              onChange={(e) => setDefaultPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          <label>
            Permission role
            <Select
              value={role}
              onChange={setRole}
              options={CREATE_ROLE_OPTIONS}
              placeholder="Select role"
              portal={false}
            />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Create user'}
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </Modal>

      <Modal
        open={Boolean(accessTarget)}
        title="Access permissions"
        description={
          accessTarget
            ? `Select every area ${accessTarget.firstName} ${accessTarget.lastName} may open. Only checked permissions stay available after save.`
            : undefined
        }
        onClose={() => {
          setAccessTarget(null)
          setAccessError(null)
        }}
      >
        <form
          className="stack-form"
          onSubmit={(event) => void onSaveAccess(event)}
        >
          <div className="permission-check-list">
            {accessCatalog.map((item) => (
              <label key={item.id} className="permission-check-row">
                <input
                  type="checkbox"
                  checked={allowedIds.has(item.id)}
                  onChange={() => toggleAllowed(item.id)}
                />
                <span>{item.label}</span>
              </label>
            ))}
            {accessCatalog.length === 0 ? (
              <p className="muted">No permissions for this role.</p>
            ) : null}
          </div>
          {accessError ? <p className="form-error">{accessError}</p> : null}
          <div className="form-actions">
            <button type="submit" disabled={accessSaving}>
              {accessSaving ? 'Saving…' : 'Save permissions'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(resetTarget)}
        title="Reset password"
        description={
          resetTarget
            ? `Set a new password for ${resetTarget.firstName} ${resetTarget.lastName}.`
            : undefined
        }
        onClose={() => {
          setResetTarget(null)
          setResetPassword('')
          setResetConfirm('')
          setResetError(null)
        }}
      >
        <form
          className="stack-form"
          onSubmit={(event) => void onResetPassword(event)}
        >
          <label>
            New password
            <input
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          <label>
            Confirm password
            <input
              type="password"
              value={resetConfirm}
              onChange={(e) => setResetConfirm(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          {resetError ? <p className="form-error">{resetError}</p> : null}
          <div className="form-actions">
            <button type="submit" disabled={resetSaving}>
              {resetSaving ? 'Saving…' : 'Reset password'}
            </button>
          </div>
        </form>
      </Modal>

      <section className="table-card">
        <div className="table-head">
          <h2>User directory</h2>
          <p className="muted">
            Use Access to grant or remove visit rights. Actions covers password
            and account status.
          </p>
        </div>
        {error && !modalOpen && !resetTarget && !accessTarget ? (
          <p className="form-error">{error}</p>
        ) : null}
        <div className="users-table-wrap">
          <table className="users-permission-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Access</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isSelf = row.id === user?.id
                const busy = busyId === row.id
                const granted = grantedPermissionLabels(
                  row.role,
                  row.allowedPermissions,
                  row.deniedPermissions,
                )
                return (
                  <tr key={row.id}>
                    <td>
                      <Link to={`/employees/${row.id}/ledger`}>
                        {row.firstName} {row.lastName}
                      </Link>
                      {isSelf ? <span className="muted"> · you</span> : null}
                    </td>
                    <td>{row.email}</td>
                    <td>
                      <Select
                        value={row.role}
                        onChange={(value) =>
                          void onChangeRole(row.id, value as Role)
                        }
                        options={PERMISSION_ROLE_OPTIONS}
                        disabled={busy}
                        portal
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ghost access-btn"
                        disabled={busy}
                        onClick={() => openAccess(row)}
                        title={granted.join(', ') || 'No access areas'}
                      >
                        Access
                        <span className="access-btn-count">{granted.length}</span>
                      </button>
                    </td>
                    <td>
                      <span
                        className={
                          row.isActive
                            ? 'status-pill is-ok'
                            : 'status-pill is-off'
                        }
                      >
                        {row.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td>
                      <ActionMenu
                        disabled={busy}
                        items={[
                          {
                            label: 'Reset password',
                            onSelect: () => {
                              setResetTarget(row)
                              setResetError(null)
                              setResetPassword('')
                              setResetConfirm('')
                            },
                          },
                          {
                            label: row.isActive
                              ? 'Disable access'
                              : 'Enable access',
                            danger: row.isActive,
                            disabled: isSelf,
                            disabledReason: isSelf
                              ? 'You cannot disable your own account'
                              : undefined,
                            onSelect: () => void onToggleActive(row),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    No users yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
