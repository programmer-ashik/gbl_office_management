import {
  applyAccountSplit,
  planAccountSplit,
  type AccountSplitPlan,
  type AccountSplitResult,
} from './account-split';
import type { JournalService } from './journal.service';
import { SystemAccountCode } from './system-account-codes';

export const UTILITY_HEADER_CODE = SystemAccountCode.UTILITIES;
export const UTILITY_LEGACY_CODE = SystemAccountCode.OTHER_UTILITIES;

/** Must match chart_of_accounts.json. */
export const UTILITY_SUB_LEDGERS = [
  { code: '5221', name: 'Electricity Bill' },
  { code: '5222', name: 'Water Bill' },
  { code: '5223', name: 'Internet Bill' },
  { code: '5224', name: 'Gas Bill' },
  { code: UTILITY_LEGACY_CODE, name: 'Other Utility Bills' },
];

const UTILITY_SPLIT = {
  code: UTILITY_HEADER_CODE,
  children: UTILITY_SUB_LEDGERS,
  historyTo: UTILITY_LEGACY_CODE,
};

/** Read-only preview of the 5220 Utility Bills split. */
export function planUtilitySplit(): Promise<AccountSplitPlan> {
  return planAccountSplit(UTILITY_SPLIT);
}

/** 5220 Utility Bills → header with 5221–5224 and 5229 (receives history). */
export function applyUtilitySplit(
  journalService: JournalService,
  userId: string,
): Promise<AccountSplitResult> {
  return applyAccountSplit(journalService, userId, UTILITY_SPLIT);
}
