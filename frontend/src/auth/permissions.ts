import { Role } from '../types/auth'

/** Derived helpers — no persisted can_* flags on User. */
export function canCreateQuotation(role: Role | undefined | null): boolean {
  return (
    role === Role.ADMIN ||
    role === Role.ACCOUNTANT ||
    role === Role.PROJECT_MANAGER ||
    role === Role.EMPLOYEE
  )
}

export function canAuditQuotations(role: Role | undefined | null): boolean {
  return role === Role.ADMIN
}

export function canApproveQuotation(role: Role | undefined | null): boolean {
  return role === Role.ADMIN || role === Role.ACCOUNTANT
}

export function canDeleteQuotation(
  role: Role | undefined | null,
  status: string,
  isOwner: boolean,
): boolean {
  if (role === Role.ADMIN) return true
  if (!isOwner) return false
  return status !== 'APPROVED'
}

export function canEditQuotation(
  role: Role | undefined | null,
  status: string,
  isOwner: boolean,
): boolean {
  if (role === Role.ADMIN) return status !== 'REJECTED'
  if (!isOwner) return false
  return status === 'DRAFT' || status === 'SENT'
}
