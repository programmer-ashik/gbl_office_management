import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import {
  AddItemForm,
  addItemBodyFromValues,
  emptyAddItemValues,
  type AddItemFormValues,
} from "../components/AddItemForm";
import { ExpandableText } from "../components/ExpandableText";
import { Modal, Select } from "../components/ui";
import { money } from "../types/accounting";
import { Role } from "../types/auth";
import type { Item, ProductCategory, Supplier } from "../types/procurement";

export function ProcurementCatalogPage() {
  const { user } = useAuth();
  const isFinance = user?.role === Role.ADMIN || user?.role === Role.ACCOUNTANT;
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
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
  const [catName, setCatName] = useState("");
  const [catCode, setCatCode] = useState("");
  const [subName, setSubName] = useState("");
  const [subParentId, setSubParentId] = useState("");
  const [itemForm, setItemForm] =
    useState<AddItemFormValues>(emptyAddItemValues());

  async function load() {
    const [cats, productRows, vendorRows] = await Promise.all([
      api.productCategories(),
      api.items(
        productSearch.trim() ? { search: productSearch.trim() } : undefined,
      ),
      api.suppliers().catch(() => [] as Supplier[]),
    ]);
    setCategories(cats);
    setItems(productRows);
    setSuppliers(vendorRows);
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
      if (selectedSubId && row.subCategoryId !== selectedSubId) return false;
      if (
        selectedCategoryId &&
        !selectedSubId &&
        row.categoryId !== selectedCategoryId
      ) {
        return false;
      }
      return true;
    });
  }, [items, selectedCategoryId, selectedSubId]);

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

  async function onCreateItem(event: FormEvent) {
    event.preventDefault();
    if (!isFinance) return;
    setSaving(true);
    setItemError(null);
    setError(null);
    try {
      await api.createItem(addItemBodyFromValues(itemForm));
      setItemForm(emptyAddItemValues());
      setItemModal(false);
      await load();
    } catch (err) {
      setItemError(
        err instanceof Error ? err.message : "Unable to create product",
      );
    } finally {
      setSaving(false);
    }
  }

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
              <button type='button' onClick={() => setItemModal(true)}>
                Add product
              </button>
            </>
          ) : null}
        </div>
      </header>
      <div className=''>
        {" "}
        <p className='text-muted'>
          Categories → sub-categories → products. Warehouse stock and project
          issue stay on Material Allocation.
        </p>
      </div>
      {error ? <p className='form-error'>{error}</p> : null}

      <section className='catalog-layout catalog-layout-compact'>
        <aside className='table-card catalog-sidebar compact-panel'>
          <div className='compact-toolbar'>
            <input
              className='compact-search'
              value={categorySearch}
              onChange={(e) => setCategorySearch(e.target.value)}
              placeholder='Search categories…'
              aria-label='Search categories'
            />
          </div>
          <button
            type='button'
            className={`catalog-cat-btn ${!selectedCategoryId ? "is-active" : ""}`}
            onClick={() => {
              setSelectedCategoryId("");
              setSelectedSubId("");
            }}
          >
            All products
          </button>
          <ul className='catalog-cat-list'>
            {filteredRoots.map((cat) => (
              <li key={cat.id}>
                <button
                  type='button'
                  className={`catalog-cat-btn ${selectedCategoryId === cat.id ? "is-active" : ""}`}
                  onClick={() => {
                    setSelectedCategoryId(cat.id);
                    setSelectedSubId("");
                  }}
                >
                  {cat.name}
                  {cat.code ? ` (${cat.code})` : ""}
                </button>
                {selectedCategoryId === cat.id ? (
                  <ul className='catalog-sub-list'>
                    {subs
                      .filter((row) => row.parentId === cat.id)
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
                    </tr>
                  );
                })}
                {visibleItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className='muted'>
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
              options={roots.map((row) => ({ value: row.id, label: row.name }))}
              searchable
              portal
              placeholder='Select category'
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
        title='Add item'
        description='Catalog SKU with price, description, specification, and supplier.'
        onClose={() => {
          setItemModal(false);
          setItemError(null);
        }}
        wide
      >
        <AddItemForm
          values={itemForm}
          onChange={(patch) => setItemForm((prev) => ({ ...prev, ...patch }))}
          onSubmit={(e) => void onCreateItem(e)}
          saving={saving}
          error={itemError}
          categories={categories}
          suppliers={suppliers}
        />
      </Modal>
    </>
  );
}
