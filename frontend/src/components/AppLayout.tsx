import { Navigate, useLocation } from 'react-router-dom'
import { AppSidebar } from './AppSidebar'
import { PageTransition } from './PageTransition'
import { useAuth } from '../auth/AuthContext'
import { isPathDenied } from '../utils/rolePermissions'

export function AppLayout() {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) {
    return null
  }

  if (
    isPathDenied(
      user.role,
      location.pathname,
      user.allowedPermissions,
      user.deniedPermissions ?? [],
    )
  ) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="app-shell">
      <AppSidebar />
      <main className="workspace">
        <PageTransition />
      </main>
    </div>
  )
}
