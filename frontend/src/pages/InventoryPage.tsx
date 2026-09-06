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
  qty,
  type Item,
  type StockIssue,
  type StockRow,
  type Warehouse,
} from '../types/procurement'

export function InventoryPage() {
  const { user } = useAuth()
  const isFinance = user?.role === Role.ADMIN || user?.role === Role.ACCOUNTANT
  const [items, setItems] = useState<Item[]>([])
  const [stock, setStock] = useState<StockRow[]>([])
  const [issues, setIssues] = useState<StockIssue[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [warehouseId, setWarehouseId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [itemId, setItemId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [sku, setSku] = useState('')
  const [itemName, setItemName] = useState('')
  const [unit, setUnit] = useState('bag')
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [countryOfOrigin, setCountryOfOrigin] = useState('')
  const [technicalSpecification, setTechnicalSpecification] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [itemModalOpen, setItemModalOpen] = useState(false)

  async function load() {
    const [itemRows, rows, issueRows, warehouseRows, projectRows] =
      await Promise.all([
        api.items(),
        api.inventory(),
        api.stockIssues(),
        api.warehouses(),
        api.projects(),
      ])
    const catalog = Array.isArray(itemRows) ? itemRows : []
    const onHand = Array.isArray(rows) ? rows : []
    const issueList = Array.isArray(issueRows) ? issueRows : []
    const warehouseList = Array.isArray(warehouseRows) ? warehouseRows : []
    const projectList = Array.isArray(projectRows) ? projectRows : []

    setItems(catalog)
    setStock(onHand)
    setIssues(issueList)
    setWarehouses(warehouseList)
    setProjects(projectList)
    if (!warehouseId && warehouseList[0]) setWarehouseId(warehouseList[0].id)
    if (!projectId && projectList[0]) setProjectId(projectList[0].id)
    if (!itemId && onHand[0]) setItemId(onHand[0].itemId)
    else if (!itemId && catalog[0]) setItemId(catalog[0].id)
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load inventory')
    })
  }, [])

  async function onCreateItem(event: FormEvent) {
    event.preventDefault()
    if (!isFinance) return
    setSaving(true)
    setError(null)
    try {
      const created = await api.createItem({
        sku,
        name: itemName,
        unit,
        brand: brand || undefined,
        model: model || undefined,
        countryOfOrigin: countryOfOrigin || undefined,
        technicalSpecification: technicalSpecification || undefined,
      })
      setSku('')
      setItemName('')
      setUnit('bag')
      setBrand('')
      setModel('')
      setCountryOfOrigin('')
      setTechnicalSpecification('')
      setItemModalOpen(false)
      setItemId(created.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create item')
    } finally {
      setSaving(false)
    }
  }

  async function onIssue(event: FormEvent) {
    event.preventDefault()
    if (!warehouseId || !projectId || !itemId) return
    setSaving(true)
    setError(null)
    try {
      await api.issueStock({
        warehouseId,
        projectId,
        date,
        lines: [{ itemId, quantity: Number(quantity) }],
      })
      setQuantity('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to issue stock')
    } finally {
      setSaving(false)
    }
  }

  const totalValue = stock.reduce((sum, row) => sum + row.value, 0)
  const issueItemOptions =
    stock.length > 0
      ? stock.map((row) => ({
          value: row.itemId,
          label: `${row.sku} · ${row.name} (${qty(row.quantity)} ${row.unit})`,
        }))
      : items.map((row) => ({
          value: row.id,
          label: `${row.sku} · ${row.name} (${row.unit})`,
        }))

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Central warehouse</h1>
        </div>
        <div className="form-actions">
          <Link to="/procurement" className="ghost-link">
            Procurement
          </Link>
          {isFinance ? (
            <button type="button" onClick={() => setItemModalOpen(true)}>
              Add item
            </button>
          ) : null}
        </div>
      </header>

      <section className="grid metric-card-grid">
        <MetricCard
          variant="teal"
          title="On-hand value"
          value={money(totalValue)}
          meta="GL 1141 · Inventory"
        />
        <MetricCard
          variant="blue"
          title="SKUs in stock"
          value={stock.length}
          meta="FIFO lots from warehouse receipts"
        />
        <MetricCard
          variant="amber"
          title="Catalog items"
          value={items.length}
          meta="Active SKUs available for POs"
        />
      </section>

      {isFinance ? (
        <Modal
          open={itemModalOpen}
          title="New inventory item"
          description="Adds a catalog SKU. Stock quantity appears after a warehouse PO is received."
          onClose={() => setItemModalOpen(false)}
        >
          <form className="stack-form" onSubmit={(event) => void onCreateItem(event)}>
            <div className="name-row">
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
            </div>
            <div className="name-row">
              <label>
                Unit
                <input value={unit} onChange={(e) => setUnit(e.target.value)} required />
              </label>
              <label>
                Brand
                <input
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="Optional"
                />
              </label>
            </div>
            <div className="name-row">
              <label>
                Model
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Optional"
                />
              </label>
              <label>
                Country of origin
                <input
                  value={countryOfOrigin}
                  onChange={(e) => setCountryOfOrigin(e.target.value)}
                  placeholder="Optional"
                />
              </label>
            </div>
            <label>
              Technical specification
              <textarea
                value={technicalSpecification}
                onChange={(e) => setTechnicalSpecification(e.target.value)}
                rows={3}
                placeholder="Materials, capacity, standards…"
              />
            </label>
            <div className="form-actions">
              <button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Add item'}
              </button>
            </div>
            {error ? <p className="form-error">{error}</p> : null}
          </form>
        </Modal>
      ) : null}

      <section className="table-card">
        <h2>Catalog items</h2>
        <p className="muted">
          Items added here are available on purchase orders. On-hand quantity stays
          at zero until goods are received into a warehouse.
        </p>
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Item</th>
              <th>Brand / Model</th>
              <th>Origin</th>
              <th>Unit</th>
              <th>On hand</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              const onHand = stock
                .filter((s) => s.itemId === row.id)
                .reduce((sum, s) => sum + s.quantity, 0)
              return (
                <tr key={row.id}>
                  <td>{row.sku}</td>
                  <td>
                    <div>{row.name}</div>
                    {row.technicalSpecification ? (
                      <div className="muted" style={{ fontSize: 12 }}>
                        {row.technicalSpecification.slice(0, 80)}
                        {row.technicalSpecification.length > 80 ? '…' : ''}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    {[row.brand, row.model].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td>{row.countryOfOrigin || '—'}</td>
                  <td>{row.unit}</td>
                  <td>
                    {onHand > 0 ? `${qty(onHand)} ${row.unit}` : '—'}
                  </td>
                </tr>
              )
            })}
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No catalog items yet. Use Add item to create one.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {isFinance ? (
        <section className="table-card">
          <h2>Issue to project</h2>
          <p className="muted">
            Moves warehouse stock to project materials (Dr 5110 / Cr 1141). Direct
            site deliveries never pass through this screen.
          </p>
          <form className="stack-form" onSubmit={(event) => void onIssue(event)}>
            <div className="name-row">
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
              <label>
                Item
                <Select
                  value={itemId}
                  onChange={setItemId}
                  options={issueItemOptions}
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
            </div>
            <div className="form-actions">
              <button
                type="submit"
                disabled={saving || stock.length === 0 || !warehouseId || !projectId || !itemId}
              >
                {saving ? 'Posting…' : 'Issue to project'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="table-card">
        <h2>On hand</h2>
        <table>
          <thead>
            <tr>
              <th>Warehouse</th>
              <th>SKU</th>
              <th>Item</th>
              <th>Qty</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {stock.map((row) => (
              <tr key={`${row.warehouseId}-${row.itemId}`}>
                <td>
                  {row.warehouseCode} · {row.warehouseName}
                </td>
                <td>{row.sku}</td>
                <td>{row.name}</td>
                <td>
                  {qty(row.quantity)} {row.unit}
                </td>
                <td>{money(row.value)}</td>
              </tr>
            ))}
            {stock.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  Warehouse is empty. Receive a warehouse PO first.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="table-card">
        <h2>Issues</h2>
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Date</th>
              <th>Project</th>
              <th>Item</th>
              <th>Qty</th>
              <th>Amount</th>
              <th>Journal</th>
            </tr>
          </thead>
          <tbody>
            {issues.flatMap((row) => {
              const lines =
                row.lines?.length > 0
                  ? row.lines
                  : [
                      {
                        sku: '—',
                        name: '—',
                        unit: '',
                        quantity: row.quantity ?? 0,
                        amount: row.amount,
                      },
                    ]
              return lines.map((line, index) => (
                <tr key={`${row.id}-${index}`}>
                  <td>{index === 0 ? row.issueNumber : ''}</td>
                  <td>{index === 0 ? row.date.slice(0, 10) : ''}</td>
                  <td>
                  {index === 0
                    ? row.projectId
                      ? (
                          <Link to={`/projects/${row.projectId}`}>
                            {row.projectCode} · {row.projectName}
                          </Link>
                        )
                      : (
                          `${row.projectCode} · ${row.projectName}`
                        )
                    : ''}
                </td>
                  <td>
                    {line.sku} · {line.name}
                  </td>
                  <td>
                    {qty(line.quantity)}
                    {line.unit ? ` ${line.unit}` : ''}
                  </td>
                  <td>{money(line.amount)}</td>
                  <td>{index === 0 ? row.journalNumber : ''}</td>
                </tr>
              ))
            })}
            {issues.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  No stock issues yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {!itemModalOpen && error ? <p className="form-error">{error}</p> : null}
    </>
  )
}
