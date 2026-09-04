import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { Select } from '../components/ui'
import { money, type Account, type AccountLedger } from '../types/accounting'

export function AccountLedgerPage() {
  const { accountCode: routeCode } = useParams()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountCode, setAccountCode] = useState(routeCode ?? '')
  const [ledger, setLedger] = useState<AccountLedger | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api
      .accounts()
      .then((rows) => {
        const postable = rows.filter((row) => row.isPostable && row.isActive)
        setAccounts(postable)
        if (!accountCode && postable[0]) {
          setAccountCode(postable[0].code)
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load accounts')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (routeCode) setAccountCode(routeCode)
  }, [routeCode])

  useEffect(() => {
    if (!accountCode) return
    setLoading(true)
    setError(null)
    api
      .ledger(accountCode)
      .then(setLedger)
      .catch((err: unknown) => {
        setLedger(null)
        setError(err instanceof Error ? err.message : 'Unable to load ledger')
      })
      .finally(() => setLoading(false))
  }, [accountCode])

  const running = useMemo(() => {
    if (!ledger) return []
    let balance = 0
    return ledger.entries.map((row) => {
      balance += row.debit - row.credit
      return { ...row, runningBalance: balance }
    })
  }, [ledger])

  const accountOptions = accounts.map((account) => ({
    value: account.code,
    label: `${account.code} · ${account.name}`,
  }))

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>General ledger</h1>
        </div>
        <Link to="/journals" className="ghost-link">
          Journals
        </Link>
      </header>

      <section className="table-card">
        <div className="table-head">
          <h2>Account inquiry</h2>
          <p className="muted">Posted journal lines for one GL account</p>
        </div>
        <form className="filter-bar" onSubmit={(event) => event.preventDefault()}>
          <label>
            Account
            <Select
              value={accountCode}
              onChange={setAccountCode}
              options={accountOptions}
              searchable
              placeholder="Select account"
            />
          </label>
        </form>

        {error ? <p className="form-error">{error}</p> : null}
        {loading ? <p className="muted">Loading ledger…</p> : null}

        {ledger ? (
          <>
            <section className="grid">
              <article className="stat-card">
                <h3>{ledger.account.accountCode}</h3>
                <p className="stat-value" style={{ fontSize: 'var(--text-xl)' }}>
                  {ledger.account.accountName}
                </p>
              </article>
              <article className="stat-card">
                <h3>Balance</h3>
                <p className="stat-value">{money(ledger.account.balance)}</p>
              </article>
              <article className="stat-card">
                <h3>Lines</h3>
                <p className="stat-value">{ledger.entries.length}</p>
              </article>
            </section>

            <div className="journal-lines-scroll">
              <table className="journal-lines-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Journal</th>
                    <th>Memo</th>
                    <th>Entity</th>
                    <th className="num">Debit</th>
                    <th className="num">Credit</th>
                    <th className="num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {running.map((row) => (
                    <tr key={row.id}>
                      <td>{row.date.slice(0, 10)}</td>
                      <td>
                        <Link to={`/journals`}>{row.entryNumber}</Link>
                      </td>
                      <td>{row.memo}</td>
                      <td>{row.entityName ?? '—'}</td>
                      <td className="num amount-debit-cell">
                        {row.debit > 0 ? money(row.debit) : '—'}
                      </td>
                      <td className="num amount-credit-cell">
                        {row.credit > 0 ? money(row.credit) : '—'}
                      </td>
                      <td className="num">{money(row.runningBalance)}</td>
                    </tr>
                  ))}
                  {running.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="muted">
                        No posted lines for this account.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>
    </>
  )
}
