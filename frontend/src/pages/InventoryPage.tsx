import { useEffect, useState, type FormEvent } from "react";
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
import { MetricCard } from "../components/MetricCard";
import { Modal, Select } from "../components/ui";
import { money } from "../types/accounting";
import { Role } from "../types/auth";
import type { Project } from "../types/project";
import {
  qty,
  type Item,
  type ProductCategory,
  type StockIssue,
  type StockRow,
  type Supplier,
  type Warehouse,
} from "../types/procurement";

export function InventoryPage() {
  const { user } = useAuth();
  const isFinance = user?.role === Role.ADMIN || user?.role === Role.ACCOUNTANT;
  const [items, setItems] = useState<Item[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [issues, setIssues] = useState<StockIssue[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [itemForm, setItemForm] = useState<AddItemFormValues>(emptyAddItemValues());
  const [error, setError] = useState<string | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [itemModalOpen, setItemModalOpen] = useState(false);

  async function load() {
    const [itemRows, rows, issueRows, warehouseRows, projectRows, cats, vendors] =
      await Promise.all([
        api.items(),
        api.inventory(),
        api.stockIssues(),
        api.warehouses(),
        api.projects(),
        api.productCategories().catch(() => [] as ProductCategory[]),
        api.suppliers().catch(() => [] as Supplier[]),
      ]);
    const catalog = Array.isArray(itemRows) ? itemRows : [];
    const onHand = Array.isArray(rows) ? rows : [];
    const issueList = Array.isArray(issueRows) ? issueRows : [];
    const warehouseList = Array.isArray(warehouseRows) ? warehouseRows : [];
    const projectList = Array.isArray(projectRows) ? projectRows : [];

    setItems(catalog);
    setStock(onHand);
    setIssues(issueList);
    setWarehouses(warehouseList);
    setProjects(projectList);
    setCategories(cats);
    setSuppliers(vendors);
    if (!warehouseId && warehouseList[0]) setWarehouseId(warehouseList[0].id);
    if (!projectId && projectList[0]) setProjectId(projectList[0].id);
    if (!itemId && onHand[0]) setItemId(onHand[0].itemId);
    else if (!itemId && catalog[0]) setItemId(catalog[0].id);
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Unable to load inventory");
    });
  }, []);

  async function onCreateItem(event: FormEvent) {
    event.preventDefault();
    if (!isFinance) return;
    setSaving(true);
    setItemError(null);
    setError(null);
    try {
      const created = await api.createItem(addItemBodyFromValues(itemForm));
      setItemForm(emptyAddItemValues());
      setItemModalOpen(false);
      setItemId(created.id);
      await load();
    } catch (err) {
      setItemError(err instanceof Error ? err.message : "Unable to create item");
    } finally {
      setSaving(false);
    }
  }

  async function onIssue(event: FormEvent) {
    event.preventDefault();
    if (!warehouseId || !projectId || !itemId) return;
    setSaving(true);
    setError(null);
    try {
      await api.issueStock({
        warehouseId,
        projectId,
        date,
        lines: [{ itemId, quantity: Number(quantity) }],
      });
      setQuantity("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to issue stock");
    } finally {
      setSaving(false);
    }
  }

  const totalValue = stock.reduce((sum, row) => sum + row.value, 0);
  const issueItemOptions =
    stock.length > 0
      ? stock.map((row) => ({
          value: row.itemId,
          label: `${row.sku} · ${row.name} (${qty(row.quantity)} ${row.unit})`,
        }))
      : items.map((row) => ({
          value: row.id,
          label: `${row.sku} · ${row.name} (${row.unit})`,
        }));

  return (
    <>
      <header className='workspace-header'>
        <div>
          <h1>Central warehouse</h1>
        </div>
        <div className='form-actions'>
          <Link to='/procurement' className='ghost-link'>
            Procurement
          </Link>
          {isFinance ? (
            <button type='button' onClick={() => setItemModalOpen(true)}>
              Add item
            </button>
          ) : null}
        </div>
      </header>

      <section className='grid metric-card-grid'>
        <MetricCard
          variant='teal'
          title='On-hand value'
          value={money(totalValue)}
          meta='GL 1141 · Inventory'
        />
        <MetricCard
          variant='blue'
          title='SKUs in stock'
          value={stock.length}
          meta='FIFO lots from warehouse receipts'
        />
        <MetricCard
          variant='amber'
          title='Catalog items'
          value={items.length}
          meta='Active SKUs available for POs'
        />
      </section>

      {isFinance ? (
        <Modal
          open={itemModalOpen}
          title="Add item"
          description="Catalog SKU with price, description, specification, and supplier."
          onClose={() => {
            setItemModalOpen(false);
            setItemError(null);
          }}
          wide
        >
          <AddItemForm
            values={itemForm}
            onChange={(patch) => setItemForm((prev) => ({ ...prev, ...patch }))}
            onSubmit={(event) => void onCreateItem(event)}
            saving={saving}
            error={itemError}
            categories={categories}
            suppliers={suppliers}
          />
        </Modal>
      ) : null}

      <section className='table-card'>
        <h2>Catalog items</h2>
        <p className='muted'>
          Items added here are available on purchase orders. On-hand quantity
          stays at zero until goods are received into a warehouse.
        </p>
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Item</th>
              <th>Unit</th>
              <th className='num'>Price</th>
              <th>Supplier</th>
              <th>Description</th>
              <th>On hand</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              const onHand = stock
                .filter((s) => s.itemId === row.id)
                .reduce((sum, s) => sum + s.quantity, 0);
              return (
                <tr key={row.id}>
                  <td>{row.sku}</td>
                  <td>
                    <div>{row.name}</div>
                    {row.technicalSpecification ? (
                      <div className='muted' style={{ fontSize: 12 }}>
                        <ExpandableText
                          text={row.technicalSpecification}
                          maxChars={48}
                        />
                      </div>
                    ) : null}
                  </td>
                  <td>{row.unit}</td>
                  <td className='num'>
                    {row.unitPrice != null ? money(row.unitPrice) : '—'}
                  </td>
                  <td>{row.supplierName ?? '—'}</td>
                  <td>
                    <ExpandableText text={row.description} maxChars={40} />
                  </td>
                  <td>{onHand > 0 ? `${qty(onHand)} ${row.unit}` : '—'}</td>
                </tr>
              );
            })}
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className='muted'>
                  No catalog items yet. Use Add item to create one.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {isFinance ? (
        <section className='table-card'>
          <h2>Issue to project</h2>
          <p className='muted'>
            Moves warehouse stock to project materials (Dr 5110 / Cr 1141).
            Direct site deliveries never pass through this screen.
          </p>
          <form
            className='stack-form'
            onSubmit={(event) => void onIssue(event)}
          >
            <div className='name-row'>
              <label>
                Warehouse
                <Select
                  value={warehouseId}
                  onChange={setWarehouseId}
                  options={warehouses.map((row) => ({
                    value: row.id,
                    label: `${row.code} · ${row.name}`,
                  }))}
                  placeholder='Select warehouse'
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
                  placeholder='Select project'
                  required
                />
              </label>
              <label>
                Date
                <input
                  type='date'
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </label>
            </div>
            <div className='name-row'>
              <label>
                Item
                <Select
                  value={itemId}
                  onChange={setItemId}
                  options={issueItemOptions}
                  placeholder='Select item'
                  required
                />
              </label>
              <label>
                Quantity
                <input
                  inputMode='decimal'
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </label>
            </div>
            <div className='form-actions'>
              <button
                type='submit'
                disabled={
                  saving ||
                  stock.length === 0 ||
                  !warehouseId ||
                  !projectId ||
                  !itemId
                }
              >
                {saving ? "Posting…" : "Issue to project"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className='table-card'>
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
                <td colSpan={5} className='muted'>
                  Warehouse is empty. Receive a warehouse PO first.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className='table-card'>
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
                        sku: "—",
                        name: "—",
                        unit: "",
                        quantity: row.quantity ?? 0,
                        amount: row.amount,
                      },
                    ];
              return lines.map((line, index) => (
                <tr key={`${row.id}-${index}`}>
                  <td>{index === 0 ? row.issueNumber : ""}</td>
                  <td>{index === 0 ? row.date.slice(0, 10) : ""}</td>
                  <td>
                    {index === 0 ? (
                      row.projectId ? (
                        <Link to={`/projects/${row.projectId}`}>
                          {row.projectName}
                        </Link>
                      ) : (
                        row.projectName || '—'
                      )
                    ) : (
                      ""
                    )}
                  </td>
                  <td>
                    {line.sku} · {line.name}
                  </td>
                  <td>
                    {qty(line.quantity)}
                    {line.unit ? ` ${line.unit}` : ""}
                  </td>
                  <td>{money(line.amount)}</td>
                  <td>{index === 0 ? row.journalNumber : ""}</td>
                </tr>
              ));
            })}
            {issues.length === 0 ? (
              <tr>
                <td colSpan={7} className='muted'>
                  No stock issues yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {!itemModalOpen && error ? <p className='form-error'>{error}</p> : null}
    </>
  );
}
