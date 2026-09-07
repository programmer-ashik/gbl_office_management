import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Select } from "../components/ui";
import { money } from "../types/accounting";
import {
  ADVANCE_STATUS_LABEL,
  AdvanceStatus,
  type Advance,
  type AdvanceStatus as AdvanceStatusType,
} from "../types/advance";

const SETTLEABLE: AdvanceStatusType[] = [
  AdvanceStatus.DISBURSED,
  AdvanceStatus.SUBMITTED,
  AdvanceStatus.SETTLED,
];

export function AdvanceSettlementsPage() {
  const [rows, setRows] = useState<Advance[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    api
      .advances({ pageSize: 200 })
      .then((result) => setRows(result.items))
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Unable to load settlements",
        );
      });
  }, []);

  const settleable = useMemo(
    () => rows.filter((row) => SETTLEABLE.includes(row.status)),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return settleable.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!needle) return true;
      const haystack = [
        row.advanceNumber,
        row.projectCode,
        row.projectName,
        row.employeeName,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [settleable, statusFilter, search]);

  const statusOptions = [
    { value: "all", label: "All settleable" },
    ...SETTLEABLE.map((status) => ({
      value: status,
      label: ADVANCE_STATUS_LABEL[status],
    })),
  ];

  return (
    <>
      <header className='workspace-header'>
        <div>
          <h1>Expense settlements</h1>
        </div>
        <Link to='/advances' className='ghost-link'>
          Advance requisitions
        </Link>
      </header>

      {error ? <p className='form-error'>{error}</p> : null}

      <section className='table-card'>
        <div className='table-head'>
          <h2>Settlement queue</h2>
          <p className='muted'>
            Advances that are disbursed, submitted for settlement, or already
            settled
          </p>
        </div>
        <div className='filter-bar'>
          <label>
            Status
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              options={statusOptions}
            />
          </label>
          <label>
            Search
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Number, project, or employee'
            />
          </label>
        </div>
        <table className='data-table'>
          <thead>
            <tr>
              <th>Number</th>
              <th>Project</th>
              <th>Employee</th>
              <th>Requested</th>
              <th>Spent</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link to={`/advances/${row.id}`}>{row.advanceNumber}</Link>
                </td>
                <td>
                  {row.projectName}
                </td>
                <td>{row.employeeName}</td>
                <td>{money(row.requestedAmount)}</td>
                <td>
                  {row.spentAmount === null ? "—" : money(row.spentAmount)}
                </td>
                <td>
                  <span className={`status-pill status-${row.status}`}>
                    {ADVANCE_STATUS_LABEL[row.status]}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className='muted'>
                  No settleable advances match this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </>
  );
}
