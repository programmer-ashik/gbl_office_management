import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { ExpandableText } from './ExpandableText'
import { ActionMenu, Select } from './ui'
import {
  JOURNAL_STATUS_LABEL,
  JOURNAL_TYPE_LABEL,
  JournalStatus,
  JournalType,
  money,
  type JournalEntry,
} from '../types/accounting'
import type { Project } from '../types/project'
import {
  downloadJournalVoucher,
  loadJournalVoucherTemplate,
  previewJournalVoucher,
} from '../utils/journalVoucherPdf'

async function getJvTemplate() {
  return loadJournalVoucherTemplate(() => api.journalVoucherTemplate())
}

export function journalEditDisabledReason(entry: JournalEntry): string | undefined {
  if (entry.source === 'system') {
    return 'System-generated journals cannot be edited.'
  }
  if (entry.status === JournalStatus.REVERSED) {
    return 'Reversed journals cannot be edited.'
  }
  if (entry.status === JournalStatus.POSTED) {
    return 'Posted journals cannot be edited — reverse instead.'
  }
  if (
    entry.status !== JournalStatus.DRAFT &&
    entry.status !== JournalStatus.REJECTED &&
    entry.status !== JournalStatus.APPROVED
  ) {
    return `Cannot edit status ${entry.status}.`
  }
  return undefined
}

export function journalDeleteDisabledReason(entry: JournalEntry): string | undefined {
  if (entry.source === 'system') {
    return 'System-generated journals cannot be deleted.'
  }
  if (entry.status === JournalStatus.POSTED) {
    return 'Posted journals cannot be deleted — reverse instead.'
  }
  if (entry.status === JournalStatus.REVERSED) {
    return 'Reversed journals cannot be deleted.'
  }
  if (
    entry.status !== JournalStatus.DRAFT &&
    entry.status !== JournalStatus.REJECTED &&
    entry.status !== JournalStatus.CANCELLED
  ) {
    return `Cannot delete status ${entry.status}.`
  }
  return undefined
}

export function journalReverseDisabledReason(entry: JournalEntry): string | undefined {
  if (entry.status !== JournalStatus.POSTED) {
    return 'Only posted journals can be reversed.'
  }
  return undefined
}

/** @deprecated use journalEditDisabledReason */
export function journalMutateDisabledReason(entry: JournalEntry): string | undefined {
  return journalEditDisabledReason(entry) ?? journalDeleteDisabledReason(entry)
}

type JournalRegisterProps = {
  title?: string
  description?: string
  lockedDate?: string
  showRangeFilter?: boolean
  onEdit?: (entry: JournalEntry) => void
  onChanged?: () => void
  refreshKey?: number | string
}

const PAGE_SIZE = 15

