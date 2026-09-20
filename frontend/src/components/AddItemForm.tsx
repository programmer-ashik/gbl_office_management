import { useEffect, useMemo, type FormEvent } from "react";
import { Select } from "./ui";
import type {
  Item,
  ProductCategory,
  Supplier,
  Warehouse,
} from "../types/procurement";
import { buildItemBarcode, code39Svg } from "../utils/barcodeSvg";

const UNIT_OPTIONS = [
  { value: "pcs", label: "pcs" },
  { value: "set", label: "set" },
  { value: "box", label: "box" },
  { value: "kg", label: "kg" },
  { value: "g", label: "g" },
  { value: "m", label: "m" },
  { value: "cm", label: "cm" },
  { value: "ltr", label: "ltr" },
  { value: "roll", label: "roll" },
  { value: "pair", label: "pair" },
  { value: "pack", label: "pack" },
  { value: "unit", label: "unit" },
] as const;

export type AddItemFormValues = {
  sku: string;
  name: string;
  unit: string;
  description: string;
  unitPrice: string;
  quantity: string;
  brand: string;
  model: string;
  countryOfOrigin: string;
  technicalSpecification: string;
  warranty: string;
  serialNumber: string;
  barcode: string;
  warehouseId: string;
  dataSheetUrl: string;
  categoryId: string;
  subCategoryId: string;
  supplierId: string;
};

