import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { NavIcon } from '../nav/icons'
import {
  readOpenSectionId,
  readRailCollapsed,
  sectionsForRole,
  writeOpenSectionId,
  writeRailCollapsed,
  type NavSection,
} from '../nav/navigation'
import { ROLE_LABEL } from '../types/auth'

function sectionIdForPath(
  sections: ReturnType<typeof sectionsForRole>,
  pathname: string,
): string | null {
  let best: { id: string; score: number } | null = null
  for (const section of sections) {
    for (const item of section.items) {
      const candidates = item.children?.length ? item.children : [item]
      for (const link of candidates) {
        const matches = link.end
          ? pathname === link.to
          : pathname === link.to || pathname.startsWith(`${link.to}/`)
        if (!matches) continue
        const score = link.to.length
        if (!best || score > best.score) best = { id: section.id, score }
      }
    }
  }
  return best?.id ?? null
}

export function AppSidebar() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [railCollapsed, setRailCollapsed] = useState(readRailCollapsed)
  const [openSectionId, setOpenSectionId] = useState<string | null>(() =>
    user ? readOpenSectionId(user.role) : null,
  )

  const sections = useMemo(
    () => (user ? sectionsForRole(user.role) : []),
    [user],
  )

  useEffect(() => {
    if (!user) return
    const matched = sectionIdForPath(sections, location.pathname)
    if (!matched) return
    setOpenSectionId((current) => {
      if (current === matched) return current
      writeOpenSectionId(matched)
      return matched
    })
  }, [user, sections, location.pathname])

  const collapsedSections = useMemo(() => {
    const seen = new Set<string>()
    const list: NavSection[] = []
    for (const section of sections) {
      if (seen.has(section.id)) continue
      seen.add(section.id)
      list.push(section)
    }
    return list
  }, [sections])

  if (!user) return null

  function toggleRail() {
    setRailCollapsed((current) => {
      const next = !current
      writeRailCollapsed(next)
      return next
    })
  }

  function toggleSection(id: string) {
    setOpenSectionId((current) => {
      const next = current === id ? null : id
      writeOpenSectionId(next)
      return next
    })
  }

  return (
    <aside className={railCollapsed ? 'sidebar is-collapsed' : 'sidebar'}>
      <div className="sidebar-top">
        <div className="brand-mark" title="GBL Office">
          <span>GBL</span>
          {!railCollapsed ? <strong>Office</strong> : null}
        </div>
        <button
          type="button"
          className="ghost sidebar-toggle"
          aria-label={railCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={railCollapsed ? 'Expand menu' : 'Collapse menu'}
          onClick={toggleRail}
        >
          <NavIcon name="panel" size={15} />
        </button>
      </div>

      <nav aria-label="Main">
        {railCollapsed
          ? collapsedSections.map((section) => {
              const primary = section.items[0]
              if (!primary) return null
              return (
                <NavLink
                  key={`rail-${section.id}`}
                  to={primary.to}
                  end={primary.end}
                  title={section.label}
                  className={({ isActive }) =>
                    isActive ? 'nav-rail-link is-active' : 'nav-rail-link'
                  }
                >
                  <NavIcon name={section.icon} size={17} />
                </NavLink>
              )
            })
          : sections.map((section) => {
              const isOpen = openSectionId === section.id
              return (
                <div key={section.id} className="nav-section">
                  <button
                    type="button"
                    className="nav-section-toggle"
                    aria-expanded={isOpen}
                    onClick={() => toggleSection(section.id)}
                  >
                    <span className="nav-section-label">
                      <NavIcon name={section.icon} size={15} />
                      <span>{section.label}</span>
                    </span>
                    <span
                      className={
                        isOpen ? 'nav-chevron is-open' : 'nav-chevron'
                      }
                      aria-hidden
                    >
                      <NavIcon name="chevron" size={12} />
                    </span>
                  </button>

                  <div
                    className={
                      isOpen
                        ? 'nav-section-panel is-open'
                        : 'nav-section-panel'
                    }
                  >
                    <div className="nav-section-items">
                      {section.items.map((item) =>
                        item.children && item.children.length > 0 ? (
                          <div
                            key={`${section.id}-${item.label}-group`}
                            className="nav-subgroup"
                          >
                            <div className="nav-subgroup-label">
                              <NavIcon name={item.icon} size={14} />
                              <span>{item.label}</span>
                            </div>
                            {item.children.map((child) => (
                              <NavLink
                                key={`${section.id}-${child.label}-${child.to}`}
                                to={child.to}
                                end={child.end}
                                title={child.hint}
                                className={({ isActive }) =>
                                  isActive
                                    ? 'nav-link nav-link-nested is-active'
                                    : 'nav-link nav-link-nested'
                                }
                              >
                                <span className="nav-link-main">
                                  <NavIcon name={child.icon} size={14} />
                                  <span className="nav-link-copy">
                                    <span className="nav-link-label">
                                      {child.label}
                                    </span>
                                    {child.hint ? (
                                      <span className="nav-link-hint">
                                        {child.hint}
                                      </span>
                                    ) : null}
                                  </span>
                                </span>
                              </NavLink>
                            ))}
                          </div>
                        ) : (
                          <NavLink
                            key={`${section.id}-${item.label}-${item.to}`}
                            to={item.to}
                            end={item.end}
                            title={item.hint}
                            className={({ isActive }) =>
                              isActive ? 'nav-link is-active' : 'nav-link'
                            }
                          >
                            <span className="nav-link-main">
                              <NavIcon name={item.icon} size={15} />
                              <span className="nav-link-copy">
                                <span className="nav-link-label">
                                  {item.label}
                                </span>
                                {item.hint ? (
                                  <span className="nav-link-hint">
                                    {item.hint}
                                  </span>
                                ) : null}
                              </span>
                            </span>
                          </NavLink>
                        ),
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
      </nav>

      <div className="sidebar-user">
        {!railCollapsed ? (
          <>
            <p>
              <NavLink to="/settings/profile" className="sidebar-user-link">
                <NavIcon name="profile" size={14} />
                <span>
                  {user.firstName} {user.lastName}
                </span>
              </NavLink>
            </p>
            <span className="role-pill">{ROLE_LABEL[user.role]}</span>
          </>
        ) : (
          <NavLink
            to="/settings/profile"
            className="nav-rail-link"
            title={`${user.firstName} ${user.lastName} · ${ROLE_LABEL[user.role]}`}
          >
            <NavIcon name="profile" size={17} />
          </NavLink>
        )}
        <button
          type="button"
          className="ghost sidebar-logout"
          onClick={() => void logout()}
          title="Sign out"
        >
          <NavIcon name="logout" size={14} />
          {railCollapsed ? null : <span>Sign out</span>}
        </button>
      </div>
    </aside>
  )
}
