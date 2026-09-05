import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import {
  journalDeleteDisabledReason,
  journalEditDisabledReason,
  journalReverseDisabledReason,
} from '../components/JournalRegister'
import { MetricCard } from '../components/MetricCard'
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

export function JournalDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [entry, setEntry] = useState<JournalEntry | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([api.journal(id), api.projects()])
      .then(([journal, projectRows]) => {
        setEntry(journal)
        setProjects(projectRows)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load journal')
      })
  }, [id])

  async function onDelete() {
    if (!entry) return
    if (!window.confirm(`Delete ${entry.entryNumber}?`)) return
    setBusy(true)
    setError(null)
    try {
      await api.deleteJournal(entry.id)
      navigate('/journals')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete journal')
    } finally {
      setBusy(false)
    }
  }

  async function onReverse() {
    if (!entry) return
    if (
      !window.confirm(
        `Reverse ${entry.entryNumber}? A balancing reversing entry will be posted.`,
      )
    ) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const reversing = await api.reverseJournal(entry.id)
      navigate(`/journals/${reversing.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reverse journal')
    } finally {
      setBusy(false)
    }
  }

  async function onPostDraft() {
    if (!entry) return
    setBusy(true)
    setError(null)
    try {
      const posted = await api.postDraftJournal(entry.id)
      setEntry(posted)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to post draft')
    } finally {
      setBusy(false)
    }
  }

  if (!entry && !error) {
    return <p className="muted">Loading voucher…</p>
  }

  if (!entry) {
    return <p className="form-error">{error}</p>
  }

  const editReason = journalEditDisabledReason(entry)
  const deleteReason = journalDeleteDisabledReason(entry)
  const reverseReason = journalReverseDisabledReason(entry)
  const projectLabel = entry.projectId
    ? (projects.find((project) => project.id === entry.projectId)?.code ??
      'Tagged')
    : '—'
  const typeLabel =
    JOURNAL_TYPE_LABEL[entry.journalType as JournalType] ??
    entry.journalType ??
    'General'

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Journal voucher</h1>
          <p className="muted">{entry.entryNumber}</p>
        </div>
        <div className="table-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => void getJvTemplate().then((t) => previewJournalVoucher(entry, t))}
          >
            Preview PDF
          </button>
          <button
            type="button"
            onClick={() => void getJvTemplate().then((t) => downloadJournalVoucher(entry, t))}
          >
            Download PDF
          </button>
          {!editReason ? (
            <Link to={`/journals?edit=${entry.id}`} className="action-link">
              Edit
            </Link>
          ) : null}
          {entry.status === JournalStatus.DRAFT ? (
            <button type="button" disabled={busy} onClick={() => void onPostDraft()}>
              Post
            </button>
          ) : null}
          {!reverseReason ? (
            <button
              type="button"
              className="ghost"
              disabled={busy}
              onClick={() => void onReverse()}
            >
              Reverse
            </button>
          ) : null}
          {!deleteReason ? (
            <button
              type="button"
              className="ghost"
              disabled={busy}
              onClick={() => void onDelete()}
            >
              Delete
            </button>
          ) : null}
          <Link to="/journals" className="ghost-link">
            Back
          </Link>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="grid metric-card-grid">
        <MetricCard variant="blue" title="Date" value={entry.date.slice(0, 10)} />
        <MetricCard
          variant="amber"
          title="Status"
          value={JOURNAL_STATUS_LABEL[entry.status] ?? entry.status}
        />
        <MetricCard variant="purple" title="Type" value={typeLabel} />
        <MetricCard variant="teal" title="Project" value={projectLabel} />
      </section>

      <section className="table-card">
        <div className="table-head">
          <h2>Header</h2>
          <p className="muted">
            Source {entry.source}
            {entry.reference ? ` · Ref ${entry.reference}` : ''}
            {entry.postedAt ? ` · Posted ${entry.postedAt.slice(0, 10)}` : ''}
          </p>
        </div>
        <p>{entry.memo}</p>
      </section>

      <section className="table-card">
        <div className="table-head">
          <h2>Accounting entries</h2>
        </div>
        <div className="journal-lines-scroll">
          <table className="journal-lines-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Entity</th>
                <th>Project</th>
                <th>Description</th>
                <th className="num">Debit</th>
                <th className="num">Credit</th>
              </tr>
            </thead>
            <tbody>
              {entry.lines.map((line, index) => (
                <tr key={`${line.accountCode}-${index}`}>
                  <td>
                    <Link to={`/ledgers/${line.accountCode}`}>
                      {line.accountCode} · {line.accountName}
                    </Link>
                  </td>
                  <td>
                    {line.entityName
                      ? `${line.entityType ?? ''} · ${line.entityName}`
                      : '—'}
                  </td>
                  <td>
                    {line.projectId
                      ? (projects.find((project) => project.id === line.projectId)
                          ?.code ?? 'Tagged')
                      : '—'}
                  </td>
                  <td>{line.description ?? '—'}</td>
                  <td className="num amount-debit-cell">
                    {line.debit > 0 ? money(line.debit) : '—'}
                  </td>
                  <td className="num amount-credit-cell">
                    {line.credit > 0 ? money(line.credit) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={4}>Totals</th>
                <th className="num">{money(entry.totalDebit)}</th>
                <th className="num">{money(entry.totalCredit)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </>
  )
}
