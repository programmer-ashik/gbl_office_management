import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { ROLE_LABEL, type HealthStatus } from '../types/auth'

function formatWhen(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

export function ProfilePage() {
  const { user } = useAuth()
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [profile, setProfile] = useState(user)
  const [error, setError] = useState<string | null>(null)

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

  if (!profile) {
    return null
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Profile</h1>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="grid">
        <article className="stat-card">
          <h3>Authentication</h3>
          <p className="stat-value">Active</p>
          <p className="muted">JWT access token + rotating refresh token</p>
        </article>
        <article className="stat-card">
          <h3>Database</h3>
          <p className="stat-value">
            {health?.database.connected ? 'Connected' : 'Checking…'}
          </p>
          <p className="muted">
            Replica set transactions {health?.database.ping ? 'ready' : 'pending'}
          </p>
        </article>
        <article className="stat-card">
          <h3>Your role</h3>
          <p className="stat-value">{ROLE_LABEL[profile.role]}</p>
          <p className="muted">{profile.email}</p>
        </article>
      </section>

      <section className="table-card">
        <div className="table-head">
          <h2>Account details</h2>
          <p className="muted">Signed-in user profile</p>
        </div>
        <table>
          <tbody>
            <tr>
              <th scope="row">Name</th>
              <td>
                {profile.firstName} {profile.lastName}
              </td>
            </tr>
            <tr>
              <th scope="row">Email</th>
              <td>{profile.email}</td>
            </tr>
            <tr>
              <th scope="row">Role</th>
              <td>{ROLE_LABEL[profile.role]}</td>
            </tr>
            <tr>
              <th scope="row">Status</th>
              <td>{profile.isActive ? 'Active' : 'Disabled'}</td>
            </tr>
            <tr>
              <th scope="row">Last login</th>
              <td>{formatWhen(profile.lastLoginAt)}</td>
            </tr>
            <tr>
              <th scope="row">Created</th>
              <td>{formatWhen(profile.createdAt)}</td>
            </tr>
            <tr>
              <th scope="row">Updated</th>
              <td>{formatWhen(profile.updatedAt)}</td>
            </tr>
            <tr>
              <th scope="row">User ID</th>
              <td>
                <code>{profile.id}</code>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </>
  )
}
