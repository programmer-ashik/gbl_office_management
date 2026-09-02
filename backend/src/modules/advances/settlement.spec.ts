import { AccountType } from '../../common/enums/account-type.enum';
import { SettlementCase } from '../../common/enums/advance-status.enum';
import { AppError } from '../../common/errors/app-error';
import { toMinorUnits } from '../../common/utils/money';
import {
  ADVANCE_ASSET_CODE,
  assertExpenseAccount,
  buildSettlementJournalLines,
  classifySettlement,
  EMPLOYEE_PAYABLE_CODE,
} from './settlement';

describe('classifySettlement', () => {
  it('classifies equal, less and more spend', () => {
    expect(classifySettlement(10000, 10000)).toBe(SettlementCase.EQUAL);
    expect(classifySettlement(10000, 7000)).toBe(SettlementCase.LESS);
    expect(classifySettlement(10000, 12500)).toBe(SettlementCase.MORE);
  });
});

describe('buildSettlementJournalLines', () => {
  const vouchers = [
    {
      accountCode: '5000',
      accountName: 'Project Materials',
      amountMinor: toMinorUnits(8000),
    },
    {
      accountCode: '5300',
      accountName: 'Travel & Conveyance',
      amountMinor: toMinorUnits(2000),
    },
  ];

  it('closes the advance with expenses only when spend equals the advance', () => {
    const result = buildSettlementJournalLines({
      projectId: 'proj-1',
      advancedMinor: toMinorUnits(10000),
      vouchers,
    });
    expect(result.settlementCase).toBe(SettlementCase.EQUAL);
    expect(result.lines).toHaveLength(3);
    expect(result.lines[2]).toMatchObject({
      accountCode: ADVANCE_ASSET_CODE,
      credit: 10000,
      projectId: 'proj-1',
    });
    expect(result.lines.some((line) => line.accountCode === '1000')).toBe(false);
    expect(
      result.lines.some((line) => line.accountCode === EMPLOYEE_PAYABLE_CODE),
    ).toBe(false);
  });

  it('returns the remainder to cash when spend is less', () => {
    const result = buildSettlementJournalLines({
      projectId: 'proj-1',
      advancedMinor: toMinorUnits(10000),
      vouchers: [vouchers[0]],
      returnAccountCode: '1000',
    });
    expect(result.settlementCase).toBe(SettlementCase.LESS);
    expect(result.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountCode: '5000', debit: 8000, projectId: 'proj-1' }),
        expect.objectContaining({ accountCode: '1000', debit: 2000 }),
        expect.objectContaining({ accountCode: ADVANCE_ASSET_CODE, credit: 10000 }),
      ]),
    );
  });

  it('credits employee payable when spend is more', () => {
    const result = buildSettlementJournalLines({
      projectId: 'proj-1',
      advancedMinor: toMinorUnits(10000),
      vouchers: [
        {
          accountCode: '5000',
          accountName: 'Project Materials',
          amountMinor: toMinorUnits(12500),
        },
      ],
    });
    expect(result.settlementCase).toBe(SettlementCase.MORE);
    expect(result.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountCode: '5000', debit: 12500, projectId: 'proj-1' }),
        expect.objectContaining({ accountCode: ADVANCE_ASSET_CODE, credit: 10000 }),
        expect.objectContaining({ accountCode: EMPLOYEE_PAYABLE_CODE, credit: 2500 }),
      ]),
    );
  });

  it('rejects a non-expense voucher account', () => {
    expect(() => assertExpenseAccount(AccountType.ASSET, '1300')).toThrow(AppError);
  });
});
