import { AccountType } from '../../common/enums/account-type.enum';
import { SettlementCase } from '../../common/enums/advance-status.enum';
import { toMinorUnits } from '../../common/utils/money';
import { AppError } from '../../common/errors/app-error';
import { JournalEntityType } from '../accounting/journal.enums';
import {
  ADVANCE_ASSET_CODE,
  EMPLOYEE_PAYABLE_CODE,
  assertExpenseAccount,
  buildReimbursementJournalLines,
  buildSettlementJournalLines,
  classifySettlement,
} from './settlement';

describe('classifySettlement', () => {
  it('classifies equal, less, and more cases', () => {
    expect(classifySettlement(10000, 10000)).toBe(SettlementCase.EQUAL);
    expect(classifySettlement(10000, 7000)).toBe(SettlementCase.LESS);
    expect(classifySettlement(10000, 12500)).toBe(SettlementCase.MORE);
  });
});

describe('buildSettlementJournalLines', () => {
  const employeeId = '507f1f77bcf86cd799439011';

  it('balances equal spend with expense debit and advance credit', () => {
    const result = buildSettlementJournalLines({
      projectId: 'proj-1',
      employeeId,
      advancedMinor: toMinorUnits(10000),
      vouchers: [
        {
          accountCode: '5110',
          accountName: 'Project Materials',
          amountMinor: toMinorUnits(10000),
        },
      ],
    });
    expect(result.settlementCase).toBe(SettlementCase.EQUAL);
    expect(result.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountCode: '5110', debit: 10000 }),
        expect.objectContaining({
          accountCode: ADVANCE_ASSET_CODE,
          credit: 10000,
          entityType: JournalEntityType.EMPLOYEE,
          entityId: employeeId,
        }),
      ]),
    );
  });

  it('returns unspent cash when spend is less', () => {
    const result = buildSettlementJournalLines({
      projectId: 'proj-1',
      employeeId,
      advancedMinor: toMinorUnits(10000),
      vouchers: [
        {
          accountCode: '5110',
          accountName: 'Project Materials',
          amountMinor: toMinorUnits(7000),
        },
      ],
      returnAccountCode: '1111',
    });
    expect(result.settlementCase).toBe(SettlementCase.LESS);
    expect(result.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountCode: '1111', debit: 3000 }),
        expect.objectContaining({ accountCode: ADVANCE_ASSET_CODE, credit: 10000 }),
      ]),
    );
  });

  it('credits employee payable when spend is more', () => {
    const result = buildSettlementJournalLines({
      projectId: 'proj-1',
      employeeId,
      advancedMinor: toMinorUnits(10000),
      vouchers: [
        {
          accountCode: '5110',
          accountName: 'Project Materials',
          amountMinor: toMinorUnits(12500),
        },
      ],
    });
    expect(result.settlementCase).toBe(SettlementCase.MORE);
    expect(result.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountCode: '5110',
          debit: 12500,
          projectId: 'proj-1',
        }),
        expect.objectContaining({ accountCode: ADVANCE_ASSET_CODE, credit: 10000 }),
        expect.objectContaining({
          accountCode: EMPLOYEE_PAYABLE_CODE,
          credit: 2500,
          entityType: JournalEntityType.EMPLOYEE,
          entityId: employeeId,
        }),
      ]),
    );
    expect(EMPLOYEE_PAYABLE_CODE).toBe('2121');
  });

  it('builds reimbursement payout clearing employee payable', () => {
    const lines = buildReimbursementJournalLines({
      employeeId,
      amountMinor: toMinorUnits(2500),
      treasuryAccountCode: '1111',
      description: 'Reimburse excess',
    });
    expect(lines).toEqual([
      expect.objectContaining({
        accountCode: EMPLOYEE_PAYABLE_CODE,
        debit: 2500,
        entityId: employeeId,
      }),
      expect.objectContaining({ accountCode: '1111', credit: 2500 }),
    ]);
  });

  it('rejects a non-expense voucher account', () => {
    expect(() => assertExpenseAccount(AccountType.ASSET, '1131')).toThrow(AppError);
  });
});
