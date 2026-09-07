import type { FormEvent } from "react";
import { Select } from "./ui";
import type { ProductCategory, Supplier } from "../types/procurement";

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
  categoryId: string;
  subCategoryId: string;
  supplierId: string;
};

export function emptyAddItemValues(): AddItemFormValues {
  return {
    sku: "",
    name: "",
    unit: "pcs",
    description: "",
    unitPrice: "",
    quantity: "1",
    brand: "",
    model: "",
    countryOfOrigin: "",
    technicalSpecification: "",
    categoryId: "",
    subCategoryId: "",
    supplierId: "",
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
  submitLabel?: string;
};

/** Shared Add Item form for Inventory, Catalog, and Procurement. */
export function AddItemForm({
  values,
  onChange,
  onSubmit,
  saving = false,
  error = null,
  categories = [],
  suppliers = [],
  submitLabel = "Add item",
}: Props) {
  const roots = categories.filter((row) => !row.parentId);
  const subs = categories.filter(
    (row) => row.parentId && row.parentId === values.categoryId,
  );

  return (
    <form className='stack-form stack-form-compact' onSubmit={onSubmit}>
      <div className='name-row'>
        <label>
          SKU
          <input
            value={values.sku}
            onChange={(e) => onChange({ sku: e.target.value })}
            required
          />
        </label>
        {categories.length > 0 ? (
          <div className='name-row'>
            <label>
              Category
              <Select
                value={values.categoryId}
                onChange={(value) =>
                  onChange({ categoryId: value, subCategoryId: "" })
                }
                options={[
                  { value: "", label: "Uncategorized" },
                  ...roots.map((row) => ({ value: row.id, label: row.name })),
                ]}
                searchable
                portal
              />
            </label>
            <label>
              Sub-category
              <Select
                value={values.subCategoryId}
                onChange={(value) => onChange({ subCategoryId: value })}
                options={[
                  { value: "", label: "None" },
                  ...subs.map((row) => ({ value: row.id, label: row.name })),
                ]}
                searchable
                portal
              />
            </label>
          </div>
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
          />
        </label>
        <label>
          Name
          <input
            value={values.name}
            onChange={(e) => onChange({ name: e.target.value })}
            required
          />
        </label>
      </div>

      <div className='name-row'>
        <label>
          Brand
          <input
            value={values.brand}
            onChange={(e) => onChange({ brand: e.target.value })}
          />
        </label>
        <label>
          Model
          <input
            value={values.model}
            onChange={(e) => onChange({ model: e.target.value })}
          />
        </label>
        <label>
          Country of origin
          <input
            value={values.countryOfOrigin}
            onChange={(e) => onChange({ countryOfOrigin: e.target.value })}
          />
        </label>
        <label>
          Unit
          <input
            value={values.unit}
            onChange={(e) => onChange({ unit: e.target.value })}
            required
          />
        </label>
      </div>
      <div className='name-row'>
        <label>
          Price
          <input
            type='number'
            min={0}
            step='0.01'
            value={values.unitPrice}
            onChange={(e) => onChange({ unitPrice: e.target.value })}
            placeholder='0.00'
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
          />
        </label>
      </div>

      <label>
        Description
        <textarea
          rows={2}
          value={values.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder='Short product description'
        />
      </label>

      <label>
        Specification
        <textarea
          rows={2}
          value={values.technicalSpecification}
          onChange={(e) => onChange({ technicalSpecification: e.target.value })}
          placeholder='Technical specification'
        />
      </label>

      <div className='form-actions'>
        <button
          type='submit'
          disabled={saving || values.name.trim().length < 2}
        >
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
      {error ? <p className='form-error'>{error}</p> : null}
    </form>
  );
}

export function addItemBodyFromValues(values: AddItemFormValues) {
  return {
    sku: values.sku.trim(),
    name: values.name.trim(),
    unit: values.unit.trim(),
    description: values.description.trim() || undefined,
    unitPrice: values.unitPrice !== "" ? Number(values.unitPrice) : undefined,
    quantity: values.quantity !== "" ? Number(values.quantity) : undefined,
    brand: values.brand.trim() || undefined,
    model: values.model.trim() || undefined,
    countryOfOrigin: values.countryOfOrigin.trim() || undefined,
    technicalSpecification: values.technicalSpecification.trim() || undefined,
    categoryId: values.categoryId || undefined,
    subCategoryId: values.subCategoryId || undefined,
    supplierId: values.supplierId || undefined,
  };
}
