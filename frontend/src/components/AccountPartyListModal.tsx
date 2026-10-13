import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import {
  ACCOUNT_PARTY_TYPE_LABELS,
  type Account,
  type AccountPartyType,
} from '../types/accounting'
import { otherPartyKindFor, type OtherParty } from '../types/otherParty'
import { Modal, Select } from './ui'

const TYPE_OPTIONS = [
  { value: '', label: 'None (no party list)' },
  { value: 'customer', label: 'Customers' },
  { value: 'supplier', label: 'Suppliers' },
  { value: 'employee', label: 'Employees' },
  { value: 'other', label: 'Other (my own list)' },
]

type Props = {
  account: Account | null
  otherParties: OtherParty[]
  onClose: () => void
  onDone: (message: string) => void
}

export function AccountPartyListModal({ account, otherParties, onClose, onDone }: Props) {
  const [partyType, setPartyType] = useState<AccountPartyType | ''>('')
  const [added, setAdded] = useState<OtherParty[]>([])
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!account) return
    setPartyType(account.partyType ?? '')
    setAdded([])
    setNewName('')
    setNewPhone('')
    setError(null)
  }, [account])

  if (!account) return null

  const kind = otherPartyKindFor(account.normalBalance)
  const kindLabel = kind === 'receivable' ? 'Other receivable' : 'Other payable'
  const list = [...otherParties, ...added].filter(
    (row) => row.isActive && row.kind === kind,
  )

  async function addParty() {
    const name = newName.trim()
    if (name.length < 2) {
      setError('Enter a party name (at least 2 characters)')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const row = await api.createOtherParty({
        name,
        kind,
        phone: newPhone.trim() || undefined,
      })
      setAdded((prev) => [...prev, row])
      setNewName('')
      setNewPhone('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add party')
    } finally {
      setBusy(false)
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!account) return
    setBusy(true)
    setError(null)
    try {
      if (partyType !== (account.partyType ?? '')) {
        await api.updateAccount(account.id, { partyType: partyType || null })
      }
      onDone(
        partyType
          ? `${account.code} · ${account.name} now lists ${ACCOUNT_PARTY_TYPE_LABELS[partyType].toLowerCase()}. Post journal will ask for one on each line.`
          : `${account.code} · ${account.name} no longer uses a party list.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save party list')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open title={`Party list · ${account.code} ${account.name}`} onClose={onClose}>
      <form className="stack-form" onSubmit={(event) => void save(event)}>
        <label>
          List under this account
          <Select
            value={partyType}
            onChange={(value) => setPartyType(value as AccountPartyType | '')}
            options={TYPE_OPTIONS}
            portal
          />
        </label>
        <p className="muted">
          Parties show under this account in the tree, and Post journal asks
          which one each line is for.
        </p>

        {partyType === 'other' ? (
          <>
            <h3 className="party-list-heading">{kindLabel} parties</h3>
            {list.length > 0 ? (
              <ul className="party-list-names">
                {list.map((row) => (
                  <li key={row.id}>
                    {row.name}
                    {row.phone ? <span className="muted"> · {row.phone}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No {kindLabel.toLowerCase()} parties yet.</p>
            )}
            <div className="name-row">
              <label>
                New party name
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Mr. Ayube"
                />
              </label>
              <label>
                Phone (optional)
                <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
              </label>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="ghost"
                disabled={busy || !newName.trim()}
                onClick={() => void addParty()}
              >
                + Add party
              </button>
            </div>
            <p className="muted">
              This list is also managed in Procurement &amp; Inventory → Other
              Receivable &amp; Payable.
            </p>
          </>
        ) : null}

        <div className="form-actions">
          <button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
      </form>
    </Modal>
  )
}
