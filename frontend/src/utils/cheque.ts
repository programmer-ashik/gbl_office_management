import type { ChequeRegisterRow, PdcDirection } from '../types/accounting'

export const PDC_RECEIVABLE_CODE = '1152'
export const PDC_PAYABLE_CODE = '2112'

/** Register state shown to the user (derived from PDC status + cheque date). */
export type ChequeState =
  | 'pending'
  | 'due'
  | 'overdue'
  | 'cleared'
  | 'bounced'
  | 'current'
  | 'reversed'

export const CHEQUE_STATE_LABEL: Record<ChequeState, string> = {
  pending: 'Pending',
  due: 'Due today',
  overdue: 'Overdue',
  cleared: 'Cleared',
  bounced: 'Bounced',
  current: 'Posted to bank',
  reversed: 'Reversed',
}

export const DIRECTION_LABEL: Record<PdcDirection, string> = {
  receipt: 'Received',
  payment: 'Issued',
}

/** Today in the browser's calendar (YYYY-MM-DD). */
export function localToday(): string {
  return new Date().toLocaleDateString('en-CA')
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

export function chequeState(row: ChequeRegisterRow, today = localToday()): ChequeState {
  if (row.pdcStatus === 'Bounced') return 'bounced'
  if (row.isPdc) {
    if (row.pdcStatus === 'Cleared') return 'cleared'
    const day = row.chequeDate ?? today
    if (day < today) return 'overdue'
    if (day === today) return 'due'
    return 'pending'
  }
  return row.status === 'reversed' ? 'reversed' : 'current'
}

/** Short hint under the status pill, e.g. "in 12 days" / "3 days late". */
export function chequeStateHint(row: ChequeRegisterRow, today = localToday()): string | null {
  const state = chequeState(row, today)
  if (!row.chequeDate) return null
  if (state === 'pending') {
    const days = daysBetween(today, row.chequeDate)
    return `in ${days} day${days === 1 ? '' : 's'}`
  }
  if (state === 'overdue') {
    const days = daysBetween(row.chequeDate, today)
    return `${days} day${days === 1 ? '' : 's'} late`
  }
  if (state === 'cleared' && row.clearingEntryNumber) return `via ${row.clearingEntryNumber}`
  if (state === 'bounced' && row.pdcBounceReason) return row.pdcBounceReason
  return null
}

export function isOpenPdc(state: ChequeState): boolean {
  return state === 'pending' || state === 'due' || state === 'overdue'
}
