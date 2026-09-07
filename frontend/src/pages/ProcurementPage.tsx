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
import {
  AddSupplierForm,
  emptyAddSupplierValues,
  type AddSupplierFormValues,
} from "../components/AddSupplierForm";
import { MetricCard } from "../components/MetricCard";
import { Modal } from "../components/ui";
import { money } from "../types/accounting";
import { Role } from "../types/auth";
import type { ProductCategory } from "../types/procurement";
import {
  PO_STATUS_LABEL,
  type Item,
  type PurchaseOrder,
  type Supplier,
} from "../types/procurement";

export function ProcurementPage() {
  const { user } = useAuth();
  const isFinance = user?.role === Role.ADMIN || user?.role === Role.ACCOUNTANT;
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [supplierForm, setSupplierForm] = useState<AddSupplierFormValues>(
    emptyAddSupplierValues(),
  );
  const [itemForm, setItemForm] =
    useState<AddItemFormValues>(emptyAddItemValues());
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [itemModalOpen, setItemModalOpen] = useState(false);

  async function load() {
    const [vendorRows, itemRows, orderRows, categoryRows] = await Promise.all([
      api.suppliers(),
      api.items(),
      api.purchaseOrders(),
      api.productCategories().catch(() => [] as ProductCategory[]),
    ]);
    setSuppliers(vendorRows);
    setItems(itemRows);
    setOrders(orderRows);
    setCategories(categoryRows);
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(
        err instanceof Error ? err.message : "Unable to load procurement",
      );
    });
  }, []);

  async function onCreateSupplier(event: FormEvent) {
    event.preventDefault();
    if (!isFinance) return;
    setSaving(true);
    setSupplierError(null);
    setError(null);
    try {
      await api.createSupplier({
        name: supplierForm.name,
        contactName: supplierForm.contactName || undefined,
        phone: supplierForm.phone || undefined,
        address: supplierForm.address || undefined,
      });
      setSupplierForm(emptyAddSupplierValues());
      setSupplierModalOpen(false);
      await load();
    } catch (err) {
      setSupplierError(
        err instanceof Error ? err.message : "Unable to create supplier",
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
      setItemModalOpen(false);
      await load();
    } catch (err) {
      setItemError(
        err instanceof Error ? err.message : "Unable to create item",
      );
    } finally {
      setSaving(false);
    }
  }

  const anyModalOpen = supplierModalOpen || itemModalOpen;

  return (
    <>
      <header className='workspace-header'>
        <div>
          <h1>Purchase Orders</h1>
        </div>
        <div className='header-actions header-actions-compact'>
          <Link to='/procurement/catalog' className='ghost-link compact-link'>
            Catalog
          </Link>
          <Link to='/inventory' className='ghost-link compact-link'>
            Inventory
          </Link>
          {isFinance ? (
            <>
              <button
                type='button'
                className='ghost compact-btn'
                onClick={() => setSupplierModalOpen(true)}
              >
                Supplier
              </button>
              <button
                type='button'
                className='ghost compact-btn'
                onClick={() => setItemModalOpen(true)}
              >
                Item
              </button>
            </>
          ) : null}
          <Link to='/procurement/new' className='compact-btn-primary'>
            New PO
          </Link>
        </div>
      </header>
      <div className=''>
        <p className='muted'>
          Create POs from existing catalog products. Warehouse receive updates
          stock; issue to project stays on Material Allocation.
        </p>
      </div>

      {isFinance ? (
        <section className='grid metric-card-grid'>
          <MetricCard
            variant='amber'
            title='Open payables'
            value={money(
              orders.reduce((sum, row) => sum + row.outstandingPayable, 0),
            )}
            meta='Received less vendor returns'
          />
        </section>
      ) : null}

      <Modal
        open={supplierModalOpen}
        title='Add supplier'
        description='Creates a vendor record for POs and payables'
        onClose={() => {
          setSupplierModalOpen(false);
          setSupplierError(null);
        }}
      >
        <AddSupplierForm
          values={supplierForm}
          onChange={(patch) =>
            setSupplierForm((prev) => ({ ...prev, ...patch }))
          }
          onSubmit={(event) => void onCreateSupplier(event)}
          saving={saving}
          error={supplierError}
          submitLabel='Create supplier'
        />
      </Modal>

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
        />
      </Modal>

      <section className='table-card'>
        <div className='table-head'>
          <h2>Purchase orders</h2>
          <p className='muted'>
            {orders.length} orders · {items.length} catalog SKUs
          </p>
        </div>
        <table>
          <thead>
            <tr>
              <th>PO</th>
              <th>Supplier</th>
              <th>Destination</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link to={`/procurement/${row.id}`}>{row.poNumber}</Link>
                </td>
                <td>
                  {isFinance ? (
                    <Link to={`/suppliers/${row.supplierId}`}>
                      {row.supplierName}
                    </Link>
                  ) : (
                    row.supplierName
                  )}
                </td>
                <td>
                  {row.destination === "warehouse"
                    ? (row.warehouseName ?? "Warehouse")
                    : (row.projectName ?? "Site")}
                </td>
                <td>{PO_STATUS_LABEL[row.status]}</td>
                <td>{row.date.slice(0, 10)}</td>
              </tr>
            ))}
            {orders.length === 0 ? (
              <tr>
                <td colSpan={5} className='muted'>
                  No purchase orders yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className='table-card'>
        <h2>Suppliers</h2>
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Name</th>
              <th>Terms</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((row) => (
              <tr key={row.id}>
                <td>
                  {isFinance ? (
                    <Link to={`/suppliers/${row.id}`}>
                      {row.supplierNumber}
                    </Link>
                  ) : (
                    row.supplierNumber
                  )}
                </td>
                <td>{row.name}</td>
                <td>{row.paymentTermsDays} days</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {!anyModalOpen && error ? <p className='form-error'>{error}</p> : null}
    </>
  );
}
