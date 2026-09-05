import { badRequest } from '../../common/errors/app-error';
import { fromMinorUnits } from '../../common/utils/money';
import type { JournalLineDto } from '../accounting/dto/journal.dto';

import { SystemAccountCode } from '../accounting/system-account-codes';

export const AR_CODE = SystemAccountCode.ACCOUNTS_RECEIVABLE;
export const AP_CODE = SystemAccountCode.ACCOUNTS_PAYABLE;
export const REVENUE_CODE = SystemAccountCode.PROJECT_REVENUE;
export const DEFAULT_BILL_EXPENSE_CODE = SystemAccountCode.OFFICE_EXPENSES;

export function buildInvoiceJournalLines(input: {
  amountMinor: number;
  projectId: string;
  description: string;
}): JournalLineDto[] {
  if (input.amountMinor <= 0) {
    throw badRequest('Invoice amount must be greater than zero');
  }
  const amount = fromMinorUnits(input.amountMinor);
  return [
    {
      accountCode: AR_CODE,
      debit: amount,
      description: input.description,
      projectId: input.projectId,
    },
    {
      accountCode: REVENUE_CODE,
      credit: amount,
      description: input.description,
      projectId: input.projectId,
    },
  ];
}

export function buildCollectionJournalLines(input: {
  amountMinor: number;
  treasuryAccountCode: string;
  projectId: string;
  description: string;
}): JournalLineDto[] {
  if (input.amountMinor <= 0) {
    throw badRequest('Collection amount must be greater than zero');
  }
  const amount = fromMinorUnits(input.amountMinor);
  return [
    {
      accountCode: input.treasuryAccountCode,
      debit: amount,
      description: input.description,
      projectId: input.projectId,
    },
    {
      accountCode: AR_CODE,
      credit: amount,
      description: input.description,
      projectId: input.projectId,
    },
  ];
}

export function buildCreditBillJournalLines(input: {
  amountMinor: number;
  expenseAccountCode: string;
  projectId?: string;
  description: string;
}): JournalLineDto[] {
  if (input.amountMinor <= 0) {
    throw badRequest('Bill amount must be greater than zero');
  }
  const amount = fromMinorUnits(input.amountMinor);
  return [
    {
      accountCode: input.expenseAccountCode,
      debit: amount,
      description: input.description,
      projectId: input.projectId,
    },
    {
      accountCode: AP_CODE,
      credit: amount,
      description: input.description,
    },
  ];
}

export function buildCashBillJournalLines(input: {
  amountMinor: number;
  expenseAccountCode: string;
  treasuryAccountCode: string;
  projectId?: string;
  description: string;
}): JournalLineDto[] {
  if (input.amountMinor <= 0) {
    throw badRequest('Bill amount must be greater than zero');
  }
  const amount = fromMinorUnits(input.amountMinor);
  return [
    {
      accountCode: input.expenseAccountCode,
      debit: amount,
      description: input.description,
      projectId: input.projectId,
    },
    {
      accountCode: input.treasuryAccountCode,
      credit: amount,
      description: input.description,
    },
  ];
}

export function buildSupplierPaymentJournalLines(input: {
  amountMinor: number;
  treasuryAccountCode: string;
  description: string;
}): JournalLineDto[] {
  if (input.amountMinor <= 0) {
    throw badRequest('Payment amount must be greater than zero');
  }
  const amount = fromMinorUnits(input.amountMinor);
  return [
    {
      accountCode: AP_CODE,
      debit: amount,
      description: input.description,
    },
    {
      accountCode: input.treasuryAccountCode,
      credit: amount,
      description: input.description,
    },
  ];
}
