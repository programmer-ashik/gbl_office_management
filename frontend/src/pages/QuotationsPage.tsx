import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { canAuditQuotations, canCreateQuotation } from "../auth/permissions";
import { Select } from "../components/ui";
import { money } from "../types/accounting";
import type { PublicUser } from "../types/auth";
import type { Project } from "../types/project";
import {
  QUOTATION_STATUS_LABEL,
  QuotationStatus,
  type Quotation,
} from "../types/quotation";
import { downloadQuotationPdf } from "../utils/quotationPdf";

export function QuotationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canCreate = canCreateQuotation(user?.role);
  const canAudit = canAuditQuotations(user?.role);

  const [rows, setRows] = useState<Quotation[]>([]);
  const [employees, setEmployees] = useState<PublicUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [createdBy, setCreatedBy] = useState("");
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [list, projectRows] = await Promise.all([
        api.quotations({
          createdBy: canAudit && createdBy ? createdBy : undefined,
          projectId: projectId || undefined,
          status: (status as QuotationStatus) || undefined,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        }),
        api.projects().catch(() => [] as Project[]),
      ]);
      setRows(list);
      setProjects(projectRows);
      if (canAudit && employees.length === 0) {
        const staff = await api.employees().catch(() => [] as PublicUser[]);
        setEmployees(staff);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load quotations",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canCreate) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCreate]);

  const employeeOptions = useMemo(
    () =>
      employees.map((row) => ({
        value: row.id,
        label: `${row.firstName} ${row.lastName}`.trim(),
      })),
    [employees],
  );

  if (!canCreate) {
    return (
      <section className='table-card'>
        <p className='form-error'>
          You do not have permission to view quotations.
        </p>
      </section>
    );
  }

  return (
    <>
      <header className='workspace-header'>
        <div>
          <h1>{canAudit ? "Quotations · Audit" : "My quotations"}</h1>
          <p className='muted'>
            Create client quotes from inventory products. PDF export available
            on each row.
          </p>
        </div>
        <div className='header-actions'>
          <button type='button' onClick={() => navigate("/quotations/new")}>
            New quotation
          </button>
        </div>
      </header>
      <section className='table-card'>
        <form
          className='flex flex-col gap-4'
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void load();
          }}
        >
          {/* Main filters */}
          <div className='flex flex-wrap items-end gap-4'>
            {canAudit ? (
              <label className='flex min-w-[200px] flex-1 flex-col gap-1'>
                <span>Employee</span>

                <Select
                  value={createdBy}
                  onChange={setCreatedBy}
                  options={[
                    { value: "", label: "All employees" },
                    ...employeeOptions,
                  ]}
                  searchable
                  portal
                  placeholder='All employees'
                />
              </label>
            ) : null}

            <label className='flex min-w-[200px] flex-1 flex-col gap-1'>
              <span>Project</span>

              <Select
                value={projectId}
                onChange={setProjectId}
                options={[
                  { value: "", label: "All projects" },
                  ...projects.map((row) => ({
                    value: row.id,
                    label: row.name,
                  })),
                ]}
                searchable
                portal
                placeholder='All projects'
              />
            </label>

            <label className='flex min-w-[180px] flex-1 flex-col gap-1'>
              <span>Status</span>

              <Select
                value={status}
                onChange={setStatus}
                options={[
                  { value: "", label: "All statuses" },
                  ...Object.values(QuotationStatus).map((value) => ({
                    value,
                    label: QUOTATION_STATUS_LABEL[value],
                  })),
                ]}
              />
            </label>
          </div>

          {/* Date filters + actions */}
          <div className='flex flex-wrap items-end gap-4'>
            <label className='flex min-w-[180px] flex-1 flex-col gap-1'>
              <span>From</span>

              <input
                type='date'
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </label>

            <label className='flex min-w-[180px] flex-1 flex-col gap-1'>
              <span>To</span>

              <input
                type='date'
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </label>

            <div className='flex items-center gap-2'>
              <button type='submit'>Apply</button>

              <button
                type='button'
                className='ghost'
                onClick={() => {
                  setCreatedBy("");
                  setProjectId("");
                  setStatus("");
                  setFromDate("");
                  setToDate("");

                  setLoading(true);
                  setError(null);

                  api
                    .quotations({})
                    .then(setRows)
                    .catch((err: unknown) => {
                      setError(
                        err instanceof Error
                          ? err.message
                          : "Unable to load quotations",
                      );
                    })
                    .finally(() => setLoading(false));
                }}
              >
                Clear
              </button>
            </div>
          </div>
        </form>

        {/* Error */}
        {error ? <p className='form-error'>{error}</p> : null}

        {/* Loading */}
        {loading ? <p className='muted'>Loading…</p> : null}

        {/* Table */}
        <div className='journal-lines-scroll'>
          <table className='journal-lines-table'>
            <thead>
              <tr>
                <th>Number</th>
                <th>Client</th>
                <th>Project</th>
                <th>Created by</th>
                <th>Date</th>
                <th>Status</th>
                <th className='num'>Total</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link to={`/quotations/${row.id}`}>
                      {row.quotationNumber}
                    </Link>
                  </td>

                  <td>{row.clientInfo.name}</td>

                  <td>{row.projectName ?? "—"}</td>

                  <td>{row.createdByName}</td>

                  <td>{row.createdAt.slice(0, 10)}</td>

                  <td>{QUOTATION_STATUS_LABEL[row.status]}</td>

                  <td className='num'>{money(row.grandTotal)}</td>

                  <td>
                    <div className='form-actions'>
                      <button
                        type='button'
                        className='ghost'
                        onClick={() => navigate(`/quotations/${row.id}`)}
                      >
                        Open
                      </button>

                      <button
                        type='button'
                        className='ghost'
                        onClick={() => downloadQuotationPdf(row)}
                      >
                        PDF
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className='muted'>
                    No quotations yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
