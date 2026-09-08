import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Select } from '../components/ui'
import { money } from '../types/accounting'
import { Role } from '../types/auth'
import type { Project } from '../types/project'
import {
  PURCHASE_DESTINATION_LABEL,
  PurchaseDestination,
  type Supplier,
  type Warehouse,
} from '../types/procurement'
import {
  clearPoCreateDraft,
  clearPoProductSelection,
  readPoCreateDraft,
  readPoProductSelection,
  writePoCreateDraft,
  type PoSelectedProduct,
} from '../utils/poProductSelection'

type PoLine = {
  key: string
  itemId: string
  productName: string
  quantity: string
  unitCost: string
}

function emptyLine(product?: PoSelectedProduct): PoLine {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    itemId: product?.productId ?? '',
    productName: product?.productName ?? '',
    quantity: '1',
    unitCost:
      product?.unitPrice != null && product.unitPrice > 0
        ? String(product.unitPrice)
        : '',
  }
}

export function PurchaseOrderCreatePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const canCreate =
    user?.role === Role.ADMIN ||
    user?.role === Role.ACCOUNTANT ||
    user?.role === Role.PROJECT_MANAGER

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
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
  const [poLines, setPoLines] = useState<PoLine[]>([emptyLine()])

  useEffect(() => {
    if (!canCreate) return
    Promise.all([
      api.suppliers(),
      api.warehouses(),
      api.projects().catch(() => [] as Project[]),
    ])
      .then(([vendorRows, warehouseRows, projectRows]) => {
        setSuppliers(vendorRows)
        setWarehouses(warehouseRows)
        setProjects(projectRows)

        const draft = readPoCreateDraft()
        if (draft) {
          setSupplierId(draft.supplierId || vendorRows[0]?.id || '')
          if (
            draft.destination === PurchaseDestination.WAREHOUSE ||
            draft.destination === PurchaseDestination.DIRECT_TO_SITE
          ) {
            setDestination(draft.destination)
          }
          setProjectId(draft.projectId || projectRows[0]?.id || '')
          setWarehouseId(draft.warehouseId || warehouseRows[0]?.id || '')
          setDate(draft.date || new Date().toISOString().slice(0, 10))
          setNotes(draft.notes || '')
        } else {
          if (vendorRows[0]) setSupplierId(vendorRows[0].id)
          if (warehouseRows[0]) setWarehouseId(warehouseRows[0].id)
          if (projectRows[0]) setProjectId(projectRows[0].id)
        }

        let nextLines =
          draft?.lines?.length && draft.lines.length > 0
            ? draft.lines.map((row) => ({
                key: row.key,
                itemId: row.itemId,
                productName: row.productName || '',
                quantity: row.quantity,
                unitCost: row.unitCost,
              }))
            : [emptyLine()]

        const payload = readPoProductSelection()
        if (payload?.products?.length) {
          const blankOnly =
            nextLines.length === 1 &&
            !nextLines[0]?.itemId &&
            !nextLines[0]?.productName
          const base = blankOnly ? [] : nextLines
          const existing = new Set(base.map((row) => row.itemId).filter(Boolean))
          const additions = payload.products
            .filter((row) => !existing.has(row.productId))
            .map((row) => emptyLine(row))
          nextLines = [...base, ...additions]
          clearPoProductSelection()
          writePoCreateDraft({
            supplierId: draft?.supplierId || vendorRows[0]?.id || '',
            destination: draft?.destination || PurchaseDestination.WAREHOUSE,
            projectId: draft?.projectId || projectRows[0]?.id || '',
            warehouseId: draft?.warehouseId || warehouseRows[0]?.id || '',
            date: draft?.date || new Date().toISOString().slice(0, 10),
            notes: draft?.notes || '',
            lines: nextLines,
          })
        }

        setPoLines(nextLines.length > 0 ? nextLines : [emptyLine()])
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load form data')
      })
  }, [canCreate])

  function openProductPicker() {
    writePoCreateDraft({
      supplierId,
      destination,
      projectId,
      warehouseId,
      date,
      notes,
      lines: poLines,
    })
    navigate('/procurement/products/select')
  }

  const previewTotals = useMemo(() => {
    const subTotal = poLines.reduce((sum, line) => {
      const qty = Number(line.quantity) || 0
      const cost = Number(line.unitCost) || 0
      return sum + qty * cost
    }, 0)
    return { subTotal: Number(subTotal.toFixed(2)) }
  }, [poLines])

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
      clearPoCreateDraft()
      clearPoProductSelection()
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
        <form
          className="stack-form stack-form-compact quotation-create-form"
          onSubmit={(e) => void onSubmit(e)}
        >
          <div className="filter-grid-2">
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
            <div className="form-actions compact-actions filter-actions">
              <button
                type="button"
                className="ghost"
                onClick={openProductPicker}
              >
                Add products
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setPoLines((prev) => [...prev, emptyLine()])}
              >
                + Line
              </button>
            </div>
          </div>

          <div className="journal-lines-scroll quotation-table-desktop">
            <table className="journal-lines-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Qty</th>
                  <th className="num">Unit cost</th>
                  <th className="num">Line total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {poLines.map((line) => (
                  <tr key={line.key}>
                    <td>
                      <input
                        value={line.productName}
                        onChange={(e) =>
                          setPoLines((prev) =>
                            prev.map((row) =>
                              row.key === line.key
                                ? { ...row, productName: e.target.value }
                                : row,
                            ),
                          )
                        }
                        placeholder="Product name"
                        readOnly={Boolean(line.itemId)}
                        required
                      />
                    </td>
                    <td>
                      <input
                        className="inv-num"
                        inputMode="decimal"
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
                    </td>
                    <td>
                      <input
                        className="inv-num"
                        inputMode="decimal"
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
                    </td>
                    <td className="num">
                      {money(
                        (Number(line.quantity) || 0) *
                          (Number(line.unitCost) || 0),
                      )}
                    </td>
                    <td>
                      {poLines.length > 1 ? (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() =>
                            setPoLines((prev) =>
                              prev.filter((row) => row.key !== line.key),
                            )
                          }
                        >
                          Remove
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="quotation-cards-mobile">
            {poLines.map((line) => (
              <article key={line.key} className="quotation-line-card">
                <label>
                  Product
                  <input
                    value={line.productName}
                    onChange={(e) =>
                      setPoLines((prev) =>
                        prev.map((row) =>
                          row.key === line.key
                            ? { ...row, productName: e.target.value }
                            : row,
                        ),
                      )
                    }
                    placeholder="Product name"
                    readOnly={Boolean(line.itemId)}
                    required
                  />
                </label>
                <div className="name-row">
                  <label>
                    Qty
                    <input
                      inputMode="decimal"
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
                      inputMode="decimal"
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
                </div>
                <p>
                  Line total{' '}
                  <strong>
                    {money(
                      (Number(line.quantity) || 0) *
                        (Number(line.unitCost) || 0),
                    )}
                  </strong>
                </p>
                {poLines.length > 1 ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      setPoLines((prev) =>
                        prev.filter((row) => row.key !== line.key),
                      )
                    }
                  >
                    Remove
                  </button>
                ) : null}
              </article>
            ))}
          </div>

          <label>
            Notes
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          <p className="muted">
            Subtotal <strong>{money(previewTotals.subTotal)}</strong>
          </p>

          <div className="form-actions">
            <button type="submit" disabled={saving || !supplierId}>
              {saving ? 'Saving…' : 'Create purchase order'}
            </button>
            <Link
              to="/procurement"
              className="ghost-link"
              onClick={() => {
                clearPoCreateDraft()
                clearPoProductSelection()
              }}
            >
              Cancel
            </Link>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </section>
    </>
  )
}
