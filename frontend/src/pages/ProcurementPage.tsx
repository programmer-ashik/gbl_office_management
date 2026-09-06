import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { MetricCard } from '../components/MetricCard'
import { Modal, Select } from '../components/ui'
import { money } from '../types/accounting'
import { Role } from '../types/auth'
import type { Project } from '../types/project'
import {
  PO_STATUS_LABEL,
  PURCHASE_DESTINATION_LABEL,
  PurchaseDestination,
  type Item,
  type PurchaseOrder,
  type Supplier,
  type Warehouse,
} from '../types/procurement'

export function ProcurementPage() {
  const { user } = useAuth()
  const isFinance = user?.role === Role.ADMIN || user?.role === Role.ACCOUNTANT
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [supplierName, setSupplierName] = useState('')
  const [sku, setSku] = useState('')
  const [itemName, setItemName] = useState('')
  const [unit, setUnit] = useState('bag')
  const [supplierId, setSupplierId] = useState('')
  const [destination, setDestination] =
    useState<(typeof PurchaseDestination)[keyof typeof PurchaseDestination]>(
      PurchaseDestination.WAREHOUSE,
    )
  const [projectId, setProjectId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [itemId, setItemId] = useState('')
  const [quantity, setQuantity] = useState('10')
  const [unitCost, setUnitCost] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [supplierModalOpen, setSupplierModalOpen] = useState(false)
  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [poModalOpen, setPoModalOpen] = useState(false)

  async function load() {
    const [vendorRows, itemRows, warehouseRows, orderRows] = await Promise.all([
      api.suppliers(),
      api.items(),
      api.warehouses(),
      api.purchaseOrders(),
    ])
    setSuppliers(vendorRows)
    setItems(itemRows)
    setWarehouses(warehouseRows)
    setOrders(orderRows)
    if (!supplierId && vendorRows[0]) setSupplierId(vendorRows[0].id)
    if (!itemId && itemRows[0]) setItemId(itemRows[0].id)
    if (!warehouseId && warehouseRows[0]) setWarehouseId(warehouseRows[0].id)
    if (isFinance || user?.role === Role.PROJECT_MANAGER) {
      const projectRows = await api.projects()
      setProjects(projectRows)
      if (!projectId && projectRows[0]) setProjectId(projectRows[0].id)
    }
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load procurement')
    })
  }, [])

  async function onCreateSupplier(event: FormEvent) {
    event.preventDefault()
    if (!isFinance) return
    setSaving(true)
    setError(null)
    try {
      await api.createSupplier({ name: supplierName })
      setSupplierName('')
      setSupplierModalOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create supplier')
    } finally {
      setSaving(false)
    }
  }

  async function onCreateItem(event: FormEvent) {
    event.preventDefault()
    if (!isFinance) return
    setSaving(true)
    setError(null)
    try {
      const created = await api.createItem({ sku, name: itemName, unit })
      setSku('')
      setItemName('')
      setItemModalOpen(false)
      setItemId(created.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create item')
    } finally {
      setSaving(false)
    }
  }

  async function onCreatePo(event: FormEvent) {
    event.preventDefault()
    if (!supplierId || !itemId) return
    if (destination === PurchaseDestination.DIRECT_TO_SITE && !projectId) return
    if (destination === PurchaseDestination.WAREHOUSE && !warehouseId) return
    setSaving(true)
    setError(null)
    try {
      await api.createPurchaseOrder({
        supplierId,
        destination,
        date,
        projectId:
          destination === PurchaseDestination.DIRECT_TO_SITE ? projectId : undefined,
        warehouseId:
          destination === PurchaseDestination.WAREHOUSE ? warehouseId : undefined,
        lines: [{ itemId, quantity: Number(quantity), unitCost: Number(unitCost) }],
      })
      setUnitCost('')
      setPoModalOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create purchase order')
    } finally {
      setSaving(false)
    }
  }

  const anyModalOpen = supplierModalOpen || itemModalOpen || poModalOpen

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Suppliers, POs & material allocation</h1>
        </div>
        <div className="form-actions">
          <Link to="/inventory" className="ghost-link">
            Inventory
          </Link>
          {isFinance ? (
            <>
              <button
                type="button"
                className="ghost"
                onClick={() => setSupplierModalOpen(true)}
              >
                Add supplier
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setItemModalOpen(true)}
              >
                Add item
              </button>
            </>
          ) : null}
          <button type="button" onClick={() => setPoModalOpen(true)}>
            Add purchase order
          </button>
        </div>
      </header>

      {isFinance ? (
        <section className="grid metric-card-grid">
          <MetricCard
            variant="amber"
            title="Open payables"
            value={money(
              orders.reduce((sum, row) => sum + row.outstandingPayable, 0),
            )}
            meta="Received less vendor returns"
          />
        </section>
      ) : null}

      <Modal
        open={supplierModalOpen}
        title="New supplier"
        onClose={() => setSupplierModalOpen(false)}
      >
        <form className="stack-form" onSubmit={(event) => void onCreateSupplier(event)}>
          <label>
            Name
            <input
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              required
              minLength={2}
            />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              Add supplier
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </Modal>

      <Modal
        open={itemModalOpen}
        title="New item"
        onClose={() => setItemModalOpen(false)}
      >
        <form className="stack-form" onSubmit={(event) => void onCreateItem(event)}>
          <label>
            SKU
            <input value={sku} onChange={(e) => setSku(e.target.value)} required />
          </label>
          <label>
            Name
            <input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              required
            />
          </label>
          <label>
            Unit
            <input value={unit} onChange={(e) => setUnit(e.target.value)} required />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              Add item
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </Modal>

      <Modal
        open={poModalOpen}
        title="New purchase order"
        description="Direct to site costs the project on receipt. Warehouse receipts sit in inventory (1141) until issued."
        onClose={() => setPoModalOpen(false)}
        wide
      >
        <form className="stack-form" onSubmit={(event) => void onCreatePo(event)}>
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
                placeholder="Select supplier"
                required
              />
            </label>
            <label>
              Destination
              <Select
                value={destination}
                onChange={(value) => setDestination(value as typeof destination)}
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
                placeholder="Select project"
                required
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
                placeholder="Select warehouse"
                required
              />
            </label>
          )}
          <div className="name-row">
            <label>
              Item
              <Select
                value={itemId}
                onChange={setItemId}
                options={items.map((row) => ({
                  value: row.id,
                  label: `${row.sku} · ${row.name} (${row.unit})`,
                }))}
                placeholder="Select item"
                required
              />
            </label>
            <label>
              Quantity
              <input
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </label>
            <label>
              Unit cost
              <input
                inputMode="decimal"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                required
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" disabled={saving || !supplierId || !itemId}>
              {saving ? 'Saving…' : 'Create purchase order'}
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </Modal>

      <section className="table-card">
        <h2>Purchase orders</h2>
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Supplier</th>
              <th>Destination</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link to={`/procurement/${row.id}`}>{row.poNumber}</Link>
                </td>
                <td>
                  {isFinance ? (
                    <Link to={`/suppliers/${row.supplierId}`}>{row.supplierName}</Link>
                  ) : (
                    row.supplierName
                  )}
                </td>
                <td>
                  {PURCHASE_DESTINATION_LABEL[row.destination]}
                  {row.projectCode ? ` · ${row.projectCode}` : ''}
                  {row.warehouseCode ? ` · ${row.warehouseCode}` : ''}
                </td>
                <td>{money(row.orderedAmount)}</td>
                <td>
                  <span className={`status-pill status-${row.status}`}>
                    {PO_STATUS_LABEL[row.status]}
                  </span>
                </td>
              </tr>
            ))}
            {orders.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No purchase orders yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="table-card">
        <h2>Items</h2>
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Unit</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id}>
                <td>{row.sku}</td>
                <td>{row.name}</td>
                <td>{row.unit}</td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={3} className="muted">
                  No items yet. Use Add item to create a catalog SKU.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="table-card">
        <h2>Suppliers</h2>
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Name</th>
              <th>Terms</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((row) => (
              <tr key={row.id}>
                <td>
                  {isFinance ? (
                    <Link to={`/suppliers/${row.id}`}>{row.supplierNumber}</Link>
                  ) : (
                    row.supplierNumber
                  )}
                </td>
                <td>{row.name}</td>
                <td>{row.paymentTermsDays} days</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {!anyModalOpen && error ? <p className="form-error">{error}</p> : null}
    </>
  )
}
