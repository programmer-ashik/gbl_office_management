import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

/**
 * Soft route fade without skeleton swap — avoids table header blink.
 */
export function PageTransition() {
  const location = useLocation()
  const [displayPath, setDisplayPath] = useState(location.pathname)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (location.pathname === displayPath) return
    setFading(true)
    const fadeOut = window.setTimeout(() => {
      setDisplayPath(location.pathname)
      setFading(false)
    }, 90)
    return () => window.clearTimeout(fadeOut)
  }, [location.pathname, displayPath])

  return (
    <div
      key={displayPath}
      className={fading ? 'page-view page-view--fade' : 'page-view'}
    >
      <Outlet />
    </div>
  )
}
