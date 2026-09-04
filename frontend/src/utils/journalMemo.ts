/**
 * Auto memo format: gbl-{YYYY-MM-DD}-{Account Head}-{Account Head}-…
 */
export function buildJournalMemo(
  date: string,
  accountHeads: Array<string | null | undefined>,
): string {
  const day = date.slice(0, 10) || new Date().toISOString().slice(0, 10)
  const heads = accountHeads
    .map((name) => (name ?? '').trim())
    .filter(Boolean)
    .map((name) => name.replace(/\s+/g, ' '))
  const body = heads.length > 0 ? heads.join('-') : 'General'
  return `gbl-${day}-${body}-`
}
