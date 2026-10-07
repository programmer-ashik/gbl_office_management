import type { JournalEntry, JournalLine } from "../types/accounting";

/**
 * Project a line is posted to in the ledger: its own tag, else the journal tag.
 * Matches how ledger lines are stored, so project filters agree with the ledger.
 */
export function postedLineProjectId(
  entry: JournalEntry,
  line: JournalLine,
): string | null {
  return line.projectId ?? entry.projectId ?? null;
}

/** Lines of the journal that belong to the project (all lines when no project). */
export function projectLines(
  entry: JournalEntry,
  projectId: string,
): JournalLine[] {
  const lines = entry.lines ?? [];
  if (!projectId) return lines;
  return lines.filter((line) => postedLineProjectId(entry, line) === projectId);
}

/** Journals with at least one line in the project (all journals when no project). */
export function journalsForProject(
  entries: JournalEntry[],
  projectId: string,
): JournalEntry[] {
  if (!projectId) return entries;
  return entries.filter((entry) =>
    entry.lines?.length
      ? projectLines(entry, projectId).length > 0
      : entry.projectId === projectId,
  );
}

/** Debit / credit of the project's lines across the journals. */
export function projectTotals(
  entries: JournalEntry[],
  projectId: string,
): { debit: number; credit: number } {
  let debit = 0;
  let credit = 0;
  for (const entry of entries) {
    if (!entry.lines?.length) {
      if (!projectId || entry.projectId === projectId) {
        debit += entry.totalDebit;
        credit += entry.totalCredit;
      }
      continue;
    }
    for (const line of projectLines(entry, projectId)) {
      debit += line.debit;
      credit += line.credit;
    }
  }
  return {
    debit: Number(debit.toFixed(2)),
    credit: Number(credit.toFixed(2)),
  };
}
