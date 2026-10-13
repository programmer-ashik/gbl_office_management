import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { canCreateQuotation } from '../auth/permissions'
import { useAuth } from '../auth/AuthContext'
import { money } from '../types/accounting'
import type { Item, ProductCategory, StockRow } from '../types/procurement'
import { writeQuotationProductSelection } from '../utils/quotationProductSelection'

const PAGE_SIZE = 25
const UNCATEGORIZED = '__uncategorized__'

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

export function QuotationProductSelectPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
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
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)

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

  const childrenByParent = useMemo(() => {
    const map = new Map<string, ProductCategory[]>()
    for (const row of categories) {
      if (!row.parentId) continue
      const list = map.get(row.parentId) ?? []
      list.push(row)
      map.set(row.parentId, list)
    }
    return map
  }, [categories])

  const filteredRoots = useMemo(() => {
    const q = categorySearch.trim().toLowerCase()
    if (!q) return roots
    const matches = (row: ProductCategory) =>
      row.name.toLowerCase().includes(q) ||
      (row.code ?? '').toLowerCase().includes(q)
    return roots.filter(
      (row) =>
        matches(row) || (childrenByParent.get(row.id) ?? []).some(matches),
    )
  }, [roots, categorySearch, childrenByParent])

  useEffect(() => {
    const q = categorySearch.trim().toLowerCase()
    if (!q) return
    setExpandedIds((prev) => {
      const next = new Set(prev)
      for (const row of filteredRoots) {
        const children = childrenByParent.get(row.id) ?? []
        if (
          children.some(
            (sub) =>
              sub.name.toLowerCase().includes(q) ||
              (sub.code ?? '').toLowerCase().includes(q),
          )
        ) {
          next.add(row.id)
        }
      }
      return next
    })
  }, [categorySearch, filteredRoots, childrenByParent])

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectCategory(rootId: string, subId = '') {
    setSelectedCategoryId(rootId)
    setSelectedSubId(subId)
    if (
      rootId &&
      !subId &&
      (childrenByParent.get(rootId)?.length ?? 0) > 0
    ) {
      setExpandedIds((prev) => new Set(prev).add(rootId))
    }
  }

  function onKeySelect(event: KeyboardEvent, action: () => void) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      action()
    }
  }

  const categoryById = useMemo(
    () => new Map(categories.map((row) => [row.id, row])),
    [categories],
  )

  /** Top-level category of a product; null when it has none (or it no longer exists). */
  const rootCategoryId = useMemo(() => {
    const rootOf = (id: string | null): string | null => {
      let current = id ? categoryById.get(id) : undefined
      while (current?.parentId) {
        const parent = categoryById.get(current.parentId)
        if (!parent) break
        current = parent
      }
      return current?.id ?? null
    }
    return (row: Item) => rootOf(row.categoryId) ?? rootOf(row.subCategoryId)
  }, [categoryById])

  const uncategorizedCount = useMemo(
    () => items.filter((row) => !rootCategoryId(row)).length,
    [items, rootCategoryId],
  )

  const filteredItems = useMemo(() => {
    const q = productSearch.trim().toLowerCase()
    return items.filter((row) => {
      if (selectedCategoryId === UNCATEGORIZED) {
        if (rootCategoryId(row)) return false
      } else if (selectedSubId) {
        if (row.subCategoryId !== selectedSubId && row.categoryId !== selectedSubId) {
          return false
        }
      } else if (selectedCategoryId && rootCategoryId(row) !== selectedCategoryId) {
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
  }, [items, selectedCategoryId, selectedSubId, productSearch, rootCategoryId])

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
    const cat = row.categoryId ? categoryById.get(row.categoryId) : undefined
    const sub = row.subCategoryId ? categoryById.get(row.subCategoryId) : undefined
    if (cat && sub) return `${cat.name} / ${sub.name}`
    return cat?.name ?? sub?.name ?? 'Uncategorized'
  }

  function stockQuantity(row: Item) {
    return stockMap.get(row.id)?.quantity ?? row.quantity ?? 0
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
        unitPrice: row.unitPrice ?? stockMap.get(row.id)?.unitPrice ?? 0,
        dataSheetUrl: row.dataSheetUrl,
      }))
    if (products.length === 0) {
      setError('Select at least one product')
      return
    }
    writeQuotationProductSelection(products)
    setError(null)
    navigate('/quotations/new')
  }

  if (!canUse) {
    return (
      <section className="table-card">
        <p className="form-error">You cannot select quotation products.</p>
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
            Select products, then save back to the quotation.
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

      <section className="catalog-layout catalog-layout-compact">
        <aside className="table-card catalog-sidebar compact-panel">
          <div className="compact-toolbar">
            <input
              className="compact-search"
              value={categorySearch}
              onChange={(e) => setCategorySearch(e.target.value)}
              placeholder="Categories…"
              aria-label="Search categories"
            />
          </div>
          <ul className="catalog-tree">
            <li>
              <div
                className={`catalog-tree-row ${!selectedCategoryId && !selectedSubId ? 'is-active' : ''}`}
              >
                <span className="catalog-tree-spacer" aria-hidden="true" />
                <span
                  className="catalog-tree-label"
                  role="button"
                  tabIndex={0}
                  onClick={() => selectCategory('')}
                  onKeyDown={(e) => onKeySelect(e, () => selectCategory(''))}
                >
                  All categories
                </span>
              </div>
            </li>
            {filteredRoots.map((row) => {
              const children = childrenByParent.get(row.id) ?? []
              const open = children.length > 0 && expandedIds.has(row.id)
              return (
                <li key={row.id}>
                  <div
                    className={`catalog-tree-row ${selectedCategoryId === row.id && !selectedSubId ? 'is-active' : ''} ${!row.isActive ? 'is-inactive' : ''}`}
                  >
                    {children.length > 0 ? (
                      <span
                        className={`catalog-tree-toggle ${open ? 'is-open' : ''}`}
                        role="button"
                        tabIndex={0}
                        aria-label={open ? 'Collapse' : 'Expand'}
                        aria-expanded={open}
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleExpanded(row.id)
                        }}
                        onKeyDown={(e) =>
                          onKeySelect(e, () => toggleExpanded(row.id))
                        }
                      >
                        ▸
                      </span>
                    ) : (
                      <span className="catalog-tree-spacer" aria-hidden="true" />
                    )}
                    <span
                      className="catalog-tree-label"
                      role="button"
                      tabIndex={0}
                      onClick={() => selectCategory(row.id)}
                      onKeyDown={(e) =>
                        onKeySelect(e, () => selectCategory(row.id))
                      }
                    >
                      {row.name}
                      {!row.isActive ? (
                        <span className="muted catalog-tree-badge">
                          inactive
                        </span>
                      ) : null}
                    </span>
                  </div>
                  {open ? (
                    <ul className="catalog-tree catalog-tree-nested">
                      {children.map((sub) => (
                        <li key={sub.id}>
                          <div
                            className={`catalog-tree-row ${selectedSubId === sub.id ? 'is-active' : ''} ${!sub.isActive ? 'is-inactive' : ''}`}
                          >
                            <span
                              className="catalog-tree-spacer"
                              aria-hidden="true"
                            />
                            <span
                              className="catalog-tree-label is-sub"
                              role="button"
                              tabIndex={0}
                              onClick={() => selectCategory(row.id, sub.id)}
                              onKeyDown={(e) =>
                                onKeySelect(e, () =>
                                  selectCategory(row.id, sub.id),
                                )
                              }
                            >
                              {sub.name}
                              {!sub.isActive ? (
                                <span className="muted catalog-tree-badge">
                                  inactive
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              )
            })}
            {uncategorizedCount > 0 ? (
              <li>
                <div
                  className={`catalog-tree-row ${selectedCategoryId === UNCATEGORIZED ? 'is-active' : ''}`}
                >
                  <span className="catalog-tree-spacer" aria-hidden="true" />
                  <span
                    className="catalog-tree-label"
                    role="button"
                    tabIndex={0}
                    onClick={() => selectCategory(UNCATEGORIZED)}
                    onKeyDown={(e) =>
                      onKeySelect(e, () => selectCategory(UNCATEGORIZED))
                    }
                  >
                    Uncategorized ({uncategorizedCount})
                  </span>
                </div>
              </li>
            ) : null}
          </ul>
        </aside>

        <div className="table-card compact-panel quote-pick-panel">
          <div className="compact-toolbar">
            <div className="bg-white rounded-md border border-gray-300 shadow-sm flex items-center gap-2 px-3 py-1">
              <span className="muted compact-count">
                All Items ({filteredItems.length})
              </span>
            </div>
            <input
              className="compact-search"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Search products…"
              aria-label="Search products"
              autoFocus
            />
            <span className="muted compact-count">
              {selectedIds.size} selected
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
                  const quantity = stockQuantity(row)
                  const displayPrice =
                    row.unitPrice ?? stockMap.get(row.id)?.unitPrice ?? 0
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
                        <div>{row.name}</div>
                        {row.dataSheetUrl ? (
                          <a
                            href={row.dataSheetUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="muted"
                            style={{ fontSize: 12 }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            Data sheet
                          </a>
                        ) : null}
                      </td>
                      <td>{row.unit}</td>
                      <td>{row.brand ?? '—'}</td>
                      <td>{categoryLabel(row)}</td>
                      <td className={quantity > 0 ? 'num' : 'num muted'}>
                        {quantity > 0 ? quantity : 'Out of stock'}
                      </td>
                      <td className="num">{money(displayPrice)}</td>
                    </tr>
                  )
                })}
                {pageItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="muted">
                      {items.length === 0
                        ? 'No products yet. Add them in Product Catalog.'
                        : 'No products match this filter.'}
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
              Save to quotation ({selectedIds.size})
            </button>
          </div>
        </div>
      </section>
    </>
  )
}
