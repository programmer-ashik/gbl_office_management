import type { JournalEntry, JournalLine } from "../types/accounting";

/** One cost / return line of the project ledger with the running net cost. */
export type ProjectLedgerRow = {
  entry: JournalEntry;
  line: JournalLine;
  index: number;
  balance: number;
};

const toMinor = (value: number) => Math.round((value || 0) * 100);

/**
 * Project ledger rows in the given order. Lines come from the server already
 * trimmed to the project's expense heads: costs in Dr, returns in Cr.
 */
export function projectLedgerRows(entries: JournalEntry[]): ProjectLedgerRow[] {
  const rows: ProjectLedgerRow[] = [];
  let balance = 0;
  for (const entry of entries) {
    (entry.lines ?? []).forEach((line, index) => {
      balance += toMinor(line.debit) - toMinor(line.credit);
      rows.push({ entry, line, index, balance: balance / 100 });
    });
  }
  return rows;
}

/** Total cost (Dr), total returns (Cr) and net project cost. */
export function projectLedgerTotals(rows: ProjectLedgerRow[]): {
  cost: number;
  returns: number;
  net: number;
} {
  let cost = 0;
  let returns = 0;
  for (const { line } of rows) {
    cost += toMinor(line.debit);
    returns += toMinor(line.credit);
  }
  return { cost: cost / 100, returns: returns / 100, net: (cost - returns) / 100 };
}
