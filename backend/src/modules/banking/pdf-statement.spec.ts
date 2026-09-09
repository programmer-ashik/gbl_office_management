import { parseStatementPdfDetailed } from './pdf-statement';

jest.mock('pdf-parse', () =>
  jest.fn(async () => ({
    text: [
      'Statement of Account',
      'Period From:01-02-2026To31-05-2026',
      'ACCOUNT ACTIVITY',
      'DATEDESCRIPTIONCHQ.NO.WITHDRAWALDEPOSITBALANCE',
      '02-02-2026NPSB IN/SJBL/402411100003356100,000.00105,022.65',
      '02-02-2026CT/FT-CBLTA-260334834342-1263060,900.0044,122.65',
      '04-02-2026ATM WDLLalmatia RATM>Mohammadp5,000.0039,122.65',
      '06-02-2026CITYTOUCH/NPSB-CHARGE-2050703010.0039,112.65',
      'Total Withdrawal : 100.00 BDT Opening Balance : 5,022.65 BDT',
      ' Total Deposit : 100.00 BDT Available Balance as of 31-05-2026 : 39,112.65 BDT',
    ].join('\n'),
  })),
);

describe('parseStatementPdf City Bank layout', () => {
  it('uses running balance deltas even when refs glue to amounts', async () => {
    const parsed = await parseStatementPdfDetailed(Buffer.from('%PDF-mock'));
    expect(parsed.openingBalance).toBe(5022.65);
    expect(parsed.closingBalance).toBe(39112.65);
    expect(parsed.lines.map((line) => line.amount)).toEqual([
      100000, -60900, -5000, -10,
    ]);
    expect(parsed.lines[3].description).toMatch(/CITYTOUCH\/NPSB-CHARGE/i);
  });
});
