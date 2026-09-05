import {
  allocateLaborByTime,
  buildPayrollJournalLines,
  proposeAdvanceDeductions,
} from './allocation';

describe('payroll allocation', () => {
  it('splits gross salary across projects by logged time', () => {
    const rows = allocateLaborByTime({
      grossMinor: 100_000,
      logs: [
        {
          projectId: 'p1',
          projectCode: 'PRJ-1',
          projectName: 'Alpha',
          quantityMilli: 6000,
        },
        {
          projectId: 'p2',
          projectCode: 'PRJ-2',
          projectName: 'Beta',
          quantityMilli: 4000,
        },
      ],
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]?.amountMinor).toBe(60_000);
    expect(rows[1]?.amountMinor).toBe(40_000);
  });

  it('proposes advance deductions before net pay', () => {
    const result = proposeAdvanceDeductions({
      grossMinor: 50_000,
      structuralDeductionMinor: 5000,
      advances: [
        {
          advanceId: 'a1',
          advanceNumber: 'ADV-1',
          projectId: 'p1',
          outstandingMinor: 20_000,
        },
      ],
    });

    expect(result.totalAdvanceDeductionMinor).toBe(20_000);
    expect(result.netPayMinor).toBe(25_000);
  });

  it('builds balanced payroll journal lines', () => {
    const lines = buildPayrollJournalLines({
      allocations: [
        {
          projectId: 'p1',
          projectCode: 'PRJ-1',
          projectName: 'Alpha',
          quantityMilli: 1000,
          amountMinor: 50_000,
        },
      ],
      advanceDeductions: [
        {
          advanceId: 'a1',
          advanceNumber: 'ADV-1',
          projectId: 'p1',
          amountMinor: 10_000,
        },
      ],
      structuralDeductionMinor: 5000,
      netPayMinor: 35_000,
      treasuryAccountCode: '1112',
      employeeName: 'Rahim',
    });

    const debit = lines.reduce((sum, row) => sum + (row.debit ?? 0), 0);
    const credit = lines.reduce((sum, row) => sum + (row.credit ?? 0), 0);
    expect(debit).toBe(credit);
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountCode: '5100', debit: 500 }),
        expect.objectContaining({ accountCode: '1131', credit: 100 }),
        expect.objectContaining({ accountCode: '2100', credit: 50 }),
        expect.objectContaining({ accountCode: '1112', credit: 350 }),
      ]),
    );
  });
});
