import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import {
  AddSupplierForm,
  emptyAddSupplierValues,
  type AddSupplierFormValues,
} from '../components/AddSupplierForm'
import { Role } from '../types/auth'
import type { Supplier } from '../types/procurement'

export function VendorsPage() {
  const { user } = useAuth()
  const isFinance = user?.role === Role.ADMIN || user?.role === Role.ACCOUNTANT
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<AddSupplierFormValues>(emptyAddSupplierValues)

  async function load() {
    const rows = await api.suppliers()
    setSuppliers(rows)
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load vendors')
    })
  }, [])

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    if (!isFinance) return
    setSaving(true)
    setError(null)
    try {
      await api.createSupplier({
        name: form.name,
        contactName: form.contactName || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
      })
      setForm(emptyAddSupplierValues())
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create supplier')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Vendor directory</h1>
        </div>
        <Link to="/procurement" className="ghost-link">
          Purchase orders
        </Link>
      </header>

      {isFinance ? (
        <section className="table-card">
          <div className="table-head">
            <h2>Add supplier</h2>
            <p className="muted">Creates a vendor record for POs and payables</p>
          </div>
          <AddSupplierForm
            values={form}
            onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
            onSubmit={(event) => void onCreate(event)}
            saving={saving}
            error={error}
            submitLabel="Create supplier"
          />
        </section>
      ) : null}

      <section className="table-card">
        <div className="table-head">
          <h2>Suppliers</h2>
          <p className="muted">Open a vendor for ledger and payment history</p>
        </div>
        {!isFinance && error ? <p className="form-error">{error}</p> : null}
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Name</th>
              <th>Contact</th>
              <th>Phone</th>
              <th>Address</th>
              <th>Terms</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link to={`/suppliers/${row.id}`}>{row.supplierNumber}</Link>
                </td>
                <td>
                  <Link to={`/suppliers/${row.id}`}>{row.name}</Link>
                </td>
                <td>{row.contactName ?? '—'}</td>
                <td>{row.phone ?? '—'}</td>
                <td>{row.address ?? '—'}</td>
                <td>{row.paymentTermsDays} days</td>
                <td>{row.isActive ? 'Active' : 'Inactive'}</td>
              </tr>
            ))}
            {suppliers.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  No suppliers yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </>
  )
}
