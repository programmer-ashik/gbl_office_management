import type { FormEvent } from 'react'

export type AddSupplierFormValues = {
  name: string
  contactName: string
  phone: string
  address: string
}

export const emptyAddSupplierValues = (): AddSupplierFormValues => ({
  name: '',
  contactName: '',
  phone: '',
  address: '',
})

type Props = {
  values: AddSupplierFormValues
  onChange: (patch: Partial<AddSupplierFormValues>) => void
  onSubmit: (event: FormEvent) => void
  saving?: boolean
  error?: string | null
  submitLabel?: string
}

/** Shared create-supplier fields for Vendors page and Procurement modal. */
export function AddSupplierForm({
  values,
  onChange,
  onSubmit,
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
        <label>
          Phone
          <input
            value={values.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            placeholder="Phone"
          />
        </label>
      </div>
      <label>
        Address
        <textarea
          value={values.address}
          onChange={(e) => onChange({ address: e.target.value })}
          rows={2}
          placeholder="Street, city, country"
          maxLength={240}
        />
      </label>
      <div className="form-actions">
        <button type="submit" disabled={saving || values.name.trim().length < 2}>
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  )
}
