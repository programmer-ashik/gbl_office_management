import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from '../../api/client'
import { money } from '../../types/accounting'
import { TreasuryKind, type TreasuryAccount } from '../../types/banking'
import { ReportExportMenu } from '../../components/ReportExportMenu'

type Props = {
  mode: 'cash' | 'bank'
}

export function TreasuryTransactionReportPage({ mode }: Props) {
  const [channels, setChannels] = useState<TreasuryAccount[]>([])
  const [accountId, setAccountId] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lines, setLines] = useState<
    Array<{
      id: string
      date: string
      entryNumber: string
      memo: string
      debit: number
      credit: number
      runningBalance?: number
    }>
  >([])

  const options = useMemo(
    () =>
      channels.filter((row) =>
        mode === 'cash'
          ? row.kind === TreasuryKind.CASH || row.kind === TreasuryKind.PETTY_CASH
          : row.kind === TreasuryKind.COMMERCIAL_BANK,
      ),
    [channels, mode],
  )

  useEffect(() => {
    api
      .treasury()
      .then((rows) => {
        setChannels(rows)
        const first = rows.find((row) =>
          mode === 'cash'
            ? row.kind === TreasuryKind.CASH || row.kind === TreasuryKind.PETTY_CASH
            : row.kind === TreasuryKind.COMMERCIAL_BANK,
        )
        if (first) setAccountId(first.id)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load treasury')
      })
      .finally(() => setLoading(false))
  }, [mode])

  useEffect(() => {
    const channel = options.find((row) => row.id === accountId)
    if (!channel) {
      setLines([])
      return
    }
    setLoading(true)
    api
      .ledger(channel.glAccountCode, {
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      })
      .then((ledger) => setLines(ledger.entries))
      .catch((err: unknown) => {
        setLines([])
        setError(err instanceof Error ? err.message : 'Unable to load ledger')
      })
      .finally(() => setLoading(false))
  }, [accountId, options, fromDate, toDate])

  const title =
    mode === 'cash' ? 'Cash Transaction Report' : 'Bank Transaction Report'
  const selected = options.find((row) => row.id === accountId)
  const debit = lines.reduce((sum, row) => sum + row.debit, 0)
  const credit = lines.reduce((sum, row) => sum + row.credit, 0)

  function exportPayload() {
    return {
      title,
      filters: [
        { label: 'Account', value: selected?.name ?? '—' },
        { label: 'From', value: fromDate || '—' },
        { label: 'To', value: toDate || '—' },
      ],
      headers: ['Date', 'Journal', 'Memo', 'Debit', 'Credit', 'Balance'],
      rows: lines.map((row) => [
        row.date.slice(0, 10),
        row.entryNumber,
        row.memo,
        row.debit ? money(row.debit) : '',
        row.credit ? money(row.credit) : '',
        money(row.runningBalance ?? 0),
      ]),
      totals: [['', '', 'Totals', money(debit), money(credit), '']],
    }
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>{title}</h1>
          <p className="muted">
            Uses the existing general ledger for the selected treasury account.
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
            {mode === 'cash' ? 'Cash account' : 'Bank'}
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {options.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} · {row.glAccountCode}
                </option>
              ))}
            </select>
          </label>
          <label>
            From
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </label>
        </form>
        {error ? <p className="form-error">{error}</p> : null}
        {loading ? <p className="muted">Loading…</p> : null}
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Journal</th>
              <th>Memo</th>
              <th className="num">Debit</th>
              <th className="num">Credit</th>
              <th className="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((row) => (
              <tr key={row.id}>
                <td>{row.date.slice(0, 10)}</td>
                <td>{row.entryNumber}</td>
                <td>{row.memo}</td>
                <td className="num">{row.debit ? money(row.debit) : '—'}</td>
                <td className="num">{row.credit ? money(row.credit) : '—'}</td>
                <td className="num">{money(row.runningBalance ?? 0)}</td>
              </tr>
            ))}
            {!loading && lines.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No transactions in this range.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </>
  )
}
