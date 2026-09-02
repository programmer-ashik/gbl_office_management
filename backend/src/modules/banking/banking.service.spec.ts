import { TransferKind } from '../../common/enums/transfer-kind.enum';
import { TreasuryKind } from '../../common/enums/treasury-kind.enum';
import { AppError } from '../../common/errors/app-error';
import {
  autoMatchStatementLines,
  parseStatementCsv,
  toSignedMinorUnits,
} from './csv';
import { assertTransferKind, inferTransferKind } from './banking.service';

describe('statement CSV parsing', () => {
  it('parses signed amounts and BD dates', () => {
    const lines = parseStatementCsv(
      [
        'date,narration,amount,reference',
        '02/09/2026,Cash deposit,"15,000.50",TRF-1',
        '2026-09-03,ATM withdrawal,-500.00,WD-9',
        '03/09/2026,Bank charge,(25.00),FEE',
      ].join('\n'),
    );

    expect(lines).toHaveLength(3);
    expect(lines[0].amount).toBe(15000.5);
    expect(lines[0].date.startsWith('2026-09-02')).toBe(true);
    expect(lines[1].amount).toBe(-500);
    expect(lines[2].amount).toBe(-25);
    expect(toSignedMinorUnits(lines[0].amount)).toBe(1500050);
  });

  it('rejects a CSV without required headers', () => {
    expect(() => parseStatementCsv('foo,bar\n1,2')).toThrow(AppError);
  });
});

describe('autoMatchStatementLines', () => {
  it('matches inflows to debits and outflows to credits on the same day', () => {
    const matches = autoMatchStatementLines(
      [
        { index: 0, date: new Date('2026-09-02T00:00:00.000Z'), amountMinor: 1500000 },
        { index: 1, date: new Date('2026-09-03T00:00:00.000Z'), amountMinor: -50000 },
      ],
      [
        {
          id: 'in',
          date: new Date('2026-09-02T08:00:00.000Z'),
          debitMinor: 1500000,
          creditMinor: 0,
        },
        {
          id: 'out',
          date: new Date('2026-09-03T12:00:00.000Z'),
          debitMinor: 0,
          creditMinor: 50000,
        },
      ],
    );

    expect(matches).toEqual([
      { statementIndex: 0, ledgerLineId: 'in' },
      { statementIndex: 1, ledgerLineId: 'out' },
    ]);
  });

  it('does not reuse a book line twice', () => {
    const matches = autoMatchStatementLines(
      [
        { index: 0, date: new Date('2026-09-02T00:00:00.000Z'), amountMinor: 10000 },
        { index: 1, date: new Date('2026-09-02T00:00:00.000Z'), amountMinor: 10000 },
      ],
      [
        {
          id: 'only',
          date: new Date('2026-09-02T00:00:00.000Z'),
          debitMinor: 10000,
          creditMinor: 0,
        },
      ],
    );
    expect(matches).toEqual([{ statementIndex: 0, ledgerLineId: 'only' }]);
  });
});

describe('transfer kind rules', () => {
  it('infers deposit, withdrawal and generic transfer', () => {
    expect(
      inferTransferKind(TreasuryKind.CASH, TreasuryKind.COMMERCIAL_BANK),
    ).toBe(TransferKind.DEPOSIT);
    expect(
      inferTransferKind(TreasuryKind.COMMERCIAL_BANK, TreasuryKind.PETTY_CASH),
    ).toBe(TransferKind.WITHDRAWAL);
    expect(
      inferTransferKind(TreasuryKind.CASH, TreasuryKind.PETTY_CASH),
    ).toBe(TransferKind.TRANSFER);
  });

  it('rejects a withdrawal that does not land in cash', () => {
    expect(() =>
      assertTransferKind(
        TransferKind.WITHDRAWAL,
        TreasuryKind.COMMERCIAL_BANK,
        TreasuryKind.MOBILE_BANKING,
      ),
    ).toThrow(AppError);
  });
});
