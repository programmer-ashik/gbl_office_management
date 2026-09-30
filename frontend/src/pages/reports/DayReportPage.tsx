import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../../api/client";
import { ReportExportMenu } from "../../components/ReportExportMenu";
import { money, type JournalEntry } from "../../types/accounting";
import { lineDescription } from "../../utils/journalNarrative";

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

type DayLine = {
  id: string;
  /** Serial number of the journal; every line of one journal shares it. */
  serial: number;
  /** First line of its journal (SL, date and journal number print here). */
  first: boolean;
  date: string;
  entryNumber: string;
  description: string;
  account: string;
  debit: number;
  credit: number;
};

export function DayReportPage() {
  const [date, setDate] = useState(todayIso);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .journals({ fromDate: date, toDate: date, status: "posted" })
      .then((rows) => setJournals(Array.isArray(rows) ? rows : []))
      .catch((err: unknown) => {
        setJournals([]);
        setError(
          err instanceof Error ? err.message : "Unable to load day report",
        );
      })
      .finally(() => setLoading(false));
  }, [date]);

  const lines = useMemo<DayLine[]>(() => {
    const ordered = [...journals].sort((a, b) =>
      a.entryNumber.localeCompare(b.entryNumber, undefined, { numeric: true }),
    );
    return ordered.flatMap((entry, journalIndex) =>
      [...entry.lines]
        .sort((a, b) => Number(b.debit > 0) - Number(a.debit > 0))
        .map((line, index) => ({
          id: `${entry.id}-${index}`,
          serial: journalIndex + 1,
          first: index === 0,
          date: entry.date.slice(0, 10),
          entryNumber: entry.entryNumber,
          description: lineDescription(entry, line),
          account: line.accountName,
          debit: line.debit,
          credit: line.credit,
        })),
    );
  }, [journals]);
  const journalCount = lines.length ? lines[lines.length - 1]!.serial : 0;

  const debit = lines.reduce((sum, row) => sum + row.debit, 0);
  const credit = lines.reduce((sum, row) => sum + row.credit, 0);

  function exportPayload() {
    return {
      title: `Day Report · ${date}`,
      filters: [
        { label: "Date", value: date },
        { label: "Journals", value: String(journalCount) },
      ],
      headers: [
        "SL",
        "Date",
        "Journal",
        "Account",
        "Description",
        "Debit",
        "Credit",
      ],
      rows: lines.map((row) => [
        row.first ? String(row.serial) : "",
        row.first ? row.date : "",
        row.first ? row.entryNumber : "",
        row.account,
        row.description,
        row.debit ? money(row.debit) : "",
        row.credit ? money(row.credit) : "",
      ]),
      rightAlign: [5, 6],
      groupStarts: lines.flatMap((row, index) => (row.first ? [index] : [])),
      totals: [["", "", "", "", "Totals", money(debit), money(credit)]],
    };
  }

  return (
    <>
      <header className='workspace-header'>
        <div>
          <h1>Day report</h1>
          <p className='muted'>
            Posted journal lines for the selected day. Opens on today.
          </p>
        </div>
        <ReportExportMenu payload={exportPayload} disabled={loading} />
      </header>
      <section className='table-card'>
        <form
          className='filter-bar'
          onSubmit={(event: FormEvent) => event.preventDefault()}
        >
          <label>
            Date
            <input
              type='date'
              value={date}
              onChange={(e) => setDate(e.target.value || todayIso())}
            />
          </label>
          <button
            type='button'
            className='ghost'
            onClick={() => setDate(todayIso())}
          >
            Today
          </button>
        </form>
        {error ? <p className='form-error'>{error}</p> : null}
        {loading ? <p className='muted'>Loading…</p> : null}
        <table>
          <thead>
            <tr>
              <th>SL</th>
              <th>Date</th>
              <th>Journal</th>
              <th>Account</th>
              <th>Description</th>
              <th className='num'>Debit</th>
              <th className='num'>Credit</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((row) => (
              <tr
                key={row.id}
                className={[
                  row.first ? "day-report-group-start" : "",
                  row.serial % 2 === 0 ? "day-report-group-alt" : "",
                ]
                  .filter(Boolean)
                  .join(" ") || undefined}
              >
                <td>{row.first ? row.serial : ""}</td>
                <td>{row.first ? row.date : ""}</td>
                <td>{row.first ? row.entryNumber : ""}</td>
                <td>{row.account}</td>
                <td className='ledger-reference-cell'>{row.description}</td>
                <td className='num'>{row.debit ? money(row.debit) : "—"}</td>
                <td className='num'>{row.credit ? money(row.credit) : "—"}</td>
              </tr>
            ))}
            {!loading && lines.length === 0 ? (
              <tr>
                <td colSpan={7} className='muted'>
                  No posted transactions on {date}.
                </td>
              </tr>
            ) : null}
            <tr className='day-report-group-start'>
              <td colSpan={5}>Totals · {journalCount} journals</td>
              <td className='num'>{money(debit)}</td>
              <td className='num'>{money(credit)}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </>
  );
}
