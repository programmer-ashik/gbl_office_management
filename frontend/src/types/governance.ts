export const ApprovalStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXECUTED: 'executed',
  CANCELLED: 'cancelled',
} as const
export type ApprovalStatus =
  (typeof ApprovalStatus)[keyof typeof ApprovalStatus]

export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  executed: 'Executed',
  cancelled: 'Cancelled',
}

export type ApprovalStep = {
  role: string
  status: string
  actorEmail: string | null
  decidedAt: string | null
  note: string | null
}

export type ApprovalRequest = {
  id: string
  requestNumber: string
  status: ApprovalStatus
  entityType: string
  amount: number
  summary: string
  projectId: string | null
  projectCode: string | null
  payload: Record<string, unknown>
  steps: ApprovalStep[]
  currentStepIndex: number
  requestedByEmail: string
  resultRef: string | null
  executedAt: string | null
  createdAt: string | null
}

export type AuditLog = {
  id: string
  action: string
  entityType: string
  entityId: string
  actorId: string
  actorEmail: string
  actorRole: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  summary: string
  createdAt: string
}

export type OcrScanResult = {
  vendor: string | null
  date: string | null
  total: number | null
  lines: Array<{
    accountCode: string
    amount: number
    description: string
    confidence: number
  }>
  rawText: string
  mock: true
}
