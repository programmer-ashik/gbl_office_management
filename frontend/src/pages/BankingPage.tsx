import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { Modal, Select } from '../components/ui'
import { money } from '../types/accounting'
import {
  TREASURY_KIND_LABEL,
  TreasuryKind,
  type TreasuryAccount,
} from '../types/banking'

export function BankingPage() {
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<TreasuryKind>(TreasuryKind.COMMERCIAL_BANK)
  const [institution, setInstitution] = useState('')
  const [accountNumber, setAccountNumber] = useState('')

  async function load() {
    const treasury = await api.treasury()
    setAccounts(treasury)
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load banking')
    })
  }, [])

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api.createTreasury({
        name,
        kind,
        institution: institution || undefined,
        accountNumber: accountNumber || undefined,
      })
      setName('')
      setInstitution('')
      setAccountNumber('')
      setModalOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create account')
    } finally {
      setSaving(false)
    }
  }

  const cashTotal = accounts
    .filter((account) => account.kind === 'cash' || account.kind === 'petty_cash')
    .reduce((sum, account) => sum + account.bookBalance, 0)
  const bankTotal = accounts
    .filter(
      (account) =>
        account.kind === 'commercial_bank' || account.kind === 'mobile_banking',
    )
    .reduce((sum, account) => sum + account.bookBalance, 0)

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Accounts & wallets</h1>
        </div>
        <div className="table-actions">
          <Link to="/banking/transfers" className="action-link">
            Transfers
          </Link>
          <Link to="/banking/reconciliation" className="action-link">
            Reconciliation
          </Link>
          <button type="button" onClick={() => setModalOpen(true)}>
            Add channel
          </button>
        </div>
      </header>

      <section className="grid">
        <article className="stat-card">
          <h3>Cash & petty cash</h3>
          <p className="stat-value">{money(cashTotal)}</p>
          <p className="muted">Hand cash and petty floats</p>
        </article>
        <article className="stat-card">
          <h3>Banks & wallets</h3>
          <p className="stat-value">{money(bankTotal)}</p>
          <p className="muted">Commercial banks, bKash, Nagad</p>
        </article>
        <article className="stat-card">
          <h3>Channels</h3>
          <p className="stat-value">{accounts.length}</p>
          <p className="muted">Each channel posts through the Chart of Accounts</p>
        </article>
      </section>

      <Modal open={modalOpen} title="Add channel" onClose={() => setModalOpen(false)}>
        <form className="stack-form" onSubmit={(event) => void onCreate(event)}>
          <div className="name-row">
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Type
              <Select
                value={kind}
                onChange={(value) => setKind(value as TreasuryKind)}
                options={Object.values(TreasuryKind).map((value) => ({
                  value,
                  label: TREASURY_KIND_LABEL[value],
                }))}
                searchable
              />
            </label>
          </div>
          <div className="name-row">
            <label>
              Institution
              <input
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="DBBL, bKash…"
              />
            </label>
            <label>
              Account number
              <input
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Add account'}
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </Modal>

      <section className="table-card">
        <div className="table-head">
          <h2>Treasury channels</h2>
          <p className="muted">Book balance is the live ledger, not a stored figure.</p>
        </div>
        {error && !modalOpen ? <p className="form-error">{error}</p> : null}
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>GL</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id}>
                <td>
                  <Link to={`/banking/${account.id}`}>{account.name}</Link>
                  {account.institution ? (
                    <span className="muted"> · {account.institution}</span>
                  ) : null}
                </td>
                <td>{TREASURY_KIND_LABEL[account.kind]}</td>
                <td>{account.glAccountCode}</td>
                <td>{money(account.bookBalance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}