export function JournalRegister({
  title = 'Journal register',
  description,
  lockedDate,
  showRangeFilter = true,
  onEdit,
  onChanged,
  refreshKey,
}: JournalRegisterProps) {
  const navigate = useNavigate()
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [status, setStatus] = useState('')
  const [journalType, setJournalType] = useState('')
  const [projectId, setProjectId] = useState('')
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchDebounced(search.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [search])

  async function load(overrides?: {
    from?: string
    to?: string
    status?: string
    journalType?: string
    projectId?: string
    search?: string
  }) {
    const from = lockedDate ?? overrides?.from ?? fromDate
    const to = lockedDate ?? overrides?.to ?? toDate
    const [journals, projectRows] = await Promise.all([
      api.journals({
        fromDate: from || undefined,
        toDate: to || undefined,
        status: (overrides?.status ?? status) || undefined,
        journalType: (overrides?.journalType ?? journalType) || undefined,
        projectId: (overrides?.projectId ?? projectId) || undefined,
        search: (overrides?.search ?? searchDebounced) || undefined,
      }),
      api.projects(),
    ])
    setEntries(journals)
    setProjects(projectRows)
    setPage(1)
  }

  useEffect(() => {
    setError(null)
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load journals')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedDate, refreshKey, searchDebounced])

  async function onFilter(event: FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to filter journals')
    }
  }

  async function onDelete(entry: JournalEntry) {
    if (!window.confirm(`Delete draft ${entry.entryNumber}?`)) return
    setBusyId(entry.id)
    setError(null)
    try {
      await api.deleteJournal(entry.id)
      await load()
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete journal')
    } finally {
      setBusyId(null)
    }
  }

  async function onReverse(entry: JournalEntry) {
    if (
      !window.confirm(
        `Reverse ${entry.entryNumber}? A balancing reversing entry will be posted.`,
      )
    ) {
      return
    }
    setBusyId(entry.id)
    setError(null)
    try {
      await api.reverseJournal(entry.id)
      await load()
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reverse journal')
    } finally {
      setBusyId(null)
    }
  }

  async function onPostDraft(entry: JournalEntry) {
    setBusyId(entry.id)
    setError(null)
    try {
      await api.postDraftJournal(entry.id)
      await load()
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to post draft')
    } finally {
      setBusyId(null)
    }
  }

  async function onPdf(entry: JournalEntry, action: 'preview' | 'download') {
    setBusyId(entry.id)
    setError(null)
    try {
      const voucher =
        entry.lines && entry.lines.length > 0 ? entry : await api.journal(entry.id)
      if (action === 'preview') await previewJournalVoucher(voucher, await getJvTemplate())
      else await downloadJournalVoucher(voucher, await getJvTemplate())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open voucher PDF')
    } finally {
      setBusyId(null)
    }
  }

  const statusOptions = useMemo(
    () => [
      { value: '', label: 'All statuses' },
      ...Object.entries(JOURNAL_STATUS_LABEL).map(([value, label]) => ({
        value,
        label,
      })),
    ],
    [],
  )

  const typeOptions = useMemo(
    () => [
      { value: '', label: 'All types' },
      ...Object.entries(JOURNAL_TYPE_LABEL).map(([value, label]) => ({
        value,
        label,
      })),
    ],
    [],
  )

  const projectOptions = [
    { value: '', label: 'All projects' },
    ...projects.map((project) => ({
      value: project.id,
      label: `${project.code} · ${project.name}`,
    })),
  ]

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageEntries = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return entries.slice(start, start + PAGE_SIZE)
  }, [entries, currentPage])
  const rangeStart = entries.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, entries.length)

  return (
    <section className="table-card report-section" id="report">
      <div className="table-head">
        <h2>{title}</h2>
        <p className="muted">
          {description ??
            (lockedDate
              ? `Showing journals for ${lockedDate}.`
              : 'Full journal register with filters and voucher actions.')}
        </p>
      </div>

      {showRangeFilter ? (
        <form className="filter-bar filter-bar-compact" onSubmit={(event) => void onFilter(event)}>
          <label>
            Search
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Number, memo, entity…"
            />
          </label>
          {!lockedDate ? (
            <>
              <label>
                From
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </label>
            </>
          ) : null}
          <label>
            Status
            <Select value={status} onChange={setStatus} options={statusOptions} searchable />
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
          <button type="submit">Apply</button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setFromDate('')
              setToDate('')
              setStatus('')
              setJournalType('')
              setProjectId('')
              setSearch('')
              setSearchDebounced('')
              void load({
                from: '',
                to: '',
                status: '',
                journalType: '',
                projectId: '',
                search: '',
              }).catch((err: unknown) => {
                setError(err instanceof Error ? err.message : 'Unable to load journals')
              })
            }}
          >
            Clear
          </button>
        </form>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}

      <div className="journal-lines-scroll">
        <table className="journal-lines-table journal-register-table">
          <thead>
            <tr>
              <th>Number</th>
              <th>Date</th>
              <th>Type</th>
              <th>Status</th>
              <th>Memo</th>
              <th>Project</th>
              <th className="num">Debit</th>
              <th className="num">Credit</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageEntries.map((entry) => {
              const editReason = journalEditDisabledReason(entry)
              const deleteReason = journalDeleteDisabledReason(entry)
              const reverseReason = journalReverseDisabledReason(entry)
              const typeLabel =
                JOURNAL_TYPE_LABEL[entry.journalType as JournalType] ??
                entry.journalType ??
                'General'
              return (
                <tr key={entry.id}>
                  <td>
                    <Link to={`/journals/${entry.id}`}>{entry.entryNumber}</Link>
                  </td>
                  <td>{entry.date.slice(0, 10)}</td>
                  <td>{typeLabel}</td>
                  <td>
                    <span className={`status-pill status-${entry.status}`}>
                      {JOURNAL_STATUS_LABEL[entry.status] ?? entry.status}
                    </span>
                  </td>
                  <td>
                    <ExpandableText text={entry.memo} maxChars={48} />
                  </td>
                  <td>
                    {entry.projectId
                      ? (projects.find((project) => project.id === entry.projectId)
                          ?.name ?? 'Tagged')
                      : '—'}
                  </td>
                  <td className="num">{money(entry.totalDebit)}</td>
                  <td className="num">{money(entry.totalCredit)}</td>
                  <td>
                    <ActionMenu
                      disabled={busyId === entry.id}
                      items={[
                        {
                          label: 'View',
                          onSelect: () => navigate(`/journals/${entry.id}`),
                        },
                        {
                          label: 'Edit',
                          disabled: Boolean(editReason) || !onEdit,
                          disabledReason: !onEdit
                            ? 'Edit this journal from the Journals page.'
                            : editReason,
                          onSelect: () => onEdit?.(entry),
                        },
                        {
                          label: 'Post draft',
                          disabled: entry.status !== JournalStatus.DRAFT,
                          disabledReason:
                            entry.status !== JournalStatus.DRAFT
                              ? 'Only drafts can be posted from here.'
                              : undefined,
                          onSelect: () => void onPostDraft(entry),
                        },
                        {
                          label: 'Reverse',
                          disabled: Boolean(reverseReason),
                          disabledReason: reverseReason,
                          onSelect: () => void onReverse(entry),
                        },
                        {
                          label: 'Preview PDF',
                          onSelect: () => void onPdf(entry, 'preview'),
                        },
                        {
                          label: 'Download PDF',
                          onSelect: () => void onPdf(entry, 'download'),
                        },
                        {
                          label: 'Delete',
                          danger: true,
                          disabled: Boolean(deleteReason),
                          disabledReason: deleteReason,
                          onSelect: () => void onDelete(entry),
                        },
                      ]}
                    />
                  </td>
                </tr>
              )
            })}
            {entries.length === 0 ? (
              <tr>
                <td colSpan={9} className="muted">
                  No journals match the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {entries.length > 0 ? (
        <div className="table-pagination">
          <p className="muted">
            Showing {rangeStart}–{rangeEnd} of {entries.length}
          </p>
          <div className="form-actions">
            <button
              type="button"
              className="ghost"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="pagination-page">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              className="ghost"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
