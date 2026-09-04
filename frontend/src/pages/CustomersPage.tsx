import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Customer } from '../types/accounting'

export function CustomersPage() {
  const [rows, setRows] = useState<Customer[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [contactName, setContactName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')

  async function load() {
    const list = await api.customers()
    setRows(list)
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load customers')
    })
  }, [])

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api.createCustomer({
        name,
        contactName: contactName || undefined,
        phone: phone || undefined,
        email: email || undefined,
      })
      setName('')
      setContactName('')
      setPhone('')
      setEmail('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create customer')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Customers</h1>
        </div>
        <Link to="/journals" className="ghost-link">
          Journals
        </Link>
      </header>

      <section className="table-card">
        <div className="table-head">
          <h2>Add customer</h2>
          <p className="muted">
            AR control account 1100 uses customer as the sub-ledger entity — not a
            separate CoA account per customer.
          </p>
        </div>
        <form className="stack-form" onSubmit={(event) => void onCreate(event)}>
          <div className="name-row">
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Contact
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </label>
          </div>
          <div className="name-row">
            <label>
              Phone
              <input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Add customer'}
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </section>

      <section className="table-card">
        <div className="table-head">
          <h2>Directory</h2>
          <p className="muted">{rows.length} customers</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Name</th>
              <th>Contact</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Ledger</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.customerNumber}</td>
                <td>{row.name}</td>
                <td>{row.contactName ?? '—'}</td>
                <td>{row.phone ?? '—'}</td>
                <td>{row.isActive ? 'Active' : 'Inactive'}</td>
                <td>
                  <Link to={`/ledgers/1100`}>AR 1100</Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No customers yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </>
  )
}
