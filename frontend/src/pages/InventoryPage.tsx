import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Select } from '../components/ui'
import { money } from '../types/accounting'
import { Role } from '../types/auth'
import type { Project } from '../types/project'
import { qty, type StockIssue, type StockRow, type Warehouse } from '../types/procurement'
import { MetricCard } from '../components/MetricCard'

export function InventoryPage() {
  const { user } = useAuth()
  const isFinance = user?.role === Role.ADMIN || user?.role === Role.ACCOUNTANT
  const [stock, setStock] = useState<StockRow[]>([])
  const [issues, setIssues] = useState<StockIssue[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [warehouseId, setWarehouseId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [itemId, setItemId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    const [rows, issueRows, warehouseRows, projectRows] = await Promise.all([
      api.inventory(),
      api.stockIssues(),
      api.warehouses(),
      api.projects(),
    ])
    setStock(rows)
    setIssues(issueRows)
    setWarehouses(warehouseRows)
    setProjects(projectRows)
    if (!warehouseId && warehouseRows[0]) setWarehouseId(warehouseRows[0].id)
    if (!projectId && projectRows[0]) setProjectId(projectRows[0].id)
    if (!itemId && rows[0]) setItemId(rows[0].itemId)
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load inventory')
    })
  }, [])

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

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Central warehouse</h1>
        </div>
        <Link to="/procurement" className="ghost-link">
          Procurement
        </Link>
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
                  options={stock.map((row) => ({
                    value: row.itemId,
                    label: `${row.sku} · ${row.name} (${qty(row.quantity)} ${row.unit})`,
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
              <th>Project</th>
              <th>Amount</th>
              <th>Journal</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((row) => (
              <tr key={row.id}>
                <td>{row.issueNumber}</td>
                <td>
                  {row.projectCode} · {row.projectName}
                </td>
                <td>{money(row.amount)}</td>
                <td>{row.journalNumber}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {error ? <p className="form-error">{error}</p> : null}
    </>
  )
}
