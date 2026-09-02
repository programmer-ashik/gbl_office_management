import { PurchaseDestination } from '../../common/enums/procurement.enum';
import { badRequest } from '../../common/errors/app-error';
import { fromMinorUnits } from '../../common/utils/money';
import type { JournalLineDto } from '../accounting/dto/journal.dto';

export const INVENTORY_CODE = '1200';
export const AP_CODE = '2000';
export const MATERIALS_CODE = '5000';

export function buildReceiptJournalLines(input: {
  destination: PurchaseDestination;
  amountMinor: number;
  projectId?: string;
  description: string;
}): JournalLineDto[] {
  if (input.amountMinor <= 0) {
    throw badRequest('Receipt amount must be greater than zero');
  }
  const amount = fromMinorUnits(input.amountMinor);
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
      {
        accountCode: AP_CODE,
        credit: amount,
        description: input.description,
      },
    ];
  }
  return [
    {
      accountCode: INVENTORY_CODE,
      debit: amount,
      description: input.description,
    },
    {
      accountCode: AP_CODE,
      credit: amount,
      description: input.description,
    },
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
