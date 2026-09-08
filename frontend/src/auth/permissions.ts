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
  return role === Role.ADMIN || role === Role.ACCOUNTANT
}

export function canApproveQuotation(role: Role | undefined | null): boolean {
  return role === Role.ADMIN || role === Role.ACCOUNTANT
}
