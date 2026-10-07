import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { ActionMenu, Modal, Select } from '../components/ui'
import { money } from '../types/accounting'
import { Role } from '../types/auth'
import type { OtherParty, OtherPartyKind } from '../types/otherParty'

const KIND_OPTIONS = [
  { value: 'receivable', label: 'Other receivable (owes us)' },
  { value: 'payable', label: 'Other payable (we owe)' },
]

const SECTIONS: Array<{ kind: OtherPartyKind; title: string; hint: string }> = [
  {
    kind: 'receivable',
    title: 'Other receivable',
    hint: 'Parties that owe us, used on receivable accounts with an Other party list.',
  },
  {
    kind: 'payable',
    title: 'Other payable',
    hint: 'Parties we owe, used on payable accounts with an Other party list.',
  },
]

type Draft = { name: string; kind: OtherPartyKind; phone: string; note: string }

const emptyDraft = (kind: OtherPartyKind): Draft => ({ name: '', kind, phone: '', note: '' })

export function OtherPartiesPage() {
  const { user } = useAuth()
  const canManage = user?.role === Role.ADMIN || user?.role === Role.ACCOUNTANT

  const [rows, setRows] = useState<OtherParty[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<OtherParty | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)

  async function load() {
    setRows(await api.otherParties())
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load parties')
    })
  }, [])

  function openAdd(kind: OtherPartyKind) {
    setEditing(null)
    setDraft(emptyDraft(kind))
    setModalError(null)
  }

  function openEdit(row: OtherParty) {
    setEditing(row)
    setDraft({ name: row.name, kind: row.kind, phone: row.phone ?? '', note: row.note ?? '' })
    setModalError(null)
  }

  function closeModal() {
    setEditing(null)
    setDraft(null)
    setModalError(null)
  }

  async function onSave(event: FormEvent) {
    event.preventDefault()
    if (!draft || !canManage) return
    setSaving(true)
    setModalError(null)
    try {
      if (editing) {
        await api.updateOtherParty(editing.id, {
          name: draft.name.trim(),
          phone: draft.phone.trim(),
          note: draft.note.trim(),
        })
      } else {
        await api.createOtherParty({
          name: draft.name.trim(),
          kind: draft.kind,
          phone: draft.phone.trim() || undefined,
          note: draft.note.trim() || undefined,
        })
      }
      closeModal()
      await load()
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Unable to save party')
    } finally {
      setSaving(false)
    }
  }

  async function setActive(row: OtherParty, isActive: boolean) {
    if (!canManage) return
    if (
      !isActive &&
      !window.confirm(`Deactivate ${row.name}? It will be hidden from journal party lists.`)
    ) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.updateOtherParty(row.id, { isActive })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update party')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Other Receivable &amp; Payable</h1>
        </div>
        <div className="form-actions">
          <Link to="/accounts" className="ghost-link">
            Chart of Accounts
          </Link>
          <Link to="/journals" className="ghost-link">
            Journals
          </Link>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      {SECTIONS.map((section) => {
        const list = rows.filter((row) => row.kind === section.kind)
        const total = list.reduce((sum, row) => sum + row.balance, 0)
        return (
          <section className="table-card" key={section.kind}>
            <div className="table-head">
              <div>
                <h2>{section.title}</h2>
                <p className="muted">{section.hint}</p>
              </div>
              <div className="form-actions">
                <span className="muted">
                  {list.length} parties · Balance {money(total)}
                </span>
                {canManage ? (
                  <button type="button" onClick={() => openAdd(section.kind)}>
                    Add party
                  </button>
                ) : null}
              </div>
            </div>
            <table className="mobile-stack">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Note</th>
                  <th className="num">Balance</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((row) => (
                  <tr key={row.id}>
                    <td data-label="Name" className="mobile-stack-title">
                      {row.name}
                    </td>
                    <td data-label="Phone">{row.phone ?? '—'}</td>
                    <td data-label="Note">{row.note ?? '—'}</td>
                    <td data-label="Balance" className="num">
                      {money(row.balance)}
                    </td>
                    <td data-label="Status">{row.isActive ? 'Active' : 'Inactive'}</td>
                    <td data-label="Actions" className="mobile-stack-actions">
                      {canManage ? (
                        <ActionMenu
                          disabled={saving}
                          items={[
                            { label: 'Edit', onSelect: () => openEdit(row) },
                            row.isActive
                              ? {
                                  label: 'Deactivate',
                                  danger: true,
                                  onSelect: () => void setActive(row, false),
                                }
                              : {
                                  label: 'Reactivate',
                                  onSelect: () => void setActive(row, true),
                                },
                          ]}
                        />
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {list.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      No {section.title.toLowerCase()} parties yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
        )
      })}

      <Modal
        open={draft !== null}
        title={editing ? `Edit ${editing.name}` : 'Add party'}
        onClose={closeModal}
      >
        {draft ? (
          <form className="stack-form" onSubmit={(event) => void onSave(event)}>
            <label>
              List
              <Select
                value={draft.kind}
                onChange={(value) => setDraft({ ...draft, kind: value as OtherPartyKind })}
                options={KIND_OPTIONS}
                disabled={Boolean(editing)}
                portal
              />
            </label>
            <label>
              Name
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                required
                minLength={2}
                autoFocus
              />
            </label>
            <label>
              Phone
              <input
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              />
            </label>
            <label>
              Note
              <input
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                maxLength={240}
              />
            </label>
            {modalError ? <p className="form-error">{modalError}</p> : null}
            <div className="form-actions">
              <button type="button" className="ghost" onClick={closeModal}>
                Cancel
              </button>
              <button type="submit" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add party'}
              </button>
            </div>
          </form>
        ) : null}
      </Modal>
    </>
  )
}