function dayStamp(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

export function generateItemSerial(): string {
  const day = dayStamp();
  const seq = String(Date.now() % 100000).padStart(5, "0");
  return `SN${day.slice(2)}${seq}`;
}

export function generateItemSku(categoryCode: string): string {
  const code =
    (categoryCode || "GEN").toUpperCase().replace(/[^A-Z0-9]/g, "") || "GEN";
  const day = dayStamp();
  const seq = String((Date.now() % 9000) + 1000);
  return `${code}-${day.slice(2)}-${seq}`;
}

export function emptyAddItemValues(
  defaults?: Partial<AddItemFormValues>,
): AddItemFormValues {
  const serialNumber = defaults?.serialNumber ?? generateItemSerial();
  const sku = defaults?.sku ?? generateItemSku("GEN");
  return {
    name: "",
    unit: "pcs",
    description: "",
    unitPrice: "",
    quantity: "1",
    brand: "",
    model: "",
    countryOfOrigin: "",
    technicalSpecification: "",
    warranty: "",
    barcode: "",
    warehouseId: "",
    dataSheetUrl: "",
    categoryId: "",
    subCategoryId: "",
    supplierId: "",
    ...defaults,
    sku,
    serialNumber,
  };
}

export function itemToFormValues(item: Item): AddItemFormValues {
  return {
    sku: item.sku,
    name: item.name,
    unit: item.unit || "pcs",
    description: item.description ?? "",
    unitPrice: item.unitPrice != null ? String(item.unitPrice) : "",
    quantity: item.quantity != null ? String(item.quantity) : "1",
    brand: item.brand ?? "",
    model: item.model ?? "",
    countryOfOrigin: item.countryOfOrigin ?? "",
    technicalSpecification: item.technicalSpecification ?? "",
    warranty: item.warranty ?? "",
    serialNumber: item.serialNumber ?? "",
    barcode: item.barcode ?? "",
    warehouseId: item.warehouseId ?? "",
    dataSheetUrl: item.dataSheetUrl ?? "",
    categoryId: item.categoryId ?? "",
    subCategoryId: item.subCategoryId ?? "",
    supplierId: item.supplierId ?? "",
  };
}

type Props = {
  values: AddItemFormValues;
  onChange: (patch: Partial<AddItemFormValues>) => void;
  onSubmit: (event: FormEvent) => void;
  saving?: boolean;
  error?: string | null;
  categories?: ProductCategory[];
  suppliers?: Supplier[];
  warehouses?: Warehouse[];
  submitLabel?: string;
  /** create = auto codes; edit = keep existing unless regenerated */
  mode?: "create" | "edit";
  readOnly?: boolean;
};

function resolveCategoryCode(
  categories: ProductCategory[],
  categoryId: string,
  subCategoryId: string,
): string {
  if (subCategoryId) {
    const sub = categories.find((row) => row.id === subCategoryId);
    if (sub?.code) return sub.code.toUpperCase();
  }
  if (categoryId) {
    const cat = categories.find((row) => row.id === categoryId);
    if (cat?.code) return cat.code.toUpperCase();
  }
  return "GEN";
}

/** Shared Add Item form for Inventory, Catalog, and Procurement. */
export function AddItemForm({
  values,
  onChange,
  onSubmit,
  saving = false,
  error = null,
  categories = [],
  suppliers = [],
  warehouses = [],
  submitLabel = "Add item",
  mode = "create",
  readOnly = false,
}: Props) {
  const roots = categories.filter((row) => !row.parentId);
  const subs = categories.filter(
    (row) => row.parentId && row.parentId === values.categoryId,
  );

  const categoryCode = resolveCategoryCode(
    categories,
    values.categoryId,
    values.subCategoryId,
  );

  const selectedWarehouse =
    warehouses.find((row) => row.id === values.warehouseId) ??
    warehouses.find((row) => row.isDefault) ??
    warehouses[0];

  const warehouseCode = (selectedWarehouse?.code || "WH01").toUpperCase();

  const barcodeValue = useMemo(
    () =>
      values.barcode.trim() ||
      buildItemBarcode(warehouseCode, categoryCode, values.serialNumber),
    [values.barcode, values.serialNumber, warehouseCode, categoryCode],
  );

  const barcodeSvgMarkup = useMemo(
    () => code39Svg(barcodeValue, { height: 44, module: 1.4 }),
    [barcodeValue],
  );

  useEffect(() => {
    if (readOnly) return;
    if (!values.warehouseId && selectedWarehouse) {
      onChange({ warehouseId: selectedWarehouse.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.warehouseId, selectedWarehouse?.id, readOnly]);

  useEffect(() => {
    if (readOnly) return;
    const next = buildItemBarcode(
      warehouseCode,
      categoryCode,
      values.serialNumber,
    );
    if (values.barcode !== next) {
      onChange({ barcode: next });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseCode, categoryCode, values.serialNumber, readOnly]);

  function regenerateCodes() {
    if (readOnly) return;
    const serial = generateItemSerial();
    const sku = generateItemSku(categoryCode);
    const barcode = buildItemBarcode(warehouseCode, categoryCode, serial);
    onChange({ serialNumber: serial, sku, barcode });
  }

  function onCategoryChange(value: string) {
    if (mode === "edit") {
      onChange({ categoryId: value, subCategoryId: "" });
      return;
    }
    onChange({
      categoryId: value,
      subCategoryId: "",
      sku: generateItemSku(resolveCategoryCode(categories, value, "")),
    });
  }

  function onSubCategoryChange(value: string) {
    if (mode === "edit") {
      onChange({ subCategoryId: value });
      return;
    }
    onChange({
      subCategoryId: value,
      sku: generateItemSku(
        resolveCategoryCode(categories, values.categoryId, value),
      ),
    });
  }

  const disabled = readOnly || saving;

  return (
    <form className='stack-form stack-form-compact' onSubmit={onSubmit}>
      <div className='form-grid-3'>
        <label>
          Warehouse
          <Select
            value={values.warehouseId}
            onChange={(value) => onChange({ warehouseId: value })}
            options={
              warehouses.length > 0
                ? warehouses.map((row) => ({
                    value: row.id,
                    label: `${row.code} · ${row.name}${row.isDefault ? " (default)" : ""}`,
                  }))
                : [{ value: "", label: "Default warehouse" }]
            }
            searchable
            portal
            disabled={disabled}
          />
        </label>
        <label>
          SKU
          <input
            value={values.sku}
            onChange={(e) => onChange({ sku: e.target.value.toUpperCase() })}
            placeholder='Auto-generated'
            disabled={disabled}
          />
        </label>
        <label>
          Regenerate codes
          <button
            type='button'
            className='ghost'
            onClick={regenerateCodes}
            disabled={disabled}
            style={{ width: "100%" }}
          >
            Regenerate
          </button>
        </label>

        {categories.length > 0 ? (
          <>
            <label>
              Category
              <Select
                value={values.categoryId}
                onChange={onCategoryChange}
                options={[
                  { value: "", label: "Uncategorized" },
                  ...roots.map((row) => ({
                    value: row.id,
                    label: row.code ? `${row.code} · ${row.name}` : row.name,
                  })),
                ]}
                searchable
                portal
                disabled={disabled}
              />
            </label>
            <label>
              Sub-category
              <Select
                value={values.subCategoryId}
                onChange={onSubCategoryChange}
                options={[
                  { value: "", label: "None" },
                  ...subs.map((row) => ({
                    value: row.id,
                    label: row.code ? `${row.code} · ${row.name}` : row.name,
                  })),
                ]}
                searchable
                portal
                disabled={disabled}
              />
            </label>
          </>
        ) : null}
        <label>
          Supplier
          <Select
            value={values.supplierId}
            onChange={(value) => onChange({ supplierId: value })}
            options={[
              { value: "", label: "No supplier" },
              ...suppliers.map((row) => ({
                value: row.id,
                label: `${row.supplierNumber} · ${row.name}`,
              })),
            ]}
            searchable
            portal
            placeholder='Select supplier'
            disabled={disabled}
          />
        </label>

        <label className='form-span-3'>
          Name
          <input
            value={values.name}
            onChange={(e) => onChange({ name: e.target.value })}
            required
            disabled={disabled}
          />
        </label>

        <label>
          Brand
          <input
            value={values.brand}
            onChange={(e) => onChange({ brand: e.target.value })}
            disabled={disabled}
          />
        </label>
        <label>
          Model
          <input
            value={values.model}
            onChange={(e) => onChange({ model: e.target.value })}
            disabled={disabled}
          />
        </label>
        <label>
          Country of manufacture
          <input
            value={values.countryOfOrigin}
            onChange={(e) => onChange({ countryOfOrigin: e.target.value })}
            placeholder='e.g. Bangladesh'
            disabled={disabled}
          />
        </label>

        <label>
          Unit
          <Select
            value={values.unit}
            onChange={(value) => onChange({ unit: value })}
            options={UNIT_OPTIONS.map((row) => ({
              value: row.value,
              label: row.label,
            }))}
            portal
            disabled={disabled}
          />
        </label>
        <label>
          Warranty
          <input
            value={values.warranty}
            onChange={(e) => onChange({ warranty: e.target.value })}
            placeholder='e.g. 12 months'
            disabled={disabled}
          />
        </label>
        <label>
          Item serial number
          <input
            value={values.serialNumber}
            onChange={(e) =>
              onChange({ serialNumber: e.target.value.toUpperCase() })
            }
            required
            disabled={disabled}
          />
        </label>

        <label>
          Price
          <input
            type='number'
            min={0}
            step='0.01'
            value={values.unitPrice}
            onChange={(e) => onChange({ unitPrice: e.target.value })}
            placeholder='0.00'
            disabled={disabled}
          />
        </label>
        <label>
          Quantity
          <input
            type='number'
            min={0}
            step='any'
            value={values.quantity}
            onChange={(e) => onChange({ quantity: e.target.value })}
            disabled={disabled}
          />
        </label>
        <label>
          Data sheet URL{" "}
          <span className='muted' style={{ fontWeight: 400 }}>
            (optional)
          </span>
          <input
            type='url'
            value={values.dataSheetUrl}
            onChange={(e) => onChange({ dataSheetUrl: e.target.value })}
            placeholder='https://…'
            disabled={disabled}
          />
        </label>

        <div className='form-span-3'>
          <p className='muted' style={{ marginBottom: 6, fontSize: 12 }}>
            Barcode = warehouse · category · serial ({barcodeValue})
          </p>
          <div
            className='barcode-preview'
            style={{
              overflowX: "auto",
              padding: "8px 0",
              background: "#fff",
              borderRadius: 6,
            }}
            dangerouslySetInnerHTML={{ __html: barcodeSvgMarkup }}
          />
        </div>

        <label className='form-span-3'>
          Description
          <textarea
            rows={2}
            value={values.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder='Short product description'
            disabled={disabled}
          />
        </label>

        <label className='form-span-3'>
          Specification
          <textarea
            rows={2}
            value={values.technicalSpecification}
            onChange={(e) =>
              onChange({ technicalSpecification: e.target.value })
            }
            placeholder='Technical specification'
            disabled={disabled}
          />
        </label>
      </div>

      {!readOnly ? (
        <div className='form-actions'>
          <button
            type='submit'
            disabled={saving || values.name.trim().length < 2}
          >
            {saving ? "Saving…" : submitLabel}
          </button>
        </div>
      ) : null}
      {error ? <p className='form-error'>{error}</p> : null}
    </form>
  );
}

export function addItemBodyFromValues(values: AddItemFormValues) {
  return {
    sku: values.sku.trim() || undefined,
    name: values.name.trim(),
    unit: values.unit.trim(),
    description: values.description.trim() || undefined,
    unitPrice: values.unitPrice !== "" ? Number(values.unitPrice) : undefined,
    quantity: values.quantity !== "" ? Number(values.quantity) : undefined,
    brand: values.brand.trim() || undefined,
    model: values.model.trim() || undefined,
    countryOfOrigin: values.countryOfOrigin.trim() || undefined,
    technicalSpecification: values.technicalSpecification.trim() || undefined,
    warranty: values.warranty.trim() || undefined,
    serialNumber: values.serialNumber.trim() || undefined,
    barcode: values.barcode.trim() || undefined,
    warehouseId: values.warehouseId || undefined,
    dataSheetUrl: values.dataSheetUrl.trim() || undefined,
    categoryId: values.categoryId || undefined,
    subCategoryId: values.subCategoryId || undefined,
    supplierId: values.supplierId || undefined,
  };
}
