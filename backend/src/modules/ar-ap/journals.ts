import { badRequest } from '../../common/errors/app-error';
import { fromMinorUnits } from '../../common/utils/money';
import type { JournalLineDto } from '../accounting/dto/journal.dto';
import { JournalEntityType } from '../accounting/journal.enums';

import { SystemAccountCode } from '../accounting/system-account-codes';

export const AR_CODE = SystemAccountCode.ACCOUNTS_RECEIVABLE;
export const AP_CODE = SystemAccountCode.ACCOUNTS_PAYABLE;
export const REVENUE_CODE = SystemAccountCode.PROJECT_REVENUE;
export const DEFAULT_BILL_EXPENSE_CODE = SystemAccountCode.OFFICE_EXPENSES;

export function buildInvoiceJournalLines(input: {
  amountMinor: number;
  projectId: string;
  description: string;
  customerId?: string;
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
      ...(input.customerId
        ? {
            entityType: JournalEntityType.CUSTOMER,
            entityId: input.customerId,
          }
        : {}),
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
  customerId?: string;
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
      ...(input.customerId
        ? {
            entityType: JournalEntityType.CUSTOMER,
            entityId: input.customerId,
          }
        : {}),
    },
  ];
}

export function buildCreditBillJournalLines(input: {
  amountMinor: number;
  expenseAccountCode: string;
  projectId?: string;
  description: string;
  supplierId: string;
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
      entityType: JournalEntityType.SUPPLIER,
      entityId: input.supplierId,
    },
  ];
}

/**
 * Cash (paid immediately) supplier bill.
 * Routes through AP so the vendor still appears on 2111, then clears AP
 * against treasury in the same entry (net AP for this bill = 0):
 *   Dr expense / Cr 2111  ·  Dr 2111 / Cr treasury
 */
export function buildCashBillJournalLines(input: {
  amountMinor: number;
  expenseAccountCode: string;
  treasuryAccountCode: string;
  projectId?: string;
  description: string;
  supplierId: string;
}): JournalLineDto[] {
  if (input.amountMinor <= 0) {
    throw badRequest('Bill amount must be greater than zero');
  }
  const amount = fromMinorUnits(input.amountMinor);
  const supplier = {
    entityType: JournalEntityType.SUPPLIER,
    entityId: input.supplierId,
  };
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
      ...supplier,
    },
    {
      accountCode: AP_CODE,
      debit: amount,
      description: `${input.description} (paid)`,
      ...supplier,
    },
    {
      accountCode: input.treasuryAccountCode,
      credit: amount,
      description: `${input.description} (paid)`,
    },
  ];
}

export function buildSupplierPaymentJournalLines(input: {
  amountMinor: number;
  treasuryAccountCode: string;
  description: string;
  supplierId: string;
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
      entityType: JournalEntityType.SUPPLIER,
      entityId: input.supplierId,
    },
    {
      accountCode: input.treasuryAccountCode,
      credit: amount,
      description: input.description,
    },
  ];
}
