import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Role } from '../types/auth'

export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="boot-screen">
        <div className="boot-card">Restoring session…</div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (user.role !== Role.ADMIN) {
    return (
      <section className="table-card">
        <h2>Access denied</h2>
        <p className="muted">
          Only Admin users can manage balance sheet templates.
        </p>
      </section>
    )
  }

  return children
}
