import type { FormEvent } from 'react'

export type AddSupplierFormValues = {
  name: string
  contactName: string
  phone: string
  email: string
  address: string
}

export const emptyAddSupplierValues = (): AddSupplierFormValues => ({
  name: '',
  contactName: '',
  phone: '',
  email: '',
  address: '',
})

type Props = {
  values: AddSupplierFormValues
  onChange: (patch: Partial<AddSupplierFormValues>) => void
  onSubmit: (event: FormEvent) => void
  onCancel?: () => void
  saving?: boolean
  error?: string | null
  submitLabel?: string
}

/** Shared create-supplier fields for Vendors page and Procurement modal. */
export function AddSupplierForm({
  values,
  onChange,
  onSubmit,
  onCancel,
  saving = false,
  error = null,
  submitLabel = 'Create supplier',
}: Props) {
  return (
    <form className="stack-form" onSubmit={onSubmit}>
      <div className="name-row">
        <label>
          Name
          <input
            value={values.name}
            onChange={(e) => onChange({ name: e.target.value })}
            required
            minLength={2}
            autoFocus
            placeholder="Vendor / company name"
          />
        </label>
        <label>
          Contact
          <input
            value={values.contactName}
            onChange={(e) => onChange({ contactName: e.target.value })}
            placeholder="Contact person"
          />
        </label>
      </div>
      <div className="name-row">
        <label>
          Phone
          <input
            value={values.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={values.email}
            onChange={(e) => onChange({ email: e.target.value })}
          />
        </label>
      </div>
      <label>
        Billing address
        <textarea
          value={values.address}
          onChange={(e) => onChange({ address: e.target.value })}
          rows={3}
          required
          placeholder="House / road, area, city, postcode"
          maxLength={240}
        />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="form-actions">
        {onCancel ? (
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button
          type="submit"
          disabled={
            saving ||
            values.name.trim().length < 2 ||
            !values.address.trim()
          }
        >
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
