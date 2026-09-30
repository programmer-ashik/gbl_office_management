import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { Modal } from './ui'
import {
  JournalType,
  money,
  type JournalEntry,
  type JournalWriteBody,
} from '../types/accounting'

export type OpeningTarget = {
  key: string
  accountCode: string
  label: string
  /** Side a positive amount posts to; a negative amount posts to the other side. */
  side: 'debit' | 'credit'
  entityType?: 'customer' | 'supplier' | 'employee'
  entityId?: string
}

export type OpeningRequest = {
  title: string
  targets: OpeningTarget[]
  emptyHint?: string
}

const OWNER_CAPITAL_CODE = '3100'

function lastDayOfPreviousMonth(): string {
  const now = new Date()
  const last = new Date(now.getFullYear(), now.getMonth(), 0)
  const mm = String(last.getMonth() + 1).padStart(2, '0')
  const dd = String(last.getDate()).padStart(2, '0')
  return `${last.getFullYear()}-${mm}-${dd}`
}

function parseAmount(value: string): number {
  const n = Number(value.replace(/,/g, '').trim())
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

function targetMatchesLine(
  target: OpeningTarget,
  line: JournalEntry['lines'][number],
): boolean {
  if (line.accountCode !== target.accountCode) return false
  return !target.entityId || line.entityId === target.entityId
}

export function AccountOpeningModal({
  request,
  onClose,
  onPosted,
}: {
  request: OpeningRequest | null
  onClose: () => void
  onPosted: (message: string) => void
}) {
  const [date, setDate] = useState(lastDayOfPreviousMonth)
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [existing, setExisting] = useState<JournalEntry[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!request) return
    setAmounts({})
    setError(null)
    setExisting([])
    api
      .journals({ journalType: JournalType.OPENING_BALANCE })
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : []
        setExisting(
          list.filter(
            (j) =>
              j.status === 'posted' &&
              !j.reversesEntryId &&
              !j.reversedByEntryId &&
              j.lines.some((line) =>
                request.targets.some((t) => targetMatchesLine(t, line)),
              ),
          ),
        )
      })
      .catch(() => setExisting([]))
  }, [request])

  const lines = useMemo(() => {
    const out: JournalWriteBody['lines'] = []
    for (const target of request?.targets ?? []) {
      const amount = parseAmount(amounts[target.key] ?? '')
      if (amount === 0) continue
      const debitSide = (target.side === 'debit') === amount > 0
      out.push({
        accountCode: target.accountCode,
        ...(debitSide ? { debit: Math.abs(amount) } : { credit: Math.abs(amount) }),
        description: `Opening balance · ${target.label.replace(`${target.accountCode} · `, '')}`,
        ...(target.entityId
          ? { entityType: target.entityType, entityId: target.entityId }
          : {}),
      })
    }
    return out
  }, [amounts, request])

  const totalDebit = lines.reduce((sum, l) => sum + (l.debit ?? 0), 0)
  const totalCredit = lines.reduce((sum, l) => sum + (l.credit ?? 0), 0)
  const difference = Math.round((totalDebit - totalCredit) * 100) / 100
  const hasStock = request?.targets.some((t) => t.accountCode.startsWith('114'))

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!request) return
    setError(null)
    if (lines.length === 0) {
      setError('Enter at least one amount')
      return
    }
    const body: JournalWriteBody = {
      date,
      memo: `Opening balance as of ${date} · ${request.title}`,
      reference: 'OPENING',
      journalType: JournalType.OPENING_BALANCE,
      intent: 'post',
      lines: [
        ...lines,
        ...(difference !== 0
          ? [
              {
                accountCode: OWNER_CAPITAL_CODE,
                ...(difference > 0 ? { credit: difference } : { debit: -difference }),
                description: 'Opening balance offset',
              },
            ]
          : []),
      ],
    }
    setSaving(true)
    try {
      const result = (await api.postJournal(body)) as JournalEntry & {
        requiresApproval?: boolean
      }
      onPosted(
        result.requiresApproval
          ? `Opening balance for ${request.title} sent for approval. It posts once an Admin approves it.`
          : `Opening balance for ${request.title} posted as ${result.entryNumber}.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to post opening balance')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={Boolean(request)}
      title={request ? `Opening balance · ${request.title}` : 'Opening balance'}
      description="Closing balances from your old books, as of the day before you start recording here. Posts one Opening Balance journal; no invoices or bills are created."
      onClose={onClose}
      wide
    >
      {request ? (
        <form className="stack-form" onSubmit={(event) => void onSubmit(event)}>
          {existing.length > 0 ? (
            <div className="callout callout-warn">
              Already has an opening balance:{' '}
              {existing.map((j, i) => (
                <span key={j.id}>
                  {i > 0 ? ', ' : ''}
                  <Link to={`/journals/${j.id}`}>{j.entryNumber}</Link> ({j.date.slice(0, 10)})
                </span>
              ))}
              . Posting again adds to it. To correct it, reverse that journal first.
            </div>
          ) : null}

          <label>
            As of date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>

          {request.targets.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {request.targets.map((target) => (
                  <tr key={target.key}>
                    <td>{target.label}</td>
                    <td>
                      <input
                        inputMode="decimal"
                        placeholder="0.00"
                        value={amounts[target.key] ?? ''}
                        onChange={(e) =>
                          setAmounts((prev) => ({ ...prev, [target.key]: e.target.value }))
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">{request.emptyHint ?? 'Nothing to enter here.'}</p>
          )}

          <p className="muted">
            Enter a negative amount for the opposite side (for example an overdrawn
            bank account).
            {hasStock
              ? ' Stock opening sets the accounting value only; item quantities are not created.'
              : ''}
          </p>

          {lines.length > 0 ? (
            <p className="muted">Total {money(Math.max(totalDebit, totalCredit))}</p>
          ) : null}

          <div className="form-actions">
            <button type="submit" disabled={saving || lines.length === 0}>
              {saving ? 'Posting…' : 'Post opening balance'}
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      ) : null}
    </Modal>
  )
}
