import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { ExpandableText } from "./ExpandableText";
import { PostedJournalEditModal } from "./PostedJournalEditModal";
import { ActionMenu, Select } from "./ui";
import { VoucherPdfPreview } from "./VoucherPdfPreview";
import { ReportExportMenu } from "./ReportExportMenu";
import type { ReportExport, ReportSection } from "../utils/reportExport";
import {
  journalDescription,
  journalHeads,
  lineDescription,
} from "../utils/journalNarrative";
import {
  JOURNAL_STATUS_LABEL,
  JOURNAL_TYPE_LABEL,
  JournalStatus,
  JournalType,
  money,
  type JournalEntry,
  type JournalLine,
} from "../types/accounting";
import type { Project } from "../types/project";
import {
  downloadJournalVoucher,
  journalVoucherPreviewUrl,
  loadJournalVoucherTemplate,
} from "../utils/journalVoucherPdf";
import {
  journalsForProject,
  projectLines,
  projectTotals,
} from "../utils/journalProjectFilter";

async function getJvTemplate() {
  return loadJournalVoucherTemplate(() => api.journalVoucherTemplate(), {
    force: true,
  });
}

export function journalEditDisabledReason(
  entry: JournalEntry,
): string | undefined {
  if (entry.source === "system") {
    return "System-generated journals cannot be edited.";
  }
  if (entry.status === JournalStatus.REVERSED) {
    return "Reversed journals cannot be edited.";
  }
  if (entry.status === JournalStatus.POSTED) {
    return "Posted: use Edit date / description, or reverse to change amounts.";
  }
  if (
    entry.status !== JournalStatus.DRAFT &&
    entry.status !== JournalStatus.REJECTED &&
    entry.status !== JournalStatus.APPROVED
  ) {
    return `Cannot edit status ${entry.status}.`;
  }
  return undefined;
}

export function journalDetailsEditDisabledReason(
  entry: JournalEntry,
): string | undefined {
  if (entry.status !== JournalStatus.POSTED) {
    return entry.status === JournalStatus.REVERSED
      ? "Reversed journals cannot be edited."
      : "Only posted journals — drafts use Edit.";
  }
  return undefined;
}

export function journalDeleteDisabledReason(
  entry: JournalEntry,
): string | undefined {
  if (entry.source === "system") {
    return "System-generated journals cannot be deleted.";
  }
  if (entry.status === JournalStatus.POSTED) {
    return "Posted journals cannot be deleted — reverse instead.";
  }
  if (entry.status === JournalStatus.REVERSED) {
    return "Reversed journals cannot be deleted.";
  }
  if (
    entry.status !== JournalStatus.DRAFT &&
    entry.status !== JournalStatus.REJECTED &&
    entry.status !== JournalStatus.CANCELLED
  ) {
    return `Cannot delete status ${entry.status}.`;
  }
  return undefined;
}

export function journalReverseDisabledReason(
  entry: JournalEntry,
): string | undefined {
  if (entry.status !== JournalStatus.POSTED) {
    return "Only posted journals can be reversed.";
  }
  return undefined;
}

/** @deprecated use journalEditDisabledReason */
export function journalMutateDisabledReason(
  entry: JournalEntry,
): string | undefined {
  return journalEditDisabledReason(entry) ?? journalDeleteDisabledReason(entry);
}

type JournalRegisterProps = {
  title?: string;
  description?: string;
  lockedDate?: string;
  showRangeFilter?: boolean;
  onEdit?: (entry: JournalEntry) => void;
  onChanged?: () => void;
  refreshKey?: number | string;
  /** Oldest first so the last entry is the last row (reports). */
  chronological?: boolean;
  /** Enables PDF preview / download / CSV of every filtered journal (grouped by project). */
  exportTitle?: string;
  /** `ledger`: one row per journal line in general-ledger columns. */
  layout?: "journal" | "ledger";
};

const PAGE_SIZE = 15;

function compareChronological(a: JournalEntry, b: JournalEntry): number {
  const byDate = a.date.slice(0, 10).localeCompare(b.date.slice(0, 10));
  if (byDate !== 0) return byDate;
  return a.entryNumber.localeCompare(b.entryNumber, undefined, {
    numeric: true,
  });
}

/**
 * Project for a line: its own tag, else the journal tag, else the only project
 * used on the journal (so the Hand Cash side follows the expense's project).
 */
function lineProjectId(entry: JournalEntry, line: JournalLine): string | null {
  if (line.projectId) return line.projectId;
  if (entry.projectId) return entry.projectId;
  const tagged = new Set(
    (entry.lines ?? []).map((row) => row.projectId).filter(Boolean),
  );
  return tagged.size === 1 ? ([...tagged][0] as string) : null;
}

