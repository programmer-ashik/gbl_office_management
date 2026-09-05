import { AccountType } from '../../common/enums/account-type.enum';
import { SettlementCase } from '../../common/enums/advance-status.enum';
import { badRequest } from '../../common/errors/app-error';
import { fromMinorUnits } from '../../common/utils/money';
import type { JournalLineDto } from '../accounting/dto/journal.dto';
import { JournalEntityType } from '../accounting/journal.enums';
import { SystemAccountCode } from '../accounting/system-account-codes';

export const ADVANCE_ASSET_CODE = SystemAccountCode.EMPLOYEE_ADVANCES;
export const EMPLOYEE_PAYABLE_CODE = SystemAccountCode.EMPLOYEE_PAYABLES;

export type VoucherInput = {
  accountCode: string;
  accountName: string;
  amountMinor: number;
  description?: string;
};

export function classifySettlement(
  advancedMinor: number,
  spentMinor: number,
): SettlementCase {
  if (spentMinor < 0 || advancedMinor <= 0) {
    throw badRequest('Advance and spend amounts must be valid');
  }
  if (spentMinor === advancedMinor) {
    return SettlementCase.EQUAL;
  }
  if (spentMinor < advancedMinor) {
    return SettlementCase.LESS;
  }
  return SettlementCase.MORE;
}

export function buildSettlementJournalLines(input: {
  projectId: string;
  employeeId: string;
  advancedMinor: number;
  vouchers: VoucherInput[];
  returnAccountCode?: string;
}): {
  settlementCase: SettlementCase;
  lines: JournalLineDto[];
} {
  const spentMinor = input.vouchers.reduce(
    (sum, line) => sum + line.amountMinor,
    0,
  );
  const settlementCase = classifySettlement(input.advancedMinor, spentMinor);
  const remainderMinor = input.advancedMinor - spentMinor;
  const excessMinor = spentMinor - input.advancedMinor;
  const lines: JournalLineDto[] = [];

  for (const voucher of input.vouchers) {
    if (voucher.amountMinor <= 0) {
      throw badRequest('Voucher amounts must be greater than zero');
    }
    lines.push({
      accountCode: voucher.accountCode,
      debit: fromMinorUnits(voucher.amountMinor),
      description: voucher.description || voucher.accountName,
      projectId: input.projectId,
    });
  }

  if (settlementCase === SettlementCase.LESS) {
    if (!input.returnAccountCode) {
      throw badRequest(
        'Unspent advance must be returned to a cash or bank account',
      );
    }
    if (remainderMinor <= 0) {
      throw badRequest('Return amount must be greater than zero');
    }
    lines.push({
      accountCode: input.returnAccountCode,
      debit: fromMinorUnits(remainderMinor),
      description: 'Unspent advance returned',
    });
  }

  lines.push({
    accountCode: ADVANCE_ASSET_CODE,
    credit: fromMinorUnits(input.advancedMinor),
    description: 'Close employee advance',
    projectId: input.projectId,
    entityType: JournalEntityType.EMPLOYEE,
    entityId: input.employeeId,
  });

  if (settlementCase === SettlementCase.MORE) {
    lines.push({
      accountCode: EMPLOYEE_PAYABLE_CODE,
      credit: fromMinorUnits(excessMinor),
      description: 'Excess spend due to employee',
      entityType: JournalEntityType.EMPLOYEE,
      entityId: input.employeeId,
    });
  }

  return { settlementCase, lines };
}

export function buildReimbursementJournalLines(input: {
  employeeId: string;
  amountMinor: number;
  treasuryAccountCode: string;
  description: string;
}): JournalLineDto[] {
  if (input.amountMinor <= 0) {
    throw badRequest('Reimbursement amount must be greater than zero');
  }
  const amount = fromMinorUnits(input.amountMinor);
  return [
    {
      accountCode: EMPLOYEE_PAYABLE_CODE,
      debit: amount,
      description: input.description,
      entityType: JournalEntityType.EMPLOYEE,
      entityId: input.employeeId,
    },
    {
      accountCode: input.treasuryAccountCode,
      credit: amount,
      description: input.description,
    },
  ];
}

export function assertExpenseAccount(type: AccountType, code: string): void {
  if (type !== AccountType.EXPENSE) {
    throw badRequest(
      `Account ${code} is not an expense account and cannot be used on a settlement voucher`,
    );
  }
}
