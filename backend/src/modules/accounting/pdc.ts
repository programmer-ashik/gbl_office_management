import { badRequest } from '../../common/errors/app-error';
import { SystemAccountCode } from './system-account-codes';

/** Lifecycle of a post-dated cheque carried on a journal entry. */
export const PdcStatus = {
  NONE: 'None',
  PENDING: 'Pending',
  CLEARED: 'Cleared',
  BOUNCED: 'Bounced',
} as const;

export type PdcStatus = (typeof PdcStatus)[keyof typeof PdcStatus];

export const PDC_STATUS_VALUES = Object.values(PdcStatus);

/** receipt = money coming in (bank debit); payment = money going out (bank credit). */
export const PdcDirection = {
  RECEIPT: 'receipt',
  PAYMENT: 'payment',
} as const;

export type PdcDirection = (typeof PdcDirection)[keyof typeof PdcDirection];

export const PDC_DIRECTION_VALUES = Object.values(PdcDirection);

export const PDC_RECEIVABLE_CODE = SystemAccountCode.PDC_RECEIVABLE;
export const PDC_PAYABLE_CODE = SystemAccountCode.PDC_PAYABLE;

/** Company calendar used to decide whether a cheque date is in the future. */
export function pdcTimeZone(): string {
  return process.env.APP_TIMEZONE?.trim() || 'Asia/Dhaka';
}

function formatDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Today as YYYY-MM-DD in the company time zone. */
export function todayIsoDate(now: Date = new Date()): string {
  return formatDay(now, pdcTimeZone());
}

/**
 * Normalise a cheque date to a calendar day (YYYY-MM-DD).
 * Plain `YYYY-MM-DD` input is taken as-is; full timestamps are read in the
 * company time zone so late-evening entries do not slip a day.
 */
export function chequeDay(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      throw badRequest('Invalid cheque date');
    }
    return formatDay(parsed, pdcTimeZone());
  }
  if (Number.isNaN(value.getTime())) {
    throw badRequest('Invalid cheque date');
  }
  return formatDay(value, pdcTimeZone());
}

/** Stored as UTC midnight of the calendar day, like journal dates. */
export function chequeDayToDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

export function isPostDated(
  chequeDate: string | Date | null | undefined,
  today: string = todayIsoDate(),
): boolean {
  const day = chequeDay(chequeDate);
  return day !== null && day > today;
}

export type PdcPlanLine = {
  accountCode: string;
  debitMinor: number;
  creditMinor: number;
  entityType?: string;
  entityId?: string;
};

export type PdcSwapPlan = {
  direction: PdcDirection;
  bankCode: string;
  clearingCode: string;
  /** Indexes of the bank lines that move to the PDC clearing account. */
  lineIndexes: number[];
  amountMinor: number;
  /** Customer/supplier on the opposite side, when there is exactly one. */
  counterparty?: { entityType: string; entityId: string };
};

/**
 * Decide how a post-dated cheque rewrites a journal.
 * Exactly one bank account may appear, all on one side:
 * - bank debit (receipt) → debit PDC Receivable instead
 * - bank credit (payment) → credit PDC Payable instead
 */
export function planPdcSwap(
  lines: PdcPlanLine[],
  bankCodes: ReadonlySet<string>,
): PdcSwapPlan {
  const bankIndexes = lines
    .map((line, index) => (bankCodes.has(line.accountCode) ? index : -1))
    .filter((index) => index >= 0);

  if (bankIndexes.length === 0) {
    throw badRequest(
      'A post-dated cheque needs a bank account line (Cash in Bank) to hold until clearing',
    );
  }

  const codes = new Set(bankIndexes.map((index) => lines[index]!.accountCode));
  if (codes.size > 1) {
    throw badRequest(
      'A post-dated cheque can touch only one bank account — split transfers between banks into separate entries',
    );
  }

  const debitSide = bankIndexes.every((index) => lines[index]!.debitMinor > 0);
  const creditSide = bankIndexes.every((index) => lines[index]!.creditMinor > 0);
  if (!debitSide && !creditSide) {
    throw badRequest(
      'A post-dated cheque must either receive into or pay from the bank, not both',
    );
  }

  const direction = debitSide ? PdcDirection.RECEIPT : PdcDirection.PAYMENT;
  const amountMinor = bankIndexes.reduce(
    (sum, index) =>
      sum + (debitSide ? lines[index]!.debitMinor : lines[index]!.creditMinor),
    0,
  );

  const parties = new Map<string, { entityType: string; entityId: string }>();
  lines.forEach((line, index) => {
    if (bankIndexes.includes(index)) return;
    const opposite = debitSide ? line.creditMinor > 0 : line.debitMinor > 0;
    if (!opposite || !line.entityId || !line.entityType) return;
    if (line.entityType !== 'customer' && line.entityType !== 'supplier') return;
    parties.set(`${line.entityType}:${line.entityId}`, {
      entityType: line.entityType,
      entityId: line.entityId,
    });
  });

  return {
    direction,
    bankCode: [...codes][0]!,
    clearingCode:
      direction === PdcDirection.RECEIPT ? PDC_RECEIVABLE_CODE : PDC_PAYABLE_CODE,
    lineIndexes: bankIndexes,
    amountMinor,
    counterparty: parties.size === 1 ? [...parties.values()][0] : undefined,
  };
}
