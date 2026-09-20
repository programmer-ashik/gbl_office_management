export const PayrollRunStatus = {
  DRAFT: 'draft',
  POSTED: 'posted',
  DISBURSED: 'disbursed',
} as const
export type PayrollRunStatus =
  (typeof PayrollRunStatus)[keyof typeof PayrollRunStatus]
export const PAYROLL_STATUS_LABEL: Record<PayrollRunStatus, string> = {
  draft: 'Draft',
  posted: 'Posted (accrued)',
  disbursed: 'Disbursed',
}

export const TimeUnit = {
  HOURS: 'hours',
  DAYS: 'days',
} as const
export type TimeUnit = (typeof TimeUnit)[keyof typeof TimeUnit]

export type PayrollSettings = {
  basicPercentOfGross: number
  houseRentPercentOfBasic: number
  medicalType: 'PERCENT_OF_BASIC' | 'FIXED_AMOUNT'
  medicalValue: number
  conveyanceType: 'REMAINING_BALANCE' | 'FIXED_AMOUNT'
  conveyanceValue: number
}

export type SalaryBreakdown = {
  basicSalary: number
  houseRent: number
  medicalAllowance: number
  conveyanceAllowance: number
  otherAllowances: number
}

export type SalaryDeductionsDetail = {
  providentFund: number
  taxDeduction: number
  advanceAdjustment: number
}

export type SalaryStructure = {
  id: string
  employeeId: string
  employeeName: string
  basic: number
  allowances: Array<{ name: string; amount: number }>
  deductions: Array<{ name: string; amount: number }>
  gross: number
  grossSalary: number
  customBreakdownApplied: boolean
  breakdown: SalaryBreakdown
  deductionsDetail: SalaryDeductionsDetail
  netPayable: number
  structuralDeductions: number
  isActive: boolean
}

export type SalaryBreakdownPreview = {
  grossSalary: number
  basicSalary: number
  houseRent: number
  medicalAllowance: number
  conveyanceAllowance: number
  otherAllowances: number
  providentFund: number
  taxDeduction: number
  advanceAdjustment: number
  netPayable: number
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
  kind: 'project' | 'administrative'
  projectId: string | null
  projectCode: string
  projectName: string
  periodYear: number
  periodMonth: number
  unit: string
  quantity: number
  notes: string | null
}

export type SalaryFacility = {
  id: string
  facilityNumber: string
  kind: 'salary_advance' | 'salary_loan'
  status: string
  employeeId: string
  employeeName: string
  principal: number
  installment: number
  installmentCount: number
  repaid: number
  outstanding: number
  purpose: string
  treasuryAccountCode: string | null
  journalNumber: string | null
  disbursedAt: string
}

export type PayrollLine = {
  employeeId: string
  employeeName: string
  basic: number
  allowances: number
  structuralDeductions: number
  providentFund: number
  taxDeduction: number
  structureAdvance: number
  gross: number
  advanceDeductions: Array<{
    advanceId: string
    advanceNumber: string
    amount: number
  }>
  facilityDeductions: Array<{
    facilityId: string
    facilityNumber: string
    kind: 'salary_advance' | 'salary_loan'
    label: string
    amount: number
  }>
  totalAdvanceDeductions: number
  totalFacilityDeductions: number
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
  totalFacilityDeductions?: number
  totalNetPay: number
  accrualJournalNumber: string | null
  postedAt: string | null
  journalNumber: string | null
  disbursedAt: string | null
  treasuryAccountCode: string | null
  lines: PayrollLine[]
}
