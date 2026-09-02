import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('admin@gblenterprise.com')
  const [password, setPassword] = useState('Admin123!')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-shell">
      <section className="auth-brand">
        <p className="eyebrow">GBL Enterprise</p>
        <h1>Project accounting &amp; office control</h1>
        <p className="lede">
          Sign in to manage ledgers, projects, payroll, and settlements from a
          single modular workspace.
        </p>
        <ul className="brand-points">
          <li>JWT + refresh-token sessions</li>
          <li>Role-based access: Admin, Accountant, PM, Employee</li>
          <li>MongoDB transactions ready for double-entry posting</li>
        </ul>
      </section>

      <section className="auth-panel">
        <form className="auth-card" onSubmit={onSubmit}>
          <h2>Sign in</h2>
          <p className="muted">Use your GBL Office credentials.</p>

          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <button type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="switch-auth">
            Need an account? <Link to="/signup">Create one</Link>
          </p>
        </form>
      </section>
    </div>
  )
}
