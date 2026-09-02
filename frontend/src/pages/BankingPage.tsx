import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { Modal, Select } from '../components/ui'
import { money } from '../types/accounting'
import {
  TRANSFER_KIND_LABEL,
  TREASURY_KIND_LABEL,
  TreasuryKind,
  type FundTransfer,
  type TreasuryAccount,
} from '../types/banking'

export function BankingPage() {
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([])
  const [transfers, setTransfers] = useState<FundTransfer[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<TreasuryKind>(TreasuryKind.COMMERCIAL_BANK)
  const [institution, setInstitution] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [memo, setMemo] = useState('')

  async function load() {
    const [treasury, rows] = await Promise.all([api.treasury(), api.transfers()])
    setAccounts(treasury)
    setTransfers(rows)
    if (!fromId && treasury[0]) {
      setFromId(treasury[0].id)
    }
    if (!toId && treasury[1]) {
      setToId(treasury[1].id)
    }
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

  async function onTransfer(event: FormEvent) {
    event.preventDefault()
    if (!fromId || !toId) return
    setSaving(true)
    setError(null)
    try {
      await api.createTransfer({
        fromTreasuryId: fromId,
        toTreasuryId: toId,
        amount: Number(amount),
        date,
        memo,
      })
      setAmount('')
      setMemo('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to post transfer')
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

  const accountOptions = accounts.map((account) => ({
    value: account.id,
    label: `${account.glAccountCode} · ${account.name}`,
  }))

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Banking, cash & petty cash</h1>
        </div>
        <button type="button" onClick={() => setModalOpen(true)}>
          Add channel
        </button>
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

      <Modal
        open={modalOpen}
        title="Add channel"
        onClose={() => setModalOpen(false)}
      >
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
          <h2>Accounts</h2>
          <p className="muted">Book balance is the live ledger, not a stored figure.</p>
        </div>
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

      <section className="table-card">
        <h2>Fund transfer</h2>
        <p className="muted">
          Withdrawal: bank/wallet → cash. Deposit: cash → bank/wallet. Other
          moves post as account-to-account. Each transfer writes a balanced journal.
        </p>
        <form className="stack-form" onSubmit={(event) => void onTransfer(event)}>
          <div className="name-row triple-row">
            <label>
              From
              <Select
                value={fromId}
                onChange={setFromId}
                options={accountOptions}
                placeholder="Select"
                required
              />
            </label>
            <label>
              To
              <Select
                value={toId}
                onChange={setToId}
                options={accountOptions}
                placeholder="Select"
                required
              />
            </label>
            <label>
              Amount
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </label>
          </div>
          <div className="name-row">
            <label>
              Date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>
            <label>
              Memo
              <input value={memo} onChange={(e) => setMemo(e.target.value)} required />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" disabled={saving || !fromId || !toId || fromId === toId}>
              {saving ? 'Posting…' : 'Post transfer'}
            </button>
          </div>
          {error && !modalOpen ? <p className="form-error">{error}</p> : null}
        </form>
      </section>

      <section className="table-card">
        <h2>Posted transfers</h2>
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Date</th>
              <th>Kind</th>
              <th>From</th>
              <th>To</th>
              <th>Amount</th>
              <th>Journal</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((row) => (
              <tr key={row.id}>
                <td>{row.transferNumber}</td>
                <td>{row.date.slice(0, 10)}</td>
                <td>{TRANSFER_KIND_LABEL[row.kind]}</td>
                <td>{row.fromAccountCode}</td>
                <td>{row.toAccountCode}</td>
                <td>{money(row.amount)}</td>
                <td>{row.journalEntryNumber}</td>
              </tr>
            ))}
            {transfers.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  No transfers yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </>
  )
}
