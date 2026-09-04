import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { money } from '../types/accounting'
import {
  TREASURY_KIND_LABEL,
  type TreasuryAccount,
} from '../types/banking'

export function BankingReconciliationPage() {
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .treasury()
      .then(setAccounts)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load treasury accounts')
      })
  }, [])

  const banks = accounts.filter((account) => account.kind === 'commercial_bank')
  const others = accounts.filter((account) => account.kind !== 'commercial_bank')

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Bank reconciliation</h1>
        </div>
        <Link to="/banking" className="ghost-link">
          Accounts & wallets
        </Link>
      </header>

      <section className="table-card">
        <div className="table-head">
          <h2>Statement matching</h2>
          <p className="muted">
            Compare each channel’s book balance to the bank or wallet statement. Open
            Reconcile to import statement lines, match them to ledger movements, and
            clear differences. Commercial bank accounts are listed first.
          </p>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
      </section>

      <section className="table-card">
        <div className="table-head">
          <h2>Commercial banks</h2>
          <p className="muted">Primary channels for statement reconciliation</p>
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
                  No commercial bank accounts yet.
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
            <p className="muted">Cash, petty cash, and mobile wallets</p>
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
