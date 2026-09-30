import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { AppSidebar } from './AppSidebar'
import { PageTransition } from './PageTransition'
import { useAuth } from '../auth/AuthContext'
import { NavIcon } from '../nav/icons'
import { isPathDenied } from '../utils/rolePermissions'
import { MOBILE_QUERY, useMediaQuery } from '../utils/useMediaQuery'

export function AppLayout() {
  const { user } = useAuth()
  const location = useLocation()
  const isMobile = useMediaQuery(MOBILE_QUERY)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname, isMobile])

  useEffect(() => {
    if (!menuOpen) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

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
    <div className={menuOpen ? 'app-shell is-menu-open' : 'app-shell'}>
      {isMobile ? (
        <header className="mobile-topbar">
          <button
            type="button"
            className="ghost mobile-menu-button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="app-sidebar"
            onClick={() => setMenuOpen((current) => !current)}
          >
            <NavIcon name={menuOpen ? 'close' : 'menu'} size={20} />
          </button>
          <span className="mobile-brand">
            <img src="/gbl-logo.png" alt="" className="w-7 h-7 rounded-full" />
            <strong>GBL Enterprise</strong>
          </span>
        </header>
      ) : null}
      <AppSidebar isMobile={isMobile} onNavigate={() => setMenuOpen(false)} />
      {isMobile && menuOpen ? (
        <div
          className="mobile-nav-backdrop"
          aria-hidden
          onClick={() => setMenuOpen(false)}
        />
      ) : null}
      <main className="workspace">
        <PageTransition />
      </main>
    </div>
  )
}
