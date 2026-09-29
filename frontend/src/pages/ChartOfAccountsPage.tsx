import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import {
  AccountOpeningModal,
  type OpeningRequest,
  type OpeningTarget,
} from '../components/AccountOpeningModal'
import { ActionMenu, Modal, Select } from '../components/ui'
import {
  ACCOUNT_TYPE_LABEL,
  AccountType,
  type Account,
  type Customer,
} from '../types/accounting'
import type { Employee } from '../types/employee'
import type { Supplier } from '../types/procurement'

const PARTY_CONTROL_ACCOUNTS: Record<
  string,
  { entityType: 'customer' | 'supplier' | 'employee'; label: string }
> = {
  '1151': { entityType: 'customer', label: 'Customers' },
  '2111': { entityType: 'supplier', label: 'Suppliers' },
  '2113': { entityType: 'supplier', label: 'Subcontractors' },
  '1161': { entityType: 'employee', label: 'Employees' },
  '2121': { entityType: 'employee', label: 'Employees' },
}

type TreeRow =
  | {
      kind: 'account'
      account: Account
      depth: number
      hasChildren: boolean
    }
  | {
      kind: 'party'
      id: string
      parentCode: string
      depth: number
      entityType: 'customer' | 'supplier' | 'employee'
      entityId: string
      name: string
      meta?: string
    }

function buildChildrenMap(accounts: Account[]): Map<string | null, Account[]> {
  const map = new Map<string | null, Account[]>()
  for (const account of accounts) {
    const key = account.parentCode || null
    const list = map.get(key) ?? []
    list.push(account)
    map.set(key, list)
  }
  for (const [, list] of map) {
    list.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
  }
  return map
}

