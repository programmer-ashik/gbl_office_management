/** Bangladesh corporate salary component labels (stored as free-text names). */
export const BdSalaryComponent = {
  HOUSE_RENT: 'House Rent Allowance',
  MEDICAL: 'Medical Allowance',
  CONVEYANCE: 'Conveyance Allowance',
  OTHER: 'Other Allowances',
  PF: 'Provident Fund',
  ADVANCE: 'Advance Adjustment',
  AIT: 'Income Tax (AIT)',
} as const

export const MedicalAllowanceType = {
  PERCENT_OF_BASIC: 'PERCENT_OF_BASIC',
  FIXED_AMOUNT: 'FIXED_AMOUNT',
} as const
export type MedicalAllowanceType =
  (typeof MedicalAllowanceType)[keyof typeof MedicalAllowanceType]

export const ConveyanceType = {
  REMAINING_BALANCE: 'REMAINING_BALANCE',
  FIXED_AMOUNT: 'FIXED_AMOUNT',
} as const
export type ConveyanceType =
  (typeof ConveyanceType)[keyof typeof ConveyanceType]

export type PayrollRuleConfig = {
  basicPercentOfGross: number
  houseRentPercentOfBasic: number
  medicalType: MedicalAllowanceType
  medicalValue: number
  conveyanceType: ConveyanceType
  conveyanceValue: number
}

export const DEFAULT_PAYROLL_RULE_CONFIG: PayrollRuleConfig = {
  basicPercentOfGross: 50,
  houseRentPercentOfBasic: 50,
  medicalType: MedicalAllowanceType.FIXED_AMOUNT,
  medicalValue: 2_500,
  conveyanceType: ConveyanceType.REMAINING_BALANCE,
  conveyanceValue: 0,
}

export type BdSalaryBreakdown = {
  gross: number
  basic: number
  houseRent: number
  medical: number
  conveyance: number
  otherAllowances: number
  providentFund: number
  advanceAdjustment: number
  incomeTax: number
  netPayable: number
}

export type BdSalaryOverrides = Partial<
  Omit<BdSalaryBreakdown, 'gross' | 'netPayable'>
>

export const DEFAULT_PF_RATE_ON_BASIC = 0.07

function roundMoney(value: number): number {
  return Number((Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2))
}

/**
 * Auto-split Gross Monthly Salary using Admin PayrollSettings (no hardcoded %).
 */
export function calculateBdSalaryFromGross(
  grossInput: number,
  companyConfig: PayrollRuleConfig = DEFAULT_PAYROLL_RULE_CONFIG,
  overrides: BdSalaryOverrides = {},
): BdSalaryBreakdown {
  const config = { ...DEFAULT_PAYROLL_RULE_CONFIG, ...companyConfig }
  const gross = roundMoney(Math.max(0, grossInput))
  if (gross <= 0) {
    return {
      gross: 0,
      basic: 0,
      houseRent: 0,
      medical: 0,
      conveyance: 0,
      otherAllowances: 0,
      providentFund: 0,
      advanceAdjustment: 0,
      incomeTax: 0,
      netPayable: 0,
    }
  }

  const basic =
    overrides.basic != null
      ? roundMoney(Math.max(0, overrides.basic))
      : roundMoney(gross * (config.basicPercentOfGross / 100))

  const houseRent =
    overrides.houseRent != null
      ? roundMoney(Math.max(0, overrides.houseRent))
      : roundMoney(basic * (config.houseRentPercentOfBasic / 100))

  let medical: number
  if (overrides.medical != null) {
    medical = roundMoney(Math.max(0, overrides.medical))
  } else if (config.medicalType === MedicalAllowanceType.PERCENT_OF_BASIC) {
    const room = roundMoney(Math.max(0, gross - basic - houseRent))
    medical = roundMoney(
      Math.min(basic * (config.medicalValue / 100), room),
    )
  } else {
    const room = roundMoney(Math.max(0, gross - basic - houseRent))
    medical = roundMoney(Math.min(Math.max(0, config.medicalValue), room))
  }

  let conveyance: number
  if (overrides.conveyance != null) {
    conveyance = roundMoney(Math.max(0, overrides.conveyance))
  } else if (config.conveyanceType === ConveyanceType.FIXED_AMOUNT) {
    const room = roundMoney(Math.max(0, gross - basic - houseRent - medical))
    conveyance = roundMoney(Math.min(Math.max(0, config.conveyanceValue), room))
  } else {
    conveyance = roundMoney(
      Math.max(0, gross - basic - houseRent - medical),
    )
  }

  const otherAllowances =
    overrides.otherAllowances != null
      ? roundMoney(Math.max(0, overrides.otherAllowances))
      : roundMoney(
          Math.max(0, gross - basic - houseRent - medical - conveyance),
        )

  const providentFund =
    overrides.providentFund != null
      ? roundMoney(Math.max(0, overrides.providentFund))
      : 0
  const advanceAdjustment =
    overrides.advanceAdjustment != null
      ? roundMoney(Math.max(0, overrides.advanceAdjustment))
      : 0
  const incomeTax =
    overrides.incomeTax != null
      ? roundMoney(Math.max(0, overrides.incomeTax))
      : 0

  const earnings =
    basic + houseRent + medical + conveyance + otherAllowances
  const deductions = providentFund + advanceAdjustment + incomeTax

  return {
    gross,
    basic,
    houseRent,
    medical,
    conveyance,
    otherAllowances,
    providentFund,
    advanceAdjustment,
    incomeTax,
    netPayable: roundMoney(earnings - deductions),
  }
}

