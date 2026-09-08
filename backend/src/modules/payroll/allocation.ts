import { badRequest } from '../../common/errors/app-error';
import { fromMinorUnits } from '../../common/utils/money';
import type { JournalLineDto } from '../accounting/dto/journal.dto';
import { JournalEntityType } from '../accounting/journal.enums';
import { SystemAccountCode } from '../accounting/system-account-codes';

export const LABOR_CODE = SystemAccountCode.PROJECT_LABOR;
export const ADMIN_SALARY_CODE = SystemAccountCode.ADMIN_SALARIES;
export const ADVANCE_ASSET_CODE = SystemAccountCode.EMPLOYEE_ADVANCES;
export const EMPLOYEE_PAYABLE_CODE = SystemAccountCode.EMPLOYEE_PAYABLES;
export const TAX_PAYABLE_CODE = SystemAccountCode.SOURCE_TAX_PAYABLE;
export const PF_PAYABLE_CODE = SystemAccountCode.PF_PAYABLE;

export type LaborAllocation = {
  projectId: string;
  projectCode: string;
  projectName: string;
  quantityMilli: number;
  amountMinor: number;
};

export type AdvanceDeduction = {
  advanceId: string;
  advanceNumber: string;
  projectId: string;
  amountMinor: number;
};

/**
 * Split gross across projects by time. Empty logs → [] (HQ salary uses 5230).
 */
export function allocateLaborByTime(input: {
  grossMinor: number;
  logs: Array<{
    projectId: string;
    projectCode: string;
    projectName: string;
    quantityMilli: number;
  }>;
}): LaborAllocation[] {
  if (input.grossMinor <= 0) {
    throw badRequest('Gross salary must be greater than zero');
  }
  const totalUnits = input.logs.reduce((sum, row) => sum + row.quantityMilli, 0);
  if (totalUnits <= 0 || input.logs.length === 0) {
    return [];
  }

  let allocated = 0;
  return input.logs.map((row, index) => {
    let amountMinor: number;
    if (index === input.logs.length - 1) {
      amountMinor = input.grossMinor - allocated;
    } else {
      amountMinor = Math.round(
        (input.grossMinor * row.quantityMilli) / totalUnits,
      );
      allocated += amountMinor;
    }
    return {
      projectId: row.projectId,
      projectCode: row.projectCode,
      projectName: row.projectName,
      quantityMilli: row.quantityMilli,
      amountMinor,
    };
  });
}

export function proposeAdvanceDeductions(input: {
  grossMinor: number;
  structuralDeductionMinor: number;
  advances: Array<{
    advanceId: string;
    advanceNumber: string;
    projectId: string;
    outstandingMinor: number;
  }>;
}): {
  deductions: AdvanceDeduction[];
  totalAdvanceDeductionMinor: number;
  netPayMinor: number;
} {
  const pool = input.grossMinor - input.structuralDeductionMinor;
  if (pool < 0) {
    throw badRequest('Structural deductions exceed gross salary');
  }

  let remaining = pool;
  const deductions: AdvanceDeduction[] = [];
  for (const advance of input.advances) {
    if (remaining <= 0) {
      break;
    }
    const amountMinor = Math.min(remaining, advance.outstandingMinor);
    if (amountMinor <= 0) {
      continue;
    }
    deductions.push({
      advanceId: advance.advanceId,
      advanceNumber: advance.advanceNumber,
      projectId: advance.projectId,
      amountMinor,
    });
    remaining -= amountMinor;
  }

  return {
    deductions,
    totalAdvanceDeductionMinor: pool - remaining,
    netPayMinor: remaining,
  };
}

/**
 * Step 1 — Monthly accrual (expense recognized, net owed to staff).
 * Dr 5120 (project labor) or 5230 (HQ) = Gross
 * Cr 1131 advances · Cr 2133 PF · Cr 2131 tax · Cr 2121 net payable
 */
