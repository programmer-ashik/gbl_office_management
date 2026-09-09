import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { Select } from '../components/ui'
import { money } from '../types/accounting'
import {
  TREASURY_KIND_LABEL,
  type TreasuryAccount,
} from '../types/banking'

export function BankingReconciliationPage() {
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .treasury()
      .then((rows) => {
        setAccounts(rows)
        const preferred =
          rows.find((row) => row.kind === 'commercial_bank') ?? rows[0]
        if (preferred) setSelectedId(preferred.id)
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : 'Unable to load treasury accounts',
        )
      })
  }, [])

  const banks = accounts.filter(
    (account) =>
      account.kind === 'commercial_bank' || account.kind === 'mobile_banking',
  )
  const others = accounts.filter(
    (account) =>
      account.kind !== 'commercial_bank' && account.kind !== 'mobile_banking',
  )
  const bankOptions = banks.map((row) => ({
    value: row.id,
    label: `${row.name} · ${row.glAccountCode}`,
  }))

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Bank reconciliation</h1>
          <p className="muted">
            Import statements for treasury bank / wallet leaves (not CoA header
            1110). Match to the system bank book, post charges to 5250, then
            finalize when difference is zero.
          </p>
        </div>
        <Link to="/banking" className="ghost-link">
          Accounts & wallets
        </Link>
      </header>

      <section className="table-card">
        <div className="table-head">
          <h2>Bank account picker</h2>
          <p className="muted">Cash & bank postable channels only</p>
        </div>
        <div className="name-row">
          <label>
            Bank / mobile channel
            <Select
              value={selectedId}
              options={bankOptions}
              onChange={setSelectedId}
              placeholder="Select treasury channel"
            />
          </label>
          <div className="form-actions">
            <Link
              className={!selectedId ? 'ghost-link is-disabled' : undefined}
              to={selectedId ? `/banking/${selectedId}` : '#'}
              onClick={(e) => {
                if (!selectedId) e.preventDefault()
              }}
            >
              Open reconciliation workspace
            </Link>
          </div>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
      </section>

      <section className="table-card">
        <div className="table-head">
          <h2>Commercial banks & mobile</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Institution</th>
              <th>GL</th>
              <th>Book balance</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {banks.map((account) => (
              <tr key={account.id}>
                <td>{account.name}</td>
                <td>{account.institution ?? '—'}</td>
                <td>{account.glAccountCode}</td>
                <td>{money(account.bookBalance)}</td>
                <td>
                  <Link to={`/banking/${account.id}`}>Reconcile</Link>
                </td>
              </tr>
            ))}
            {banks.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No bank or mobile channels yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {others.length > 0 ? (
        <section className="table-card">
          <div className="table-head">
            <h2>Other treasury channels</h2>
            <p className="muted">Cash / petty cash (optional to reconcile)</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>GL</th>
                <th>Book balance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {others.map((account) => (
                <tr key={account.id}>
                  <td>{account.name}</td>
                  <td>{TREASURY_KIND_LABEL[account.kind]}</td>
                  <td>{account.glAccountCode}</td>
                  <td>{money(account.bookBalance)}</td>
                  <td>
                    <Link to={`/banking/${account.id}`}>Reconcile</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  )
}
