import {
  ConveyanceType,
  MedicalAllowanceType,
} from '../../common/enums/payroll.enum';

/** Bangladesh corporate salary component labels (legacy allowance/deduction rows). */
export const BdSalaryComponent = {
  HOUSE_RENT: 'House Rent Allowance',
  MEDICAL: 'Medical Allowance',
  CONVEYANCE: 'Conveyance Allowance',
  OTHER: 'Other Allowances',
  PF: 'Provident Fund',
  ADVANCE: 'Advance Adjustment',
  AIT: 'Income Tax (AIT)',
} as const;

export type PayrollRuleConfig = {
  basicPercentOfGross: number;
  houseRentPercentOfBasic: number;
  medicalType: MedicalAllowanceType;
  medicalValue: number;
  conveyanceType: ConveyanceType;
  conveyanceValue: number;
};

export const DEFAULT_PAYROLL_RULE_CONFIG: PayrollRuleConfig = {
  basicPercentOfGross: 50,
  houseRentPercentOfBasic: 50,
  medicalType: MedicalAllowanceType.FIXED_AMOUNT,
  medicalValue: 2_500,
  conveyanceType: ConveyanceType.REMAINING_BALANCE,
  conveyanceValue: 0,
};

export type SalaryBreakdownResult = {
  grossSalary: number;
  basicSalary: number;
  houseRent: number;
  medicalAllowance: number;
  conveyanceAllowance: number;
  otherAllowances: number;
  providentFund: number;
  taxDeduction: number;
  advanceAdjustment: number;
  netPayable: number;
};

export type SalaryBreakdownOverrides = Partial<{
  basicSalary: number;
  houseRent: number;
  medicalAllowance: number;
  conveyanceAllowance: number;
  otherAllowances: number;
  providentFund: number;
  taxDeduction: number;
  advanceAdjustment: number;
}>;

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Dynamic salary split driven by Admin PayrollSettings (no hardcoded %).
 */
