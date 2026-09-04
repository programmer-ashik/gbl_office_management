import { Outlet } from 'react-router-dom'
import { AppSidebar } from './AppSidebar'
import { useAuth } from '../auth/AuthContext'

export function AppLayout() {
  const { user } = useAuth()
  if (!user) {
    return null
  }

  return (
    <div className="app-shell">
      <AppSidebar />
      <main className="workspace">
        <Outlet />
      </main>
    </div>
  )
}
