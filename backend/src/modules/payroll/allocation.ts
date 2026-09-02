import { badRequest } from '../../common/errors/app-error';
import { fromMinorUnits } from '../../common/utils/money';
import type { JournalLineDto } from '../accounting/dto/journal.dto';

export const LABOR_CODE = '5100';
export const ADVANCE_ASSET_CODE = '1300';
export const EMPLOYEE_PAYABLE_CODE = '2100';

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
  if (totalUnits <= 0) {
    throw badRequest('Time logs are required to allocate labor cost');
  }

  let allocated = 0;
  return input.logs.map((row, index) => {
    let amountMinor: number;
    if (index === input.logs.length - 1) {
      amountMinor = input.grossMinor - allocated;
    } else {
      amountMinor = Math.round((input.grossMinor * row.quantityMilli) / totalUnits);
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

export function buildPayrollJournalLines(input: {
  allocations: LaborAllocation[];
  advanceDeductions: AdvanceDeduction[];
  structuralDeductionMinor: number;
  netPayMinor: number;
  treasuryAccountCode: string;
  employeeName: string;
}): JournalLineDto[] {
  if (input.netPayMinor < 0) {
    throw badRequest('Net pay cannot be negative');
  }

  const lines: JournalLineDto[] = [];
  for (const row of input.allocations) {
    if (row.amountMinor <= 0) {
      continue;
    }
    lines.push({
      accountCode: LABOR_CODE,
      debit: fromMinorUnits(row.amountMinor),
      description: `Labor · ${input.employeeName} · ${row.projectCode}`,
      projectId: row.projectId,
    });
  }

  for (const row of input.advanceDeductions) {
    lines.push({
      accountCode: ADVANCE_ASSET_CODE,
      credit: fromMinorUnits(row.amountMinor),
      description: `Advance deduction ${row.advanceNumber}`,
      projectId: row.projectId,
    });
  }

  if (input.structuralDeductionMinor > 0) {
    lines.push({
      accountCode: EMPLOYEE_PAYABLE_CODE,
      credit: fromMinorUnits(input.structuralDeductionMinor),
      description: `Payroll deductions · ${input.employeeName}`,
    });
  }

  if (input.netPayMinor > 0) {
    lines.push({
      accountCode: input.treasuryAccountCode,
      credit: fromMinorUnits(input.netPayMinor),
      description: `Net pay · ${input.employeeName}`,
    });
  }

  return lines;
}
