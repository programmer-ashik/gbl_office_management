import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { Select } from '../components/ui'
import { money } from '../types/accounting'
import {
  TRANSFER_KIND_LABEL,
  type FundTransfer,
  type TreasuryAccount,
} from '../types/banking'

export function BankingTransfersPage() {
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([])
  const [transfers, setTransfers] = useState<FundTransfer[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
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
      setError(err instanceof Error ? err.message : 'Unable to load transfers')
    })
  }, [])

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

  const accountOptions = accounts.map((account) => ({
    value: account.id,
    label: `${account.glAccountCode} · ${account.name}`,
  }))

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Internal transfers</h1>
        </div>
        <Link to="/banking" className="ghost-link">
          Accounts & wallets
        </Link>
      </header>

      <section className="table-card">
        <h2>Fund transfer</h2>
        <p className="muted">
          Withdrawal: bank/wallet → cash. Deposit: cash → bank/wallet. Other moves post
          as account-to-account. Each transfer writes a balanced journal.
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
                searchable
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
                searchable
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
            <button
              type="submit"
              disabled={saving || !fromId || !toId || fromId === toId}
            >
              {saving ? 'Posting…' : 'Post transfer'}
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
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
