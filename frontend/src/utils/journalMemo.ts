/**
 * Short auto memo: gbl-YYMMDD-HeadA-HeadB (heads truncated).
 */
export function buildJournalMemo(
  date: string,
  accountHeads: Array<string | null | undefined>,
): string {
  const raw = date.slice(0, 10) || new Date().toISOString().slice(0, 10)
  const compactDay = raw.replace(/-/g, '').slice(2) // YYMMDD
  const heads = accountHeads
    .map((name) => (name ?? '').trim())
    .filter(Boolean)
    .map((name) =>
      name
        .replace(/\s+/g, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 8),
    )
    .filter(Boolean)
  // Keep memo short: at most 2 heads
  const body = heads.length > 0 ? heads.slice(0, 2).join('-') : 'JV'
  return `gbl-${compactDay}-${body}`
}
