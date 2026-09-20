import { PurchaseDestination } from '../../common/enums/procurement.enum';
import { badRequest } from '../../common/errors/app-error';
import { fromMinorUnits } from '../../common/utils/money';
import type { JournalLineDto } from '../accounting/dto/journal.dto';
import { JournalEntityType } from '../accounting/journal.enums';
import { SystemAccountCode } from '../accounting/system-account-codes';

export const INVENTORY_CODE = SystemAccountCode.INVENTORY;
export const AP_CODE = SystemAccountCode.ACCOUNTS_PAYABLE;
export const MATERIALS_CODE = SystemAccountCode.PROJECT_MATERIALS;
export const CASH_CODE = SystemAccountCode.CASH;
export const CASH_IN_HAND_CODE = SystemAccountCode.CASH_IN_HAND;

/** How the supplier is settled on goods receipt. */
export type ReceiptSettlement = 'due' | 'cash' | 'bank';

function creditLine(input: {
  settlement: ReceiptSettlement;
  amount: number;
  description: string;
  creditAccountCode?: string;
  supplierId?: string;
}): JournalLineDto {
  if (input.settlement === 'due') {
    return {
      accountCode: AP_CODE,
      credit: input.amount,
      description: input.description,
      ...(input.supplierId
        ? {
            entityType: JournalEntityType.SUPPLIER,
            entityId: input.supplierId,
          }
        : {}),
    };
  }
  const code = input.creditAccountCode?.trim();
  if (!code) {
    throw badRequest(
      input.settlement === 'cash'
        ? 'Select a cash account for cash settlement'
        : 'Select a bank account for bank settlement',
    );
  }
  return {
    accountCode: code,
    credit: input.amount,
    description: input.description,
  };
}

export function buildReceiptJournalLines(input: {
  destination: PurchaseDestination;
  amountMinor: number;
  projectId?: string;
  description: string;
  settlement?: ReceiptSettlement;
  creditAccountCode?: string;
  supplierId?: string;
}): JournalLineDto[] {
  if (input.amountMinor <= 0) {
    throw badRequest('Receipt amount must be greater than zero');
  }
  const amount = fromMinorUnits(input.amountMinor);
  const settlement = input.settlement ?? 'due';
  const credit = creditLine({
    settlement,
    amount,
    description: input.description,
    creditAccountCode: input.creditAccountCode,
    supplierId: input.supplierId,
  });

  if (input.destination === PurchaseDestination.DIRECT_TO_SITE) {
    if (!input.projectId) {
      throw badRequest('Direct-to-site receipts must be tagged to a project');
    }
    return [
      {
        accountCode: MATERIALS_CODE,
        debit: amount,
        description: input.description,
        projectId: input.projectId,
      },
      credit,
    ];
  }
  return [
    {
      accountCode: INVENTORY_CODE,
      debit: amount,
      description: input.description,
    },
    credit,
  ];
}

export function buildIssueJournalLines(input: {
  amountMinor: number;
  projectId: string;
  description: string;
}): JournalLineDto[] {
  if (input.amountMinor <= 0) {
    throw badRequest('Issue amount must be greater than zero');
  }
  const amount = fromMinorUnits(input.amountMinor);
  return [
    {
      accountCode: MATERIALS_CODE,
      debit: amount,
      description: input.description,
      projectId: input.projectId,
    },
    {
      accountCode: INVENTORY_CODE,
      credit: amount,
      description: input.description,
    },
  ];
}

export function buildReturnJournalLines(input: {
  destination: PurchaseDestination;
  amountMinor: number;
  projectId?: string;
  description: string;
}): JournalLineDto[] {
  if (input.amountMinor <= 0) {
    throw badRequest('Return amount must be greater than zero');
  }
  const amount = fromMinorUnits(input.amountMinor);
  if (input.destination === PurchaseDestination.DIRECT_TO_SITE) {
    if (!input.projectId) {
      throw badRequest('Direct-to-site returns must reverse the project cost');
    }
    return [
      {
        accountCode: AP_CODE,
        debit: amount,
        description: input.description,
      },
      {
        accountCode: MATERIALS_CODE,
        credit: amount,
        description: input.description,
        projectId: input.projectId,
      },
    ];
  }
  return [
    {
      accountCode: AP_CODE,
      debit: amount,
      description: input.description,
    },
    {
      accountCode: INVENTORY_CODE,
      credit: amount,
      description: input.description,
    },
  ];
}
