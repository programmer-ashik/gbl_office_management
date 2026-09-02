export const ProjectStatus = {
  PLANNING: 'planning',
  ACTIVE: 'active',
  ON_HOLD: 'on_hold',
  COMPLETED: 'completed',
} as const

export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus]

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: 'Planning',
  active: 'Active',
  on_hold: 'On hold',
  completed: 'Completed',
}

export type ProjectClient = {
  name: string
  contactName: string | null
  email: string | null
  phone: string | null
  address: string | null
}

export type CostBreakdownRow = {
  accountCode: string
  accountName: string
  accountType: string
  amount: number
  isDirectCost: boolean
}

export type ProjectFinancials = {
  recognizedRevenue: number
  directCost: number
  otherExpense: number
  totalCost: number
  grossProfit: number
  netProfit: number
  grossMarginPct: number | null
  netMarginPct: number | null
  contractValue: number
  totalBudget: number
  budgetRemaining: number
  budgetUsedPct: number | null
  isOverBudget: boolean
  contractRemaining: number
  breakdown: CostBreakdownRow[]
}

export type Project = {
  id: string
  code: string
  name: string
  client: ProjectClient
  startDate: string
  endDate: string | null
  contractValue: number
  totalBudget: number
  status: ProjectStatus
  managerId: string | null
  description: string | null
  createdAt: string | null
  financials: ProjectFinancials
}

export type CreateProjectBody = {
  name: string
  client: {
    name: string
    contactName?: string
    email?: string
    phone?: string
    address?: string
  }
  startDate: string
  endDate?: string
  contractValue: number
  totalBudget: number
  description?: string
}
