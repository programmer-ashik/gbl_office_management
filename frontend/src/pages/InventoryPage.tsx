import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
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

const PAGE_SIZE = 15;

function matchesQuery(haystack: string, q: string): boolean {
  return haystack.toLowerCase().includes(q);
}

type IssueFlatRow = {
  key: string;
  issueNumber: string;
  date: string;
  projectId: string | null;
  projectName: string;
  journalNumber: string;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  amount: number;
  isFirst: boolean;
};

function TablePager(props: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const { page, totalPages, total, onPage } = props;
  if (total === 0) return null;
  return (
    <div className='table-pagination'>
      <p className='muted'>
        Page {page} of {totalPages} · {total} rows
      </p>
      <div className='form-actions'>
        <button
          type='button'
          className='ghost'
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </button>
        <button
          type='button'
          className='ghost'
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

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
  const [itemForm, setItemForm] =
    useState<AddItemFormValues>(emptyAddItemValues());
  const [error, setError] = useState<string | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [itemModalOpen, setItemModalOpen] = useState(false);

  const [catalogSearch, setCatalogSearch] = useState("");
  const [stockSearch, setStockSearch] = useState("");
  const [issuesSearch, setIssuesSearch] = useState("");
  const [catalogPage, setCatalogPage] = useState(1);
  const [stockPage, setStockPage] = useState(1);
  const [issuesPage, setIssuesPage] = useState(1);

  async function load() {
    const [
      itemRows,
      rows,
      issueRows,
      warehouseRows,
      projectRows,
      cats,
      vendors,
    ] = await Promise.all([
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
      setItemError(
        err instanceof Error ? err.message : "Unable to create item",
      );
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

  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter((row) =>
      matchesQuery(
        [
          row.sku,
          row.name,
          row.unit,
          row.brand ?? "",
          row.model ?? "",
          row.supplierName ?? "",
          row.description ?? "",
          row.serialNumber ?? "",
          row.barcode ?? "",
        ].join(" "),
        q,
      ),
    );
  }, [items, catalogSearch]);

  const filteredStock = useMemo(() => {
    const q = stockSearch.trim().toLowerCase();
    if (!q) return stock;
    return stock.filter((row) =>
      matchesQuery(
        [
          row.warehouseCode,
          row.warehouseName,
          row.sku,
          row.name,
          row.unit,
        ].join(" "),
        q,
      ),
    );
  }, [stock, stockSearch]);

  const flatIssues = useMemo((): IssueFlatRow[] => {
    return issues.flatMap((row) => {
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
      return lines.map((line, index) => ({
        key: `${row.id}-${index}`,
        issueNumber: row.issueNumber,
        date: row.date.slice(0, 10),
        projectId: row.projectId ?? null,
        projectName: row.projectName || "—",
        journalNumber: row.journalNumber,
        sku: line.sku,
        name: line.name,
        unit: line.unit,
        quantity: line.quantity,
        amount: line.amount,
        isFirst: index === 0,
      }));
    });
  }, [issues]);

  const filteredIssues = useMemo(() => {
    const q = issuesSearch.trim().toLowerCase();
    if (!q) return flatIssues;
    return flatIssues.filter((row) =>
      matchesQuery(
        [
          row.issueNumber,
          row.date,
          row.projectName,
          row.sku,
          row.name,
          row.journalNumber,
        ].join(" "),
        q,
      ),
    );
  }, [flatIssues, issuesSearch]);

  useEffect(() => setCatalogPage(1), [catalogSearch]);
  useEffect(() => setStockPage(1), [stockSearch]);
  useEffect(() => setIssuesPage(1), [issuesSearch]);

  const catalogPages = Math.max(1, Math.ceil(filteredCatalog.length / PAGE_SIZE));
  const stockPages = Math.max(1, Math.ceil(filteredStock.length / PAGE_SIZE));
  const issuesPages = Math.max(1, Math.ceil(filteredIssues.length / PAGE_SIZE));

  const catalogRows = filteredCatalog.slice(
    (catalogPage - 1) * PAGE_SIZE,
    catalogPage * PAGE_SIZE,
  );
  const stockRows = filteredStock.slice(
    (stockPage - 1) * PAGE_SIZE,
    stockPage * PAGE_SIZE,
  );
  const issueRows = filteredIssues.slice(
    (issuesPage - 1) * PAGE_SIZE,
    issuesPage * PAGE_SIZE,
  );

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
          title='Add item'
          description='Catalog SKU with price, description, specification, and supplier.'
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
            warehouses={warehouses}
          />
        </Modal>
      ) : null}
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
        <div className='table-head'>
          <div>
            <h2>Catalog items</h2>
            <p className='muted'>
              Items added here are available on purchase orders. On-hand
              quantity stays at zero until goods are received into a warehouse.
            </p>
          </div>
          <input
            className='compact-search'
            value={catalogSearch}
            onChange={(e) => setCatalogSearch(e.target.value)}
            placeholder='Search catalog…'
            aria-label='Search catalog items'
          />
        </div>
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
            {catalogRows.map((row) => {
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
                    {row.unitPrice != null ? money(row.unitPrice) : "—"}
                  </td>
                  <td>{row.supplierName ?? "—"}</td>
                  <td>
                    <ExpandableText text={row.description} maxChars={40} />
                  </td>
                  <td>{onHand > 0 ? `${qty(onHand)} ${row.unit}` : "—"}</td>
                </tr>
              );
            })}
            {catalogRows.length === 0 ? (
              <tr>
                <td colSpan={7} className='muted'>
                  {catalogSearch.trim()
                    ? "No catalog items match this search."
                    : "No catalog items yet. Use Add item to create one."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <TablePager
          page={Math.min(catalogPage, catalogPages)}
          totalPages={catalogPages}
          total={filteredCatalog.length}
          onPage={setCatalogPage}
        />
      </section>

      <section className='table-card'>
        <div className='table-head'>
          <h2>On hand</h2>
          <input
            className='compact-search'
            value={stockSearch}
            onChange={(e) => setStockSearch(e.target.value)}
            placeholder='Search stock…'
            aria-label='Search on-hand stock'
          />
        </div>
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
            {stockRows.map((row) => (
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
            {stockRows.length === 0 ? (
              <tr>
                <td colSpan={5} className='muted'>
                  {stockSearch.trim()
                    ? "No stock rows match this search."
                    : "Warehouse is empty. Receive a warehouse PO first."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <TablePager
          page={Math.min(stockPage, stockPages)}
          totalPages={stockPages}
          total={filteredStock.length}
          onPage={setStockPage}
        />
      </section>

      <section className='table-card'>
        <div className='table-head'>
          <h2>Issues</h2>
          <input
            className='compact-search'
            value={issuesSearch}
            onChange={(e) => setIssuesSearch(e.target.value)}
            placeholder='Search issues…'
            aria-label='Search stock issues'
          />
        </div>
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
            {issueRows.map((row) => (
              <tr key={row.key}>
                <td>{row.isFirst ? row.issueNumber : ""}</td>
                <td>{row.isFirst ? row.date : ""}</td>
                <td>
                  {row.isFirst ? (
                    row.projectId ? (
                      <Link to={`/projects/${row.projectId}`}>
                        {row.projectName}
                      </Link>
                    ) : (
                      row.projectName
                    )
                  ) : (
                    ""
                  )}
                </td>
                <td>
                  {row.sku} · {row.name}
                </td>
                <td>
                  {qty(row.quantity)}
                  {row.unit ? ` ${row.unit}` : ""}
                </td>
                <td>{money(row.amount)}</td>
                <td>{row.isFirst ? row.journalNumber : ""}</td>
              </tr>
            ))}
            {issueRows.length === 0 ? (
              <tr>
                <td colSpan={7} className='muted'>
                  {issuesSearch.trim()
                    ? "No issues match this search."
                    : "No stock issues yet."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <TablePager
          page={Math.min(issuesPage, issuesPages)}
          totalPages={issuesPages}
          total={filteredIssues.length}
          onPage={setIssuesPage}
        />
      </section>

      {!itemModalOpen && error ? <p className='form-error'>{error}</p> : null}
    </>
  );
}