export function JournalRegister({
  title = "Journal register",
  description,
  lockedDate,
  showRangeFilter = true,
  onEdit,
  onChanged,
  refreshKey,
  chronological = false,
  exportTitle,
  layout = "journal",
}: JournalRegisterProps) {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [status, setStatus] = useState("");
  const [journalType, setJournalType] = useState("");
  const [projectId, setProjectId] = useState("");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("Voucher PDF");
  const [detailsEntry, setDetailsEntry] = useState<JournalEntry | null>(null);
  const [page, setPage] = useState(1);
  const [applied, setApplied] = useState({
    from: "",
    to: "",
    status: "",
    journalType: "",
    projectId: "",
    search: "",
  });

  useEffect(() => {
    const timer = window.setTimeout(
      () => setSearchDebounced(search.trim()),
      350,
    );
    return () => window.clearTimeout(timer);
  }, [search]);

  async function load(overrides?: {
    from?: string;
    to?: string;
    status?: string;
    journalType?: string;
    projectId?: string;
    search?: string;
  }) {
    const from = lockedDate ?? overrides?.from ?? fromDate;
    const to = lockedDate ?? overrides?.to ?? toDate;
    const filters = {
      from,
      to,
      status: overrides?.status ?? status,
      journalType: overrides?.journalType ?? journalType,
      projectId: overrides?.projectId ?? projectId,
      search: overrides?.search ?? searchDebounced,
    };
    const [journals, projectRows] = await Promise.all([
      api.journals({
        fromDate: filters.from || undefined,
        toDate: filters.to || undefined,
        status: filters.status || undefined,
        journalType: filters.journalType || undefined,
        projectId: filters.projectId || undefined,
        search: filters.search || undefined,
      }),
      api.projects(),
    ]);
    setApplied(filters);
    setEntries(
      chronological ? [...journals].sort(compareChronological) : journals,
    );
    setProjects(projectRows);
    setPage(1);
  }

  useEffect(() => {
    setError(null);
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Unable to load journals");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedDate, refreshKey, searchDebounced]);

  async function onFilter(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to filter journals",
      );
    }
  }

  async function onDelete(entry: JournalEntry) {
    if (!window.confirm(`Delete draft ${entry.entryNumber}?`)) return;
    setBusyId(entry.id);
    setError(null);
    try {
      await api.deleteJournal(entry.id);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete journal");
    } finally {
      setBusyId(null);
    }
  }

  async function onReverse(entry: JournalEntry) {
    if (
      !window.confirm(
        `Reverse ${entry.entryNumber}? A balancing reversing entry will be posted.`,
      )
    ) {
      return;
    }
    setBusyId(entry.id);
    setError(null);
    try {
      await api.reverseJournal(entry.id);
      await load();
      onChanged?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to reverse journal",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function onPostDraft(entry: JournalEntry) {
    setBusyId(entry.id);
    setError(null);
    try {
      await api.postDraftJournal(entry.id);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to post draft");
    } finally {
      setBusyId(null);
    }
  }

  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  async function onPdf(entry: JournalEntry, action: "preview" | "download") {
    setBusyId(entry.id);
    setError(null);
    try {
      const voucher =
        entry.lines && entry.lines.length > 0
          ? entry
          : await api.journal(entry.id);
      const template = await getJvTemplate();
      if (action === "preview") {
        const url = await journalVoucherPreviewUrl(voucher, template);
        setPreviewTitle(`${voucher.entryNumber} PDF`);
        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return url;
        });
      } else {
        await downloadJournalVoucher(voucher, template);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to open voucher PDF",
      );
    } finally {
      setBusyId(null);
    }
  }

  const statusOptions = useMemo(
    () => [
      { value: "", label: "All statuses" },
      ...Object.entries(JOURNAL_STATUS_LABEL).map(([value, label]) => ({
        value,
        label,
      })),
    ],
    [],
  );

  const typeOptions = useMemo(
    () => [
      { value: "", label: "All types" },
      ...Object.entries(JOURNAL_TYPE_LABEL).map(([value, label]) => ({
        value,
        label,
      })),
    ],
    [],
  );

  const projectOptions = [
    { value: "", label: "All projects" },
    ...projects.map((project) => ({
      value: project.id,
      label: project.name,
      keywords: project.code,
    })),
  ];

  const visibleEntries = useMemo(
    () => journalsForProject(entries, applied.projectId),
    [entries, applied.projectId],
  );
  const totalPages = Math.max(1, Math.ceil(visibleEntries.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageEntries = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return visibleEntries.slice(start, start + PAGE_SIZE);
  }, [visibleEntries, currentPage]);
  const rangeStart =
    visibleEntries.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, visibleEntries.length);

  const headDescription =
    description ??
    (lockedDate
      ? `Showing journals for ${lockedDate}.`
      : "Full journal register with filters and voucher actions.");

  function projectName(id: string | null): string {
    if (!id) return "—";
    const project = projects.find((row) => row.id === id);
    return project ? project.name : "Tagged";
  }

  const totals = useMemo(
    () => projectTotals(visibleEntries, applied.projectId),
    [visibleEntries, applied.projectId],
  );

  function exportPayload(): ReportExport {
    const optionLabel = (
      options: Array<{ value: string; label: string }>,
      value: string,
    ) => options.find((row) => row.value === value)?.label ?? value;

    const byProject = new Map<
      string,
      { rows: string[][]; debit: number; credit: number }
    >();
    for (const entry of visibleEntries) {
      for (const line of projectLines(entry, applied.projectId)) {
        const key = lineProjectId(entry, line) ?? "";
        const bucket = byProject.get(key) ?? { rows: [], debit: 0, credit: 0 };
        bucket.rows.push([
          entry.date.slice(0, 10),
          entry.entryNumber,
          line.accountName,
          lineDescription(entry, line),
          line.entityName ?? "",
          line.debit ? money(line.debit) : "",
          line.credit ? money(line.credit) : "",
        ]);
        bucket.debit += line.debit;
        bucket.credit += line.credit;
        byProject.set(key, bucket);
      }
    }
    const projectCode = (id: string) =>
      projects.find((row) => row.id === id)?.code ?? "\uffff";
    const sections: ReportSection[] = [...byProject.entries()]
      .sort(([a], [b]) => {
        if (!a) return 1;
        if (!b) return -1;
        return projectCode(a).localeCompare(projectCode(b), undefined, {
          numeric: true,
        });
      })
      .map(([id, bucket]) => ({
        title: id ? `Project: ${projectName(id)}` : "No project",
        rows: bucket.rows,
        totals: [
          [
            "",
            "",
            "",
            "",
            "Project total",
            money(bucket.debit),
            money(bucket.credit),
          ],
        ],
      }));
    const grandDebit = [...byProject.values()].reduce(
      (sum, row) => sum + row.debit,
      0,
    );
    const grandCredit = [...byProject.values()].reduce(
      (sum, row) => sum + row.credit,
      0,
    );

    return {
      title: exportTitle ?? title,
      filters: [
        { label: "From", value: applied.from || "Start" },
        { label: "To", value: applied.to || "Today" },
        {
          label: "Status",
          value: applied.status
            ? optionLabel(statusOptions, applied.status)
            : "All",
        },
        {
          label: "Type",
          value: applied.journalType
            ? optionLabel(typeOptions, applied.journalType)
            : "All",
        },
        {
          label: "Project",
          value: applied.projectId
            ? optionLabel(projectOptions, applied.projectId)
            : "All",
        },
        ...(applied.search ? [{ label: "Search", value: applied.search }] : []),
        { label: "Journals", value: String(visibleEntries.length) },
      ],
      headers: [
        "Date",
        "Journal",
        "Ledger Head",
        "Description",
        "Entity",
        "Debit",
        "Credit",
      ],
      rows: sections.flatMap((section) => section.rows),
      sections,
      rightAlign: [5, 6],
      totals: [
        [
          "",
          "",
          "",
          "",
          "Grand total",
          money(grandDebit),
          money(grandCredit),
        ],
      ],
    };
  }

  function renderActions(entry: JournalEntry) {
    const editReason = journalEditDisabledReason(entry);
    const deleteReason = journalDeleteDisabledReason(entry);
    const reverseReason = journalReverseDisabledReason(entry);
    const detailsReason = journalDetailsEditDisabledReason(entry);
    return (
      <ActionMenu
        disabled={busyId === entry.id}
        items={[
          {
            label: "View",
            onSelect: () => navigate(`/journals/${entry.id}`),
          },
          {
            label: "Edit",
            disabled: Boolean(editReason) || !onEdit,
            disabledReason: !onEdit
              ? "Edit this journal from the Journals page."
              : editReason,
            onSelect: () => onEdit?.(entry),
          },
          {
            label: "Edit date / description",
            disabled: Boolean(detailsReason),
            disabledReason: detailsReason,
            onSelect: () => setDetailsEntry(entry),
          },
          {
            label: "Post draft",
            disabled: entry.status !== JournalStatus.DRAFT,
            disabledReason:
              entry.status !== JournalStatus.DRAFT
                ? "Only drafts can be posted from here."
                : undefined,
            onSelect: () => void onPostDraft(entry),
          },
          {
            label: "Reverse",
            disabled: Boolean(reverseReason),
            disabledReason: reverseReason,
            onSelect: () => void onReverse(entry),
          },
          {
            label: "Preview PDF",
            onSelect: () => void onPdf(entry, "preview"),
          },
          {
            label: "Download PDF",
            onSelect: () => void onPdf(entry, "download"),
          },
          {
            label: "Delete",
            danger: true,
            disabled: Boolean(deleteReason),
            disabledReason: deleteReason,
            onSelect: () => void onDelete(entry),
          },
        ]}
      />
    );
  }

  function renderLedgerRows() {
    return pageEntries.flatMap((entry) => {
      const lines = projectLines(entry, applied.projectId);
      const statusPill =
        entry.status !== JournalStatus.POSTED ? (
          <span className={`status-pill status-${entry.status}`}>
            {JOURNAL_STATUS_LABEL[entry.status] ?? entry.status}
          </span>
        ) : null;
      const types = entry.typeTags?.length
        ? entry.typeTags
        : [entry.effectiveType ?? entry.journalType];
      const typeTag = (
        <span className='muted ledger-reference-no'>
          {types
            .map(
              (type) =>
                JOURNAL_TYPE_LABEL[type as JournalType] ?? type ?? "General",
            )
            .join(" · ")}
        </span>
      );
      if (lines.length === 0) {
        return [
          <tr key={entry.id}>
            <td>{entry.date.slice(0, 10)}</td>
            <td>
              <Link to={`/journals/${entry.id}`}>{entry.entryNumber}</Link>{" "}
              {statusPill}
              {typeTag}
            </td>
            <td>—</td>
            <td className='ledger-description-cell description-cell'>
              <ExpandableText text={journalDescription(entry)} maxChars={60} />
            </td>
            <td>—</td>
            <td>{projectName(entry.projectId)}</td>
            <td className='num amount-debit-cell'>{money(entry.totalDebit)}</td>
            <td className='num amount-credit-cell'>
              {money(entry.totalCredit)}
            </td>
            <td>{renderActions(entry)}</td>
          </tr>,
        ];
      }
      return lines.map((line, index) => {
        const first = index === 0;
        return (
          <tr
            key={`${entry.id}-${index}`}
            className={first ? undefined : "journal-register-continued"}
          >
            <td>{first ? entry.date.slice(0, 10) : ""}</td>
            <td>
              {first ? (
                <>
                  <Link to={`/journals/${entry.id}`}>{entry.entryNumber}</Link>{" "}
                  {statusPill}
                  {typeTag}
                </>
              ) : null}
            </td>
            <td>
              <Link
                to={`/ledgers/${encodeURIComponent(line.accountCode)}`}
                title={line.accountCode}
              >
                {line.accountName}
              </Link>
            </td>
            <td className='ledger-description-cell description-cell'>
              <ExpandableText
                text={lineDescription(entry, line)}
                maxChars={60}
              />
            </td>
            <td>{line.entityName ?? "—"}</td>
            <td>{projectName(lineProjectId(entry, line))}</td>
            <td className='num amount-debit-cell'>
              {line.debit > 0 ? money(line.debit) : "—"}
            </td>
            <td className='num amount-credit-cell'>
              {line.credit > 0 ? money(line.credit) : "—"}
            </td>
            <td>{first ? renderActions(entry) : null}</td>
          </tr>
        );
      });
    });
  }

  return (
    <section className='table-card report-section' id='report'>
      <VoucherPdfPreview
        url={previewUrl}
        title={previewTitle}
        onClose={closePreview}
      />
      <PostedJournalEditModal
        entry={detailsEntry}
        onClose={() => setDetailsEntry(null)}
        onSaved={() => {
          setDetailsEntry(null);
          load()
            .then(() => onChanged?.())
            .catch((err: unknown) => {
              setError(
                err instanceof Error ? err.message : "Unable to load journals",
              );
            });
        }}
      />
      {exportTitle ? (
        <div className='table-head'>
          <div>
            <h2>{title}</h2>
            <p className='muted'>{headDescription}</p>
          </div>
          <ReportExportMenu
            payload={exportPayload}
            disabled={visibleEntries.length === 0}
          />
        </div>
      ) : (
        <div className='table-head'>
          <h2>{title}</h2>
          <p className='muted'>{headDescription}</p>
        </div>
      )}

      {showRangeFilter ? (
        <form
          className='filter-bar filter-bar-compact'
          onSubmit={(event) => void onFilter(event)}
        >
          <label>
            Search
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Number, memo, entity…'
            />
          </label>
          {!lockedDate ? (
            <>
              <label>
                From
                <input
                  type='date'
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </label>
              <label>
                To
                <input
                  type='date'
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </label>
            </>
          ) : null}
          <label>
            Status
            <Select
              value={status}
              onChange={setStatus}
              options={statusOptions}
              searchable
            />
          </label>
          <label>
            Type
            <Select
              value={journalType}
              onChange={setJournalType}
              options={typeOptions}
              searchable
            />
          </label>
          <label>
            Project
            <Select
              value={projectId}
              onChange={setProjectId}
              options={projectOptions}
              searchable
            />
          </label>
          <button type='submit'>Apply</button>
          <button
            type='button'
            className='ghost'
            onClick={() => {
              setFromDate("");
              setToDate("");
              setStatus("");
              setJournalType("");
              setProjectId("");
              setSearch("");
              setSearchDebounced("");
              void load({
                from: "",
                to: "",
                status: "",
                journalType: "",
                projectId: "",
                search: "",
              }).catch((err: unknown) => {
                setError(
                  err instanceof Error
                    ? err.message
                    : "Unable to load journals",
                );
              });
            }}
          >
            Clear
          </button>
        </form>
      ) : null}

      {error ? <p className='form-error'>{error}</p> : null}

      <div className='journal-lines-scroll'>
        {layout === "ledger" ? (
          <table className='journal-lines-table ledger-inquiry-table journal-register-table'>
            <thead>
              <tr className='ledger-table-header'>
                <th>Date</th>
                <th>Journal</th>
                <th>Ledger Head</th>
                <th className='description-cell'>Description</th>
                <th>Entity</th>
                <th>Project</th>
                <th className='num'>Debit</th>
                <th className='num'>Credit</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {renderLedgerRows()}
              {visibleEntries.length === 0 ? (
                <tr>
                  <td colSpan={9} className='muted'>
                    No journals match the current filters.
                  </td>
                </tr>
              ) : null}
              <tr className='ledger-balance-row'>
                <td colSpan={6}>
                  Totals · {visibleEntries.length} journal
                  {visibleEntries.length === 1 ? "" : "s"} (all filtered pages)
                </td>
                <td className='num'>{money(totals.debit)}</td>
                <td className='num'>{money(totals.credit)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        ) : (
          <table className='journal-lines-table journal-register-table'>
            <thead>
              <tr>
                <th>Number</th>
                <th>Date</th>
                <th>Type</th>
                <th>Status</th>
                <th>Ledger Head</th>
                <th className='description-cell'>Description</th>
                <th>Project</th>
                <th className='num'>Debit</th>
                <th className='num'>Credit</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageEntries.map((entry) => {
                const type = entry.effectiveType ?? entry.journalType;
                const typeLabel =
                  JOURNAL_TYPE_LABEL[type as JournalType] ?? type ?? "General";
                return (
                  <tr key={entry.id}>
                    <td>
                      <Link to={`/journals/${entry.id}`}>
                        {entry.entryNumber}
                      </Link>
                    </td>
                    <td>{entry.date.slice(0, 10)}</td>
                    <td>{typeLabel}</td>
                    <td>
                      <span className={`status-pill status-${entry.status}`}>
                        {JOURNAL_STATUS_LABEL[entry.status] ?? entry.status}
                      </span>
                    </td>
                    <td className='ledger-reference-cell'>
                      <ExpandableText
                        text={journalHeads(entry) || "—"}
                        maxChars={48}
                      />
                    </td>
                    <td className='description-cell'>
                      <ExpandableText
                        text={journalDescription(entry)}
                        maxChars={60}
                      />
                    </td>
                    <td>
                      {entry.projectId
                        ? (projects.find(
                            (project) => project.id === entry.projectId,
                          )?.name ?? "Tagged")
                        : "—"}
                    </td>
                    <td className='num'>{money(entry.totalDebit)}</td>
                    <td className='num'>{money(entry.totalCredit)}</td>
                    <td>{renderActions(entry)}</td>
                  </tr>
                );
              })}
              {visibleEntries.length === 0 ? (
                <tr>
                  <td colSpan={10} className='muted'>
                    No journals match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>

      {visibleEntries.length > 0 ? (
        <div className='table-pagination'>
          <p className='muted'>
            Showing {rangeStart}–{rangeEnd} of {visibleEntries.length}
          </p>
          <div className='form-actions'>
            <button
              type='button'
              className='ghost'
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className='pagination-page'>
              Page {currentPage} of {totalPages}
            </span>
            <button
              type='button'
              className='ghost'
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
