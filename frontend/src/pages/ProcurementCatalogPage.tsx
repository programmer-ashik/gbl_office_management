import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import {
  AddItemForm,
  addItemBodyFromValues,
  emptyAddItemValues,
  itemToFormValues,
  type AddItemFormValues,
} from "../components/AddItemForm";
import { ExpandableText } from "../components/ExpandableText";
import { ActionMenu, Modal, Select } from "../components/ui";
import { money } from "../types/accounting";
import { Role } from "../types/auth";
import type {
  Item,
  ProductCategory,
  Supplier,
  Warehouse,
} from "../types/procurement";

type ItemModalMode = "create" | "edit" | "view";

export function ProcurementCatalogPage() {
  const { user } = useAuth();
  const isFinance = user?.role === Role.ADMIN || user?.role === Role.ACCOUNTANT;
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedSubId, setSelectedSubId] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [catModal, setCatModal] = useState(false);
  const [subModal, setSubModal] = useState(false);
  const [itemModal, setItemModal] = useState(false);
  const [itemModalMode, setItemModalMode] = useState<ItemModalMode>("create");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [catName, setCatName] = useState("");
  const [catCode, setCatCode] = useState("");
  const [subName, setSubName] = useState("");
  const [subParentId, setSubParentId] = useState("");
  const [itemForm, setItemForm] =
    useState<AddItemFormValues>(emptyAddItemValues());

  const [manageCat, setManageCat] = useState<ProductCategory | null>(null);
  const [manageMode, setManageMode] = useState<"delete" | "deactivate" | null>(
    null,
  );
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [targetCategoryId, setTargetCategoryId] = useState("");
  const [targetSubId, setTargetSubId] = useState("");
  const [manageError, setManageError] = useState<string | null>(null);

  async function load() {
    const [cats, productRows, vendorRows, warehouseRows] = await Promise.all([
      api.productCategories(),
      api.items(
        productSearch.trim() ? { search: productSearch.trim() } : undefined,
      ),
      api.suppliers().catch(() => [] as Supplier[]),
      api.warehouses().catch(() => [] as Warehouse[]),
    ]);
    setCategories(cats);
    setItems(productRows);
    setSuppliers(vendorRows);
    setWarehouses(warehouseRows);
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Unable to load catalog");
    });
  }, []);

  const roots = useMemo(
    () => categories.filter((row) => !row.parentId),
    [categories],
  );
  const activeRoots = useMemo(
    () => roots.filter((row) => row.isActive),
    [roots],
  );
  const childrenByParent = useMemo(() => {
    const map = new Map<string, ProductCategory[]>();
    for (const row of categories) {
      if (!row.parentId) continue;
      const list = map.get(row.parentId) ?? [];
      list.push(row);
      map.set(row.parentId, list);
    }
    return map;
  }, [categories]);

  const filteredRoots = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return roots;
    return roots.filter((row) => {
      if (
        row.name.toLowerCase().includes(q) ||
        (row.code ?? "").toLowerCase().includes(q)
      ) {
        return true;
      }
      return (childrenByParent.get(row.id) ?? []).some(
        (sub) =>
          sub.name.toLowerCase().includes(q) ||
          (sub.code ?? "").toLowerCase().includes(q),
      );
    });
  }, [roots, categorySearch, childrenByParent]);

  useEffect(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      for (const row of filteredRoots) {
        const children = childrenByParent.get(row.id) ?? [];
        if (
          children.some(
            (sub) =>
              sub.name.toLowerCase().includes(q) ||
              (sub.code ?? "").toLowerCase().includes(q),
          )
        ) {
          next.add(row.id);
        }
      }
      return next;
    });
  }, [categorySearch, filteredRoots, childrenByParent]);

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function isExpanded(id: string) {
    return expandedIds.has(id);
  }

  const activeCategoryIds = useMemo(
    () => new Set(categories.filter((c) => c.isActive).map((c) => c.id)),
    [categories],
  );

  const visibleItems = useMemo(() => {
    return items.filter((row) => {
      if (row.categoryId && !activeCategoryIds.has(row.categoryId))
        return false;
      if (row.subCategoryId && !activeCategoryIds.has(row.subCategoryId)) {
        return false;
      }
      if (selectedSubId) return row.subCategoryId === selectedSubId;
      if (selectedCategoryId) return row.categoryId === selectedCategoryId;
      return true;
    });
  }, [items, selectedCategoryId, selectedSubId, activeCategoryIds]);

  const manageProducts = useMemo(() => {
    if (!manageCat) return [];
    if (manageCat.parentId) {
      return items.filter((row) => row.subCategoryId === manageCat.id);
    }
    return items.filter(
      (row) =>
        row.categoryId === manageCat.id || row.subCategoryId === manageCat.id,
    );
  }, [items, manageCat]);

  const targetSubs = useMemo(
    () =>
      categories.filter(
        (row) =>
          row.parentId === targetCategoryId &&
          row.isActive &&
          row.id !== manageCat?.id,
      ),
    [categories, targetCategoryId, manageCat],
  );

  const manageChildCount = useMemo(() => {
    if (!manageCat || manageCat.parentId) return 0;
    return (childrenByParent.get(manageCat.id) ?? []).length;
  }, [manageCat, childrenByParent]);

  const activeCategoriesForForm = useMemo(
    () => categories.filter((row) => row.isActive),
    [categories],
  );

  function openCreateItem() {
    setItemModalMode("create");
    setEditingItemId(null);
    setItemForm(emptyAddItemValues());
    setItemError(null);
    setItemModal(true);
  }

  function openViewItem(row: Item) {
    setItemModalMode("view");
    setEditingItemId(row.id);
    setItemForm(itemToFormValues(row));
    setItemError(null);
    setItemModal(true);
  }

  function openEditItem(row: Item) {
    if (!isFinance) return;
    setItemModalMode("edit");
    setEditingItemId(row.id);
    setItemForm(itemToFormValues(row));
    setItemError(null);
    setItemModal(true);
  }

  async function onDeleteItem(row: Item) {
    if (!isFinance) return;
    if (!window.confirm(`Delete product ${row.sku} · ${row.name}?`)) return;
    setSaving(true);
    setError(null);
    try {
      await api.deleteItem(row.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete product");
    } finally {
      setSaving(false);
    }
  }

  function openManageCategory(
    row: ProductCategory,
    mode: "delete" | "deactivate",
  ) {
    setManageCat(row);
    setManageMode(mode);
    setSelectedItemIds([]);
    setTargetCategoryId("");
    setTargetSubId("");
    setManageError(null);
  }

  function closeManageCategory() {
    setManageCat(null);
    setManageMode(null);
    setSelectedItemIds([]);
    setTargetCategoryId("");
    setTargetSubId("");
    setManageError(null);
  }

  function toggleItemSelection(id: string) {
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleSelectAllManage() {
    if (selectedItemIds.length === manageProducts.length) {
      setSelectedItemIds([]);
      return;
    }
    setSelectedItemIds(manageProducts.map((row) => row.id));
  }

  async function onMoveSelectedProducts() {
    if (!manageCat || !targetCategoryId || selectedItemIds.length === 0) return;
    setSaving(true);
    setManageError(null);
    try {
      await api.reassignCategoryItems(manageCat.id, {
        itemIds: selectedItemIds,
        targetCategoryId,
        targetSubCategoryId: targetSubId || undefined,
      });
      setSelectedItemIds([]);
      await load();
    } catch (err) {
      setManageError(
        err instanceof Error ? err.message : "Unable to move products",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onConfirmDeleteCategory() {
    if (!manageCat || manageProducts.length > 0) return;
    setSaving(true);
    setManageError(null);
    try {
      await api.deleteProductCategory(manageCat.id);
      if (selectedCategoryId === manageCat.id) {
        setSelectedCategoryId("");
        setSelectedSubId("");
      }
      if (selectedSubId === manageCat.id) setSelectedSubId("");
      closeManageCategory();
      await load();
    } catch (err) {
      setManageError(
        err instanceof Error ? err.message : "Unable to delete category",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onConfirmDeactivateCategory() {
    if (!manageCat) return;
    setSaving(true);
    setManageError(null);
    try {
      await api.updateProductCategory(manageCat.id, { isActive: false });
      if (selectedCategoryId === manageCat.id) {
        setSelectedCategoryId("");
        setSelectedSubId("");
      }
      if (selectedSubId === manageCat.id) setSelectedSubId("");
      closeManageCategory();
      await load();
    } catch (err) {
      setManageError(
        err instanceof Error ? err.message : "Unable to deactivate category",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onActivateCategory(row: ProductCategory) {
    if (!isFinance) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateProductCategory(row.id, { isActive: true });
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to activate category",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onCreateCategory(event: FormEvent) {
    event.preventDefault();
    if (!isFinance) return;
    setSaving(true);
    setError(null);
    try {
      await api.createProductCategory({
        name: catName,
        code: catCode || undefined,
      });
      setCatName("");
      setCatCode("");
      setCatModal(false);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to create category",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onCreateSub(event: FormEvent) {
    event.preventDefault();
    if (!isFinance || !subParentId) return;
    setSaving(true);
    setError(null);
    try {
      await api.createProductCategory({
        name: subName,
        parentId: subParentId,
      });
      setSubName("");
      setSubModal(false);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to create sub-category",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onSaveItem(event: FormEvent) {
    event.preventDefault();
    if (!isFinance) return;
    if (itemModalMode === "view") return;
    setSaving(true);
    setItemError(null);
    setError(null);
    try {
      const body = addItemBodyFromValues(itemForm);
      if (itemModalMode === "edit" && editingItemId) {
        await api.updateItem(editingItemId, body);
      } else {
        await api.createItem(body);
      }
      setItemForm(emptyAddItemValues());
      setEditingItemId(null);
      setItemModal(false);
      await load();
    } catch (err) {
      setItemError(
        err instanceof Error
          ? err.message
          : itemModalMode === "edit"
            ? "Unable to update product"
            : "Unable to create product",
      );
    } finally {
      setSaving(false);
    }
  }

  const itemModalTitle =
    itemModalMode === "view"
      ? "Product details"
      : itemModalMode === "edit"
        ? "Update product"
        : "Add product";

  const manageTitle =
    manageMode === "delete"
      ? `Delete ${manageCat?.parentId ? "sub-category" : "category"}`
      : `Deactivate ${manageCat?.parentId ? "sub-category" : "category"}`;

  return (
    <>
      <header className='workspace-header'>
        <div>
          <h1>Product catalog</h1>
        </div>
        <div className='form-actions'>
          <Link to='/procurement' className='ghost-link'>
            Purchase orders
          </Link>
          <Link to='/inventory' className='ghost-link'>
            Stock & issue
          </Link>
          {isFinance ? (
            <>
              <button
                type='button'
                className='ghost'
                onClick={() => setCatModal(true)}
              >
                Add category
              </button>
              <button
                type='button'
                className='ghost'
                onClick={() => setSubModal(true)}
              >
                Add sub-category
              </button>
              <button type='button' onClick={openCreateItem}>
                Add product
              </button>
            </>
          ) : null}
        </div>
      </header>

      {error ? <p className='form-error'>{error}</p> : null}

      <section className='catalog-layout catalog-layout-compact'>
        <aside className='table-card catalog-sidebar compact-panel'>
          <div className='compact-toolbar'>
            <input
              className='compact-search'
              value={categorySearch}
              onChange={(e) => setCategorySearch(e.target.value)}
              placeholder='Categories…'
              aria-label='Search categories'
            />
          </div>
          <ul className='catalog-tree'>
            <li>
              <div
                className={`catalog-tree-row ${!selectedCategoryId && !selectedSubId ? "is-active" : ""}`}
              >
                <span className='catalog-tree-spacer' aria-hidden='true' />
                <span
                  className='catalog-tree-label'
                  role='button'
                  tabIndex={0}
                  onClick={() => {
                    setSelectedCategoryId("");
                    setSelectedSubId("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedCategoryId("");
                      setSelectedSubId("");
                    }
                  }}
                >
                  All categories
                </span>
              </div>
            </li>
            {filteredRoots.map((row) => {
              const children = childrenByParent.get(row.id) ?? [];
              const open = children.length > 0 && isExpanded(row.id);
              return (
                <li key={row.id}>
                  <div
                    className={`catalog-tree-row ${selectedCategoryId === row.id && !selectedSubId ? "is-active" : ""} ${!row.isActive ? "is-inactive" : ""}`}
                  >
                    {children.length > 0 ? (
                      <span
                        className={`catalog-tree-toggle ${open ? "is-open" : ""}`}
                        role='button'
                        tabIndex={0}
                        aria-label={open ? "Collapse" : "Expand"}
                        aria-expanded={open}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpanded(row.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleExpanded(row.id);
                          }
                        }}
                      >
                        ▸
                      </span>
                    ) : (
                      <span className='catalog-tree-spacer' aria-hidden='true' />
                    )}
                    <span
                      className='catalog-tree-label'
                      role='button'
                      tabIndex={0}
                      onClick={() => {
                        setSelectedCategoryId(row.id);
                        setSelectedSubId("");
                        if (children.length > 0 && !expandedIds.has(row.id)) {
                          setExpandedIds((prev) => new Set(prev).add(row.id));
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedCategoryId(row.id);
                          setSelectedSubId("");
                          if (children.length > 0 && !expandedIds.has(row.id)) {
                            setExpandedIds((prev) => new Set(prev).add(row.id));
                          }
                        }
                      }}
                    >
                      {row.name}
                      {!row.isActive ? (
                        <span className='muted catalog-tree-badge'>
                          inactive
                        </span>
                      ) : null}
                    </span>
                    {isFinance ? (
                      <ActionMenu
                        label='⋯'
                        disabled={saving}
                        items={
                          row.isActive
                            ? [
                                {
                                  label: "Deactivate",
                                  onSelect: () =>
                                    openManageCategory(row, "deactivate"),
                                },
                                {
                                  label: "Delete",
                                  danger: true,
                                  onSelect: () =>
                                    openManageCategory(row, "delete"),
                                },
                              ]
                            : [
                                {
                                  label: "Activate",
                                  onSelect: () => void onActivateCategory(row),
                                },
                                {
                                  label: "Delete",
                                  danger: true,
                                  onSelect: () =>
                                    openManageCategory(row, "delete"),
                                },
                              ]
                        }
                      />
                    ) : null}
                  </div>
                  {open ? (
                    <ul className='catalog-tree catalog-tree-nested'>
                      {children.map((sub) => (
                        <li key={sub.id}>
                          <div
                            className={`catalog-tree-row ${selectedSubId === sub.id ? "is-active" : ""} ${!sub.isActive ? "is-inactive" : ""}`}
                          >
                            <span
                              className='catalog-tree-spacer'
                              aria-hidden='true'
                            />
                            <span
                              className='catalog-tree-label is-sub'
                              role='button'
                              tabIndex={0}
                              onClick={() => {
                                setSelectedCategoryId(row.id);
                                setSelectedSubId(sub.id);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setSelectedCategoryId(row.id);
                                  setSelectedSubId(sub.id);
                                }
                              }}
                            >
                              {sub.name}
                              {!sub.isActive ? (
                                <span className='muted catalog-tree-badge'>
                                  inactive
                                </span>
                              ) : null}
                            </span>
                            {isFinance ? (
                              <ActionMenu
                                label='⋯'
                                disabled={saving}
                                items={
                                  sub.isActive
                                    ? [
                                        {
                                          label: "Deactivate",
                                          onSelect: () =>
                                            openManageCategory(
                                              sub,
                                              "deactivate",
                                            ),
                                        },
                                        {
                                          label: "Delete",
                                          danger: true,
                                          onSelect: () =>
                                            openManageCategory(sub, "delete"),
                                        },
                                      ]
                                    : [
                                        {
                                          label: "Activate",
                                          onSelect: () =>
                                            void onActivateCategory(sub),
                                        },
                                        {
                                          label: "Delete",
                                          danger: true,
                                          onSelect: () =>
                                            openManageCategory(sub, "delete"),
                                        },
                                      ]
                                }
                              />
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </aside>

        <div className='table-card compact-panel'>
          <div className='compact-toolbar'>
            <div className=' bg-white rounded-md border border-gray-300 shadow-sm flex items-center gap-2 px-3 py-1'>
              <span className='muted compact-count'>
                All Items ({visibleItems.length})
              </span>
            </div>
            <input
              className='compact-search'
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder='Search products…'
              aria-label='Search products'
            />

            <button type='button' className='ghost' onClick={() => void load()}>
              Search
            </button>
          </div>
          <div className='journal-lines-scroll dense-table-scroll'>
            <table className='journal-lines-table dense-table'>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Name</th>
                  <th>Unit</th>
                  <th className='num'>Price</th>
                  <th>Supplier</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((row) => {
                  const cat = categories.find((c) => c.id === row.categoryId);
                  const sub = categories.find(
                    (c) => c.id === row.subCategoryId,
                  );
                  return (
                    <tr key={row.id}>
                      <td>{row.sku}</td>
                      <td>{row.name}</td>
                      <td>{row.unit}</td>
                      <td className='num'>
                        {row.unitPrice != null ? money(row.unitPrice) : "—"}
                      </td>
                      <td>{row.supplierName ?? "—"}</td>
                      <td>
                        <ExpandableText text={row.description} maxChars={40} />
                      </td>
                      <td>
                        {cat?.name ?? "—"}
                        {sub ? ` / ${sub.name}` : ""}
                      </td>
                      <td>
                        <ActionMenu
                          disabled={saving}
                          items={[
                            {
                              label: "View",
                              onSelect: () => openViewItem(row),
                            },
                            ...(isFinance
                              ? [
                                  {
                                    label: "Update",
                                    onSelect: () => openEditItem(row),
                                  },
                                  {
                                    label: "Delete",
                                    danger: true,
                                    onSelect: () => void onDeleteItem(row),
                                  },
                                ]
                              : []),
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
                {visibleItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className='muted'>
                      No products in this view.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <Modal
        open={catModal}
        title='Add category'
        onClose={() => setCatModal(false)}
      >
        <form className='stack-form' onSubmit={(e) => void onCreateCategory(e)}>
          <label>
            Name
            <input
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              required
              minLength={2}
            />
          </label>
          <label>
            Code
            <input
              value={catCode}
              onChange={(e) => setCatCode(e.target.value)}
              placeholder='Optional'
            />
          </label>
          <button type='submit' disabled={saving}>
            Save category
          </button>
        </form>
      </Modal>

      <Modal
        open={subModal}
        title='Add sub-category'
        onClose={() => setSubModal(false)}
      >
        <form className='stack-form' onSubmit={(e) => void onCreateSub(e)}>
          <label>
            Parent category
            <Select
              value={subParentId}
              onChange={setSubParentId}
              options={activeRoots.map((row) => ({
                value: row.id,
                label: row.name,
              }))}
              placeholder='Select category'
              required
            />
          </label>
          <label>
            Name
            <input
              value={subName}
              onChange={(e) => setSubName(e.target.value)}
              required
              minLength={2}
            />
          </label>
          <button type='submit' disabled={saving || !subParentId}>
            Save sub-category
          </button>
        </form>
      </Modal>

      <Modal
        open={Boolean(manageCat && manageMode)}
        title={manageTitle}
        description={
          manageMode === "delete"
            ? "Move every product to another category before you can confirm delete."
            : "Deactivated categories hide their products from the catalog list."
        }
        onClose={closeManageCategory}
        wide
      >
        {manageCat ? (
          <div className='stack-form'>
            <p>
              <strong>{manageCat.name}</strong>
              {manageCat.code ? (
                <span className='muted'> · {manageCat.code}</span>
              ) : null}
              <span className='muted'>
                {" "}
                · {manageProducts.length} product
                {manageProducts.length === 1 ? "" : "s"}
              </span>
            </p>
            {manageMode === "delete" && manageChildCount > 0 ? (
              <p className='form-error'>
                Delete all sub-categories first, then delete this category.
              </p>
            ) : null}

            {manageProducts.length > 0 ? (
              <>
                <div className='catalog-reassign-toolbar'>
                  <label className='catalog-check-all'>
                    <input
                      type='checkbox'
                      checked={
                        manageProducts.length > 0 &&
                        selectedItemIds.length === manageProducts.length
                      }
                      onChange={toggleSelectAllManage}
                    />
                    Select all
                  </label>
                  <Select
                    value={targetCategoryId}
                    onChange={(value) => {
                      setTargetCategoryId(value);
                      setTargetSubId("");
                    }}
                    options={activeRoots
                      .filter((row) => row.id !== manageCat.id)
                      .map((row) => ({ value: row.id, label: row.name }))}
                    placeholder='New category'
                  />
                  <Select
                    value={targetSubId}
                    onChange={setTargetSubId}
                    options={targetSubs.map((row) => ({
                      value: row.id,
                      label: row.name,
                    }))}
                    placeholder='New sub-category (optional)'
                    disabled={!targetCategoryId}
                  />
                  <button
                    type='button'
                    disabled={
                      saving ||
                      selectedItemIds.length === 0 ||
                      !targetCategoryId
                    }
                    onClick={() => void onMoveSelectedProducts()}
                  >
                    Move selected ({selectedItemIds.length})
                  </button>
                </div>

                <div className='journal-lines-scroll dense-table-scroll'>
                  <table className='journal-lines-table dense-table'>
                    <thead>
                      <tr>
                        <th style={{ width: 36 }} />
                        <th>SKU</th>
                        <th>Name</th>
                        <th>Category</th>
                      </tr>
                    </thead>
                    <tbody>
                      {manageProducts.map((row) => {
                        const cat = categories.find(
                          (c) => c.id === row.categoryId,
                        );
                        const sub = categories.find(
                          (c) => c.id === row.subCategoryId,
                        );
                        return (
                          <tr key={row.id}>
                            <td>
                              <input
                                type='checkbox'
                                checked={selectedItemIds.includes(row.id)}
                                onChange={() => toggleItemSelection(row.id)}
                                aria-label={`Select ${row.sku}`}
                              />
                            </td>
                            <td>{row.sku}</td>
                            <td>{row.name}</td>
                            <td>
                              {cat?.name ?? "—"}
                              {sub ? ` / ${sub.name}` : ""}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className='muted'>
                No products left in this{" "}
                {manageCat.parentId ? "sub-category" : "category"}.
              </p>
            )}

            {manageError ? <p className='form-error'>{manageError}</p> : null}

            <div className='form-actions'>
              <button
                type='button'
                className='ghost'
                onClick={closeManageCategory}
              >
                Cancel
              </button>
              {manageMode === "deactivate" ? (
                <button
                  type='button'
                  disabled={saving}
                  onClick={() => void onConfirmDeactivateCategory()}
                >
                  Deactivate
                </button>
              ) : (
                <button
                  type='button'
                  disabled={
                    saving || manageProducts.length > 0 || manageChildCount > 0
                  }
                  onClick={() => void onConfirmDeleteCategory()}
                >
                  Confirm delete
                </button>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={itemModal}
        title={itemModalTitle}
        description={
          itemModalMode === "view"
            ? "Read-only product details."
            : "Catalog SKU with price, description, specification, and supplier."
        }
        onClose={() => {
          setItemModal(false);
          setItemError(null);
          setEditingItemId(null);
        }}
        wide
      >
        <AddItemForm
          values={itemForm}
          onChange={(patch) => setItemForm((prev) => ({ ...prev, ...patch }))}
          onSubmit={(e) => void onSaveItem(e)}
          saving={saving}
          error={itemError}
          categories={activeCategoriesForForm}
          suppliers={suppliers}
          warehouses={warehouses}
          mode={itemModalMode === "edit" ? "edit" : "create"}
          readOnly={itemModalMode === "view"}
          submitLabel={
            itemModalMode === "edit" ? "Save changes" : "Add product"
          }
        />
      </Modal>
    </>
  );
}