export function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState<Account['type']>(AccountType.ASSET)
  const [parentCode, setParentCode] = useState('')
  const [description, setDescription] = useState('')
  const [openingBalance, setOpeningBalance] = useState('')
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [editing, setEditing] = useState<Account | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editActive, setEditActive] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [opening, setOpening] = useState<OpeningRequest | null>(null)

  async function load() {
    const [rows, customerRows, supplierRows, employeeRows] = await Promise.all([
      api.accounts(),
      api.customers(true).catch(() => [] as Customer[]),
      api.suppliers().catch(() => [] as Supplier[]),
      api.employees().catch(() => [] as Employee[]),
    ])
    setAccounts(rows)
    setCustomers(customerRows)
    setSuppliers(supplierRows)
    setEmployees(employeeRows)
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load accounts')
    })
  }, [])

  const childrenMap = useMemo(() => buildChildrenMap(accounts), [accounts])

  const matchingCodes = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle && !typeFilter) return null
    const codes = new Set<string>()
    for (const account of accounts) {
      if (typeFilter && account.type !== typeFilter) continue
      const hit =
        !needle ||
        account.code.toLowerCase().includes(needle) ||
        account.name.toLowerCase().includes(needle) ||
        (account.parentCode ?? '').toLowerCase().includes(needle)
      if (hit) codes.add(account.code)
    }
    // include ancestors so tree path stays visible
    for (const code of [...codes]) {
      let parent = accounts.find((row) => row.code === code)?.parentCode
      while (parent) {
        codes.add(parent)
        parent = accounts.find((row) => row.code === parent)?.parentCode ?? null
      }
    }
    return codes
  }, [accounts, search, typeFilter])

  const treeRows = useMemo(() => {
    const rows: TreeRow[] = []
    const walk = (parent: string | null, depth: number) => {
      const children = childrenMap.get(parent) ?? []
      for (const account of children) {
        if (matchingCodes && !matchingCodes.has(account.code)) continue
        const accountChildren = childrenMap.get(account.code) ?? []
        const partyMeta = PARTY_CONTROL_ACCOUNTS[account.code]
        const parties =
          partyMeta?.entityType === 'customer'
            ? customers.map((row) => ({
                id: row.id,
                name: row.name,
                meta: row.email ?? undefined,
              }))
            : partyMeta?.entityType === 'supplier'
              ? suppliers.map((row) => ({
                  id: row.id,
                  name: row.name,
                  meta: row.supplierNumber,
                }))
              : partyMeta?.entityType === 'employee'
                ? employees.map((row) => ({
                    id: row.id,
                    name: `${row.firstName} ${row.lastName}`.trim(),
                    meta: row.designation ?? row.email ?? undefined,
                  }))
                : []
        const hasChildren = accountChildren.length > 0 || parties.length > 0
        rows.push({
          kind: 'account',
          account,
          depth,
          hasChildren,
        })
        const isCollapsed = collapsed.has(account.code) && !matchingCodes
        if (isCollapsed) continue
        walk(account.code, depth + 1)
        if (partyMeta && (!collapsed.has(account.code) || matchingCodes)) {
          for (const party of parties) {
            if (
              search.trim() &&
              !party.name.toLowerCase().includes(search.trim().toLowerCase()) &&
              !account.name.toLowerCase().includes(search.trim().toLowerCase())
            ) {
              continue
            }
            rows.push({
              kind: 'party',
              id: `${account.code}:${party.id}`,
              parentCode: account.code,
              depth: depth + 1,
              entityType: partyMeta.entityType,
              entityId: party.id,
              name: party.name,
              meta: party.meta,
            })
          }
        }
      }
    }
    walk(null, 0)
    return rows
  }, [
    childrenMap,
    collapsed,
    customers,
    employees,
    matchingCodes,
    search,
    suppliers,
  ])

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

  async function refreshSuggestedCode(
    nextType: Account['type'],
    nextParent: string,
  ) {
    try {
      const suggested = await api.nextAccountCode(
        nextType,
        nextParent || undefined,
      )
      setCode(suggested.code)
    } catch {
      // keep current code if suggestion fails
    }
  }

  function openCreate() {
    setEditing(null)
    setName('')
    setDescription('')
    setParentCode('')
    setOpeningBalance('')
    setType(AccountType.ASSET)
    setError(null)
    setMessage(null)
    setModalOpen(true)
    void refreshSuggestedCode(AccountType.ASSET, '')
  }

  function openEdit(account: Account) {
    setEditing(account)
    setEditName(account.name)
    setEditDescription(account.description ?? '')
    setEditActive(account.isActive)
    setModalOpen(true)
  }

  function toggleCollapse(code: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  function expandAll() {
    setCollapsed(new Set())
  }

  function collapseAll() {
    const headers = accounts
      .filter((row) => !row.isPostable || PARTY_CONTROL_ACCOUNTS[row.code])
      .map((row) => row.code)
    setCollapsed(new Set(headers))
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const amountRaw = openingBalance.trim()
      const amount = amountRaw === '' ? undefined : Number(amountRaw)
      if (amountRaw !== '' && (!Number.isFinite(amount) || (amount ?? 0) <= 0)) {
        throw new Error('Opening balance must be a positive number')
      }
      const created = await api.createAccount({
        code,
        name,
        type,
        description: description || undefined,
        parentCode: parentCode || undefined,
        openingBalance: amount,
      })
      setName('')
      setDescription('')
      setParentCode('')
      setOpeningBalance('')
      setModalOpen(false)
      if (created.openingJournalNumber) {
        setMessage(
          `Account ${created.code} created. Opening Balance journal ${created.openingJournalNumber} posted.`,
        )
      } else {
        setMessage(`Account ${created.code} created.`)
      }
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

  function partiesFor(entityType: 'customer' | 'supplier' | 'employee') {
    if (entityType === 'customer') {
      return customers.map((row) => ({ id: row.id, name: row.name }))
    }
    if (entityType === 'supplier') {
      return suppliers
        .filter((row) => row.isActive)
        .map((row) => ({ id: row.id, name: row.name }))
    }
    return employees
      .filter((row) => row.isActive)
      .map((row) => ({
        id: row.id,
        name: `${row.firstName} ${row.lastName}`.trim() || row.email,
      }))
  }

  function targetsForLeaf(account: Account): OpeningTarget[] {
    const partyMeta = PARTY_CONTROL_ACCOUNTS[account.code]
    if (!partyMeta) {
      return [
        {
          key: account.code,
          accountCode: account.code,
          label: `${account.code} · ${account.name}`,
          side: account.normalBalance,
        },
      ]
    }
    return partiesFor(partyMeta.entityType).map((party) => ({
      key: `${account.code}:${party.id}`,
      accountCode: account.code,
      label: `${account.code} · ${party.name}`,
      side: account.normalBalance,
      entityType: partyMeta.entityType,
      entityId: party.id,
    }))
  }

  function openAccountOpening(account: Account) {
    const leaves: Account[] = []
    const collect = (row: Account) => {
      if (row.isPostable) {
        if (row.isActive) leaves.push(row)
        return
      }
      for (const child of childrenMap.get(row.code) ?? []) collect(child)
    }
    collect(account)
    const partyMeta = PARTY_CONTROL_ACCOUNTS[account.code]
    setMessage(null)
    setOpening({
      title: `${account.code} · ${account.name}`,
      targets: leaves.flatMap(targetsForLeaf),
      emptyHint: partyMeta
        ? `No ${partyMeta.label.toLowerCase()} yet. Add them first, then come back here.`
        : 'No active postable accounts under this group.',
    })
  }

  function canPostOpening(account: Account) {
    return (
      account.isActive &&
      account.isPostable &&
      (account.type === AccountType.ASSET || account.type === AccountType.LIABILITY)
    )
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
        <div className="form-actions">
          <button type="button" className="ghost" onClick={expandAll}>
            Expand all
          </button>
          <button type="button" className="ghost" onClick={collapseAll}>
            Collapse all
          </button>
          <button type="button" onClick={openCreate}>
            Add account
          </button>
        </div>
      </header>

      {message ? <p className="muted">{message}</p> : null}
      {!modalOpen && !opening && error ? (
        <p className="form-error">{error}</p>
      ) : null}

      <section className="table-card">
        <div className="table-head">
          <h2>Account hierarchy</h2>
          <p className="muted">
            {accounts.length} accounts · expand Client Receivables / Supplier
            Payables to see party names
          </p>
        </div>
        <form className="filter-bar" onSubmit={(event) => event.preventDefault()}>
          <label>
            Search
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Code, account, or party name…"
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
                <th>Type</th>
                <th>Kind</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {treeRows.map((row) => {
                if (row.kind === 'party') {
                  return (
                    <tr key={row.id} className="coa-party-row">
                      <td>
                        <span
                          className="coa-code coa-party-code"
                          style={{ paddingLeft: `${row.depth * 16 + 8}px` }}
                        >
                          ·
                        </span>
                      </td>
                      <td>
                        <span className="coa-party-name">{row.name}</span>
                        {row.meta ? (
                          <span className="muted"> · {row.meta}</span>
                        ) : null}
                      </td>
                      <td className="muted">
                        {row.entityType === 'customer'
                          ? 'Receivable party'
                          : row.entityType === 'supplier'
                            ? 'Payable party'
                            : 'Employee party'}
                      </td>
                      <td>
                        <span className="status-pill status-draft">Party</span>
                      </td>
                      <td className="muted">—</td>
                      <td>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            const parent = accounts.find(
                              (a) => a.code === row.parentCode,
                            )
                            setError(null)
                            setMessage(null)
                            setOpening({
                              title: row.name,
                              targets: [
                                {
                                  key: row.id,
                                  accountCode: row.parentCode,
                                  label: `${row.parentCode} · ${row.name}`,
                                  side: parent?.normalBalance ?? 'debit',
                                  entityType: row.entityType,
                                  entityId: row.entityId,
                                },
                              ],
                            })
                          }}
                        >
                          Opening balance
                        </button>
                      </td>
                    </tr>
                  )
                }

                const { account, depth, hasChildren } = row
                const expanded = !collapsed.has(account.code) || Boolean(matchingCodes)
                return (
                  <tr
                    key={account.id}
                    className={account.isPostable ? undefined : 'coa-header-row'}
                  >
                    <td>
                      <span
                        className="coa-tree-cell"
                        style={{ paddingLeft: `${depth * 16}px` }}
                      >
                        {hasChildren ? (
                          <button
                            type="button"
                            className="coa-toggle"
                            aria-label={expanded ? 'Collapse' : 'Expand'}
                            onClick={() => toggleCollapse(account.code)}
                          >
                            {expanded ? '▾' : '▸'}
                          </button>
                        ) : (
                          <span className="coa-toggle-spacer" />
                        )}
                        <span className="coa-code">{account.code}</span>
                      </span>
                    </td>
                    <td>
                      {account.name}
                      {PARTY_CONTROL_ACCOUNTS[account.code] ? (
                        <span className="muted">
                          {' '}
                          · {PARTY_CONTROL_ACCOUNTS[account.code]?.label}
                        </span>
                      ) : null}
                    </td>
                    <td>{ACCOUNT_TYPE_LABEL[account.type]}</td>
                    <td>
                      {account.isPostable ? (
                        <span className="status-pill status-posted">Postable</span>
                      ) : (
                        <span className="status-pill status-draft">Header</span>
                      )}
                    </td>
                    <td>{account.isActive ? 'Active' : 'Inactive'}</td>
                    <td>
                      <div className="table-actions">
                        {canPostOpening(account) ? (
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => openAccountOpening(account)}
                          >
                            Opening balance
                          </button>
                        ) : null}
                        <ActionMenu
                          disabled={busyId === account.id}
                          items={[
                            {
                              label: 'Edit',
                              onSelect: () => openEdit(account),
                            },
                            {
                              label: 'Ledger',
                              onSelect: () => {
                                window.location.assign(
                                  `/ledgers/${encodeURIComponent(account.code)}`,
                                )
                              },
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
                      </div>
                    </td>
                  </tr>
                )
              })}
              {treeRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
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
              Type
              <Select
                value={type}
                onChange={(value) => {
                  const nextType = value as Account['type']
                  setType(nextType)
                  setParentCode('')
                  void refreshSuggestedCode(nextType, '')
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
                onChange={(value) => {
                  setParentCode(value)
                  void refreshSuggestedCode(type, value)
                }}
                options={parentOptions}
                searchable
                placeholder="None (top level)"
              />
            </label>
            <label>
              Code (auto)
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
              />
            </label>
            <p className="muted">
              Suggested sequentially from existing codes. You can override if
              needed.
            </p>
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Description
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label>
              Opening balance (optional)
              <input
                inputMode="decimal"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                placeholder="Leave blank for zero"
              />
            </label>
            <p className="muted">
              For existing accounts, customers or suppliers, use the Opening
              balance button in the tree.
            </p>
            <div className="form-actions">
              <button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Add'}
              </button>
            </div>
            {error ? <p className="form-error">{error}</p> : null}
          </form>
        )}
      </Modal>

      <AccountOpeningModal
        request={opening}
        onClose={() => setOpening(null)}
        onPosted={(text) => {
          setOpening(null)
          setMessage(text)
        }}
      />
    </>
  )
}