export function calculateSalaryBreakdown(
  grossSalaryInput: number,
  companyConfig: PayrollRuleConfig,
  overrides: SalaryBreakdownOverrides = {},
): SalaryBreakdownResult {
  const config = { ...DEFAULT_PAYROLL_RULE_CONFIG, ...companyConfig };
  const grossSalary = roundMoney(Math.max(0, grossSalaryInput));

  if (grossSalary <= 0) {
    return {
      grossSalary: 0,
      basicSalary: 0,
      houseRent: 0,
      medicalAllowance: 0,
      conveyanceAllowance: 0,
      otherAllowances: 0,
      providentFund: 0,
      taxDeduction: 0,
      advanceAdjustment: 0,
      netPayable: 0,
    };
  }

  const basicSalary =
    overrides.basicSalary != null
      ? roundMoney(Math.max(0, overrides.basicSalary))
      : roundMoney(grossSalary * (config.basicPercentOfGross / 100));

  const houseRent =
    overrides.houseRent != null
      ? roundMoney(Math.max(0, overrides.houseRent))
      : roundMoney(basicSalary * (config.houseRentPercentOfBasic / 100));

  let medicalAllowance =
    overrides.medicalAllowance != null
      ? roundMoney(Math.max(0, overrides.medicalAllowance))
      : config.medicalType === MedicalAllowanceType.PERCENT_OF_BASIC
        ? roundMoney(basicSalary * (config.medicalValue / 100))
        : roundMoney(Math.max(0, config.medicalValue));

  // Keep medical within remaining room when using company defaults
  if (overrides.medicalAllowance == null) {
    const room = roundMoney(Math.max(0, grossSalary - basicSalary - houseRent));
    medicalAllowance = roundMoney(Math.min(medicalAllowance, room));
  }

  let conveyanceAllowance: number;
  if (overrides.conveyanceAllowance != null) {
    conveyanceAllowance = roundMoney(Math.max(0, overrides.conveyanceAllowance));
  } else if (config.conveyanceType === ConveyanceType.FIXED_AMOUNT) {
    conveyanceAllowance = roundMoney(Math.max(0, config.conveyanceValue));
  } else {
    conveyanceAllowance = roundMoney(
      Math.max(0, grossSalary - (basicSalary + houseRent + medicalAllowance)),
    );
  }

  let otherAllowances =
    overrides.otherAllowances != null
      ? roundMoney(Math.max(0, overrides.otherAllowances))
      : roundMoney(
          Math.max(
            0,
            grossSalary -
              (basicSalary +
                houseRent +
                medicalAllowance +
                conveyanceAllowance),
          ),
        );

  // If fixed conveyance overshoots, fold remainder into otherAllowances = 0
  // and clamp conveyance so earnings never exceed gross when using defaults.
  if (
    overrides.conveyanceAllowance == null &&
    overrides.otherAllowances == null &&
    config.conveyanceType === ConveyanceType.FIXED_AMOUNT
  ) {
    const used = basicSalary + houseRent + medicalAllowance;
    const room = roundMoney(Math.max(0, grossSalary - used));
    conveyanceAllowance = roundMoney(Math.min(conveyanceAllowance, room));
    otherAllowances = roundMoney(
      Math.max(0, grossSalary - (used + conveyanceAllowance)),
    );
  }

  const providentFund =
    overrides.providentFund != null
      ? roundMoney(Math.max(0, overrides.providentFund))
      : 0;
  const taxDeduction =
    overrides.taxDeduction != null
      ? roundMoney(Math.max(0, overrides.taxDeduction))
      : 0;
  const advanceAdjustment =
    overrides.advanceAdjustment != null
      ? roundMoney(Math.max(0, overrides.advanceAdjustment))
      : 0;

  const earnings =
    basicSalary +
    houseRent +
    medicalAllowance +
    conveyanceAllowance +
    otherAllowances;
  const deductions = providentFund + taxDeduction + advanceAdjustment;

  return {
    grossSalary,
    basicSalary,
    houseRent,
    medicalAllowance,
    conveyanceAllowance,
    otherAllowances,
    providentFund,
    taxDeduction,
    advanceAdjustment,
    netPayable: roundMoney(earnings - deductions),
  };
}

/** Sync typed breakdown → legacy allowance/deduction component rows for payroll runs. */
export function breakdownToLegacyComponents(row: SalaryBreakdownResult): {
  basic: number;
  allowances: Array<{ name: string; amount: number }>;
  deductions: Array<{ name: string; amount: number }>;
} {
  const allowances: Array<{ name: string; amount: number }> = [];
  if (row.houseRent > 0) {
    allowances.push({ name: BdSalaryComponent.HOUSE_RENT, amount: row.houseRent });
  }
  if (row.medicalAllowance > 0) {
    allowances.push({
      name: BdSalaryComponent.MEDICAL,
      amount: row.medicalAllowance,
    });
  }
  if (row.conveyanceAllowance > 0) {
    allowances.push({
      name: BdSalaryComponent.CONVEYANCE,
      amount: row.conveyanceAllowance,
    });
  }
  if (row.otherAllowances > 0) {
    allowances.push({
      name: BdSalaryComponent.OTHER,
      amount: row.otherAllowances,
    });
  }

  const deductions: Array<{ name: string; amount: number }> = [];
  if (row.providentFund > 0) {
    deductions.push({ name: BdSalaryComponent.PF, amount: row.providentFund });
  }
  if (row.advanceAdjustment > 0) {
    deductions.push({
      name: BdSalaryComponent.ADVANCE,
      amount: row.advanceAdjustment,
    });
  }
  if (row.taxDeduction > 0) {
    deductions.push({ name: BdSalaryComponent.AIT, amount: row.taxDeduction });
  }

  return {
    basic: row.basicSalary,
    allowances,
    deductions,
  };
}
