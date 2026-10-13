import { JournalType, type JournalType as JournalTypeValue } from './journal.enums';
import { SystemAccountCode } from './system-account-codes';

export type InferJournalInput = {
  journalType?: string | null;
  source?: string | null;
  memo?: string | null;
  reference?: string | null;
  reversesEntryId?: unknown;
  lines: Array<{ accountCode: string; debitMinor: number; creditMinor: number }>;
};

const isCash = (code: string) => code === SystemAccountCode.CASH || /^113/.test(code);
const isBank = (code: string) => /^112/.test(code);
const isTreasury = (code: string) => isCash(code) || isBank(code);
const isPayable = (code: string) =>
  code === SystemAccountCode.ACCOUNTS_PAYABLE ||
  code === SystemAccountCode.SUBCONTRACTOR_PAYABLE;
/** A post-dated cheque parks the bank side in a PDC clearing account. */
const receivedFunds = (code: string) =>
  isTreasury(code) || code === SystemAccountCode.PDC_RECEIVABLE;
const paidFunds = (code: string) =>
  isTreasury(code) || code === SystemAccountCode.PDC_PAYABLE;

/** Types that stand alone: an opening journal is not also an "advance". */
const EXCLUSIVE_TYPES = new Set<string>([
  JournalType.OPENING_BALANCE,
  JournalType.YEAR_END_CLOSING,
]);

function storedType(entry: InferJournalInput): JournalTypeValue {
  return (entry.journalType as JournalTypeValue | undefined) || JournalType.GENERAL;
}

/** Category from the document number / memo written by system modules. */
function documentType(entry: InferJournalInput): JournalTypeValue | null {
  const ref = (entry.reference ?? '').trim().toUpperCase();
  const memo = (entry.memo ?? '').trim().toLowerCase();
  if (memo.startsWith('opening balance') || memo.startsWith('opening capital')) {
    return entry.source === 'system' ? JournalType.OPENING_BALANCE : null;
  }
  if (entry.source !== 'system') return null;
  if (ref.startsWith('ADV-')) {
    return memo.includes('settlement') || memo.startsWith('reimburse')
      ? JournalType.EMPLOYEE_SETTLEMENT
      : JournalType.EMPLOYEE_ADVANCE;
  }
  if (ref.startsWith('SAD-') || ref.startsWith('SLN-')) return JournalType.EMPLOYEE_ADVANCE;
  if (memo.startsWith('payroll')) return JournalType.PAYROLL_ADJUSTMENT;
  if (ref.startsWith('INV-')) return JournalType.SALES;
  if (ref.startsWith('RC-')) return JournalType.CUSTOMER_RECEIPT;
  if (ref.startsWith('BILL-')) return JournalType.PURCHASE;
  if (ref.startsWith('PAY-')) return JournalType.SUPPLIER_PAYMENT;
  if (memo.startsWith('grn for') || memo.startsWith('return against')) {
    return JournalType.PURCHASE;
  }
  if (memo.startsWith('issue stock to')) return JournalType.PROJECT_COST;
  if (ref.startsWith('TRF-')) return JournalType.INTERNAL_TRANSFER;
  if (memo.startsWith('bank charge')) return JournalType.OTHER_EXPENSE;
  if (memo.startsWith('bank interest')) return JournalType.OTHER_INCOME;
  return null;
}

/** Categories implied by the accounts on the journal (most specific first). */
function accountTypes(entry: InferJournalInput): JournalTypeValue[] {
  const memo = (entry.memo ?? '').trim().toLowerCase();
  // A reversal swaps sides; classify it like the journal it reverses.
  const swap = Boolean(entry.reversesEntryId) || memo.startsWith('reversal of');
  const lines = entry.lines.map((line) => ({
    code: line.accountCode.trim().toUpperCase(),
    debit: swap ? line.creditMinor : line.debitMinor,
    credit: swap ? line.debitMinor : line.creditMinor,
  }));
  const dr = (test: (code: string) => boolean) =>
    lines.some((line) => line.debit > 0 && test(line.code));
  const cr = (test: (code: string) => boolean) =>
    lines.some((line) => line.credit > 0 && test(line.code));
  const is = (code: string) => (value: string) => value === code;
  const starts = (prefix: string) => (value: string) => value.startsWith(prefix);

  const types: JournalTypeValue[] = [];
  const add = (condition: boolean, type: JournalTypeValue) => {
    if (condition) types.push(type);
  };
  const transfer = lines.length > 0 && lines.every((line) => isTreasury(line.code));

  add(dr(is(SystemAccountCode.EMPLOYEE_ADVANCES)), JournalType.EMPLOYEE_ADVANCE);
  add(cr(is(SystemAccountCode.EMPLOYEE_ADVANCES)), JournalType.EMPLOYEE_SETTLEMENT);
  add(dr(isPayable) && cr(paidFunds), JournalType.SUPPLIER_PAYMENT);
  add(cr(isPayable), JournalType.PURCHASE);
  add(
    cr(is(SystemAccountCode.ACCOUNTS_RECEIVABLE)) && dr(receivedFunds),
    JournalType.CUSTOMER_RECEIPT,
  );
  add(dr(is(SystemAccountCode.ACCOUNTS_RECEIVABLE)) && cr(starts('4')), JournalType.SALES);
  add(cr(is(SystemAccountCode.OTHER_INCOME)), JournalType.OTHER_INCOME);
  add(cr(starts('41')), JournalType.PROJECT_REVENUE);
  add(dr(starts('51')), JournalType.PROJECT_COST);
  add(dr((code) => code.startsWith('5') && !code.startsWith('51')), JournalType.EXPENSE);
  add(transfer, JournalType.INTERNAL_TRANSFER);
  add(!transfer && cr(isCash), JournalType.CASH_PAYMENT);
  add(!transfer && cr(isBank), JournalType.BANK_WITHDRAWAL);
  add(!transfer && dr(isCash), JournalType.CASH_RECEIPT);
  add(!transfer && dr(isBank), JournalType.BANK_DEPOSIT);
  return types;
}

/**
 * Every Type-filter category a journal belongs to, primary first. A journal
 * that pays a staff advance and office rent in cash is Employee Advance,
 * Expense, and Cash Payment. The stored type (when not General) always leads.
 */
export function journalTypeTags(entry: InferJournalInput): JournalTypeValue[] {
  const stored = storedType(entry);
  if (EXCLUSIVE_TYPES.has(stored)) return [stored];
  const fromDocument = documentType(entry);
  if (fromDocument && EXCLUSIVE_TYPES.has(fromDocument)) return [fromDocument];
  const tags = [
    ...(stored !== JournalType.GENERAL ? [stored] : []),
    ...(fromDocument ? [fromDocument] : []),
    ...accountTypes(entry),
  ];
  return [...new Set(tags)];
}

/** Primary type for display: stored type, else the leading inferred category. */
export function effectiveJournalType(entry: InferJournalInput): JournalTypeValue {
  return journalTypeTags(entry)[0] ?? JournalType.GENERAL;
}

/**
 * Type-filter match. "General" means a manual journal saved as General
 * Journal (the form default), or a system journal no category applies to;
 * every other type matches any journal carrying that category.
 */
export function journalMatchesType(entry: InferJournalInput, type: string): boolean {
  if (type === JournalType.GENERAL) {
    if (storedType(entry) !== JournalType.GENERAL) return false;
    return entry.source !== 'system' || journalTypeTags(entry).length === 0;
  }
  return journalTypeTags(entry).includes(type as JournalTypeValue);
}
