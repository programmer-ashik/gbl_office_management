import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ROLE_LABEL, Role } from '../types/auth'

export function AppLayout() {
  const { user, logout } = useAuth()
  if (!user) {
    return null
  }

  const canSeeFinance =
    user.role === Role.ADMIN || user.role === Role.ACCOUNTANT
  const canSeeProjects =
    user.role === Role.ADMIN ||
    user.role === Role.ACCOUNTANT ||
    user.role === Role.PROJECT_MANAGER
  const canSeeApprovals = canSeeFinance || user.role === Role.PROJECT_MANAGER

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark">
          <span>GBL</span>
          <strong>Office</strong>
        </div>
        <nav>
          <NavLink to="/" end>
            Overview
          </NavLink>
          {canSeeFinance ? (
            <>
              <NavLink to="/accounts">Chart of Accounts</NavLink>
              <NavLink to="/journals">Journals</NavLink>
              <NavLink to="/trial-balance">Trial Balance</NavLink>
            </>
          ) : (
            <a className="disabled">Chart of Accounts</a>
          )}
          {canSeeProjects ? (
            <NavLink to="/projects">Projects</NavLink>
          ) : (
            <a className="disabled">Projects</a>
          )}
          {canSeeFinance ? (
            <NavLink to="/banking">Banking</NavLink>
          ) : (
            <a className="disabled">Banking</a>
          )}
          <NavLink to="/advances">Advances</NavLink>
          {canSeeFinance ? (
            <>
              <NavLink to="/receivables">Receivables</NavLink>
              <NavLink to="/payables">Payables</NavLink>
              <NavLink to="/aging">Aging</NavLink>
              <NavLink to="/payroll">Payroll</NavLink>
              <NavLink to="/employees">Employees</NavLink>
            </>
          ) : (
            <a className="disabled">Receivables</a>
          )}
          {canSeeApprovals ? (
            <NavLink to="/approvals">Approvals</NavLink>
          ) : (
            <a className="disabled">Approvals</a>
          )}
          {canSeeFinance ? (
            <NavLink to="/audit">Audit</NavLink>
          ) : (
            <a className="disabled">Audit</a>
          )}
          {canSeeProjects ? (
            <>
              <NavLink to="/procurement">Procurement</NavLink>
              <NavLink to="/inventory">Inventory</NavLink>
            </>
          ) : (
            <a className="disabled">Procurement</a>
          )}
        </nav>
        <div className="sidebar-user">
          <p>
            {user.firstName} {user.lastName}
          </p>
          <span className="role-pill">{ROLE_LABEL[user.role]}</span>
          <button type="button" className="ghost sidebar-logout" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="workspace">
        <Outlet />
      </main>
    </div>
  )
}
