import { AppSidebar } from './AppSidebar'
import { PageTransition } from './PageTransition'
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
        <PageTransition />
      </main>
    </div>
  )
}
