import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { Modal, Select } from '../components/ui'
import {
  ACCOUNT_TYPE_LABEL,
  AccountType,
  type Account,
} from '../types/accounting'

export function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState<Account['type']>(AccountType.ASSET)
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  async function load() {
    const rows = await api.accounts()
    setAccounts(rows)
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load accounts')
    })
  }, [])

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api.createAccount({ code, name, type, description: description || undefined })
      setCode('')
      setName('')
      setDescription('')
      setModalOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create account')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Chart of Accounts</h1>
        </div>
        <button type="button" onClick={() => setModalOpen(true)}>
          Add account
        </button>
      </header>

      <Modal
        open={modalOpen}
        title="Add account"
        onClose={() => setModalOpen(false)}
      >
        <form className="stack-form" onSubmit={(event) => void onCreate(event)}>
          <label>
            Code
            <input value={code} onChange={(e) => setCode(e.target.value)} required />
          </label>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Type
            <Select
              value={type}
              onChange={(value) => setType(value as Account['type'])}
              options={Object.values(AccountType).map((value) => ({
                value,
                label: ACCOUNT_TYPE_LABEL[value],
              }))}
            />
          </label>
          <label>
            Description
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Add'}
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </Modal>

      {(Object.keys(ACCOUNT_TYPE_LABEL) as Account['type'][]).map((group) => {
        const rows = accounts.filter((account) => account.type === group)
        if (rows.length === 0) {
          return null
        }
        return (
          <section className="table-card" key={group}>
            <h2>{ACCOUNT_TYPE_LABEL[group]}</h2>
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Normal</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((account) => (
                  <tr key={account.id}>
                    <td>{account.code}</td>
                    <td>{account.name}</td>
                    <td>{account.normalBalance}</td>
                    <td>{account.isActive ? 'Active' : 'Inactive'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      })}

      {!modalOpen && error ? <p className="form-error">{error}</p> : null}
    </>
  )
}
