export const PayrollRunStatus = {
  DRAFT: 'draft',
  DISBURSED: 'disbursed',
} as const
export type PayrollRunStatus =
  (typeof PayrollRunStatus)[keyof typeof PayrollRunStatus]
export const PAYROLL_STATUS_LABEL: Record<PayrollRunStatus, string> = {
  draft: 'Draft',
  disbursed: 'Disbursed',
}

export const TimeUnit = {
  HOURS: 'hours',
  DAYS: 'days',
} as const
export type TimeUnit = (typeof TimeUnit)[keyof typeof TimeUnit]

export type SalaryStructure = {
  id: string
  employeeId: string
  employeeName: string
  basic: number
  allowances: Array<{ name: string; amount: number }>
  deductions: Array<{ name: string; amount: number }>
  gross: number
  structuralDeductions: number
  isActive: boolean
}

export type PayrollEmployee = {
  id: string
  name: string
  email: string
  role: string
}

export type TimeLog = {
  id: string
  employeeId: string
  employeeName: string
  projectId: string
  projectCode: string
  projectName: string
  periodYear: number
  periodMonth: number
  unit: string
  quantity: number
  notes: string | null
}

export type PayrollLine = {
  employeeId: string
  employeeName: string
  basic: number
  allowances: number
  structuralDeductions: number
  gross: number
  advanceDeductions: Array<{
    advanceId: string
    advanceNumber: string
    amount: number
  }>
  totalAdvanceDeductions: number
  netPay: number
  allocations: Array<{
    projectId: string
    projectCode: string
    projectName: string
    quantity: number
    amount: number
  }>
}

export type PayrollRun = {
  id: string
  sheetNumber: string
  status: PayrollRunStatus
  periodYear: number
  periodMonth: number
  totalGross: number
  totalStructuralDeductions: number
  totalAdvanceDeductions: number
  totalNetPay: number
  journalNumber: string | null
  disbursedAt: string | null
  lines: PayrollLine[]
}
