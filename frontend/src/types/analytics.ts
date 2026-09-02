export type CashFlowWeek = {
  weekStart: string
  weekLabel: string
  inflow: number
  outflow: number
  net: number
}

export type CashFlowForecast = {
  asOf: string
  openingCash: number
  projectedClosingCash: number
  totalInflow: number
  totalOutflow: number
  weeks: CashFlowWeek[]
  sources: {
    openReceivables: number
    openPayables: number
    scheduledSupplierPayments: number
    draftPayroll: number
  }
}

export type BurnRateRow = {
  projectId: string
  projectCode: string
  projectName: string
  status: string
  totalBudget: number
  totalCost: number
  remainingBudget: number
  dailyBurn: number
  weeklyBurn: number
  daysElapsed: number
  estimatedDaysToComplete: number | null
  projectedEndDate: string | null
  isOverBudget: boolean
}

export type FinancialStatements = {
  asOf: string
  profitAndLoss: {
    revenue: number
    expenses: number
    netIncome: number
    lines: Array<{ code: string; name: string; type: string; amount: number }>
  }
  balanceSheet: {
    assets: number
    liabilities: number
    equity: number
    lines: Array<{ code: string; name: string; type: string; amount: number }>
  }
}