export function buildAccrualJournalLines(input: {
  employeeId: string;
  employeeName: string;
  allocations: LaborAllocation[];
  grossMinor: number;
  advanceDeductions: AdvanceDeduction[];
  structureAdvanceMinor: number;
  providentFundMinor: number;
  taxDeductionMinor: number;
  netPayMinor: number;
}): JournalLineDto[] {
  if (input.grossMinor <= 0) {
    throw badRequest('Gross salary must be greater than zero');
  }
  if (input.netPayMinor < 0) {
    throw badRequest('Net pay cannot be negative');
  }

  const lines: JournalLineDto[] = [];
  const allocated = input.allocations.reduce((s, r) => s + r.amountMinor, 0);

  if (input.allocations.length > 0) {
    for (const row of input.allocations) {
      if (row.amountMinor <= 0) continue;
      lines.push({
        accountCode: LABOR_CODE,
        debit: fromMinorUnits(row.amountMinor),
        description: `Labor · ${input.employeeName} · ${row.projectCode}`,
        projectId: row.projectId,
      });
    }
    const remainder = input.grossMinor - allocated;
    if (remainder > 0) {
      lines.push({
        accountCode: ADMIN_SALARY_CODE,
        debit: fromMinorUnits(remainder),
        description: `HQ salary · ${input.employeeName}`,
      });
    }
  } else {
    lines.push({
      accountCode: ADMIN_SALARY_CODE,
      debit: fromMinorUnits(input.grossMinor),
      description: `HQ / admin salary · ${input.employeeName}`,
    });
  }

  for (const row of input.advanceDeductions) {
    lines.push({
      accountCode: ADVANCE_ASSET_CODE,
      credit: fromMinorUnits(row.amountMinor),
      description: `Advance recovery ${row.advanceNumber}`,
      projectId: row.projectId,
      entityType: JournalEntityType.EMPLOYEE,
      entityId: input.employeeId,
    });
  }

  if (input.structureAdvanceMinor > 0) {
    lines.push({
      accountCode: ADVANCE_ASSET_CODE,
      credit: fromMinorUnits(input.structureAdvanceMinor),
      description: `Advance adjustment · ${input.employeeName}`,
      entityType: JournalEntityType.EMPLOYEE,
      entityId: input.employeeId,
    });
  }

  if (input.providentFundMinor > 0) {
    lines.push({
      accountCode: PF_PAYABLE_CODE,
      credit: fromMinorUnits(input.providentFundMinor),
      description: `Provident fund · ${input.employeeName}`,
    });
  }

  if (input.taxDeductionMinor > 0) {
    lines.push({
      accountCode: TAX_PAYABLE_CODE,
      credit: fromMinorUnits(input.taxDeductionMinor),
      description: `Income tax (AIT) · ${input.employeeName}`,
    });
  }

  if (input.netPayMinor > 0) {
    lines.push({
      accountCode: EMPLOYEE_PAYABLE_CODE,
      credit: fromMinorUnits(input.netPayMinor),
      description: `Salary payable · ${input.employeeName}`,
      entityType: JournalEntityType.EMPLOYEE,
      entityId: input.employeeId,
    });
  }

  return lines;
}

/**
 * Step 2 — Disbursement (clear salary payable against cash/bank).
 * Dr 2121 · Cr treasury leaf (1111 / 1112 / 1114)
 */
export function buildDisbursementJournalLines(input: {
  employeeId: string;
  employeeName: string;
  netPayMinor: number;
  treasuryAccountCode: string;
}): JournalLineDto[] {
  if (input.netPayMinor <= 0) {
    return [];
  }
  return [
    {
      accountCode: EMPLOYEE_PAYABLE_CODE,
      debit: fromMinorUnits(input.netPayMinor),
      description: `Salary payout · ${input.employeeName}`,
      entityType: JournalEntityType.EMPLOYEE,
      entityId: input.employeeId,
    },
    {
      accountCode: input.treasuryAccountCode,
      credit: fromMinorUnits(input.netPayMinor),
      description: `Salary payout · ${input.employeeName}`,
    },
  ];
}

/** @deprecated Use buildAccrualJournalLines + buildDisbursementJournalLines */
export function buildPayrollJournalLines(input: {
  allocations: LaborAllocation[];
  advanceDeductions: AdvanceDeduction[];
  structuralDeductionMinor: number;
  netPayMinor: number;
  treasuryAccountCode: string;
  employeeName: string;
  employeeId?: string;
}): JournalLineDto[] {
  const employeeId = input.employeeId ?? 'unknown';
  const grossMinor =
    input.allocations.reduce((s, r) => s + r.amountMinor, 0) ||
    input.netPayMinor +
      input.structuralDeductionMinor +
      input.advanceDeductions.reduce((s, r) => s + r.amountMinor, 0);

  const accrual = buildAccrualJournalLines({
    employeeId,
    employeeName: input.employeeName,
    allocations: input.allocations,
    grossMinor,
    advanceDeductions: input.advanceDeductions,
    structureAdvanceMinor: 0,
    providentFundMinor: 0,
    taxDeductionMinor: input.structuralDeductionMinor,
    netPayMinor: input.netPayMinor,
  });

  const payout = buildDisbursementJournalLines({
    employeeId,
    employeeName: input.employeeName,
    netPayMinor: input.netPayMinor,
    treasuryAccountCode: input.treasuryAccountCode,
  });

  return [...accrual, ...payout];
}
