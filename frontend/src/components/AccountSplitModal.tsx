import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import {
  money,
  type Account,
  type AccountSplitPlan,
} from '../types/accounting'
import { Modal, Select } from './ui'

type Row = { code: string; name: string }

const CODE_PATTERN = /^[A-Z0-9-]{3,12}$/

/** 5220 → 5221, 5222 …; codes not ending in 0 get 5141-01, 5141-02 … */
function nextCode(parentCode: string, taken: Set<string>): string {
  if (/^\d+0$/.test(parentCode)) {
    const base = Number(parentCode)
    for (let i = 1; i <= 9; i += 1) {
      const candidate = String(base + i)
      if (!taken.has(candidate)) return candidate
    }
  }
  for (let i = 1; i <= 99; i += 1) {
    const candidate = `${parentCode}-${String(i).padStart(2, '0')}`
    if (candidate.length <= 12 && !taken.has(candidate)) return candidate
  }
  return ''
}

type Props = {
  account: Account | null
  accounts: Account[]
  canApply: boolean
  onClose: () => void
  onDone: (message: string) => void
}

export function AccountSplitModal({
  account,
  accounts,
  canApply,
  onClose,
  onDone,
}: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const [historyTo, setHistoryTo] = useState('')
  const [preview, setPreview] = useState<AccountSplitPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const usedCodes = useMemo(
    () => new Set(accounts.map((row) => row.code)),
    [accounts],
  )

  useEffect(() => {
    if (!account) return
    const taken = new Set(usedCodes)
    const first = nextCode(account.code, taken)
    taken.add(first)
    const second = nextCode(account.code, taken)
    setRows([
      { code: first, name: '' },
      { code: second, name: '' },
    ])
    setHistoryTo('')
    setPreview(null)
    setError(null)
  }, [account, usedCodes])

  if (!account) return null

  const historyTarget =
    historyTo && rows.some((row) => row.code === historyTo)
      ? historyTo
      : (rows[rows.length - 1]?.code ?? '')

  function edit(next: Row[]) {
    setRows(next)
    setPreview(null)
    setError(null)
  }

  function addRow() {
    const taken = new Set([...usedCodes, ...rows.map((row) => row.code)])
    edit([...rows, { code: nextCode(account!.code, taken), name: '' }])
  }

  function body() {
    return {
      children: rows.map((row) => ({
        code: row.code.trim().toUpperCase(),
        name: row.name.trim(),
      })),
      historyTo: historyTarget || undefined,
    }
  }

  function localError(): string | null {
    if (rows.length === 0) return 'Add at least one sub-account'
    for (const row of rows) {
      if (!CODE_PATTERN.test(row.code.trim().toUpperCase())) {
        return `Code "${row.code}" must be 3-12 letters, numbers, or hyphens`
      }
      if (row.name.trim().length < 2) return `Enter a name for ${row.code}`
    }
    return null
  }

  async function onReview(event: FormEvent) {
    event.preventDefault()
    const problem = localError()
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      setPreview(await api.previewAccountSplit(account!.id, body()))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to preview split')
    } finally {
      setBusy(false)
    }
  }

  async function onConfirm() {
    setBusy(true)
    setError(null)
    try {
      const result = await api.splitAccount(account!.id, body())
      const moved = result.postedReclasses.length
      onDone(
        `${account!.code} ${account!.name} is now a header with ${result.children.length} sub-account(s)` +
          (moved ? `; ${moved} reclassification journal(s) posted.` : '.'),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to split account')
    } finally {
      setBusy(false)
    }
  }

  const hasHistory = Boolean(preview && preview.reclasses.length > 0)
  const target = rows.find((row) => row.code === historyTarget)

  return (
    <Modal
      open
      wide
      title={`Split ${account.code} · ${account.name}`}
      description="Turns this account into a header. New entries must then pick one of its sub-accounts."
      onClose={onClose}
    >
      <form className="stack-form" onSubmit={(event) => void onReview(event)}>
        <div className="split-rows">
          <div className="split-row split-row-head">
            <span>Code</span>
            <span>Sub-account name</span>
            <span />
          </div>
          {rows.map((row, index) => (
            <div className="split-row" key={index}>
              <input
                aria-label={`Code ${index + 1}`}
                value={row.code}
                onChange={(e) =>
                  edit(
                    rows.map((item, i) =>
                      i === index
                        ? { ...item, code: e.target.value.toUpperCase() }
                        : item,
                    ),
                  )
                }
                required
              />
              <input
                aria-label={`Name ${index + 1}`}
                value={row.name}
                placeholder={index === 0 ? 'e.g. Electricity Bill' : 'e.g. Water Bill'}
                onChange={(e) =>
                  edit(
                    rows.map((item, i) =>
                      i === index ? { ...item, name: e.target.value } : item,
                    ),
                  )
                }
                required
              />
              <button
                type="button"
                className="ghost"
                aria-label={`Remove row ${index + 1}`}
                disabled={rows.length <= 1}
                onClick={() => edit(rows.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            </div>
          ))}
          <div>
            <button type="button" className="ghost" onClick={addRow}>
              + Add sub-account
            </button>
          </div>
        </div>

        {hasHistory ? (
          <label>
            Existing balance moves to
            <Select
              value={historyTarget}
              onChange={(value) => {
                setHistoryTo(value)
                setPreview(null)
              }}
              options={rows.map((row) => ({
                value: row.code,
                label: `${row.code} · ${row.name || 'unnamed'}`,
              }))}
            />
          </label>
        ) : null}

        {preview ? (
          <div className="split-preview">
            {preview.errors.length > 0 ? (
              <ul className="form-error">
                {preview.errors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : null}
            {hasHistory ? (
              <>
                <p>
                  {preview.reclasses.length} posted journal(s) left{' '}
                  <strong>{money(preview.totalToMove)}</strong> on {account.code}.
                  They move to <strong>{target ? `${target.code} ${target.name}` : historyTarget}</strong>{' '}
                  through reclassification journals dated like the originals.
                  Original entries are not changed and report totals stay the same.
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Journal</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.reclasses.slice(0, 15).map((row) => (
                      <tr key={row.reference}>
                        <td>{row.date}</td>
                        <td>{row.entryNumber}</td>
                        <td className="num">{money(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.reclasses.length > 15 ? (
                  <p className="muted">
                    …and {preview.reclasses.length - 15} more.
                  </p>
                ) : null}
              </>
            ) : preview.errors.length === 0 ? (
              <p className="muted">
                Nothing is posted to {account.code}; it simply becomes a header.
              </p>
            ) : null}
            {preview.unpostedJournals.length > 0 ? (
              <p className="muted">
                Drafts still on {account.code} (switch their line to a
                sub-account before posting):{' '}
                {preview.unpostedJournals.map((row) => row.entryNumber).join(', ')}
              </p>
            ) : null}
            {preview.warnings.map((message) => (
              <p className="muted" key={message}>
                {message}
              </p>
            ))}
          </div>
        ) : null}

        {error ? <p className="form-error">{error}</p> : null}

        <div className="form-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          {preview && preview.errors.length === 0 ? (
            canApply ? (
              <button type="button" disabled={busy} onClick={() => void onConfirm()}>
                {busy ? 'Splitting…' : 'Confirm split'}
              </button>
            ) : (
              <span className="muted">Only an Admin can apply the split.</span>
            )
          ) : (
            <button type="submit" disabled={busy}>
              {busy ? 'Checking…' : 'Review'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  )
}
