import { Role } from '../types/auth'
import { NAV_SECTIONS, sectionsForRole, type NavSection } from '../nav/navigation'

export type PermissionOption = {
  id: string
  label: string
}

/** Full app permission catalog (every nav section). */
export function allPermissionOptions(): PermissionOption[] {
  return NAV_SECTIONS.map((section) => ({
    id: section.id,
    label: section.label,
  }))
}

/** Role default areas when admin has not set an explicit allowlist. */
export function permissionCatalogForRole(role: Role): PermissionOption[] {
  return sectionsForRole(role).map((section) => ({
    id: section.id,
    label: section.label,
  }))
}

/**
 * Effective allowed section ids.
 * - Explicit allowlist when configured
 * - Else role defaults minus legacy denials
 */
export function effectiveAllowedIds(
  role: Role,
  allowedPermissions?: string[] | null,
  deniedPermissions: string[] = [],
): string[] | null {
  if (allowedPermissions != null) {
    return [...allowedPermissions]
  }
  if (deniedPermissions.length > 0) {
    const denied = new Set(deniedPermissions)
    return permissionCatalogForRole(role)
      .map((item) => item.id)
      .filter((id) => !denied.has(id))
  }
  return null
}

export function grantedPermissionLabels(
  role: Role,
  allowedPermissions?: string[] | null,
  deniedPermissions: string[] = [],
): string[] {
  const catalog = allPermissionOptions()
  const effective = effectiveAllowedIds(
    role,
    allowedPermissions,
    deniedPermissions,
  )
  if (effective == null) {
    return permissionCatalogForRole(role).map((item) => item.label)
  }
  const allowed = new Set(effective)
  return catalog.filter((item) => allowed.has(item.id)).map((item) => item.label)
}

/** Nav sections the signed-in user may open. */
export function sectionsForUser(
  role: Role,
  allowedPermissions?: string[] | null,
  deniedPermissions: string[] = [],
): NavSection[] {
  const effective = effectiveAllowedIds(
    role,
    allowedPermissions,
    deniedPermissions,
  )
  if (effective == null) {
    return sectionsForRole(role)
  }
  const allowed = new Set(effective)
  // Explicit grants open the full section (admin-selected work areas).
  return NAV_SECTIONS.filter((section) => allowed.has(section.id)).map(
    (section) => ({
      ...section,
      items: section.items.map((item) =>
        item.children
          ? { ...item, children: [...item.children], roles: item.roles }
          : { ...item },
      ),
    }),
  )
}

export function isPathDenied(
  role: Role,
  pathname: string,
  allowedPermissions?: string[] | null,
  deniedPermissions: string[] = [],
): boolean {
  if (
    pathname === '/settings/profile' ||
    pathname.startsWith('/settings/profile/')
  ) {
    return false
  }

  const effective = effectiveAllowedIds(
    role,
    allowedPermissions,
    deniedPermissions,
  )
  // Unconfigured → role RBAC only (handled by route guards elsewhere).
  if (effective == null) return false

  const allowed = new Set(effective)
  let best: { id: string; score: number } | null = null

  for (const section of NAV_SECTIONS) {
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

  if (!best) return false
  return !allowed.has(best.id)
}
