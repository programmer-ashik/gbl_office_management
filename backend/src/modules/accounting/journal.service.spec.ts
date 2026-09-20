import {
  assertDebitsEqualCredits,
  toMinorUnits,
} from '../../common/utils/money';
import { prepareJournalLines } from './journal.service';
import { AppError } from '../../common/errors/app-error';

describe('prepareJournalLines', () => {
  it('accepts a balanced two-line entry', () => {
    const result = prepareJournalLines([
      { accountCode: '1111', debit: 1500.5 },
      { accountCode: '3100', credit: 1500.5 },
    ]);
    expect(result.debitMinor).toBe(toMinorUnits(1500.5));
    expect(result.creditMinor).toBe(toMinorUnits(1500.5));
    expect(() =>
      assertDebitsEqualCredits(result.debitMinor, result.creditMinor),
    ).not.toThrow();
  });

  it('rejects an unbalanced entry', () => {
    expect(() =>
      prepareJournalLines([
        { accountCode: '1111', debit: 100 },
        { accountCode: '3100', credit: 90 },
      ]),
    ).toThrow(AppError);
  });

  it('rejects a line with both debit and credit', () => {
    expect(() =>
      prepareJournalLines([
        { accountCode: '1111', debit: 50, credit: 50 },
        { accountCode: '3100', credit: 50 },
      ]),
    ).toThrow(AppError);
  });
});
