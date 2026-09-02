import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { Modal, Select } from '../components/ui'
import { money, type Account, type JournalEntry } from '../types/accounting'
import type { Project } from '../types/project'

type DraftLine = {
  accountCode: string
  debit: string
  credit: string
}

const emptyLine = (): DraftLine => ({ accountCode: '', debit: '', credit: '' })

export function JournalsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [memo, setMemo] = useState('')
  const [projectId, setProjectId] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(), emptyLine()])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  async function load() {
    const [coa, journals, projectRows] = await Promise.all([
      api.accounts(),
      api.journals(),
      api.projects(),
    ])
    setAccounts(coa.filter((account) => account.isPostable && account.isActive))
    setEntries(journals)
    setProjects(projectRows)
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load journals')
    })
  }, [])

  const totals = useMemo(() => {
    return lines.reduce(
      (acc, line) => ({
        debit: acc.debit + (Number(line.debit) || 0),
        credit: acc.credit + (Number(line.credit) || 0),
      }),
      { debit: 0, credit: 0 },
    )
  }, [lines])

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    )
  }

  async function onPost(event: FormEvent) {
    event.preventDefault()
    if (lines.some((line) => !line.accountCode)) return
    setSaving(true)
    setError(null)
    try {
      await api.postJournal({
        date,
        memo,
        projectId: projectId || undefined,
        lines: lines.map((line) => ({
          accountCode: line.accountCode,
          debit: line.debit ? Number(line.debit) : undefined,
          credit: line.credit ? Number(line.credit) : undefined,
        })),
      })
      setMemo('')
      setProjectId('')
      setLines([emptyLine(), emptyLine()])
      setModalOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to post journal')
    } finally {
      setSaving(false)
    }
  }

  const accountOptions = accounts.map((account) => ({
    value: account.code,
    label: `${account.code} · ${account.name}`,
  }))

  const projectOptions = [
    { value: '', label: 'None (company-level)' },
    ...projects.map((project) => ({
      value: project.id,
      label: `${project.code} · ${project.name}`,
    })),
  ]

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Journal entries</h1>
        </div>
        <button type="button" onClick={() => setModalOpen(true)}>
          Add journal
        </button>
      </header>

      <Modal
        open={modalOpen}
        title="Post journal"
        description="Debits must equal credits before posting."
        onClose={() => setModalOpen(false)}
        wide
      >
        <form className="stack-form" onSubmit={(event) => void onPost(event)}>
          <div className="name-row triple-row">
            <label>
              Date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>
            <label>
              Memo
              <input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                required
              />
            </label>
            <label>
              Project
              <Select
                value={projectId}
                onChange={setProjectId}
                options={projectOptions}
                placeholder="None (company-level)"
              />
            </label>
          </div>

          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Debit</th>
                <th>Credit</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={index}>
                  <td>
                    <Select
                      value={line.accountCode}
                      onChange={(value) => updateLine(index, { accountCode: value })}
                      options={accountOptions}
                      placeholder="Select account"
                      required
                    />
                  </td>
                  <td>
                    <input
                      inputMode="decimal"
                      value={line.debit}
                      onChange={(e) =>
                        updateLine(index, { debit: e.target.value, credit: '' })
                      }
                    />
                  </td>
                  <td>
                    <input
                      inputMode="decimal"
                      value={line.credit}
                      onChange={(e) =>
                        updateLine(index, { credit: e.target.value, debit: '' })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Totals</th>
                <th>{money(totals.debit)}</th>
                <th>{money(totals.credit)}</th>
              </tr>
            </tfoot>
          </table>

          <div className="form-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => setLines((current) => [...current, emptyLine()])}
            >
              Add line
            </button>
            <button
              type="submit"
              disabled={
                saving ||
                lines.some((line) => !line.accountCode) ||
                Number(totals.debit.toFixed(2)) !== Number(totals.credit.toFixed(2))
              }
            >
              {saving ? 'Posting…' : 'Post journal'}
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </Modal>

      <section className="table-card">
        <h2>Posted journals</h2>
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Date</th>
              <th>Memo</th>
              <th>Project</th>
              <th>Debit</th>
              <th>Credit</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.entryNumber}</td>
                <td>{entry.date.slice(0, 10)}</td>
                <td>{entry.memo}</td>
                <td>
                  {entry.projectId
                    ? (projects.find((project) => project.id === entry.projectId)?.code ??
                      'Tagged')
                    : '—'}
                </td>
                <td>{money(entry.totalDebit)}</td>
                <td>{money(entry.totalCredit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {!modalOpen && error ? <p className="form-error">{error}</p> : null}
    </>
  )
}
