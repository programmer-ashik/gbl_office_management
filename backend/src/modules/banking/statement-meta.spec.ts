import { buildStatementParseResult } from './statement-meta';
import { parseStatementCsvDetailed } from './csv';

describe('buildStatementParseResult', () => {
  it('fills opening/closing from labeled text and asOf from period', () => {
    const result = buildStatementParseResult(
      [
        {
          date: '2026-09-02T00:00:00.000Z',
          description: 'Cash deposit',
          amount: 15000,
        },
        {
          date: '2026-09-05T00:00:00.000Z',
          description: 'ATM withdrawal',
          amount: -2000,
        },
      ],
      [
        'Statement Period: 01/09/2026 to 05/09/2026',
        'Opening Balance: 50,000.00',
        'Closing Balance: 63,000.00',
      ].join('\n'),
    );

    expect(result.openingBalance).toBe(50000);
    expect(result.closingBalance).toBe(63000);
    expect(result.asOf).toBe('2026-09-05');
    expect(result.periodFrom?.startsWith('2026-09-01')).toBe(true);
  });

  it('derives closing from opening + movements when closing is missing', () => {
    const result = buildStatementParseResult(
      [
        {
          date: '2026-09-02T00:00:00.000Z',
          description: 'Deposit',
          amount: 1000,
        },
        {
          date: '2026-09-03T00:00:00.000Z',
          description: 'Fee',
          amount: -25,
        },
      ],
      'Opening Balance 10,000.00',
    );

    expect(result.openingBalance).toBe(10000);
    expect(result.closingBalance).toBe(10975);
    expect(result.asOf).toBe('2026-09-03');
  });

  it('strips opening/closing rows from CSV transactions', () => {
    const parsed = parseStatementCsvDetailed(
      [
        'date,description,amount,reference',
        '2026-09-01,Opening Balance,50000,',
        '2026-09-02,Cash deposit,15000,TRF-1',
        '2026-09-03,Closing Balance,65000,',
      ].join('\n'),
    );

    expect(parsed.lines).toHaveLength(1);
    expect(parsed.openingBalance).toBe(50000);
    expect(parsed.closingBalance).toBe(65000);
    expect(parsed.asOf).toBe('2026-09-02');
  });
});