export function earningsTotal(
  row: Pick<
    BdSalaryBreakdown,
    'basic' | 'houseRent' | 'medical' | 'conveyance' | 'otherAllowances'
  >,
): number {
  return roundMoney(
    row.basic +
      row.houseRent +
      row.medical +
      row.conveyance +
      (row.otherAllowances ?? 0),
  )
}

export function deductionsTotal(
  row: Pick<
    BdSalaryBreakdown,
    'providentFund' | 'advanceAdjustment' | 'incomeTax'
  >,
): number {
  return roundMoney(
    row.providentFund + row.advanceAdjustment + row.incomeTax,
  )
}

export function toSalaryStructurePayload(breakdown: BdSalaryBreakdown): {
  grossSalary: number
  customBreakdownApplied: boolean
  breakdown: {
    basicSalary: number
    houseRent: number
    medicalAllowance: number
    conveyanceAllowance: number
    otherAllowances: number
  }
  deductionsDetail: {
    providentFund: number
    taxDeduction: number
    advanceAdjustment: number
  }
} {
  return {
    grossSalary: breakdown.gross,
    customBreakdownApplied: true,
    breakdown: {
      basicSalary: breakdown.basic,
      houseRent: breakdown.houseRent,
      medicalAllowance: breakdown.medical,
      conveyanceAllowance: breakdown.conveyance,
      otherAllowances: breakdown.otherAllowances,
    },
    deductionsDetail: {
      providentFund: breakdown.providentFund,
      taxDeduction: breakdown.incomeTax,
      advanceAdjustment: breakdown.advanceAdjustment,
    },
  }
}

export function suggestedProvidentFund(basic: number): number {
  return roundMoney(Math.max(0, basic) * DEFAULT_PF_RATE_ON_BASIC)
}

/** Recompute conveyance so earnings still equal gross after manual edits. */
export function balanceConveyance(
  gross: number,
  basic: number,
  houseRent: number,
  medical: number,
  otherAllowances = 0,
): number {
  return roundMoney(
    Math.max(0, gross - basic - houseRent - medical - otherAllowances),
  )
}

export function describePayrollRules(config: PayrollRuleConfig): string {
  const medical =
    config.medicalType === MedicalAllowanceType.PERCENT_OF_BASIC
      ? `Medical ${config.medicalValue}% of Basic`
      : `Medical fixed ${config.medicalValue}`
  const conveyance =
    config.conveyanceType === ConveyanceType.REMAINING_BALANCE
      ? 'Conveyance = remaining balance'
      : `Conveyance fixed ${config.conveyanceValue}`
  return `Basic ${config.basicPercentOfGross}% of Gross · House Rent ${config.houseRentPercentOfBasic}% of Basic · ${medical} · ${conveyance}`
}
