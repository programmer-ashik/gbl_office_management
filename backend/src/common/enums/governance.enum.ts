export enum AuditAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
}

export enum ApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXECUTED = 'executed',
  CANCELLED = 'cancelled',
}

export enum ApprovalStepRole {
  PROJECT_MANAGER = 'project_manager',
  ACCOUNTANT = 'accountant',
  ADMIN = 'admin',
}

export enum ApprovalEntityType {
  JOURNAL = 'journal',
  ADVANCE_DISBURSE = 'advance_disburse',
  FUND_TRANSFER = 'fund_transfer',
  PAYROLL_DISBURSE = 'payroll_disburse',
}

/** Amounts at or above this threshold (major units) require multi-level approval. */
export const APPROVAL_THRESHOLD = 100_000;
