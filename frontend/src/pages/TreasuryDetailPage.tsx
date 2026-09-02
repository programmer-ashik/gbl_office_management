import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { money } from '../types/accounting'
import {
  TREASURY_KIND_LABEL,
  type Reconciliation,
  type TreasuryAccount,
} from '../types/banking'

const SAMPLE_CSV = `date,description,amount,reference
2026-09-02,Cash deposit,15000,TRF-1
2026-09-03,ATM withdrawal,-2000,WD-1`

export function TreasuryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [account, setAccount] = useState<TreasuryAccount | null>(null)
  const [entries, setEntries] = useState<
    Array<{
      id: string
      date: string
      entryNumber: string
      memo: string
      debit: number
      credit: number
    }>
  >([])
  const [session, setSession] = useState<Reconciliation | null>(null)
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10))
  const [statementBalance, setStatementBalance] = useState('')
  const [csv, setCsv] = useState(SAMPLE_CSV)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    if (!id) {
      return
    }
    const ledger = await api.treasuryLedger(id)
    setAccount(ledger.account)
    setEntries(ledger.entries)
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load account')
    })
  }, [id])

  async function onImport(event: FormEvent) {
    event.preventDefault()
    if (!id) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      const imported = await api.importReconciliation(id, {
        asOf,
        statementBalance: Number(statementBalance),
        csv,
      })
      setSession(imported)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to import statement')
    } finally {
      setSaving(false)
    }
  }

  async function onMatch(statementLineId: string, ledgerLineId: string) {
    if (!session) {
      return
    }
    setError(null)
    try {
      const updated = await api.matchReconciliation(session.id, {
        statementLineId,
        ledgerLineId,
      })
      setSession(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to match line')
    }
  }

  async function onComplete() {
    if (!session) {
      return
    }
    setError(null)
    try {
      const updated = await api.completeReconciliation(session.id)
      setSession(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete')
    }
  }

  if (!account) {
    return error ? <p className="form-error">{error}</p> : <p className="muted">Loading…</p>
  }

  const unmatchedStatement = (session?.lines ?? []).filter(
    (line) => line.status === 'unmatched',
  )

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{account.glAccountCode}</p>
          <h1>{account.name}</h1>
          <p className="muted">
            {TREASURY_KIND_LABEL[account.kind]}
            {account.institution ? ` · ${account.institution}` : ''}
          </p>
        </div>
        <Link to="/banking" className="ghost-link">
          All channels
        </Link>
      </header>

      <section className="grid">
        <article className="stat-card">
          <h3>Book balance</h3>
          <p className="stat-value">{money(account.bookBalance)}</p>
          <p className="muted">From posted ledger lines</p>
        </article>
        <article className="stat-card">
          <h3>Statement</h3>
          <p className="stat-value">
            {session ? money(session.statementBalance) : '—'}
          </p>
          <p className="muted">{session ? session.reconciliationNumber : 'No import yet'}</p>
        </article>
        <article className="stat-card">
          <h3>Difference</h3>
          <p className={`stat-value ${session && session.difference !== 0 ? 'loss' : ''}`}>
            {session ? money(session.difference) : '—'}
          </p>
          <p className="muted">
            {session?.isReconciled ? 'Reconciled' : 'Match remaining items'}
          </p>
        </article>
      </section>

      <section className="table-card">
        <h2>Book ledger</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Journal</th>
              <th>Memo</th>
              <th>Debit</th>
              <th>Credit</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.date.slice(0, 10)}</td>
                <td>{entry.entryNumber}</td>
                <td>{entry.memo}</td>
                <td>{entry.debit ? money(entry.debit) : ''}</td>
                <td>{entry.credit ? money(entry.credit) : ''}</td>
              </tr>
            ))}
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No movement on this channel yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="table-card">
        <h2>Import bank statement (CSV)</h2>
        <p className="muted">
          Header row must include date, description (or narration), and amount.
          Positive amounts are inflows (debits); negative amounts are outflows
          (credits).
        </p>
        <form className="stack-form" onSubmit={(event) => void onImport(event)}>
          <div className="name-row">
            <label>
              Statement as of
              <input
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                required
              />
            </label>
            <label>
              Closing balance
              <input
                inputMode="decimal"
                value={statementBalance}
                onChange={(e) => setStatementBalance(e.target.value)}
                required
              />
            </label>
          </div>
          <label>
            CSV
            <textarea
              rows={6}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              required
            />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Matching…' : 'Import and auto-match'}
            </button>
          </div>
        </form>
      </section>

      {session ? (
        <section className="table-card">
          <div className="table-head">
            <h2>{session.reconciliationNumber}</h2>
            <span className={session.isReconciled ? 'badge-ok' : 'badge-bad'}>
              {session.isReconciled ? 'In balance' : 'Out of balance'}
            </span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {session.lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.date.slice(0, 10)}</td>
                  <td>{line.description}</td>
                  <td>{money(line.amount)}</td>
                  <td>{line.status}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {unmatchedStatement.length > 0 && session.unmatchedBook.length > 0 ? (
            <div className="match-grid">
              <div>
                <h3>Unmatched statement</h3>
                <ul className="match-list">
                  {unmatchedStatement.map((line) => (
                    <li key={line.id}>
                      {line.date.slice(0, 10)} · {money(line.amount)} · {line.description}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Unmatched book</h3>
                <ul className="match-list">
                  {session.unmatchedBook.map((entry) => (
                    <li key={entry.id}>
                      {entry.entryNumber} · {money(entry.debit || entry.credit)} · {entry.memo}
                      {unmatchedStatement[0] ? (
                        <>
                          {' '}
                          <button
                            type="button"
                            className="ghost"
                            onClick={() =>
                              void onMatch(unmatchedStatement[0].id, entry.id)
                            }
                          >
                            Match first unmatched
                          </button>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          <div className="form-actions">
            <button
              type="button"
              disabled={!session.isReconciled || session.status === 'completed'}
              onClick={() => void onComplete()}
            >
              {session.status === 'completed' ? 'Completed' : 'Complete reconciliation'}
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </section>
      ) : error ? (
        <p className="form-error">{error}</p>
      ) : null}
    </>
  )
}
