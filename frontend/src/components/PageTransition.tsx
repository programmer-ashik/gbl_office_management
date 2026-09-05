import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { PageSkeleton } from './PageSkeleton'

const SKELETON_MS = 260

/**
 * Softens route changes with a brief skeleton + fade-in.
 * Does not alter page data loading or handlers.
 */
export function PageTransition() {
  const location = useLocation()
  const [phase, setPhase] = useState<'skeleton' | 'content'>('content')
  const [activePath, setActivePath] = useState(location.pathname)

  useEffect(() => {
    if (location.pathname === activePath) return

    setPhase('skeleton')
    const timer = window.setTimeout(() => {
      setActivePath(location.pathname)
      setPhase('content')
    }, SKELETON_MS)

    return () => window.clearTimeout(timer)
  }, [location.pathname, activePath])

  if (phase === 'skeleton') {
    return <PageSkeleton />
  }

  return (
    <div key={activePath} className="page-view">
      <Outlet />
    </div>
  )
}
