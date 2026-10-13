import { Outlet } from 'react-router-dom'

/** Route outlet. No fade or remount — those flashed the page on every navigation. */
export function PageTransition() {
  return <Outlet />
}
