import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { ROLE_LABEL, type HealthStatus } from '../types/auth'
import { grantedPermissionLabels } from '../utils/rolePermissions'

function formatWhen(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

export function ProfilePage() {
  const { user } = useAuth()
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [profile, setProfile] = useState(user)
  const [tab, setTab] = useState<'overview' | 'security'>('overview')
  const [error, setError] = useState<string | null>(null)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    setProfile(user)
  }, [user])

  useEffect(() => {
    api
      .me()
      .then(setProfile)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to refresh profile')
      })
    api
      .health()
      .then(setHealth)
      .catch(() => setHealth(null))
  }, [])

  async function onChangePassword(event: FormEvent) {
    event.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(null)
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match')
      return
    }
    setSavingPassword(true)
    try {
      await api.changeOwnPassword({ oldPassword, newPassword })
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordSuccess('Password updated successfully')
    } catch (err) {
      setPasswordError(
        err instanceof Error ? err.message : 'Unable to change password',
      )
    } finally {
      setSavingPassword(false)
    }
  }

  if (!profile) {
    return null
  }

  const accessAreas = grantedPermissionLabels(
    profile.role,
    profile.allowedPermissions,
    profile.deniedPermissions,
  )

  return (
    <div className="profile-page">
      <header className="workspace-header">
        <div>
          <h1>Profile</h1>
          <p className="muted">Account details and security settings</p>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="profile-hero table-card">
        <div className="profile-hero-main">
          <div className="profile-avatar" aria-hidden>
            {initials(profile.firstName, profile.lastName)}
          </div>
          <div className="profile-hero-copy">
            <h2>
              {profile.firstName} {profile.lastName}
            </h2>
            <p className="muted">{profile.email}</p>
            <div className="profile-meta-row">
              <span className="status-pill is-ok">{ROLE_LABEL[profile.role]}</span>
              <span
                className={
                  profile.isActive ? 'status-pill is-ok' : 'status-pill is-off'
                }
              >
                {profile.isActive ? 'Active' : 'Disabled'}
              </span>
            </div>
          </div>
        </div>
        <div className="profile-hero-stats">
          <div>
            <span className="muted">Last login</span>
            <strong>{formatWhen(profile.lastLoginAt)}</strong>
          </div>
          <div>
            <span className="muted">Member since</span>
            <strong>{formatWhen(profile.createdAt)}</strong>
          </div>
          <div>
            <span className="muted">System</span>
            <strong>
              {health?.database.connected ? 'Online' : 'Checking…'}
            </strong>
          </div>
        </div>
      </section>

      <div className="profile-tabs" role="tablist" aria-label="Profile sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'overview'}
          className={tab === 'overview' ? 'profile-tab is-active' : 'profile-tab'}
          onClick={() => setTab('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'security'}
          className={tab === 'security' ? 'profile-tab is-active' : 'profile-tab'}
          onClick={() => setTab('security')}
        >
          Security
        </button>
      </div>

      {tab === 'overview' ? (
        <div className="profile-grid">
          <section className="table-card profile-panel">
            <div className="table-head">
              <h2>Account details</h2>
              <p className="muted">Signed-in user profile</p>
            </div>
            <dl className="profile-detail-list">
              <div>
                <dt>Full name</dt>
                <dd>
                  {profile.firstName} {profile.lastName}
                </dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{profile.email}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{ROLE_LABEL[profile.role]}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{profile.isActive ? 'Active' : 'Disabled'}</dd>
              </div>
              <div>
                <dt>Last updated</dt>
                <dd>{formatWhen(profile.updatedAt)}</dd>
              </div>
              <div>
                <dt>User ID</dt>
                <dd>
                  <code>{profile.id}</code>
                </dd>
              </div>
            </dl>
          </section>

          <section className="table-card profile-panel">
            <div className="table-head">
              <h2>Workspace access</h2>
              <p className="muted">Areas available for your role</p>
            </div>
            <div className="permission-badge-row">
              {accessAreas.map((label) => (
                <span key={label} className="permission-badge">
                  {label}
                </span>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <section className="table-card profile-panel profile-security">
          <div className="table-head">
            <h2>Change password</h2>
            <p className="muted">
              Enter your current password, then choose a new one.
            </p>
          </div>
          <form
            className="stack-form profile-password-form"
            onSubmit={(event) => void onChangePassword(event)}
          >
            <label>
              Current password
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </label>
            <label>
              New password
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
            {passwordError ? <p className="form-error">{passwordError}</p> : null}
            {passwordSuccess ? (
              <p className="form-success">{passwordSuccess}</p>
            ) : null}
            <div className="form-actions">
              <button type="submit" disabled={savingPassword}>
                {savingPassword ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  )
}
