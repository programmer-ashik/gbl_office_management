import { useState, type FormEvent } from 'react'
import { api } from '../api/client'
import type { Customer } from '../types/accounting'

type Props = {
  initialName?: string
  onCreated: (customer: Customer) => void
  onCancel: () => void
  submitLabel?: string
}

/** Minimal "Add customer" form, same rules as the Customers page. */
export function QuickCustomerForm({
  initialName = '',
  onCreated,
  onCancel,
  submitLabel = 'Add client',
}: Props) {
  const [name, setName] = useState(initialName)
  const [contactName, setContactName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (!address.trim()) {
      setError('Billing address is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const customer = await api.createCustomer({
        name: name.trim(),
        contactName: contactName.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim(),
      })
      onCreated(customer)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create client')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="stack-form" onSubmit={(event) => void onSubmit(event)}>
      <div className="name-row">
        <label>
          Client name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            autoFocus
          />
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
      <label>
        Billing address
        <textarea
          rows={3}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          maxLength={240}
          required
          placeholder="House / road, area, city, postcode"
        />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="form-actions">
        <button type="button" className="ghost" onClick={onCancel}>
          Back
        </button>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
