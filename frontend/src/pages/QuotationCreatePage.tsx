import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import {
  canApproveQuotation,
  canCreateQuotation,
} from "../auth/permissions";
import { Modal, Select } from "../components/ui";
import { money } from "../types/accounting";
import type { Customer } from "../types/accounting";
import type { Project } from "../types/project";
import {
  QUOTATION_STATUS_LABEL,
  QuotationStatus,
  lineTotalPreview,
  type Quotation,
} from "../types/quotation";
import { downloadQuotationPdf } from "../utils/quotationPdf";
import {
  clearQuotationCreateDraft,
  clearQuotationProductSelection,
  readQuotationCreateDraft,
  readQuotationProductSelection,
  writeQuotationCreateDraft,
  type QuotationSelectedProduct,
} from "../utils/quotationProductSelection";

type DraftLine = {
  key: string;
  productId: string;
  productName: string;
  unitPrice: string;
  quantity: string;
  discount: string;
};

function emptyLine(product?: QuotationSelectedProduct): DraftLine {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    productId: product?.productId ?? "",
    productName: product?.productName ?? "",
    unitPrice: product?.unitPrice != null ? String(product.unitPrice) : "",
    quantity: "1",
    discount: "0",
  };
}

function clientMatchesProject(project: Project, quote: Quotation): boolean {
  const client = (quote.clientInfo.company || quote.clientInfo.name)
    .trim()
    .toLowerCase();
  const projectClient = project.client.name.trim().toLowerCase();
  return Boolean(client) && projectClient === client;
}

