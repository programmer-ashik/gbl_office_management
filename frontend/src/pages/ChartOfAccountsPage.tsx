import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { ActionMenu, Modal, Select } from '../components/ui'
import {
  ACCOUNT_TYPE_LABEL,
  AccountType,
  type Account,
} from '../types/accounting'

function depthOf(account: Account, byCode: Map<string, Account>): number {
  let depth = 0
  let parent = account.parentCode
  const seen = new Set<string>()
  while (parent) {
    if (seen.has(parent)) break
    seen.add(parent)
    depth += 1
    parent = byCode.get(parent)?.parentCode ?? null
  }
  return depth
}

export function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState<Account['type']>(AccountType.ASSET)
  const [parentCode, setParentCode] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editActive, setEditActive] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    const rows = await api.accounts()
    setAccounts(rows)
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load accounts')
    })
  }, [])

  const byCode = useMemo(() => {
    const map = new Map<string, Account>()
    for (const account of accounts) map.set(account.code, account)
    return map
  }, [accounts])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return accounts
      .filter((account) => {
        if (typeFilter && account.type !== typeFilter) return false
        if (!needle) return true
        return (
          account.code.toLowerCase().includes(needle) ||
          account.name.toLowerCase().includes(needle) ||
          (account.parentCode ?? '').toLowerCase().includes(needle)
        )
      })
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [accounts, search, typeFilter])

  const parentOptions = useMemo(() => {
    return [
      { value: '', label: 'None (top level)' },
      ...accounts
        .filter((account) => account.type === type && !account.isPostable)
        .map((account) => ({
          value: account.code,
          label: `${account.code} · ${account.name}`,
        })),
    ]
  }, [accounts, type])

  function openCreate() {
    setEditing(null)
    setCode('')
    setName('')
    setDescription('')
    setParentCode('')
    setType(AccountType.ASSET)
    setModalOpen(true)
  }

  function openEdit(account: Account) {
    setEditing(account)
    setEditName(account.name)
    setEditDescription(account.description ?? '')
    setEditActive(account.isActive)
    setModalOpen(true)
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api.createAccount({
        code,
        name,
        type,
        description: description || undefined,
        parentCode: parentCode || undefined,
      })
      setCode('')
      setName('')
      setDescription('')
      setParentCode('')
      setModalOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create account')
    } finally {
      setSaving(false)
    }
  }

  async function onUpdate(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    setSaving(true)
    setError(null)
    try {
      await api.updateAccount(editing.id, {
        name: editName,
        description: editDescription,
        isActive: editActive,
      })
      setModalOpen(false)
      setEditing(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update account')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(account: Account) {
    const confirmed = window.confirm(
      `Delete account ${account.code} · ${account.name}? This cannot be undone.`,
    )
    if (!confirmed) return
    setBusyId(account.id)
    setError(null)
    try {
      await api.deleteAccount(account.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete account')
    } finally {
      setBusyId(null)
    }
  }

  const typeOptions = [
    { value: '', label: 'All types' },
    ...Object.values(AccountType).map((value) => ({
      value,
      label: ACCOUNT_TYPE_LABEL[value],
    })),
  ]

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Chart of Accounts</h1>
        </div>
        <button type="button" onClick={openCreate}>
          Add account
        </button>
      </header>

      <section className="table-card">
        <div className="table-head">
          <h2>Account hierarchy</h2>
          <p className="muted">
            {accounts.length} accounts · header rows are non-postable parents
          </p>
        </div>
        <form className="filter-bar" onSubmit={(event) => event.preventDefault()}>
          <label>
            Search
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Code or name…"
            />
          </label>
          <label>
            Type
            <Select
              value={typeFilter}
              onChange={setTypeFilter}
              options={typeOptions}
              searchable
            />
          </label>
        </form>

        <div className="journal-lines-scroll">
          <table className="journal-lines-table coa-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Parent</th>
                <th>Type</th>
                <th>Normal</th>
                <th>Kind</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((account) => {
                const depth = depthOf(account, byCode)
                return (
                  <tr
                    key={account.id}
                    className={account.isPostable ? undefined : 'coa-header-row'}
                  >
                    <td>
                      <span
                        className="coa-code"
                        style={{ paddingLeft: `${depth * 14}px` }}
                      >
                        {account.code}
                      </span>
                    </td>
                    <td>{account.name}</td>
                    <td>{account.parentCode ?? '—'}</td>
                    <td>{ACCOUNT_TYPE_LABEL[account.type]}</td>
                    <td>{account.normalBalance}</td>
                    <td>
                      {account.isPostable ? (
                        <span className="status-pill status-posted">Postable</span>
                      ) : (
                        <span className="status-pill status-draft">Header</span>
                      )}
                    </td>
                    <td>{account.isActive ? 'Active' : 'Inactive'}</td>
                    <td>
                      <ActionMenu
                        disabled={busyId === account.id}
                        items={[
                          {
                            label: 'Edit',
                            onSelect: () => openEdit(account),
                          },
                          {
                            label: 'Delete',
                            danger: true,
                            disabled: account.isSystem,
                            disabledReason: account.isSystem
                              ? 'System accounts cannot be deleted.'
                              : undefined,
                            onSelect: () => void onDelete(account),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                )
              })}
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted">
                    No accounts match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={modalOpen}
        title={editing ? `Edit ${editing.code}` : 'Add account'}
        onClose={() => {
          setModalOpen(false)
          setEditing(null)
        }}
      >
        {editing ? (
          <form className="stack-form" onSubmit={(event) => void onUpdate(event)}>
            <label>
              Code
              <input value={editing.code} readOnly disabled />
            </label>
            <label>
              Name
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </label>
            <label>
              Description
              <input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </label>
            <label>
              Status
              <Select
                value={editActive ? 'active' : 'inactive'}
                onChange={(value) => setEditActive(value === 'active')}
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                ]}
              />
            </label>
            <div className="form-actions">
              <button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
            {error ? <p className="form-error">{error}</p> : null}
          </form>
        ) : (
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
                onChange={(value) => {
                  setType(value as Account['type'])
                  setParentCode('')
                }}
                options={Object.values(AccountType).map((value) => ({
                  value,
                  label: ACCOUNT_TYPE_LABEL[value],
                }))}
              />
            </label>
            <label>
              Parent (header)
              <Select
                value={parentCode}
                onChange={setParentCode}
                options={parentOptions}
                searchable
                placeholder="None (top level)"
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
        )}
      </Modal>

      {!modalOpen && error ? <p className="form-error">{error}</p> : null}
    </>
  )
}
