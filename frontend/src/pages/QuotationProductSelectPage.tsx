import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { canCreateQuotation } from '../auth/permissions'
import { useAuth } from '../auth/AuthContext'
import { money } from '../types/accounting'
import type { Item, ProductCategory, StockRow } from '../types/procurement'
import { writeQuotationProductSelection } from '../utils/quotationProductSelection'

type StockSummary = {
  quantity: number
  unitPrice: number
}

function stockByItem(rows: StockRow[]): Map<string, StockSummary> {
  const map = new Map<string, StockSummary>()
  for (const row of rows) {
    const current = map.get(row.itemId) ?? { quantity: 0, unitPrice: 0 }
    const nextQty = current.quantity + row.quantity
    const nextValue =
      current.quantity * current.unitPrice + row.value
    map.set(row.itemId, {
      quantity: nextQty,
      unitPrice:
        nextQty > 0 ? Number((nextValue / nextQty).toFixed(2)) : 0,
    })
  }
  return map
}

export function QuotationProductSelectPage() {
  const { user } = useAuth()
  const canUse = canCreateQuotation(user?.role)
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [stockMap, setStockMap] = useState<Map<string, StockSummary>>(
    () => new Map(),
  )
  const [error, setError] = useState<string | null>(null)
  const [categorySearch, setCategorySearch] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [selectedSubId, setSelectedSubId] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!canUse) return
    Promise.all([
      api.productCategories(),
      api.items(),
      api.inventory().catch(() => [] as StockRow[]),
    ])
      .then(([cats, productRows, stockRows]) => {
        setCategories(cats)
        setItems(productRows)
        setStockMap(stockByItem(stockRows))
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load catalog')
      })
  }, [canUse])

  const roots = useMemo(
    () => categories.filter((row) => !row.parentId),
    [categories],
  )

  const filteredRoots = useMemo(() => {
    const q = categorySearch.trim().toLowerCase()
    if (!q) return roots
    return roots.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        (row.code ?? '').toLowerCase().includes(q),
    )
  }, [roots, categorySearch])

  const filteredItems = useMemo(() => {
    const q = productSearch.trim().toLowerCase()
    return items.filter((row) => {
      const stock = stockMap.get(row.id)
      if (!stock || stock.quantity <= 0) return false
      if (selectedSubId && row.subCategoryId !== selectedSubId) return false
      if (
        selectedCategoryId &&
        !selectedSubId &&
        row.categoryId !== selectedCategoryId
      ) {
        return false
      }
      if (!q) return true
      return (
        row.sku.toLowerCase().includes(q) ||
        row.name.toLowerCase().includes(q) ||
        (row.brand ?? '').toLowerCase().includes(q) ||
        (row.model ?? '').toLowerCase().includes(q)
      )
    })
  }, [items, selectedCategoryId, selectedSubId, productSearch, stockMap])

  function categoryLabel(row: Item) {
    const cat = categories.find((c) => c.id === row.categoryId)
    const sub = categories.find((c) => c.id === row.subCategoryId)
    if (!cat) return '—'
    return sub ? `${cat.name} / ${sub.name}` : cat.name
  }

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllVisible(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const row of filteredItems) {
        if (checked) next.add(row.id)
        else next.delete(row.id)
      }
      return next
    })
  }

  function onSave() {
    const products = items
      .filter((row) => selectedIds.has(row.id))
      .map((row) => ({
        productId: row.id,
        productName: `${row.sku} · ${row.name}`,
        unitPrice:
          row.unitPrice ?? stockMap.get(row.id)?.unitPrice ?? 0,
      }))
    if (products.length === 0) {
      setError('Select at least one product')
      return
    }
    writeQuotationProductSelection(products)
    setSaved(true)
    setError(null)
    window.setTimeout(() => {
      window.close()
    }, 400)
  }

  if (!canUse) {
    return (
      <section className="table-card">
        <p className="form-error">You cannot select quotation products.</p>
      </section>
    )
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Select products</h1>
          <p className="muted">
            In-stock items only. Prices prefill the quotation and stay editable.
          </p>
        </div>
        <div className="form-actions">
          <Link to="/quotations/new" className="ghost-link">
            Back
          </Link>
          <button
            type="button"
            onClick={onSave}
            disabled={selectedIds.size === 0}
          >
            Save ({selectedIds.size})
          </button>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {saved ? (
        <p className="muted">Saved — you can close this tab.</p>
      ) : null}

      <section className="catalog-layout catalog-layout-compact">
        <aside className="table-card catalog-sidebar compact-panel">
          <div className="compact-toolbar">
            <input
              className="compact-search"
              value={categorySearch}
              onChange={(e) => setCategorySearch(e.target.value)}
              placeholder="Search categories…"
              aria-label="Search categories"
            />
          </div>
          <button
            type="button"
            className={`catalog-cat-btn ${!selectedCategoryId ? 'is-active' : ''}`}
            onClick={() => {
              setSelectedCategoryId('')
              setSelectedSubId('')
            }}
          >
            All categories
          </button>
          <ul className="catalog-cat-list">
            {filteredRoots.map((cat) => {
              const children = categories.filter(
                (row) => row.parentId === cat.id,
              )
              return (
                <li key={cat.id}>
                  <button
                    type="button"
                    className={`catalog-cat-btn ${selectedCategoryId === cat.id ? 'is-active' : ''}`}
                    onClick={() => {
                      setSelectedCategoryId(cat.id)
                      setSelectedSubId('')
                    }}
                  >
                    {cat.name}
                  </button>
                  {selectedCategoryId === cat.id && children.length > 0 ? (
                    <ul className="catalog-sub-list">
                      {children.map((sub) => (
                        <li key={sub.id}>
                          <button
                            type="button"
                            className={`catalog-cat-btn is-sub ${selectedSubId === sub.id ? 'is-active' : ''}`}
                            onClick={() => setSelectedSubId(sub.id)}
                          >
                            {sub.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </aside>

        <div className="table-card compact-panel">
          <div className="compact-toolbar">
            <input
              className="compact-search"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Search SKU, name, brand, model…"
              aria-label="Search products"
              autoFocus
            />
            <span className="muted compact-count">
              {filteredItems.length} in stock
            </span>
          </div>

          <div className="journal-lines-scroll dense-table-scroll">
            <table className="journal-lines-table dense-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all visible"
                      checked={
                        filteredItems.length > 0 &&
                        filteredItems.every((row) => selectedIds.has(row.id))
                      }
                      onChange={(e) => toggleAllVisible(e.target.checked)}
                    />
                  </th>
                  <th>SKU</th>
                  <th>Name</th>
                  <th>Unit</th>
                  <th>Brand</th>
                  <th>Model</th>
                  <th>Origin</th>
                  <th>Category</th>
                  <th className="num">Stock</th>
                  <th className="num">Price</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((row) => {
                  const stock = stockMap.get(row.id)!
                  const displayPrice = row.unitPrice ?? stock.unitPrice
                  return (
                    <tr
                      key={row.id}
                      className={
                        selectedIds.has(row.id) ? 'is-selected-row' : ''
                      }
                      onClick={() => toggle(row.id)}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggle(row.id)}
                        />
                      </td>
                      <td>{row.sku}</td>
                      <td title={row.technicalSpecification ?? undefined}>
                        {row.name}
                      </td>
                      <td>{row.unit}</td>
                      <td>{row.brand ?? '—'}</td>
                      <td>{row.model ?? '—'}</td>
                      <td>{row.countryOfOrigin ?? '—'}</td>
                      <td>{categoryLabel(row)}</td>
                      <td className="num">{stock.quantity}</td>
                      <td className="num">{money(displayPrice)}</td>
                    </tr>
                  )
                })}
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="muted">
                      No in-stock products match this filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="form-actions compact-actions">
            <button
              type="button"
              onClick={onSave}
              disabled={selectedIds.size === 0}
            >
              Save to quotation ({selectedIds.size})
            </button>
          </div>
        </div>
      </section>
    </>
  )
}