export function QuotationCreatePage() {
  const { id } = useParams();
  const isDetail = Boolean(id);
  const { user } = useAuth();
  const navigate = useNavigate();
  const canCreate = canCreateQuotation(user?.role);
  const canApprove = canApproveQuotation(user?.role);

  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [saved, setSaved] = useState<Quotation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [partyType, setPartyType] = useState<"customer" | "new_customer">(
    "customer",
  );
  const [partyId, setPartyId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [approveProjectId, setApproveProjectId] = useState("");
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newContractValue, setNewContractValue] = useState("");
  const [newTotalBudget, setNewTotalBudget] = useState("");
  const [newStartDate, setNewStartDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [taxRate, setTaxRate] = useState("0");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState(
    "Prices are valid for 30 days. Payment terms as agreed.",
  );
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);

  useEffect(() => {
    if (!canCreate) return;
    api
      .customers(true)
      .catch(() => [] as Customer[])
      .then(setCustomers);
  }, [canCreate]);

  useEffect(() => {
    if (!isDetail || !canApprove) return;
    api
      .projects()
      .catch(() => [] as Project[])
      .then(setProjects);
  }, [isDetail, canApprove]);

  function applyParty(nextType: typeof partyType, nextId: string) {
    setPartyType(nextType);
    setPartyId(nextId);
    if (nextType === "new_customer") {
      setClientName("");
      setClientPhone("");
      setClientCompany("");
      return;
    }
    const row = customers.find((c) => c.id === nextId);
    if (row) {
      setClientName(row.name);
      setClientPhone(row.phone ?? "");
      setClientCompany(row.name);
    }
  }

  useEffect(() => {
    if (!id || !canCreate) return;
    api
      .quotation(id)
      .then((row) => {
        setSaved(row);
        setApproveProjectId(row.projectId ?? "");
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Unable to load quotation",
        );
      });
  }, [id, canCreate]);

  function mergeSelectedProducts(
    products: QuotationSelectedProduct[],
    currentLines: DraftLine[],
  ): DraftLine[] {
    if (products.length === 0) return currentLines;
    const blankOnly =
      currentLines.length === 1 &&
      !currentLines[0]?.productId &&
      !currentLines[0]?.productName;
    const base = blankOnly ? [] : currentLines;
    const existing = new Set(base.map((row) => row.productId).filter(Boolean));
    const additions = products
      .filter((row) => !existing.has(row.productId))
      .map((row) => emptyLine(row));
    return [...base, ...additions];
  }

  useEffect(() => {
    if (isDetail || !canCreate) return;

    const draft = readQuotationCreateDraft();
    let nextLines = draft?.lines?.length ? draft.lines : [emptyLine()];
    let restored = Boolean(draft);

    if (draft) {
      setPartyType(
        draft.partyType === "new_customer" ? "new_customer" : "customer",
      );
      setPartyId(draft.partyId);
      setClientName(draft.clientName);
      setClientPhone(draft.clientPhone);
      setClientCompany(draft.clientCompany);
      setTaxRate(draft.taxRate);
      setNotes(draft.notes);
      setTerms(draft.terms);
    }

    const payload = readQuotationProductSelection();
    if (payload?.products?.length) {
      nextLines = mergeSelectedProducts(payload.products, nextLines);
      clearQuotationProductSelection();
      writeQuotationCreateDraft({
        partyType: draft?.partyType === "new_customer" ? "new_customer" : "customer",
        partyId: draft?.partyId ?? "",
        clientName: draft?.clientName ?? "",
        clientPhone: draft?.clientPhone ?? "",
        clientCompany: draft?.clientCompany ?? "",
        taxRate: draft?.taxRate ?? "0",
        notes: draft?.notes ?? "",
        terms:
          draft?.terms ??
          "Prices are valid for 30 days. Payment terms as agreed.",
        lines: nextLines,
      });
      restored = true;
    }

    if (restored) {
      setLines(nextLines);
    }
  }, [isDetail, canCreate]);

  const previewTotals = useMemo(() => {
    const subTotal = lines.reduce(
      (sum, line) =>
        sum +
        lineTotalPreview(
          Number(line.unitPrice) || 0,
          Number(line.quantity) || 0,
          Number(line.discount) || 0,
        ),
      0,
    );
    const tax = Number(((subTotal * (Number(taxRate) || 0)) / 100).toFixed(2));
    return {
      subTotal: Number(subTotal.toFixed(2)),
      tax,
      grandTotal: Number((subTotal + tax).toFixed(2)),
    };
  }, [lines, taxRate]);

  const matchingProjects = useMemo(() => {
    if (!saved) return projects;
    const matched = projects.filter((row) => clientMatchesProject(row, saved));
    return matched.length > 0 ? matched : projects;
  }, [projects, saved]);

  function openProductPicker() {
    writeQuotationCreateDraft({
      partyType,
      partyId,
      clientName,
      clientPhone,
      clientCompany,
      taxRate,
      notes,
      terms,
      lines,
    });
    navigate("/quotations/products/select");
  }

  function clearDraftAndLeave() {
    clearQuotationCreateDraft();
    clearQuotationProductSelection();
    navigate("/quotations");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canCreate || isDetail) return;
    const payloadLines = lines
      .filter(
        (line) =>
          line.productName.trim() &&
          Number(line.quantity) > 0 &&
          Number(line.unitPrice) >= 0,
      )
      .map((line) => ({
        productId: line.productId || undefined,
        productName: line.productName.trim(),
        unitPrice: Number(line.unitPrice) || 0,
        quantity: Number(line.quantity) || 0,
        discount: Number(line.discount) || 0,
      }));
    if (!clientName.trim() || payloadLines.length === 0) {
      setError(
        !clientName.trim()
          ? partyType === "new_customer"
            ? "Enter the new customer name"
            : "Select a customer"
          : "Add at least one product line",
      );
      return;
    }
    if (partyType === "customer" && !partyId) {
      setError("Select a customer");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await api.createQuotation({
        clientInfo: {
          name: clientName.trim(),
          phone: clientPhone.trim() || undefined,
          company: clientCompany.trim() || undefined,
        },
        items: payloadLines,
        taxRate: Number(taxRate) || 0,
        notes: notes.trim() || undefined,
        terms: terms.trim() || undefined,
        status: QuotationStatus.DRAFT,
      });
      clearQuotationCreateDraft();
      clearQuotationProductSelection();
      navigate(`/quotations/${created.id}`, { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to create quotation",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onStatus(next: QuotationStatus) {
    if (!saved) return;
    if (next === QuotationStatus.APPROVED && !approveProjectId) {
      setError("Select or create a project before approving");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateQuotationStatus(
        saved.id,
        next,
        next === QuotationStatus.APPROVED ? approveProjectId : undefined,
      );
      setSaved(updated);
      setApproveProjectId(updated.projectId ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update status");
    } finally {
      setSaving(false);
    }
  }

  async function onCreateProject(event: FormEvent) {
    event.preventDefault();
    if (!saved || !canApprove) return;
    setSaving(true);
    setError(null);
    try {
      const created = await api.createProject({
        name: newProjectName.trim(),
        client: {
          name:
            saved.clientInfo.company?.trim() ||
            saved.clientInfo.name.trim(),
          contactName: saved.clientInfo.name.trim(),
          phone: saved.clientInfo.phone ?? undefined,
        },
        startDate: newStartDate,
        contractValue: Number(newContractValue) || 0,
        totalBudget: Number(newTotalBudget) || 0,
      });
      setProjects((prev) => [created, ...prev]);
      setApproveProjectId(created.id);
      setProjectModalOpen(false);
      setNewProjectName("");
      setNewContractValue("");
      setNewTotalBudget("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create project");
    } finally {
      setSaving(false);
    }
  }

  if (!canCreate) {
    return (
      <section className='table-card'>
        <p className='form-error'>
          You do not have permission to create quotations.
        </p>
      </section>
    );
  }

  if (isDetail && saved) {
    return (
      <>
        <header className='workspace-header'>
          <div>
            <h1>{saved.quotationNumber}</h1>
            <p className='muted'>
              {QUOTATION_STATUS_LABEL[saved.status]} · {saved.createdByName}
            </p>
          </div>
          <div className='form-actions'>
            <Link to='/quotations' className='ghost-link'>
              Back to list
            </Link>
            <button type='button' onClick={() => downloadQuotationPdf(saved)}>
              Download Quotation PDF
            </button>
          </div>
        </header>

        {error ? <p className='form-error'>{error}</p> : null}

        <section className='table-card quotation-detail'>
          <div className='name-row'>
            <p>
              <strong>Client:</strong> {saved.clientInfo.name}
              {saved.clientInfo.company ? ` · ${saved.clientInfo.company}` : ""}
            </p>
            <p>
              <strong>Project:</strong>{" "}
              {saved.projectName ?? "Not assigned (set on approve)"}
            </p>
          </div>

          <div className='journal-lines-scroll quotation-table-desktop'>
            <table className='journal-lines-table'>
              <thead>
                <tr>
                  <th>Product</th>
                  <th className='num'>Qty</th>
                  <th className='num'>Unit price</th>
                  <th className='num'>Disc %</th>
                  <th className='num'>Line total</th>
                </tr>
              </thead>
              <tbody>
                {saved.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.productName}</td>
                    <td className='num'>{item.quantity}</td>
                    <td className='num'>{money(item.unitPrice)}</td>
                    <td className='num'>{item.discount}</td>
                    <td className='num'>{money(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className='quotation-cards-mobile'>
            {saved.items.map((item) => (
              <article key={item.id} className='quotation-line-card'>
                <h3>{item.productName}</h3>
                <p>Qty {item.quantity}</p>
                <p>Unit {money(item.unitPrice)}</p>
                <p>Disc {item.discount}%</p>
                <p>
                  <strong>{money(item.lineTotal)}</strong>
                </p>
              </article>
            ))}
          </div>

          <p className='muted'>
            Subtotal {money(saved.subTotal)} · Tax {money(saved.taxAmount)} ·
            Total <strong>{money(saved.grandTotal)}</strong>
          </p>

          <div className='form-actions'>
            {saved.status === QuotationStatus.DRAFT ? (
              <button
                type='button'
                disabled={saving}
                onClick={() => void onStatus(QuotationStatus.SENT)}
              >
                Mark sent
              </button>
            ) : null}
            {saved.status === QuotationStatus.SENT && canApprove ? (
              <div className='stack-form' style={{ width: '100%' }}>
                <div className='name-row'>
                  <label>
                    Assign project
                    <Select
                      value={approveProjectId}
                      onChange={setApproveProjectId}
                      options={[
                        { value: '', label: 'Select project' },
                        ...matchingProjects.map((row) => ({
                          value: row.id,
                          label: `${row.name} · ${row.client.name}`,
                        })),
                      ]}
                      searchable
                      portal
                      placeholder='Select project'
                    />
                  </label>
                  <div className='form-actions' style={{ alignItems: 'flex-end' }}>
                    <button
                      type='button'
                      className='ghost'
                      onClick={() => {
                        setNewProjectName(
                          `${saved.clientInfo.name} project`.slice(0, 160),
                        );
                        setProjectModalOpen(true);
                      }}
                    >
                      Add project
                    </button>
                  </div>
                </div>
                <div className='form-actions'>
                  <button
                    type='button'
                    disabled={saving || !approveProjectId}
                    onClick={() => void onStatus(QuotationStatus.APPROVED)}
                  >
                    Approve & assign
                  </button>
                  <button
                    type='button'
                    className='ghost'
                    disabled={saving}
                    onClick={() => void onStatus(QuotationStatus.REJECTED)}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ) : null}
            {saved.status === QuotationStatus.SENT && !canApprove ? (
              <p className='muted'>
                Waiting for admin/accountant approval and project assignment.
              </p>
            ) : null}
          </div>
        </section>

        <Modal
          open={projectModalOpen}
          title='Add project for customer'
          description='Creates a project with this quotation customer, then you can approve.'
          onClose={() => setProjectModalOpen(false)}
        >
          <form
            className='stack-form'
            onSubmit={(event) => void onCreateProject(event)}
          >
            <label>
              Project name
              <input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                required
                minLength={2}
              />
            </label>
            <label>
              Client
              <input
                value={
                  saved.clientInfo.company || saved.clientInfo.name
                }
                readOnly
              />
            </label>
            <div className='name-row'>
              <label>
                Start date
                <input
                  type='date'
                  value={newStartDate}
                  onChange={(e) => setNewStartDate(e.target.value)}
                  required
                />
              </label>
              <label>
                Contract value
                <input
                  inputMode='decimal'
                  value={newContractValue}
                  onChange={(e) => setNewContractValue(e.target.value)}
                  required
                />
              </label>
              <label>
                Total budget
                <input
                  inputMode='decimal'
                  value={newTotalBudget}
                  onChange={(e) => setNewTotalBudget(e.target.value)}
                  required
                />
              </label>
            </div>
            <button type='submit' disabled={saving}>
              {saving ? 'Saving…' : 'Create project'}
            </button>
          </form>
        </Modal>
      </>
    );
  }

  return (
    <>
      <header className='workspace-header'>
        <div>
          <h1>New quotation</h1>
          <p className='muted'>
            Search inventory and add multiple products. Mobile uses card layout.
          </p>
        </div>
        <button
          type='button'
          className='ghost-link'
          onClick={clearDraftAndLeave}
        >
          Cancel
        </button>
      </header>

      <section className='table-card'>
        <form
          className='stack-form stack-form-compact quotation-create-form'
          onSubmit={(event) => void onSubmit(event)}
        >
          <div className='filter-grid-2'>
            <label>
              Party type
              <select
                value={partyType}
                onChange={(e) => {
                  const next = e.target.value as typeof partyType;
                  if (next === "new_customer") {
                    applyParty("new_customer", "");
                  } else {
                    setPartyType(next);
                    setPartyId("");
                    setClientName("");
                    setClientPhone("");
                    setClientCompany("");
                  }
                }}
              >
                <option value='customer'>Customer</option>
                <option value='new_customer'>New customer</option>
              </select>
            </label>
            {partyType === "customer" ? (
              <label>
                Customer
                <Select
                  value={partyId}
                  onChange={(value) => applyParty("customer", value)}
                  options={customers.map((row) => ({
                    value: row.id,
                    label: row.name,
                  }))}
                  searchable
                  portal
                  placeholder='Select customer'
                />
              </label>
            ) : null}
            {partyType === "new_customer" ? (
              <label>
                Client name
                <input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  required
                  placeholder='New customer name'
                />
              </label>
            ) : (
              <label>
                Display name
                <input value={clientName} readOnly />
              </label>
            )}
            <label>
              Company
              <input
                value={clientCompany}
                onChange={(e) => setClientCompany(e.target.value)}
                readOnly={partyType !== "new_customer"}
              />
            </label>
            <label>
              Phone
              <input
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                readOnly={partyType !== "new_customer"}
              />
            </label>
            <label>
              Tax %
              <input
                type='number'
                min={0}
                step='0.01'
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
              />
            </label>
            <div className='form-actions compact-actions filter-actions'>
              <button
                type='button'
                className='ghost'
                onClick={openProductPicker}
              >
                Add products
              </button>
              <button
                type='button'
                className='ghost'
                onClick={() => setLines((prev) => [...prev, emptyLine()])}
              >
                + Line
              </button>
            </div>
          </div>

          <div className='journal-lines-scroll quotation-table-desktop'>
            <table className='journal-lines-table'>
              <thead>
                <tr>
                  <th>Product</th>
                  <th className='num'>Qty</th>
                  <th className='num'>Unit price</th>
                  <th className='num'>Disc %</th>
                  <th className='num'>Line total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.key}>
                    <td>
                      <input
                        value={line.productName}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((row) =>
                              row.key === line.key
                                ? { ...row, productName: e.target.value }
                                : row,
                            ),
                          )
                        }
                        required
                      />
                    </td>
                    <td>
                      <input
                        className='inv-num'
                        inputMode='decimal'
                        value={line.quantity}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((row) =>
                              row.key === line.key
                                ? { ...row, quantity: e.target.value }
                                : row,
                            ),
                          )
                        }
                        required
                      />
                    </td>
                    <td>
                      <input
                        className='inv-num'
                        inputMode='decimal'
                        value={line.unitPrice}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((row) =>
                              row.key === line.key
                                ? { ...row, unitPrice: e.target.value }
                                : row,
                            ),
                          )
                        }
                        required
                      />
                    </td>
                    <td>
                      <input
                        className='inv-num'
                        inputMode='decimal'
                        value={line.discount}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((row) =>
                              row.key === line.key
                                ? { ...row, discount: e.target.value }
                                : row,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className='num'>
                      {money(
                        lineTotalPreview(
                          Number(line.unitPrice) || 0,
                          Number(line.quantity) || 0,
                          Number(line.discount) || 0,
                        ),
                      )}
                    </td>
                    <td>
                      {lines.length > 1 ? (
                        <button
                          type='button'
                          className='ghost'
                          onClick={() =>
                            setLines((prev) =>
                              prev.filter((row) => row.key !== line.key),
                            )
                          }
                        >
                          Remove
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className='quotation-cards-mobile'>
            {lines.map((line) => (
              <article key={line.key} className='quotation-line-card'>
                <label>
                  Product
                  <input
                    value={line.productName}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((row) =>
                          row.key === line.key
                            ? { ...row, productName: e.target.value }
                            : row,
                        ),
                      )
                    }
                    required
                  />
                </label>
                <div className='name-row'>
                  <label>
                    Qty
                    <input
                      inputMode='decimal'
                      value={line.quantity}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((row) =>
                            row.key === line.key
                              ? { ...row, quantity: e.target.value }
                              : row,
                          ),
                        )
                      }
                      required
                    />
                  </label>
                  <label>
                    Unit price
                    <input
                      inputMode='decimal'
                      value={line.unitPrice}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((row) =>
                            row.key === line.key
                              ? { ...row, unitPrice: e.target.value }
                              : row,
                          ),
                        )
                      }
                      required
                    />
                  </label>
                </div>
                <label>
                  Discount %
                  <input
                    inputMode='decimal'
                    value={line.discount}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((row) =>
                          row.key === line.key
                            ? { ...row, discount: e.target.value }
                            : row,
                        ),
                      )
                    }
                  />
                </label>
                <p>
                  Line total{" "}
                  <strong>
                    {money(
                      lineTotalPreview(
                        Number(line.unitPrice) || 0,
                        Number(line.quantity) || 0,
                        Number(line.discount) || 0,
                      ),
                    )}
                  </strong>
                </p>
                {lines.length > 1 ? (
                  <button
                    type='button'
                    className='ghost'
                    onClick={() =>
                      setLines((prev) =>
                        prev.filter((row) => row.key !== line.key),
                      )
                    }
                  >
                    Remove
                  </button>
                ) : null}
              </article>
            ))}
          </div>

          <label>
            Notes
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <label>
            Terms & conditions
            <textarea
              rows={3}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
            />
          </label>

          <p className='muted'>
            Subtotal {money(previewTotals.subTotal)} · Tax{" "}
            {money(previewTotals.tax)} · Grand{" "}
            <strong>{money(previewTotals.grandTotal)}</strong>
          </p>

          <div className='form-actions'>
            <button type='submit' disabled={saving || !clientName.trim()}>
              {saving ? "Saving…" : "Create quotation"}
            </button>
          </div>
          {error ? <p className='form-error'>{error}</p> : null}
        </form>
      </section>
    </>
  );
}
