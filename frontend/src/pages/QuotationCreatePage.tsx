import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { canCreateQuotation } from '../auth/permissions'
import { Select } from '../components/ui'
import { money } from '../types/accounting'
import type { Customer } from '../types/accounting'
import type { Project } from '../types/project'
import type { Supplier } from '../types/procurement'
import {
  QUOTATION_STATUS_LABEL,
  QuotationStatus,
  lineTotalPreview,
  type Quotation,
} from '../types/quotation'
import { downloadQuotationPdf } from '../utils/quotationPdf'
import {
  clearQuotationProductSelection,
  readQuotationProductSelection,
  QUOTATION_PRODUCT_SELECTION_KEY,
  type QuotationSelectedProduct,
} from '../utils/quotationProductSelection'

type DraftLine = {
  key: string
  productId: string
  productName: string
  unitPrice: string
  quantity: string
  discount: string
}

function emptyLine(product?: QuotationSelectedProduct): DraftLine {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    productId: product?.productId ?? '',
    productName: product?.productName ?? '',
    unitPrice:
      product?.unitPrice != null ? String(product.unitPrice) : '',
    quantity: '1',
    discount: '0',
  }
}

export function QuotationCreatePage() {
  const { id } = useParams()
  const isDetail = Boolean(id)
  const { user } = useAuth()
  const navigate = useNavigate()
  const canCreate = canCreateQuotation(user?.role)

  const [projects, setProjects] = useState<Project[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [saved, setSaved] = useState<Quotation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [partyType, setPartyType] = useState<
    'supplier' | 'customer' | 'new_customer'
  >('customer')
  const [partyId, setPartyId] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientCompany, setClientCompany] = useState('')
  const [projectId, setProjectId] = useState('')
  const [taxRate, setTaxRate] = useState('0')
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState(
    'Prices are valid for 30 days. Payment terms as agreed.',
  )
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()])

  useEffect(() => {
    if (!canCreate) return
    Promise.all([
      api.projects().catch(() => [] as Project[]),
      api.customers(true).catch(() => [] as Customer[]),
      api.suppliers().catch(() => [] as Supplier[]),
    ]).then(([projectRows, customerRows, supplierRows]) => {
      setProjects(projectRows)
      setCustomers(customerRows)
      setSuppliers(supplierRows)
    })
  }, [canCreate])

  function applyParty(nextType: typeof partyType, nextId: string) {
    setPartyType(nextType)
    setPartyId(nextId)
    if (nextType === 'new_customer') {
      setClientName('')
      setClientPhone('')
      setClientCompany('')
      return
    }
    if (nextType === 'customer') {
      const row = customers.find((c) => c.id === nextId)
      if (row) {
        setClientName(row.name)
        setClientPhone(row.phone ?? '')
        setClientCompany(row.name)
      }
      return
    }
    const row = suppliers.find((s) => s.id === nextId)
    if (row) {
      setClientName(row.name)
      setClientPhone(row.phone ?? '')
      setClientCompany(row.name)
    }
  }

  useEffect(() => {
    if (!id || !canCreate) return
    api
      .quotation(id)
      .then(setSaved)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load quotation')
      })
  }, [id, canCreate])

  function mergeSelectedProducts(products: QuotationSelectedProduct[]) {
    if (products.length === 0) return
    setLines((prev) => {
      const blankOnly =
        prev.length === 1 && !prev[0]?.productId && !prev[0]?.productName
      const base = blankOnly ? [] : prev
      const existing = new Set(
        base.map((row) => row.productId).filter(Boolean),
      )
      const additions = products
        .filter((row) => !existing.has(row.productId))
        .map((row) => emptyLine(row))
      return [...base, ...additions]
    })
    clearQuotationProductSelection()
  }

  useEffect(() => {
    if (isDetail || !canCreate) return

    function consumeSelection() {
      const payload = readQuotationProductSelection()
      if (!payload?.products?.length) return
      mergeSelectedProducts(payload.products)
    }

    consumeSelection()

    function onStorage(event: StorageEvent) {
      if (event.key === QUOTATION_PRODUCT_SELECTION_KEY) {
        consumeSelection()
      }
    }
    function onFocus() {
      consumeSelection()
    }

    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', onFocus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDetail, canCreate])

  const previewTotals = useMemo(() => {
    const subTotal = lines.reduce(
      (sum, line) =>
        sum +
        lineTotalPreview(
          Number(line.unitPrice) || 0,
          Number(line.quantity) || 0,
          Number(line.discount) || 0,
        ),
      0,
    )
    const tax = Number(
      ((subTotal * (Number(taxRate) || 0)) / 100).toFixed(2),
    )
    return {
      subTotal: Number(subTotal.toFixed(2)),
      tax,
      grandTotal: Number((subTotal + tax).toFixed(2)),
    }
  }, [lines, taxRate])

  function openProductPicker() {
    window.open(
      '/quotations/products/select',
      '_blank',
      'noopener,noreferrer',
    )
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canCreate || isDetail) return
    const payloadLines = lines
      .filter(
        (line) =>
          line.productName.trim() &&
          Number(line.quantity) > 0 &&
          Number(line.unitPrice) >= 0,
      )
      .map((line) => ({
        productId: line.productId || undefined,
        productName: line.productName.trim(),
        unitPrice: Number(line.unitPrice) || 0,
        quantity: Number(line.quantity) || 0,
        discount: Number(line.discount) || 0,
      }))
    if (!clientName.trim() || payloadLines.length === 0) {
      setError(
        !clientName.trim()
          ? partyType === 'new_customer'
            ? 'Enter the new customer name'
            : 'Select a customer or supplier'
          : 'Add at least one product line',
      )
      return
    }
    if (partyType !== 'new_customer' && !partyId) {
      setError(
        partyType === 'customer'
          ? 'Select a customer'
          : 'Select a supplier',
      )
      return
    }
    setSaving(true)
    setError(null)
    try {
      const created = await api.createQuotation({
        projectId: projectId || undefined,
        clientInfo: {
          name: clientName.trim(),
          phone: clientPhone.trim() || undefined,
          company: clientCompany.trim() || undefined,
        },
        items: payloadLines,
        taxRate: Number(taxRate) || 0,
        notes: notes.trim() || undefined,
        terms: terms.trim() || undefined,
        status: QuotationStatus.DRAFT,
      })
      navigate(`/quotations/${created.id}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create quotation')
    } finally {
      setSaving(false)
    }
  }

  async function onStatus(next: QuotationStatus) {
    if (!saved) return
    setSaving(true)
    setError(null)
    try {
      const updated = await api.updateQuotationStatus(saved.id, next)
      setSaved(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update status')
    } finally {
      setSaving(false)
    }
  }

  if (!canCreate) {
    return (
      <section className="table-card">
        <p className="form-error">You do not have permission to create quotations.</p>
      </section>
    )
  }

  if (isDetail && saved) {
    return (
      <>
        <header className="workspace-header">
          <div>
            <h1>{saved.quotationNumber}</h1>
            <p className="muted">
              {QUOTATION_STATUS_LABEL[saved.status]} · {saved.createdByName}
            </p>
          </div>
          <div className="form-actions">
            <Link to="/quotations" className="ghost-link">
              Back to list
            </Link>
            <button type="button" onClick={() => downloadQuotationPdf(saved)}>
              Download Quotation PDF
            </button>
          </div>
        </header>

        {error ? <p className="form-error">{error}</p> : null}

        <section className="table-card quotation-detail">
          <div className="name-row">
            <p>
              <strong>Client:</strong> {saved.clientInfo.name}
              {saved.clientInfo.company ? ` · ${saved.clientInfo.company}` : ''}
            </p>
            <p>
              <strong>Project:</strong>{' '}
              {saved.projectName ?? '—'}
            </p>
          </div>

          <div className="journal-lines-scroll quotation-table-desktop">
            <table className="journal-lines-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Qty</th>
                  <th className="num">Unit price</th>
                  <th className="num">Disc %</th>
                  <th className="num">Line total</th>
                </tr>
              </thead>
              <tbody>
                {saved.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.productName}</td>
                    <td className="num">{item.quantity}</td>
                    <td className="num">{money(item.unitPrice)}</td>
                    <td className="num">{item.discount}</td>
                    <td className="num">{money(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="quotation-cards-mobile">
            {saved.items.map((item) => (
              <article key={item.id} className="quotation-line-card">
                <h3>{item.productName}</h3>
                <p>Qty {item.quantity}</p>
                <p>Unit {money(item.unitPrice)}</p>
                <p>Disc {item.discount}%</p>
                <p>
                  <strong>{money(item.lineTotal)}</strong>
                </p>
              </article>
            ))}
          </div>

          <p className="muted">
            Subtotal {money(saved.subTotal)} · Tax {money(saved.taxAmount)} ·
            Total <strong>{money(saved.grandTotal)}</strong>
          </p>

          <div className="form-actions">
            {saved.status === QuotationStatus.DRAFT ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void onStatus(QuotationStatus.SENT)}
              >
                Mark sent
              </button>
            ) : null}
            {saved.status === QuotationStatus.SENT ? (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void onStatus(QuotationStatus.APPROVED)}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={saving}
                  onClick={() => void onStatus(QuotationStatus.REJECTED)}
                >
                  Reject
                </button>
              </>
            ) : null}
          </div>
        </section>
      </>
    )
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>New quotation</h1>
          <p className="muted">
            Search inventory and add multiple products. Mobile uses card layout.
          </p>
        </div>
        <Link to="/quotations" className="ghost-link">
          Cancel
        </Link>
      </header>

      <section className="table-card">
        <form
          className="stack-form stack-form-compact quotation-create-form"
          onSubmit={(event) => void onSubmit(event)}
        >
          <div className="filter-grid-2">
            <label>
              Party type
              <select
                value={partyType}
                onChange={(e) => {
                  const next = e.target.value as typeof partyType
                  if (next === 'new_customer') {
                    applyParty('new_customer', '')
                  } else {
                    setPartyType(next)
                    setPartyId('')
                    setClientName('')
                    setClientPhone('')
                    setClientCompany('')
                  }
                }}
              >
                <option value="customer">Customer</option>
                <option value="supplier">Supplier</option>
                <option value="new_customer">New customer</option>
              </select>
            </label>
            {partyType === 'customer' ? (
              <label>
                Customer
                <Select
                  value={partyId}
                  onChange={(value) => applyParty('customer', value)}
                  options={customers.map((row) => ({
                    value: row.id,
                    label: row.name,
                  }))}
                  searchable
                  portal
                  placeholder="Select customer"
                />
              </label>
            ) : null}
            {partyType === 'supplier' ? (
              <label>
                Supplier
                <Select
                  value={partyId}
                  onChange={(value) => applyParty('supplier', value)}
                  options={suppliers.map((row) => ({
                    value: row.id,
                    label: row.name,
                  }))}
                  searchable
                  portal
                  placeholder="Select supplier"
                />
              </label>
            ) : null}
            {partyType === 'new_customer' ? (
              <label>
                Client name
                <input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  required
                  placeholder="New customer name"
                />
              </label>
            ) : (
              <label>
                Display name
                <input value={clientName} readOnly />
              </label>
            )}
            <label>
              Company
              <input
                value={clientCompany}
                onChange={(e) => setClientCompany(e.target.value)}
                readOnly={partyType !== 'new_customer'}
              />
            </label>
            <label>
              Phone
              <input
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                readOnly={partyType !== 'new_customer'}
              />
            </label>
            <label>
              Project
              <Select
                value={projectId}
                onChange={setProjectId}
                options={[
                  { value: '', label: 'No project' },
                  ...projects.map((row) => ({
                    value: row.id,
                    label: row.name,
                  })),
                ]}
                searchable
                portal
                placeholder="No project"
              />
            </label>
            <label>
              Tax %
              <input
                type="number"
                min={0}
                step="0.01"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
              />
            </label>
            <div className="form-actions compact-actions filter-actions">
              <button type="button" className="ghost" onClick={openProductPicker}>
                Add products
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setLines((prev) => [...prev, emptyLine()])}
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
                  <th className="num">Unit price</th>
                  <th className="num">Disc %</th>
                  <th className="num">Line total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.key}>
                    <td>
                      <input
                        value={line.productName}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((row) =>
                              row.key === line.key
                                ? { ...row, productName: e.target.value }
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
                        value={line.quantity}
                        onChange={(e) =>
                          setLines((prev) =>
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
                        value={line.unitPrice}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((row) =>
                              row.key === line.key
                                ? { ...row, unitPrice: e.target.value }
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
                        value={line.discount}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((row) =>
                              row.key === line.key
                                ? { ...row, discount: e.target.value }
                                : row,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="num">
                      {money(
                        lineTotalPreview(
                          Number(line.unitPrice) || 0,
                          Number(line.quantity) || 0,
                          Number(line.discount) || 0,
                        ),
                      )}
                    </td>
                    <td>
                      {lines.length > 1 ? (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() =>
                            setLines((prev) =>
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
            {lines.map((line) => (
              <article key={line.key} className="quotation-line-card">
                <label>
                  Product
                  <input
                    value={line.productName}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((row) =>
                          row.key === line.key
                            ? { ...row, productName: e.target.value }
                            : row,
                        ),
                      )
                    }
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
                        setLines((prev) =>
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
                    Unit price
                    <input
                      inputMode="decimal"
                      value={line.unitPrice}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((row) =>
                            row.key === line.key
                              ? { ...row, unitPrice: e.target.value }
                              : row,
                          ),
                        )
                      }
                      required
                    />
                  </label>
                </div>
                <label>
                  Discount %
                  <input
                    inputMode="decimal"
                    value={line.discount}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((row) =>
                          row.key === line.key
                            ? { ...row, discount: e.target.value }
                            : row,
                        ),
                      )
                    }
                  />
                </label>
                <p>
                  Line total{' '}
                  <strong>
                    {money(
                      lineTotalPreview(
                        Number(line.unitPrice) || 0,
                        Number(line.quantity) || 0,
                        Number(line.discount) || 0,
                      ),
                    )}
                  </strong>
                </p>
                {lines.length > 1 ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      setLines((prev) =>
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
          <label>
            Terms & conditions
            <textarea
              rows={3}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
            />
          </label>

          <p className="muted">
            Subtotal {money(previewTotals.subTotal)} · Tax{' '}
            {money(previewTotals.tax)} · Grand{' '}
            <strong>{money(previewTotals.grandTotal)}</strong>
          </p>

          <div className="form-actions">
            <button type="submit" disabled={saving || !clientName.trim()}>
              {saving ? 'Saving…' : 'Create quotation'}
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </section>
    </>
  )
}
