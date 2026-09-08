import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { money } from '../types/accounting'
import { Role } from '../types/auth'
import type { Item, ProductCategory, StockRow } from '../types/procurement'
import { writePoProductSelection } from '../utils/poProductSelection'

const PAGE_SIZE = 25

type StockSummary = {
  quantity: number
  unitPrice: number
}

function stockByItem(rows: StockRow[]): Map<string, StockSummary> {
  const map = new Map<string, StockSummary>()
  for (const row of rows) {
    const current = map.get(row.itemId) ?? { quantity: 0, unitPrice: 0 }
    const nextQty = current.quantity + row.quantity
    const nextValue = current.quantity * current.unitPrice + row.value
    map.set(row.itemId, {
      quantity: nextQty,
      unitPrice: nextQty > 0 ? Number((nextValue / nextQty).toFixed(2)) : 0,
    })
  }
  return map
}

export function PurchaseOrderProductSelectPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const canUse =
    user?.role === Role.ADMIN ||
    user?.role === Role.ACCOUNTANT ||
    user?.role === Role.PROJECT_MANAGER

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
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!canUse) return
    Promise.all([
      api.productCategories().catch(() => [] as ProductCategory[]),
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
  }, [items, selectedCategoryId, selectedSubId, productSearch])

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const rangeStart =
    filteredItems.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filteredItems.length)
  const pageItems = useMemo(
    () =>
      filteredItems.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE,
      ),
    [filteredItems, currentPage],
  )

  useEffect(() => {
    setPage(1)
  }, [productSearch, selectedCategoryId, selectedSubId])

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

  function toggleAllOnPage(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const row of pageItems) {
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
        unitPrice: row.unitPrice ?? stockMap.get(row.id)?.unitPrice ?? undefined,
      }))
    if (products.length === 0) {
      setError('Select at least one product')
      return
    }
    writePoProductSelection(products)
    setError(null)
    navigate('/procurement/new')
  }

  if (!canUse) {
    return (
      <section className="table-card">
        <p className="form-error">You cannot select purchase order products.</p>
      </section>
    )
  }

  const allPageSelected =
    pageItems.length > 0 && pageItems.every((row) => selectedIds.has(row.id))

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Select products</h1>
          <p className="muted">
            Catalog SKUs for this purchase order. Save to return to the PO form.
          </p>
        </div>
        <div className="form-actions">
          <Link to="/procurement/new" className="ghost-link">
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

      <section className="catalog-layout catalog-layout-compact">
        <aside className="table-card catalog-sidebar compact-panel">
          <div className="compact-toolbar">
            <input
              className="quote-pick-search"
              value={categorySearch}
              onChange={(e) => setCategorySearch(e.target.value)}
              placeholder="Categories…"
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

        <div className="table-card compact-panel quote-pick-panel">
          <div className="compact-toolbar quote-pick-toolbar">
            <input
              className="quote-pick-search"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Search SKU, name…"
              aria-label="Search products"
              autoFocus
            />
            <span className="muted compact-count">
              {filteredItems.length} · {selectedIds.size} selected
            </span>
          </div>

          <div className="journal-lines-scroll quote-pick-scroll">
            <table className="journal-lines-table dense-table quote-pick-table">
              <thead>
                <tr>
                  <th className="quote-pick-check-col">
                    <input
                      type="checkbox"
                      className="quote-pick-check"
                      aria-label="Select all on page"
                      checked={allPageSelected}
                      onChange={(e) => toggleAllOnPage(e.target.checked)}
                    />
                  </th>
                  <th>SKU</th>
                  <th>Name</th>
                  <th>Unit</th>
                  <th>Brand</th>
                  <th>Category</th>
                  <th className="num">Stock</th>
                  <th className="num">Price</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((row) => {
                  const stock = stockMap.get(row.id)
                  const displayPrice =
                    row.unitPrice ?? stock?.unitPrice ?? null
                  return (
                    <tr
                      key={row.id}
                      className={
                        selectedIds.has(row.id) ? 'is-selected-row' : ''
                      }
                      onClick={() => toggle(row.id)}
                    >
                      <td
                        className="quote-pick-check-col"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          className="quote-pick-check"
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
                      <td>{categoryLabel(row)}</td>
                      <td className="num">{stock?.quantity ?? 0}</td>
                      <td className="num">
                        {displayPrice != null ? money(displayPrice) : '—'}
                      </td>
                    </tr>
                  )
                })}
                {pageItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="muted">
                      No catalog products match this filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {filteredItems.length > 0 ? (
            <div className="table-pagination quote-pick-pagination">
              <p className="muted">
                Showing {rangeStart}–{rangeEnd} of {filteredItems.length}
              </p>
              <div className="form-actions">
                <button
                  type="button"
                  className="ghost"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="pagination-page">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  className="ghost"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}

          <div className="form-actions compact-actions">
            <button
              type="button"
              onClick={onSave}
              disabled={selectedIds.size === 0}
            >
              Save to purchase order ({selectedIds.size})
            </button>
          </div>
        </div>
      </section>
    </>
  )
}
