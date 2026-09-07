import { useEffect, useMemo, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api } from "../api/client";
import { MetricCard } from "../components/MetricCard";
import { Select } from "../components/ui";
import {
  JournalEntityType,
  dimensionRuleForAccount,
  money,
  type Account,
  type AccountLedger,
  type Customer,
  type JournalEntityType as EntityType,
} from "../types/accounting";
import type { PublicUser } from "../types/auth";
import type { TreasuryAccount } from "../types/banking";
import type { Supplier } from "../types/procurement";
import type { Project } from "../types/project";

type EntityOption = { value: string; label: string };

export function AccountLedgerPage() {
  const { accountCode: routeCode } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountCode, setAccountCode] = useState(routeCode ?? "");
  const [entityId, setEntityId] = useState(
    () => searchParams.get("entityId") ?? "",
  );
  const [projectId, setProjectId] = useState(
    () => searchParams.get("projectId") ?? "",
  );
  const [fromDate, setFromDate] = useState(
    () => searchParams.get("fromDate") ?? "",
  );
  const [toDate, setToDate] = useState(() => searchParams.get("toDate") ?? "");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [employees, setEmployees] = useState<PublicUser[]>([]);
  const [treasury, setTreasury] = useState<TreasuryAccount[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const [ledger, setLedger] = useState<AccountLedger | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const dimension = useMemo(
    () => (accountCode ? dimensionRuleForAccount(accountCode) : null),
    [accountCode],
  );

  const entityType: EntityType | null = dimension?.entityType ?? null;
  const showEntityFilter = Boolean(entityType);
  const showProjectFilter = Boolean(dimension?.projectRequired);
  const isSupplierPayable = accountCode === "2111" || accountCode === "2113";

  useEffect(() => {
    api
      .accounts()
      .then((rows) => {
        const postable = rows.filter((row) => row.isPostable && row.isActive);
        setAccounts(postable);
        if (!accountCode && postable[0]) {
          setAccountCode(postable[0].code);
        }
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Unable to load accounts",
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (routeCode) setAccountCode(routeCode);
  }, [routeCode]);

  useEffect(() => {
    const fromUrl = searchParams.get("entityId") ?? "";
    if (fromUrl !== entityId) setEntityId(fromUrl);
    const projectFromUrl = searchParams.get("projectId") ?? "";
    if (projectFromUrl !== projectId) setProjectId(projectFromUrl);
    const fromDateUrl = searchParams.get("fromDate") ?? "";
    if (fromDateUrl !== fromDate) setFromDate(fromDateUrl);
    const toDateUrl = searchParams.get("toDate") ?? "";
    if (toDateUrl !== toDate) setToDate(toDateUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!showEntityFilter && !showProjectFilter) return;

    const tasks: Promise<void>[] = [];

    if (entityType === JournalEntityType.CUSTOMER && customers.length === 0) {
      tasks.push(
        api
          .customers(true)
          .then(setCustomers)
          .catch(() => setCustomers([])),
      );
    }
    if (entityType === JournalEntityType.SUPPLIER && suppliers.length === 0) {
      tasks.push(
        api
          .suppliers()
          .then(setSuppliers)
          .catch(() => setSuppliers([])),
      );
    }
    if (entityType === JournalEntityType.EMPLOYEE && employees.length === 0) {
      tasks.push(
        api
          .employees()
          .then(setEmployees)
          .catch(() => setEmployees([])),
      );
    }
    if (entityType === JournalEntityType.TREASURY && treasury.length === 0) {
      tasks.push(
        api
          .treasury()
          .then(setTreasury)
          .catch(() => setTreasury([])),
      );
    }
    if (showProjectFilter && projects.length === 0) {
      tasks.push(
        api
          .projects()
          .then(setProjects)
          .catch(() => setProjects([])),
      );
    }

    void Promise.all(tasks);
  }, [
    entityType,
    showEntityFilter,
    showProjectFilter,
    customers.length,
    suppliers.length,
    employees.length,
    treasury.length,
    projects.length,
  ]);

  useEffect(() => {
    if (!accountCode) return;
    setLoading(true);
    setError(null);

    const params: {
      entityType?: EntityType;
      entityId?: string;
      fromDate?: string;
      toDate?: string;
    } = {};
    if (showEntityFilter && entityType && entityId) {
      params.entityType = entityType;
      params.entityId = entityId;
    }
    if (fromDate) params.fromDate = fromDate;
    if (toDate) params.toDate = toDate;

    api
      .ledger(accountCode, params)
      .then(setLedger)
      .catch((err: unknown) => {
        setLedger(null);
        setError(err instanceof Error ? err.message : "Unable to load ledger");
      })
      .finally(() => setLoading(false));
  }, [accountCode, entityId, entityType, showEntityFilter, fromDate, toDate]);

  const entityOptions: EntityOption[] = useMemo(() => {
    if (entityType === JournalEntityType.CUSTOMER) {
      return customers.map((row) => ({
        value: row.id,
        label: `${row.customerNumber} · ${row.name}`,
      }));
    }
    if (entityType === JournalEntityType.SUPPLIER) {
      return suppliers.map((row) => ({
        value: row.id,
        label: `${row.supplierNumber} · ${row.name}`,
      }));
    }
    if (entityType === JournalEntityType.EMPLOYEE) {
      return employees.map((row) => ({
        value: row.id,
        label: `${row.firstName} ${row.lastName}`,
      }));
    }
    if (entityType === JournalEntityType.TREASURY) {
      return treasury.map((row) => ({
        value: row.id,
        label: `${row.name} · ${row.glAccountCode}`,
      }));
    }
    return [];
  }, [entityType, customers, suppliers, employees, treasury]);

  const projectOptions = useMemo(
    () =>
      projects.map((project) => ({
        value: project.id,
        label: `${project.code} · ${project.name}`,
      })),
    [projects],
  );

  const filteredEntries = useMemo(() => {
    if (!ledger) return [];
    if (!showProjectFilter || !projectId) return ledger.entries;
    return ledger.entries.filter((row) => row.projectId === projectId);
  }, [ledger, showProjectFilter, projectId]);

  const running = useMemo(() => {
    // Backend already returns newest-first with bank-style runningBalance.
    // Recompute only when project filter slices the period rows.
    if (!showProjectFilter || !projectId || !ledger) {
      return filteredEntries.map((row) => ({
        ...row,
        runningBalance: row.runningBalance ?? 0,
      }));
    }
    const creditNormal = ledger.account.normalBalance === "credit";
    const chrono = [...filteredEntries].reverse();
    let balance = ledger.openingBalance ?? 0;
    const withRunning = chrono.map((row) => {
      balance += creditNormal ? row.credit - row.debit : row.debit - row.credit;
      return { ...row, runningBalance: Number(balance.toFixed(2)) };
    });
    return withRunning.reverse();
  }, [filteredEntries, ledger, showProjectFilter, projectId]);

  const filteredTotals = useMemo(() => {
    const debit = filteredEntries.reduce((sum, row) => sum + row.debit, 0);
    const credit = filteredEntries.reduce((sum, row) => sum + row.credit, 0);
    const opening = ledger?.openingBalance ?? 0;
    const closing =
      running.length > 0
        ? running[0]!.runningBalance
        : (ledger?.closingBalance ?? opening);
    return { debit, credit, opening, closing };
  }, [filteredEntries, running, ledger]);

  const accountOptions = accounts.map((account) => ({
    value: account.code,
    label: `${account.code} · ${account.name}`,
  }));

  const entityFilterLabel = dimension?.label ?? "Entity";
  const allEntitiesLabel = useMemo(() => {
    if (entityType === JournalEntityType.CUSTOMER) return "All customers";
    if (entityType === JournalEntityType.SUPPLIER) return "All suppliers";
    if (entityType === JournalEntityType.EMPLOYEE) return "All employees";
    if (entityType === JournalEntityType.TREASURY)
      return "All treasury channels";
    return `All ${entityFilterLabel.toLowerCase()}`;
  }, [entityType, entityFilterLabel]);

  const selectedSupplier = useMemo(
    () =>
      entityType === JournalEntityType.SUPPLIER
        ? suppliers.find((row) => row.id === entityId)
        : undefined,
    [entityType, suppliers, entityId],
  );

  function syncFilterParams(next: {
    entityId?: string;
    projectId?: string;
    fromDate?: string;
    toDate?: string;
  }) {
    const params = new URLSearchParams();
    const nextEntityId = next.entityId ?? entityId;
    const nextProjectId = next.projectId ?? projectId;
    const nextFrom = next.fromDate ?? fromDate;
    const nextTo = next.toDate ?? toDate;
    if (nextEntityId) params.set("entityId", nextEntityId);
    if (nextProjectId) params.set("projectId", nextProjectId);
    if (entityType && nextEntityId) params.set("entityType", entityType);
    if (nextFrom) params.set("fromDate", nextFrom);
    if (nextTo) params.set("toDate", nextTo);
    setSearchParams(params, { replace: true });
  }

  function onAccountChange(next: string) {
    setAccountCode(next);
    setEntityId("");
    setProjectId("");
    navigate(`/ledgers/${encodeURIComponent(next)}`, { replace: true });
  }

  function onEntityChange(next: string) {
    setEntityId(next);
    syncFilterParams({ entityId: next });
  }

  function onProjectChange(next: string) {
    setProjectId(next);
    syncFilterParams({ projectId: next });
  }

  function onFromDateChange(next: string) {
    setFromDate(next);
    syncFilterParams({ fromDate: next });
  }

  function onToDateChange(next: string) {
    setToDate(next);
    syncFilterParams({ toDate: next });
  }

  function entityCell(row: (typeof running)[number]) {
    if (row.entityType === JournalEntityType.SUPPLIER && row.entityId) {
      return (
        <Link to={`/suppliers/${row.entityId}`}>
          {row.entityName ?? "Supplier"}
        </Link>
      );
    }
    if (row.entityType === JournalEntityType.CUSTOMER && row.entityId) {
      return row.entityName ?? "Customer";
    }
    return row.entityName ?? "—";
  }

  return (
    <>
      <header className='workspace-header'>
        <div>
          <h1>General ledger</h1>
        </div>
        <div className='form-actions'>
          {isSupplierPayable && entityId ? (
            <Link to={`/suppliers/${entityId}`} className='ghost-link'>
              Supplier details
            </Link>
          ) : null}
          <Link to='/journals' className='ghost-link'>
            Journals
          </Link>
        </div>
      </header>

      <section className='table-card'>
        <div className='table-head'>
          <h2>Account inquiry</h2>
          {/* <p className="muted">
            Supplier bills always hit <strong>2111</strong>: credit bills leave
            an open Cr; cash bills also Cr then Dr 2111 (cleared same day). The
            expense debit still posts to <strong>5240</strong> (or the chosen
            expense account).
          </p> */}
        </div>

        <form
          className='filter-bar ledger-filter-bar'
          onSubmit={(event) => event.preventDefault()}
        >
          <div className='ledger-filter-row'>
            <label className='ledger-filter-account'>
              Account
              <Select
                value={accountCode}
                onChange={onAccountChange}
                options={accountOptions}
                searchable
                portal
                placeholder='Select account'
              />
            </label>

            {showEntityFilter ? (
              <label className='ledger-filter-party'>
                {isSupplierPayable ? "Supplier" : entityFilterLabel}
                <Select
                  value={entityId}
                  onChange={onEntityChange}
                  options={[
                    { value: "", label: allEntitiesLabel },
                    ...entityOptions,
                  ]}
                  searchable
                  portal
                  placeholder={
                    isSupplierPayable ? "All suppliers" : allEntitiesLabel
                  }
                />
              </label>
            ) : null}
          </div>

          <div className='ledger-filter-row'>
            <label>
              From date
              <input
                type='date'
                value={fromDate}
                onChange={(e) => onFromDateChange(e.target.value)}
              />
            </label>
            <label>
              To date
              <input
                type='date'
                value={toDate}
                onChange={(e) => onToDateChange(e.target.value)}
              />
            </label>
            {showProjectFilter ? (
              <label className='ledger-filter-project'>
                Project
                <Select
                  value={projectId}
                  onChange={onProjectChange}
                  options={[
                    { value: "", label: "All projects" },
                    ...projectOptions,
                  ]}
                  searchable
                  portal
                  placeholder='All projects'
                />
              </label>
            ) : null}
          </div>

          {showEntityFilter ||
          showProjectFilter ||
          fromDate ||
          toDate ? (
            <button
              type='button'
              className='ghost w-[120px]'
              onClick={() => {
                setEntityId("");
                setProjectId("");
                setFromDate("");
                setToDate("");
                setSearchParams({}, { replace: true });
              }}
            >
              Clear filters
            </button>
          ) : null}
        </form>

        {selectedSupplier ? (
          <p className='muted ledger-supplier-hint'>
            Showing transactions for{" "}
            <Link to={`/suppliers/${selectedSupplier.id}`}>
              {selectedSupplier.supplierNumber} · {selectedSupplier.name}
            </Link>
            {" · "}
            <Link to={`/suppliers/${selectedSupplier.id}`}>
              Open vendor ledger / history
            </Link>
          </p>
        ) : null}

        {error ? <p className='form-error'>{error}</p> : null}
        {loading ? <p className='muted'>Loading ledger…</p> : null}

        {ledger ? (
          <>
            <section className='grid metric-card-grid'>
              <MetricCard
                variant='blue'
                title={ledger.account.accountCode}
                value={ledger.account.accountName}
              />
              <MetricCard
                variant='teal'
                title='Opening balance'
                value={money(filteredTotals.opening)}
                meta={
                  fromDate
                    ? `Before ${fromDate}`
                    : "Start of ledger"
                }
              />
              <MetricCard
                variant='purple'
                title='Closing balance'
                value={money(filteredTotals.closing)}
                meta={toDate ? `As of ${toDate}` : "Current"}
              />
              <MetricCard
                variant='amber'
                title='Period lines'
                value={filteredEntries.length}
                meta={`Dr ${money(filteredTotals.debit)} · Cr ${money(filteredTotals.credit)}`}
              />
            </section>

            <div className='journal-lines-scroll'>
              <table className='journal-lines-table ledger-inquiry-table'>
                <thead>
                  <tr className='ledger-table-header'>
                    <th>Date</th>
                    <th>Journal</th>
                    <th>Description</th>
                    <th>Reference</th>
                    <th>Entity</th>
                    <th className='num'>Debit</th>
                    <th className='num'>Credit</th>
                    <th className='num'>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className='ledger-balance-row'>
                    <td colSpan={5}>
                      Closing balance
                      {toDate ? ` (as at ${toDate})` : " (current)"}
                    </td>
                    <td className='num'>—</td>
                    <td className='num'>—</td>
                    <td className='num'>{money(filteredTotals.closing)}</td>
                  </tr>
                  {running.map((row) => (
                    <tr key={row.id}>
                      <td>{row.date.slice(0, 10)}</td>
                      <td>
                        <Link
                          to={
                            row.journalEntryId
                              ? `/journals/${row.journalEntryId}`
                              : "/journals"
                          }
                        >
                          {row.entryNumber}
                        </Link>
                      </td>
                      <td
                        className='ledger-description-cell'
                        title={row.description || row.memo}
                      >
                        {row.description || row.memo}
                      </td>
                      <td>{row.reference ?? "—"}</td>
                      <td>{entityCell(row)}</td>
                      <td className='num amount-debit-cell'>
                        {row.debit > 0 ? money(row.debit) : "—"}
                      </td>
                      <td className='num amount-credit-cell'>
                        {row.credit > 0 ? money(row.credit) : "—"}
                      </td>
                      <td className='num'>{money(row.runningBalance)}</td>
                    </tr>
                  ))}
                  <tr className='ledger-balance-row'>
                    <td colSpan={5}>
                      Opening balance
                      {fromDate ? ` (before ${fromDate})` : " (start)"}
                    </td>
                    <td className='num'>—</td>
                    <td className='num'>—</td>
                    <td className='num'>{money(filteredTotals.opening)}</td>
                  </tr>
                  {running.length === 0 ? (
                    <tr>
                      <td colSpan={8} className='muted'>
                        No posted lines for this account
                        {entityId || projectId || fromDate || toDate
                          ? " with the selected filters"
                          : ""}
                        .
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>
    </>
  );
}
