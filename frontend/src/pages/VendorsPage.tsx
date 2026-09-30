import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import {
  AddSupplierForm,
  emptyAddSupplierValues,
  type AddSupplierFormValues,
} from '../components/AddSupplierForm'
import { Modal } from '../components/ui'
import { Role } from '../types/auth'
import type { Supplier } from '../types/procurement'

export function VendorsPage() {
  const { user } = useAuth()
  const isFinance = user?.role === Role.ADMIN || user?.role === Role.ACCOUNTANT
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<AddSupplierFormValues>(emptyAddSupplierValues)
  const [addOpen, setAddOpen] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  function openAdd() {
    setForm(emptyAddSupplierValues())
    setAddError(null)
    setAddOpen(true)
  }

  function closeAdd() {
    setAddOpen(false)
    setForm(emptyAddSupplierValues())
    setAddError(null)
  }

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
    if (!form.address.trim()) {
      setAddError('Billing address is required')
      return
    }
    setSaving(true)
    setAddError(null)
    try {
      await api.createSupplier({
        name: form.name.trim(),
        contactName: form.contactName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim(),
      })
      closeAdd()
      await load()
    } catch (err) {
      setAddError(
        err instanceof Error ? err.message : 'Unable to create supplier',
      )
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
        <div className="form-actions">
          <Link to="/procurement" className="ghost-link">
            Purchase orders
          </Link>
          {isFinance ? (
            <button type="button" onClick={openAdd}>
              Add supplier
            </button>
          ) : null}
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="table-card">
        <div className="table-head">
          <h2>Suppliers</h2>
          <p className="muted">Open a vendor for ledger and payment history</p>
        </div>
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

      <Modal
        open={addOpen}
        title="Add supplier"
        description="Creates a vendor record for POs and payables"
        onClose={closeAdd}
      >
        <AddSupplierForm
          values={form}
          onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
          onSubmit={(event) => void onCreate(event)}
          onCancel={closeAdd}
          saving={saving}
          error={addError}
          submitLabel="Add supplier"
        />
      </Modal>
    </>
  )
}
