import { classifyAgingBucket, buildAgingReport } from './aging';

describe('aging buckets', () => {
  it('groups open balances into 30/60/90+ buckets', () => {
    const asOf = new Date('2026-09-30T00:00:00.000Z');
    const report = buildAgingReport(asOf, [
      {
        id: '1',
        reference: 'INV-1',
        partyName: 'Client A',
        date: '2026-09-01T00:00:00.000Z',
        dueDate: '2026-10-15T00:00:00.000Z',
        openAmount: 1000,
      },
      {
        id: '2',
        reference: 'INV-2',
        partyName: 'Client B',
        date: '2026-08-01T00:00:00.000Z',
        dueDate: '2026-09-10T00:00:00.000Z',
        openAmount: 500,
      },
      {
        id: '3',
        reference: 'INV-3',
        partyName: 'Client C',
        date: '2026-05-01T00:00:00.000Z',
        dueDate: '2026-05-15T00:00:00.000Z',
        openAmount: 250,
      },
    ]);

    expect(report.total).toBe(1750);
    expect(report.buckets.find((b) => b.key === 'current')?.amount).toBe(1000);
    expect(report.buckets.find((b) => b.key === 'days_1_30')?.amount).toBe(500);
    expect(report.buckets.find((b) => b.key === 'days_90_plus')?.amount).toBe(250);
  });

  it('classifies days past due', () => {
    expect(classifyAgingBucket(0)).toBe('current');
    expect(classifyAgingBucket(15)).toBe('days_1_30');
    expect(classifyAgingBucket(45)).toBe('days_31_60');
    expect(classifyAgingBucket(75)).toBe('days_61_90');
    expect(classifyAgingBucket(120)).toBe('days_90_plus');
  });
});
