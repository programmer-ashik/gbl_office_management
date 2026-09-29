import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { ActionMenu, Modal } from '../components/ui'
import type { Customer } from '../types/accounting'
import { Role } from '../types/auth'

type ModalMode = 'view' | 'edit' | null

export function CustomersPage() {
  const { user } = useAuth()
  const canManage =
    user?.role === Role.ADMIN || user?.role === Role.ACCOUNTANT

  const [rows, setRows] = useState<Customer[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [contactName, setContactName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [billingAddress, setBillingAddress] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [selected, setSelected] = useState<Customer | null>(null)
  const [editName, setEditName] = useState('')
  const [editContactName, setEditContactName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [modalError, setModalError] = useState<string | null>(null)

  async function load() {
    const list = await api.customers()
    setRows(list)
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load customers')
    })
  }, [])

  function resetAddForm() {
    setName('')
    setContactName('')
    setPhone('')
    setEmail('')
    setBillingAddress('')
    setAddError(null)
  }

  function openAdd() {
    resetAddForm()
    setAddOpen(true)
  }

  function closeAdd() {
    setAddOpen(false)
    resetAddForm()
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    if (!canManage) return
    if (!billingAddress.trim()) {
      setAddError('Billing address is required')
      return
    }
    setSaving(true)
    setAddError(null)
    try {
      await api.createCustomer({
        name: name.trim(),
        contactName: contactName.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: billingAddress.trim(),
      })
      closeAdd()
      await load()
    } catch (err) {
      setAddError(
        err instanceof Error ? err.message : 'Unable to create customer',
      )
    } finally {
      setSaving(false)
    }
  }

  function openView(row: Customer) {
    setSelected(row)
    setModalMode('view')
    setModalError(null)
  }

  function openEdit(row: Customer) {
    if (!canManage) return
    setSelected(row)
    setEditName(row.name)
    setEditContactName(row.contactName ?? '')
    setEditPhone(row.phone ?? '')
    setEditEmail(row.email ?? '')
    setEditAddress(row.address ?? '')
    setModalMode('edit')
    setModalError(null)
  }

  function closeModal() {
    setModalMode(null)
    setSelected(null)
    setModalError(null)
  }

  async function onSaveEdit(event: FormEvent) {
    event.preventDefault()
    if (!canManage || !selected) return
    setSaving(true)
    setModalError(null)
    try {
      await api.updateCustomer(selected.id, {
        name: editName,
        contactName: editContactName || undefined,
        phone: editPhone || undefined,
        email: editEmail || undefined,
        address: editAddress || undefined,
      })
      closeModal()
      await load()
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'Unable to update customer',
      )
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(row: Customer) {
    if (!canManage) return
    if (
      !window.confirm(
        `Deactivate customer ${row.customerNumber} · ${row.name}? They will be hidden from active lists (soft delete).`,
      )
    ) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.updateCustomer(row.id, { isActive: false })
      await load()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to deactivate customer',
      )
    } finally {
      setSaving(false)
    }
  }

  async function onReactivate(row: Customer) {
    if (!canManage) return
    setSaving(true)
    setError(null)
    try {
      await api.updateCustomer(row.id, { isActive: true })
      await load()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to reactivate customer',
      )
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
        <div className="form-actions">
          <Link to="/journals" className="ghost-link">
            Journals
          </Link>
          {canManage ? (
            <button type="button" onClick={openAdd}>
              Add customer
            </button>
          ) : null}
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

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
              <th>Actions</th>
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
                  <Link
                    to={`/ledgers/1151?entityType=customer&entityId=${encodeURIComponent(row.id)}`}
                  >
                    AR 1151
                  </Link>
                </td>
                <td>
                  <ActionMenu
                    disabled={saving}
                    items={[
                      {
                        label: 'View',
                        onSelect: () => openView(row),
                      },
                      ...(canManage
                        ? [
                            {
                              label: 'Edit',
                              onSelect: () => openEdit(row),
                            },
                            row.isActive
                              ? {
                                  label: 'Delete',
                                  danger: true,
                                  onSelect: () => void onDelete(row),
                                }
                              : {
                                  label: 'Reactivate',
                                  onSelect: () => void onReactivate(row),
                                },
                          ]
                        : []),
                    ]}
                  />
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  No customers yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <Modal open={addOpen} title="Add customer" onClose={closeAdd}>
        <form className="stack-form" onSubmit={(event) => void onCreate(event)}>
          <p className="muted">
            AR control account 1151 uses the customer as the sub-ledger entity —
            not a separate CoA account per customer.
          </p>
          <div className="name-row">
            <label>
              Name
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
              value={billingAddress}
              onChange={(e) => setBillingAddress(e.target.value)}
              maxLength={240}
              required
              placeholder="House / road, area, city, postcode"
            />
          </label>
          {addError ? <p className="form-error">{addError}</p> : null}
          <div className="form-actions">
            <button type="button" className="ghost" onClick={closeAdd}>
              Cancel
            </button>
            <button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Add customer'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={modalMode === 'view' && Boolean(selected)}
        title="Customer details"
        onClose={closeModal}
      >
        {selected ? (
          <div className="stack-form">
            <p>
              <strong>Number:</strong> {selected.customerNumber}
            </p>
            <p>
              <strong>Name:</strong> {selected.name}
            </p>
            <p>
              <strong>Contact:</strong> {selected.contactName ?? '—'}
            </p>
            <p>
              <strong>Phone:</strong> {selected.phone ?? '—'}
            </p>
            <p>
              <strong>Email:</strong> {selected.email ?? '—'}
            </p>
            <p>
              <strong>Billing address:</strong> {selected.address ?? '—'}
            </p>
            <p>
              <strong>Status:</strong>{' '}
              {selected.isActive ? 'Active' : 'Inactive'}
            </p>
            <div className="form-actions">
              <button type="button" className="ghost" onClick={closeModal}>
                Close
              </button>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => openEdit(selected)}
                >
                  Edit
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={modalMode === 'edit' && Boolean(selected)}
        title="Edit customer"
        onClose={closeModal}
      >
        {selected ? (
          <form className="stack-form" onSubmit={(e) => void onSaveEdit(e)}>
            <p className="muted">{selected.customerNumber}</p>
            <label>
              Name
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                minLength={2}
              />
            </label>
            <label>
              Contact
              <input
                value={editContactName}
                onChange={(e) => setEditContactName(e.target.value)}
              />
            </label>
            <label>
              Phone
              <input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
              />
            </label>
            <label>
              Billing address
              <textarea
                rows={3}
                value={editAddress}
                onChange={(e) => setEditAddress(e.target.value)}
                maxLength={240}
              />
            </label>
            {modalError ? <p className="form-error">{modalError}</p> : null}
            <div className="form-actions">
              <button type="button" className="ghost" onClick={closeModal}>
                Cancel
              </button>
              <button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        ) : null}
      </Modal>
    </>
  )
}
