import {
  allocateLaborByTime,
  buildAccrualJournalLines,
  buildDisbursementJournalLines,
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

  it('returns empty allocations when no time logs (HQ salary path)', () => {
    expect(
      allocateLaborByTime({ grossMinor: 50_000, logs: [] }),
    ).toHaveLength(0);
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

  it('builds balanced accrual journal (Step 1)', () => {
    const lines = buildAccrualJournalLines({
      employeeId: 'e1',
      employeeName: 'Rahim',
      allocations: [
        {
          projectId: 'p1',
          projectCode: 'PRJ-1',
          projectName: 'Alpha',
          quantityMilli: 1000,
          amountMinor: 50_000,
        },
      ],
      grossMinor: 50_000,
      advanceDeductions: [
        {
          advanceId: 'a1',
          advanceNumber: 'ADV-1',
          projectId: 'p1',
          amountMinor: 10_000,
        },
      ],
      structureAdvanceMinor: 0,
      providentFundMinor: 3_000,
      taxDeductionMinor: 2_000,
      netPayMinor: 35_000,
    });

    const debit = lines.reduce((sum, row) => sum + (row.debit ?? 0), 0);
    const credit = lines.reduce((sum, row) => sum + (row.credit ?? 0), 0);
    expect(debit).toBe(credit);
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountCode: '5120', debit: 500 }),
        expect.objectContaining({ accountCode: '1131', credit: 100 }),
        expect.objectContaining({ accountCode: '2133', credit: 30 }),
        expect.objectContaining({ accountCode: '2131', credit: 20 }),
        expect.objectContaining({ accountCode: '2121', credit: 350 }),
      ]),
    );
  });

  it('builds balanced disbursement journal (Step 2)', () => {
    const lines = buildDisbursementJournalLines({
      employeeId: 'e1',
      employeeName: 'Rahim',
      netPayMinor: 35_000,
      treasuryAccountCode: '1112',
    });

    const debit = lines.reduce((sum, row) => sum + (row.debit ?? 0), 0);
    const credit = lines.reduce((sum, row) => sum + (row.credit ?? 0), 0);
    expect(debit).toBe(credit);
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountCode: '2121', debit: 350 }),
        expect.objectContaining({ accountCode: '1112', credit: 350 }),
      ]),
    );
  });

  it('accrues HQ salary to 5230 when no project time', () => {
    const lines = buildAccrualJournalLines({
      employeeId: 'e1',
      employeeName: 'Admin',
      allocations: [],
      grossMinor: 40_000,
      advanceDeductions: [],
      structureAdvanceMinor: 0,
      providentFundMinor: 0,
      taxDeductionMinor: 0,
      netPayMinor: 40_000,
    });
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountCode: '5230', debit: 400 }),
        expect.objectContaining({ accountCode: '2121', credit: 400 }),
      ]),
    );
  });
});
