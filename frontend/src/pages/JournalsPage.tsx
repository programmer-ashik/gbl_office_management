import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { JournalRegister } from "../components/JournalRegister";
import { Select } from "../components/ui";
import {
  JOURNAL_TYPE_LABEL,
  JournalType,
  dimensionRuleForAccount,
  money,
  type Account,
  type Customer,
  type JournalEntry,
  type JournalSummary,
  type JournalWriteBody,
} from "../types/accounting";
import type { PublicUser } from "../types/auth";
import type { TreasuryAccount } from "../types/banking";
import type { Supplier } from "../types/procurement";
import type { Project } from "../types/project";
import { buildJournalMemo } from "../utils/journalMemo";
import { MetricCard } from '../components/MetricCard'

type DraftLine = {
  accountCode: string;
  debit: string;
  credit: string;
  description: string;
  projectId: string;
  entityType: string;
  entityId: string;
};

const emptyLine = (): DraftLine => ({
  accountCode: "",
  debit: "",
  credit: "",
  description: "",
  projectId: "",
  entityType: "",
  entityId: "",
});

const JOURNAL_TYPE_OPTIONS = Object.entries(JOURNAL_TYPE_LABEL).map(
  ([value, label]) => ({ value, label }),
);

export function JournalsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const formRef = useRef<HTMLElement>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [employees, setEmployees] = useState<PublicUser[]>([]);
  const [treasury, setTreasury] = useState<TreasuryAccount[]>([]);
  const [summary, setSummary] = useState<JournalSummary | null>(null);

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [journalType, setJournalType] = useState<string>(JournalType.GENERAL);
  const [projectId, setProjectId] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(), emptyLine()]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingNumber, setEditingNumber] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [bootError, setBootError] = useState<string | null>(null);

  const accountByCode = useMemo(() => {
    const map = new Map<string, Account>();
    for (const account of accounts) map.set(account.code, account);
    return map;
  }, [accounts]);

  const memo = useMemo(() => {
    const heads = lines
      .map((line) => accountByCode.get(line.accountCode)?.name)
      .filter(Boolean) as string[];
    return buildJournalMemo(date, heads);
  }, [date, lines, accountByCode]);

  const totals = useMemo(() => {
    return lines.reduce(
      (acc, line) => ({
        debit: acc.debit + (Number(line.debit) || 0),
        credit: acc.credit + (Number(line.credit) || 0),
      }),
      { debit: 0, credit: 0 },
    );
  }, [lines]);

  const difference = Number((totals.debit - totals.credit).toFixed(2));
  const isBalanced = difference === 0 && totals.debit > 0;

  function resetForm(keepDate = false) {
    setEditingId(null);
    setEditingNumber(null);
    if (!keepDate) setDate(new Date().toISOString().slice(0, 10));
    setReference("");
    setJournalType(JournalType.GENERAL);
    setProjectId("");
    setLines([emptyLine(), emptyLine()]);
    setFormError(null);
  }

  function applyEntryToForm(entry: JournalEntry) {
    setEditingId(entry.id);
    setEditingNumber(entry.entryNumber);
    setDate(entry.date.slice(0, 10));
    setReference(entry.reference ?? "");
    setJournalType(entry.journalType || JournalType.GENERAL);
    setProjectId(entry.projectId ?? "");
    setLines(
      entry.lines.map((line) => ({
        accountCode: line.accountCode,
        debit: line.debit > 0 ? String(line.debit) : "",
        credit: line.credit > 0 ? String(line.credit) : "",
        description: line.description ?? "",
        projectId: line.projectId ?? "",
        entityType: line.entityType ?? "",
        entityId: line.entityId ?? "",
      })),
    );
    setFormError(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function loadSummary() {
    const row = await api.journalSummary();
    setSummary(row);
  }

  useEffect(() => {
    async function boot() {
      const [
        coa,
        projectRows,
        customerRows,
        supplierRows,
        employeeRows,
        treasuryRows,
      ] = await Promise.all([
        api.accounts(),
        api.projects(),
        api.customers(true),
        api.suppliers(),
        api.employees(),
        api.treasury(),
      ]);
      setAccounts(
        coa.filter((account) => account.isPostable && account.isActive),
      );
      setProjects(projectRows);
      setCustomers(customerRows);
      setSuppliers(supplierRows);
      setEmployees(employeeRows);
      setTreasury(treasuryRows);
      await loadSummary();

      const editId = searchParams.get("edit");
      if (editId) {
        const entry = await api.journal(editId);
        applyEntryToForm(entry);
        setSearchParams({}, { replace: true });
      }
    }
    boot().catch((err: unknown) => {
      setBootError(
        err instanceof Error ? err.message : "Unable to load journals",
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...patch };
        if (patch.accountCode !== undefined) {
          const rule = dimensionRuleForAccount(patch.accountCode);
          next.entityType = rule.entityType ?? "";
          next.entityId = "";
          if (rule.projectRequired && !next.projectId && projectId) {
            next.projectId = projectId;
          }
        }
        return next;
      }),
    );
  }

  function buildBody(intent: "draft" | "post"): JournalWriteBody {
    return {
      date,
      memo,
      reference: reference.trim() || undefined,
      journalType,
      intent,
      projectId: projectId || undefined,
      lines: lines.map((line) => {
        const rule = dimensionRuleForAccount(line.accountCode);
        return {
          accountCode: line.accountCode,
          debit: line.debit ? Number(line.debit) : undefined,
          credit: line.credit ? Number(line.credit) : undefined,
          description: line.description || undefined,
          projectId: line.projectId || projectId || undefined,
          entityType: line.entityType || rule.entityType || undefined,
          entityId: line.entityId || undefined,
        };
      }),
    };
  }

  async function submit(intent: "draft" | "post") {
    if (lines.some((line) => !line.accountCode)) {
      setFormError("Every line needs an account");
      return;
    }
    if (intent === "post" && !isBalanced) {
      setFormError("Total debit must equal total credit before posting");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body = buildBody(intent);
      if (editingId) {
        if (intent === "post" && editingId) {
          await api.updateJournal(editingId, { ...body, intent: "draft" });
          await api.postDraftJournal(editingId);
        } else {
          await api.updateJournal(editingId, body);
        }
      } else {
        await api.postJournal(body);
      }
      resetForm(true);
      setRefreshKey((value) => value + 1);
      await loadSummary();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Unable to save journal",
      );
    } finally {
      setSaving(false);
    }
  }

  function entityOptions(entityType: string) {
    if (entityType === "customer") {
      return customers.map((row) => ({
        value: row.id,
        label: `${row.customerNumber} · ${row.name}`,
      }));
    }
    if (entityType === "supplier") {
      return suppliers.map((row) => ({
        value: row.id,
        label: `${row.supplierNumber} · ${row.name}`,
      }));
    }
    if (entityType === "employee") {
      return employees.map((row) => ({
        value: row.id,
        label: `${row.firstName} ${row.lastName}`,
      }));
    }
    if (entityType === "treasury") {
      return treasury.map((row) => ({
        value: row.id,
        label: `${row.name} · ${row.glAccountCode}`,
      }));
    }
    return [];
  }

  const accountOptions = accounts.map((account) => ({
    value: account.code,
    label: `${account.code} · ${account.name}`,
  }));

  const projectOptions = [
    { value: "", label: "None" },
    ...projects.map((project) => ({
      value: project.id,
      label: `${project.code} · ${project.name}`,
    })),
  ];

  return (
    <>
      <header className='workspace-header'>
        <div>
          <h1>Journal management</h1>
        </div>
        <div className='table-actions'>
          <Link to='/ledgers' className='action-link'>
            General ledger
          </Link>
          <Link to='/customers' className='action-link'>
            Customers
          </Link>
          <Link to='/reports' className='action-link'>
            Full register
          </Link>
        </div>
      </header>

      {bootError ? <p className='form-error'>{bootError}</p> : null}

      {summary ? (
        <section className='grid metric-card-grid'>
          <MetricCard variant="blue" title="Total journals" value={summary.total} />
          <MetricCard variant="amber" title="Draft" value={summary.draft} />
          <MetricCard variant="green" title="Posted" value={summary.posted} />
          <MetricCard
            variant="teal"
            title="Posted debit"
            value={money(summary.totalDebit)}
          />
        </section>
      ) : null}

      <section className='table-card journal-entry-form' ref={formRef}>
        <div className='table-head'>
          <h2>
            {editingId ? `Edit ${editingNumber}` : "Create journal entry"}
          </h2>
          <p className='muted'>
            Double-entry: debit equals credit to post. Entity fields appear only
            when the account requires them.
          </p>
        </div>
        <form
          className='stack-form journal-entry-form-fields'
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void submit("post");
          }}
        >
          <div className='name-row triple-row'>
            <label>
              Journal type
              <Select
                value={journalType}
                onChange={setJournalType}
                options={JOURNAL_TYPE_OPTIONS}
                searchable
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
            <label>
              Reference
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder='INV / PO / cheque no.'
              />
            </label>
          </div>
          <div className='name-row'>
            <label>
              Memo No
              <input
                className='memo-readonly'
                value={memo}
                readOnly
                tabIndex={-1}
              />
            </label>
            <label>
              Header project
              <Select
                value={projectId}
                onChange={setProjectId}
                options={projectOptions}
                searchable
                placeholder='Optional default project'
              />
            </label>
          </div>

          <div className='journal-lines-scroll journal-entry-lines-scroll'>
            <table className='journal-lines-table journal-entry-lines'>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Entity</th>
                  <th>Project</th>
                  <th>Description</th>
                  <th className='num'>Debit</th>
                  <th className='num'>Credit</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const rule = dimensionRuleForAccount(line.accountCode);
                  const showEntity = Boolean(rule.entityType);
                  const showProject =
                    rule.projectRequired ||
                    journalType === JournalType.PROJECT_COST ||
                    journalType === JournalType.PROJECT_REVENUE ||
                    Boolean(line.projectId) ||
                    Boolean(projectId);
                  return (
                    <tr key={index}>
                      <td>
                        <Select
                          value={line.accountCode}
                          onChange={(value) =>
                            updateLine(index, { accountCode: value })
                          }
                          options={accountOptions}
                          searchable
                          placeholder='Account'
                          required
                        />
                      </td>
                      <td>
                        {showEntity ? (
                          <Select
                            value={line.entityId}
                            onChange={(value) =>
                              updateLine(index, {
                                entityId: value,
                                entityType: rule.entityType ?? "",
                              })
                            }
                            options={[
                              {
                                value: "",
                                label: rule.entityRequired
                                  ? `Select ${rule.label}`
                                  : `Optional ${rule.label}`,
                              },
                              ...entityOptions(rule.entityType ?? ""),
                            ]}
                            searchable
                            required={rule.entityRequired}
                          />
                        ) : (
                          <span className='muted'>—</span>
                        )}
                      </td>
                      <td>
                        {showProject ? (
                          <Select
                            value={line.projectId || projectId}
                            onChange={(value) =>
                              updateLine(index, { projectId: value })
                            }
                            options={projectOptions}
                            searchable
                            required={rule.projectRequired}
                          />
                        ) : (
                          <span className='muted'>—</span>
                        )}
                      </td>
                      <td>
                        <input
                          value={line.description}
                          onChange={(e) =>
                            updateLine(index, { description: e.target.value })
                          }
                          placeholder='Line note'
                        />
                      </td>
                      <td className='num'>
                        <input
                          className='amount-debit'
                          inputMode='decimal'
                          value={line.debit}
                          onChange={(e) =>
                            updateLine(index, {
                              debit: e.target.value,
                              credit: '',
                            })
                          }
                          aria-label={`Debit line ${index + 1}`}
                        />
                      </td>
                      <td className='num'>
                        <input
                          className='amount-credit'
                          inputMode='decimal'
                          value={line.credit}
                          onChange={(e) =>
                            updateLine(index, {
                              credit: e.target.value,
                              debit: '',
                            })
                          }
                          aria-label={`Credit line ${index + 1}`}
                        />
                      </td>
                      <td className='journal-line-actions'>
                        {lines.length > 2 ? (
                          <button
                            type='button'
                            className='ghost journal-line-remove'
                            aria-label={`Remove line ${index + 1}`}
                            title='Remove line'
                            onClick={() =>
                              setLines((current) =>
                                current.filter((_, i) => i !== index),
                              )
                            }
                          >
                            <svg
                              width='16'
                              height='16'
                              viewBox='0 0 24 24'
                              fill='none'
                              stroke='currentColor'
                              strokeWidth='1.75'
                              strokeLinecap='round'
                              strokeLinejoin='round'
                              aria-hidden
                            >
                              <path d='M3 6h18' />
                              <path d='M8 6V4h8v2' />
                              <path d='M19 6l-1 14H6L5 6' />
                              <path d='M10 11v6' />
                              <path d='M14 11v6' />
                            </svg>
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={4}>Totals</th>
                  <th className='num'>{money(totals.debit)}</th>
                  <th className='num'>{money(totals.credit)}</th>
                  <th />
                </tr>
                <tr>
                  <th colSpan={4}>Difference</th>
                  <th
                    colSpan={2}
                    className={difference === 0 ? "gain" : "loss"}
                  >
                    {money(Math.abs(difference))}
                    {difference === 0 ? " (balanced)" : " (unbalanced)"}
                  </th>
                  <th />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className='form-actions'>
            <button
              type='button'
              className='ghost'
              onClick={() => setLines((current) => [...current, emptyLine()])}
            >
              Add line
            </button>
            {editingId ? (
              <button
                type='button'
                className='ghost'
                onClick={() => resetForm(true)}
              >
                Cancel edit
              </button>
            ) : null}
            <button
              type='button'
              className='ghost'
              disabled={saving || lines.some((line) => !line.accountCode)}
              onClick={() => void submit("draft")}
            >
              {saving ? "Saving…" : "Save draft"}
            </button>
            <button type='submit' disabled={saving || !isBalanced}>
              {saving ? "Saving…" : editingId ? "Post journal" : "Post journal"}
            </button>
          </div>
          {formError ? <p className='form-error'>{formError}</p> : null}
        </form>
      </section>

      <JournalRegister
        title='Journal register'
        description='Search and filter journals. Drafts can be edited; posted entries are reversed, not deleted.'
        showRangeFilter
        refreshKey={refreshKey}
        onEdit={applyEntryToForm}
        onChanged={() => {
          void loadSummary();
          setRefreshKey((value) => value + 1);
        }}
      />
    </>
  );
}
