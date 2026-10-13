import type { JournalEntry, JournalLine } from '../types/accounting'

/** Auto memo numbers look like "gbl-260929-HandCash-Site". */
export function isAutoMemo(text: string | null | undefined): boolean {
  return /^gbl-\d{6}/i.test(text?.trim() ?? '')
}

function typedText(text: string | null | undefined, memo: string): string {
  const value = text?.trim() ?? ''
  if (!value || value === memo.trim() || isAutoMemo(value)) return ''
  return value
}

function uniqueJoin(values: string[]): string {
  return [...new Set(values.filter(Boolean))].join('; ')
}

const ADVANCE_TO_STAFF_CODE = '1161'

/** "Advance to Staff · Rahim Uddin" — names the employee holding the advance. */
export function ledgerHead(
  line: Pick<JournalLine, 'accountCode' | 'accountName' | 'entityName'>,
): string {
  const head = line.accountName || line.accountCode
  const holder = line.entityName?.trim()
  return line.accountCode === ADVANCE_TO_STAFF_CODE && holder
    ? `${head} · ${holder}`
    : head
}

/**
 * What the user typed for this line: its own description, else the text typed
 * on the other side of the journal, else a non-auto memo. Mirrors the backend
 * ledger narrative so ledger and register rows read the same.
 */
export function lineDescription(entry: JournalEntry, line: JournalLine): string {
  const memo = entry.memo ?? ''
  const isDebit = line.debit > 0
  const lines = entry.lines ?? []
  const opposite = lines.filter((row) => row.debit > 0 !== isDebit)
  const others = lines.filter((row) => row !== line)
  return (
    typedText(line.description, memo) ||
    uniqueJoin(opposite.map((row) => typedText(row.description, memo))) ||
    uniqueJoin(others.map((row) => typedText(row.description, memo))) ||
    typedText(memo, '') ||
    memo
  )
}

/** Ledger heads on the opposite side of the journal (reference ledger head). */
export function lineCounterpart(entry: JournalEntry, line: JournalLine): string {
  const isDebit = line.debit > 0
  const lines = entry.lines ?? []
  const opposite = lines.filter((row) => row.debit > 0 !== isDebit)
  const pool = opposite.length ? opposite : lines.filter((row) => row !== line)
  return uniqueJoin(
    pool.filter((row) => row.accountCode !== line.accountCode).map(ledgerHead),
  )
}

/** Every description typed on the journal, else a non-auto memo. */
export function journalDescription(entry: JournalEntry): string {
  const memo = entry.memo ?? ''
  return (
    uniqueJoin((entry.lines ?? []).map((row) => typedText(row.description, memo))) ||
    typedText(memo, '') ||
    memo
  )
}

/** "Dr Site Transport / Cr Hand Cash" */
export function journalHeads(entry: JournalEntry): string {
  const lines = entry.lines ?? []
  const debit = uniqueJoin(lines.filter((row) => row.debit > 0).map(ledgerHead))
  const credit = uniqueJoin(lines.filter((row) => row.credit > 0).map(ledgerHead))
  return [debit && `Dr ${debit}`, credit && `Cr ${credit}`]
    .filter(Boolean)
    .join(' / ')
}
