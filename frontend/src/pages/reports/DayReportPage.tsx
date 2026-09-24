import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from '../../api/client'
import { ReportExportMenu } from '../../components/ReportExportMenu'
import { JOURNAL_TYPE_LABEL, money, type JournalEntry } from '../../types/accounting'

function todayIso(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

type DayLine = {
  id: string
  date: string
  entryNumber: string
  journalType: string
  memo: string
  account: string
  debit: number
  credit: number
}

export function DayReportPage() {
  const [date, setDate] = useState(todayIso)
  const [journals, setJournals] = useState<JournalEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api
      .journals({ fromDate: date, toDate: date, status: 'posted' })
      .then((rows) => setJournals(Array.isArray(rows) ? rows : []))
      .catch((err: unknown) => {
        setJournals([])
        setError(err instanceof Error ? err.message : 'Unable to load day report')
      })
      .finally(() => setLoading(false))
  }, [date])

  const lines = useMemo<DayLine[]>(() => {
    return journals.flatMap((entry) =>
      entry.lines.map((line, index) => ({
        id: `${entry.id}-${index}`,
        date: entry.date.slice(0, 10),
        entryNumber: entry.entryNumber,
        journalType:
          JOURNAL_TYPE_LABEL[entry.journalType as keyof typeof JOURNAL_TYPE_LABEL] ??
          entry.journalType,
        memo: line.description || entry.memo,
        account: `${line.accountCode} · ${line.accountName}`,
        debit: line.debit,
        credit: line.credit,
      })),
    )
  }, [journals])

  const debit = lines.reduce((sum, row) => sum + row.debit, 0)
  const credit = lines.reduce((sum, row) => sum + row.credit, 0)

  function exportPayload() {
    return {
      title: `Day Report · ${date}`,
      filters: [{ label: 'Date', value: date }],
      headers: ['Date', 'Journal', 'Type', 'Account', 'Memo', 'Debit', 'Credit'],
      rows: lines.map((row) => [
        row.date,
        row.entryNumber,
        row.journalType,
        row.account,
        row.memo,
        row.debit ? money(row.debit) : '',
        row.credit ? money(row.credit) : '',
      ]),
      totals: [['', '', '', '', 'Totals', money(debit), money(credit)]],
    }
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Day report</h1>
          <p className="muted">
            Posted journal lines for the selected day. Opens on today.
          </p>
        </div>
        <ReportExportMenu payload={exportPayload} disabled={loading} />
      </header>
      <section className="table-card">
        <form
          className="filter-bar"
          onSubmit={(event: FormEvent) => event.preventDefault()}
        >
          <label>
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || todayIso())}
            />
          </label>
          <button type="button" className="ghost" onClick={() => setDate(todayIso())}>
            Today
          </button>
        </form>
        {error ? <p className="form-error">{error}</p> : null}
        {loading ? <p className="muted">Loading…</p> : null}
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Journal</th>
              <th>Type</th>
              <th>Account</th>
              <th>Memo</th>
              <th className="num">Debit</th>
              <th className="num">Credit</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((row) => (
              <tr key={row.id}>
                <td>{row.date}</td>
                <td>{row.entryNumber}</td>
                <td>{row.journalType}</td>
                <td>{row.account}</td>
                <td>{row.memo}</td>
                <td className="num">{row.debit ? money(row.debit) : '—'}</td>
                <td className="num">{row.credit ? money(row.credit) : '—'}</td>
              </tr>
            ))}
            {!loading && lines.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  No posted transactions on {date}.
                </td>
              </tr>
            ) : null}
            <tr>
              <td colSpan={5}>Totals</td>
              <td className="num">{money(debit)}</td>
              <td className="num">{money(credit)}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </>
  )
}
