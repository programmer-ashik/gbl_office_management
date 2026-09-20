import {
  calculateSalaryBreakdown,
  DEFAULT_PAYROLL_RULE_CONFIG,
  breakdownToLegacyComponents,
} from './salary-breakdown';
import {
  ConveyanceType,
  MedicalAllowanceType,
} from '../../common/enums/payroll.enum';

describe('calculateSalaryBreakdown (config-driven)', () => {
  it('uses company percentages for a 50,000 gross', () => {
    const row = calculateSalaryBreakdown(50_000, DEFAULT_PAYROLL_RULE_CONFIG);
    expect(row.basicSalary).toBe(25_000);
    expect(row.houseRent).toBe(12_500);
    expect(row.medicalAllowance).toBe(2_500);
    expect(row.conveyanceAllowance).toBe(10_000);
    expect(row.otherAllowances).toBe(0);
    expect(row.grossSalary).toBe(50_000);
  });

  it('supports medical as percent of basic', () => {
    const row = calculateSalaryBreakdown(40_000, {
      ...DEFAULT_PAYROLL_RULE_CONFIG,
      medicalType: MedicalAllowanceType.PERCENT_OF_BASIC,
      medicalValue: 10,
    });
    expect(row.basicSalary).toBe(20_000);
    expect(row.houseRent).toBe(10_000);
    expect(row.medicalAllowance).toBe(2_000);
    expect(row.conveyanceAllowance).toBe(8_000);
  });

  it('supports fixed conveyance and puts leftover in otherAllowances', () => {
    const row = calculateSalaryBreakdown(50_000, {
      ...DEFAULT_PAYROLL_RULE_CONFIG,
      conveyanceType: ConveyanceType.FIXED_AMOUNT,
      conveyanceValue: 3_000,
    });
    expect(row.medicalAllowance).toBe(2_500);
    expect(row.conveyanceAllowance).toBe(3_000);
    expect(row.otherAllowances).toBe(7_000);
  });

  it('honors custom overrides without changing company config', () => {
    const row = calculateSalaryBreakdown(
      50_000,
      DEFAULT_PAYROLL_RULE_CONFIG,
      {
        basicSalary: 30_000,
        houseRent: 10_000,
        medicalAllowance: 2_000,
        conveyanceAllowance: 8_000,
        providentFund: 2_100,
        taxDeduction: 500,
      },
    );
    expect(row.basicSalary).toBe(30_000);
    expect(row.providentFund).toBe(2_100);
    expect(row.netPayable).toBe(50_000 - 2_100 - 500);
  });

  it('maps to legacy components for payroll runs', () => {
    const legacy = breakdownToLegacyComponents(
      calculateSalaryBreakdown(50_000, DEFAULT_PAYROLL_RULE_CONFIG),
    );
    expect(legacy.basic).toBe(25_000);
    expect(legacy.allowances).toHaveLength(3);
  });
});
