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
import { Modal, Select } from "../components/ui";
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
  const subs = useMemo(
    () =>
      categories.filter(
        (row) =>
          row.parentId &&
          (!selectedCategoryId || row.parentId === selectedCategoryId),
      ),
    [categories, selectedCategoryId],
  );

  const filteredRoots = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return roots;
    return roots.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        (row.code ?? "").toLowerCase().includes(q),
    );
  }, [roots, categorySearch]);

  const visibleItems = useMemo(() => {
    return items.filter((row) => {
      if (selectedSubId) return row.subCategoryId === selectedSubId;
      if (selectedCategoryId) return row.categoryId === selectedCategoryId;
      return true;
    });
  }, [items, selectedCategoryId, selectedSubId]);

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
          <ul className='catalog-cat-list'>
            <li>
              <button
                type='button'
                className={`catalog-cat-btn ${!selectedCategoryId && !selectedSubId ? "is-active" : ""}`}
                onClick={() => {
                  setSelectedCategoryId("");
                  setSelectedSubId("");
                }}
              >
                All categories
              </button>
            </li>
            {filteredRoots.map((row) => (
              <li key={row.id}>
                <button
                  type='button'
                  className={`catalog-cat-btn ${selectedCategoryId === row.id && !selectedSubId ? "is-active" : ""}`}
                  onClick={() => {
                    setSelectedCategoryId(row.id);
                    setSelectedSubId("");
                  }}
                >
                  {row.name}
                </button>
                {selectedCategoryId === row.id ? (
                  <ul className='catalog-sub-list'>
                    {subs
                      .filter((sub) => sub.parentId === row.id)
                      .map((sub) => (
                        <li key={sub.id}>
                          <button
                            type='button'
                            className={`catalog-cat-btn is-sub ${selectedSubId === sub.id ? "is-active" : ""}`}
                            onClick={() => setSelectedSubId(sub.id)}
                          >
                            {sub.name}
                          </button>
                        </li>
                      ))}
                  </ul>
                ) : null}
              </li>
            ))}
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
                        <div className='table-actions'>
                          <button
                            type='button'
                            className='ghost'
                            onClick={() => openViewItem(row)}
                          >
                            View
                          </button>
                          {isFinance ? (
                            <>
                              <button
                                type='button'
                                className='ghost'
                                onClick={() => openEditItem(row)}
                              >
                                Update
                              </button>
                              <button
                                type='button'
                                className='ghost'
                                disabled={saving}
                                onClick={() => void onDeleteItem(row)}
                              >
                                Delete
                              </button>
                            </>
                          ) : null}
                        </div>
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
              options={roots.map((row) => ({
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
          categories={categories}
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
