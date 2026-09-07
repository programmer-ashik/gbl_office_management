import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Select } from '../components/ui'
import { Role } from '../types/auth'
import type { Project } from '../types/project'
import {
  PURCHASE_DESTINATION_LABEL,
  PurchaseDestination,
  type Item,
  type Supplier,
  type Warehouse,
} from '../types/procurement'

type PoLine = {
  key: string
  itemId: string
  quantity: string
  unitCost: string
}

export function PurchaseOrderCreatePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const canCreate =
    user?.role === Role.ADMIN ||
    user?.role === Role.ACCOUNTANT ||
    user?.role === Role.PROJECT_MANAGER

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [supplierId, setSupplierId] = useState('')
  const [destination, setDestination] = useState<
    (typeof PurchaseDestination)[keyof typeof PurchaseDestination]
  >(PurchaseDestination.WAREHOUSE)
  const [projectId, setProjectId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [poLines, setPoLines] = useState<PoLine[]>([
    { key: '1', itemId: '', quantity: '1', unitCost: '' },
  ])
  const [itemSearch, setItemSearch] = useState('')

  useEffect(() => {
    if (!canCreate) return
    Promise.all([
      api.suppliers(),
      api.items(),
      api.warehouses(),
      api.projects().catch(() => [] as Project[]),
    ])
      .then(([vendorRows, itemRows, warehouseRows, projectRows]) => {
        setSuppliers(vendorRows)
        setItems(itemRows)
        setWarehouses(warehouseRows)
        setProjects(projectRows)
        if (vendorRows[0]) setSupplierId(vendorRows[0].id)
        if (warehouseRows[0]) setWarehouseId(warehouseRows[0].id)
        if (projectRows[0]) setProjectId(projectRows[0].id)
        if (itemRows[0]) {
          setPoLines([
            {
              key: String(Date.now()),
              itemId: itemRows[0].id,
              quantity: '1',
              unitCost: '',
            },
          ])
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load form data')
      })
  }, [canCreate])

  const itemOptions = useMemo(() => {
    const q = itemSearch.trim().toLowerCase()
    const list = !q
      ? items
      : items.filter(
          (row) =>
            row.sku.toLowerCase().includes(q) ||
            row.name.toLowerCase().includes(q),
        )
    return list.map((row) => ({
      value: row.id,
      label: `${row.sku} · ${row.name} (${row.unit})`,
    }))
  }, [items, itemSearch])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canCreate) return
    const lines = poLines
      .filter(
        (line) =>
          line.itemId && Number(line.quantity) > 0 && Number(line.unitCost) > 0,
      )
      .map((line) => ({
        itemId: line.itemId,
        quantity: Number(line.quantity),
        unitCost: Number(line.unitCost),
      }))
    if (!supplierId || lines.length === 0) {
      setError('Add at least one line with product, qty, and unit cost')
      return
    }
    if (destination === PurchaseDestination.DIRECT_TO_SITE && !projectId) {
      setError('Select a project for direct-to-site')
      return
    }
    if (destination === PurchaseDestination.WAREHOUSE && !warehouseId) {
      setError('Select a warehouse')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const created = await api.createPurchaseOrder({
        supplierId,
        destination,
        date,
        notes: notes.trim() || undefined,
        projectId:
          destination === PurchaseDestination.DIRECT_TO_SITE
            ? projectId
            : undefined,
        warehouseId:
          destination === PurchaseDestination.WAREHOUSE
            ? warehouseId
            : undefined,
        lines,
      })
      navigate(`/procurement/${created.id}`)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to create purchase order',
      )
    } finally {
      setSaving(false)
    }
  }

  if (!canCreate) {
    return (
      <section className="table-card">
        <p className="form-error">You cannot create purchase orders.</p>
      </section>
    )
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>New purchase order</h1>
          <p className="muted">
            Select existing catalog products. Warehouse receive increases stock
            lots; direct-to-site costs the project on receipt.
          </p>
        </div>
        <Link to="/procurement" className="ghost-link">
          Back to POs
        </Link>
      </header>

      <section className="table-card">
        <form className="stack-form po-create-form" onSubmit={(e) => void onSubmit(e)}>
          <div className="name-row">
            <label>
              Supplier
              <Select
                value={supplierId}
                onChange={setSupplierId}
                options={suppliers.map((row) => ({
                  value: row.id,
                  label: `${row.supplierNumber} · ${row.name}`,
                }))}
                searchable
                portal
                placeholder="Select supplier"
              />
            </label>
            <label>
              Destination
              <Select
                value={destination}
                onChange={(value) =>
                  setDestination(value as typeof destination)
                }
                options={Object.values(PurchaseDestination).map((value) => ({
                  value,
                  label: PURCHASE_DESTINATION_LABEL[value],
                }))}
              />
            </label>
            <label>
              Date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>
          </div>

          <div className="name-row">
            {destination === PurchaseDestination.DIRECT_TO_SITE ? (
              <label>
                Project
                <Select
                  value={projectId}
                  onChange={setProjectId}
                  options={projects.map((row) => ({
                    value: row.id,
                    label: `${row.code} · ${row.name}`,
                  }))}
                  searchable
                  portal
                  placeholder="Select project"
                />
              </label>
            ) : (
              <label>
                Warehouse
                <Select
                  value={warehouseId}
                  onChange={setWarehouseId}
                  options={warehouses.map((row) => ({
                    value: row.id,
                    label: `${row.code} · ${row.name}`,
                  }))}
                  searchable
                  portal
                  placeholder="Select warehouse"
                />
              </label>
            )}
            <label>
              Notes
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>

          <div className="po-lines-block">
            <div className="table-head">
              <h2>Line items</h2>
              <p className="muted">
                Search and pick existing SKUs. Repeat buys top up the same
                product stock on warehouse receive.
              </p>
            </div>
            <label className="po-item-search">
              Filter products
              <input
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder="Search SKU or name…"
              />
            </label>

            {poLines.map((line, index) => (
              <div key={line.key} className="po-line-card">
                <label>
                  Existing product
                  <Select
                    value={line.itemId}
                    onChange={(value) =>
                      setPoLines((prev) =>
                        prev.map((row) =>
                          row.key === line.key
                            ? { ...row, itemId: value }
                            : row,
                        ),
                      )
                    }
                    options={itemOptions}
                    searchable
                    portal
                    placeholder="Search SKU / name"
                  />
                </label>
                <div className="name-row">
                  <label>
                    Quantity
                    <input
                      type="number"
                      min={0.001}
                      step="any"
                      value={line.quantity}
                      onChange={(e) =>
                        setPoLines((prev) =>
                          prev.map((row) =>
                            row.key === line.key
                              ? { ...row, quantity: e.target.value }
                              : row,
                          ),
                        )
                      }
                      required
                    />
                  </label>
                  <label>
                    Unit cost
                    <input
                      type="number"
                      min={0.01}
                      step="0.01"
                      value={line.unitCost}
                      onChange={(e) =>
                        setPoLines((prev) =>
                          prev.map((row) =>
                            row.key === line.key
                              ? { ...row, unitCost: e.target.value }
                              : row,
                          ),
                        )
                      }
                      required
                    />
                  </label>
                  <div className="po-line-actions">
                    {poLines.length > 1 ? (
                      <button
                        type="button"
                        className="ghost journal-line-remove"
                        aria-label={`Remove line ${index + 1}`}
                        title="Remove line"
                        onClick={() =>
                          setPoLines((prev) =>
                            prev.filter((row) => row.key !== line.key),
                          )
                        }
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <path d="M3 6h18" />
                          <path d="M8 6V4h8v2" />
                          <path d="M19 6l-1 14H6L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="ghost"
              onClick={() =>
                setPoLines((prev) => [
                  ...prev,
                  {
                    key: String(Date.now()),
                    itemId: items[0]?.id ?? '',
                    quantity: '1',
                    unitCost: '',
                  },
                ])
              }
            >
              + Add line
            </button>
          </div>

          <div className="form-actions">
            <button type="submit" disabled={saving || !supplierId}>
              {saving ? 'Saving…' : 'Create purchase order'}
            </button>
            <Link to="/procurement" className="ghost-link">
              Cancel
            </Link>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </section>
    </>
  )
}
