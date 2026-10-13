import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { MetricCard } from '../components/MetricCard'
import { ReportExportMenu } from '../components/ReportExportMenu'
import { ActionMenu, Modal, Select } from '../components/ui'
import { money, type ChequeRegisterRow } from '../types/accounting'
import {
  CHEQUE_STATE_LABEL,
  DIRECTION_LABEL,
  PDC_PAYABLE_CODE,
  PDC_RECEIVABLE_CODE,
  chequeState,
  chequeStateHint,
  isOpenPdc,
  localToday,
  type ChequeState,
} from '../utils/cheque'

type StatusFilter = '' | 'open' | 'due' | ChequeState
type DialogKind = 'clear' | 'bounce' | 'undo'

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: '', label: 'All cheques' },
  { value: 'open', label: 'Pending PDC (all)' },
  { value: 'due', label: 'Due today / overdue' },
  { value: 'pending', label: 'Pending (future)' },
  { value: 'cleared', label: 'Cleared' },
  { value: 'bounced', label: 'Bounced' },
  { value: 'current', label: 'Posted to bank on entry' },
  { value: 'reversed', label: 'Reversed' },
]

const BOUNCE_REASONS = [
  'Insufficient funds',
  'Signature mismatch',
  'Payment stopped by drawer',
  'Cheque cancelled',
  'Account closed',
]

function matchesStatus(state: ChequeState, filter: StatusFilter): boolean {
  if (!filter) return true
  if (filter === 'open') return isOpenPdc(state)
  if (filter === 'due') return state === 'due' || state === 'overdue'
  return state === filter
}

export function ChequeRegisterPage() {
  const navigate = useNavigate()
  const today = localToday()
  const [rows, setRows] = useState<ChequeRegisterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('')
  const [direction, setDirection] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const [dialog, setDialog] = useState<{ kind: DialogKind; row: ChequeRegisterRow } | null>(null)
  const [actionDate, setActionDate] = useState(today)
  const [actionMemo, setActionMemo] = useState('')
  const [bounceReason, setBounceReason] = useState(BOUNCE_REASONS[0]!)
  const [bounceNote, setBounceNote] = useState('')
  const [acting, setActing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.chequeRegister({
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        search: search.trim() || undefined,
      })
      setRows(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load cheque register')
    } finally {
      setLoading(false)
    }
  }, [fromDate, toDate, search])

  useEffect(() => {
    const handle = window.setTimeout(() => void load(), 250)
    return () => window.clearTimeout(handle)
  }, [load])

  const withState = useMemo(
    () => rows.map((row) => ({ row, state: chequeState(row, today) })),
    [rows, today],
  )

  const visible = useMemo(
    () =>
      withState.filter(
        ({ row, state }) =>
          matchesStatus(state, status) && (!direction || row.direction === direction),
      ),
    [withState, status, direction],
  )

  const metrics = useMemo(() => {
    const sum = (list: typeof withState) => list.reduce((total, item) => total + item.row.chequeAmount, 0)
    const openReceived = withState.filter((item) => isOpenPdc(item.state) && item.row.direction === 'receipt')
    const openIssued = withState.filter((item) => isOpenPdc(item.state) && item.row.direction === 'payment')
    const due = withState.filter((item) => item.state === 'due' || item.state === 'overdue')
    const bounced = withState.filter((item) => item.state === 'bounced')
    return {
      received: { count: openReceived.length, amount: sum(openReceived) },
      issued: { count: openIssued.length, amount: sum(openIssued) },
      due: { count: due.length, amount: sum(due) },
      bounced: { count: bounced.length, amount: sum(bounced) },
    }
  }, [withState])

  function openDialog(kind: DialogKind, row: ChequeRegisterRow) {
    setDialog({ kind, row })
    setActionDate(today)
    setActionMemo('')
    setBounceReason(BOUNCE_REASONS[0]!)
    setBounceNote('')
    setActionError(null)
  }

  async function runAction(event: FormEvent) {
    event.preventDefault()
    if (!dialog) return
    const { kind, row } = dialog
    setActing(true)
    setActionError(null)
    try {
      if (kind === 'clear') {
        const result = await api.clearCheque(row.id, {
          date: actionDate,
          memo: actionMemo.trim() || undefined,
        })
        setNotice(
          `Cheque ${row.chequeNumber ?? ''} cleared — ${result.clearingJournal?.entryNumber ?? 'clearing journal'} posted to ${row.bankAccountName ?? 'the bank'}.`,
        )
      } else if (kind === 'bounce') {
        const reason = [bounceReason, bounceNote.trim()].filter(Boolean).join(' — ')
        const result = await api.bounceCheque(row.id, { reason })
        setNotice(
          `Cheque ${row.chequeNumber ?? ''} marked bounced — ${result.reversal?.entryNumber ?? 'reversal'} restores the ${row.direction === 'payment' ? 'supplier' : 'customer'} balance.`,
        )
      } else {
        const result = await api.undoChequeClearing(row.id)
        setNotice(
          `Clearing reversed by ${result.reversal?.entryNumber ?? 'a reversal'} — cheque ${row.chequeNumber ?? ''} is pending again.`,
        )
      }
      setDialog(null)
      await load()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActing(false)
    }
  }

  function actionsFor(row: ChequeRegisterRow, state: ChequeState) {
    const receipt = row.direction !== 'payment'
    const items: Array<{ label: string; onSelect: () => void; danger?: boolean }> = []
    if (isOpenPdc(state)) {
      items.push({
        label: receipt ? 'Clear · deposit to bank' : 'Clear · presented at bank',
        onSelect: () => openDialog('clear', row),
      })
    }
    if (isOpenPdc(state) || state === 'current') {
      items.push({
        label: 'Mark bounced',
        danger: true,
        onSelect: () => openDialog('bounce', row),
      })
    }
    if (state === 'cleared') {
      items.push({
        label: 'Undo clearing',
        danger: true,
        onSelect: () => openDialog('undo', row),
      })
    }
    items.push({ label: 'Open journal', onSelect: () => navigate(`/journals/${row.id}`) })
    if (row.pdcClearingEntryId) {
      items.push({
        label: `Open clearing ${row.clearingEntryNumber ?? 'journal'}`,
        onSelect: () => navigate(`/journals/${row.pdcClearingEntryId}`),
      })
    }
    if (row.reversedByEntryId) {
      items.push({
        label: `Open reversal ${row.reversalEntryNumber ?? ''}`.trim(),
        onSelect: () => navigate(`/journals/${row.reversedByEntryId}`),
      })
    }
    return items
  }

  function exportPayload() {
    const total = visible.reduce((sum, item) => sum + item.row.chequeAmount, 0)
    return {
      title: 'Cheque register',
      filters: [
        { label: 'Status', value: STATUS_OPTIONS.find((option) => option.value === status)?.label ?? 'All' },
        { label: 'Type', value: direction ? DIRECTION_LABEL[direction as 'receipt' | 'payment'] : 'All' },
        { label: 'Cheque date', value: `${fromDate || '…'} to ${toDate || '…'}` },
        { label: 'Cheques', value: String(visible.length) },
      ],
      headers: ['Cheque date', 'Cheque no', 'Type', 'Party', 'Bank', 'Journal', 'Status', 'Amount'],
      rows: visible.map(({ row, state }) => [
        row.chequeDate ?? row.date.slice(0, 10),
        row.chequeNumber ?? '',
        row.direction ? `${DIRECTION_LABEL[row.direction]}${row.isPdc ? ' · PDC' : ''}` : '',
        row.partyName ?? '',
        row.bankAccountName ?? row.bankAccountCode ?? '',
        row.entryNumber,
        [CHEQUE_STATE_LABEL[state], chequeStateHint(row, today)].filter(Boolean).join(' · '),
        money(row.chequeAmount),
      ]),
      rightAlign: [7],
      totals: [['', '', '', '', '', '', 'Total', money(total)]],
    }
  }

  const dialogRow = dialog?.row
  const dialogReceipt = dialogRow?.direction !== 'payment'
  const dialogBank = dialogRow
    ? `${dialogRow.bankAccountCode ?? ''} · ${dialogRow.bankAccountName ?? 'Bank'}`
    : ''
  const dialogHold = dialogReceipt
    ? `${PDC_RECEIVABLE_CODE} · PDC Receivable`
    : `${PDC_PAYABLE_CODE} · PDC Payable`
  const earlyClear = Boolean(
    dialog?.kind === 'clear' && dialogRow?.chequeDate && actionDate < dialogRow.chequeDate,
  )

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Cheque register</h1>
          <p className="muted">
            Every cheque received or issued. Clear post-dated cheques when the bank honours
            them, or mark them bounced.
          </p>
        </div>
        <div className="table-actions">
          <Link to="/banking/cheques/new" className="action-link">
            New cheque
          </Link>
          <ReportExportMenu payload={exportPayload} disabled={loading} />
        </div>
      </header>

      <section className="grid metric-card-grid">
        <MetricCard
          variant="teal"
          title="PDC received · pending"
          value={money(metrics.received.amount)}
          meta={`${metrics.received.count} cheque(s) held in PDC Receivable`}
        />
        <MetricCard
          variant="purple"
          title="PDC issued · pending"
          value={money(metrics.issued.amount)}
          meta={`${metrics.issued.count} cheque(s) held in PDC Payable`}
        />
        <MetricCard
          variant="amber"
          title="Due today / overdue"
          value={metrics.due.count}
          meta={`${money(metrics.due.amount)} ready to clear`}
        />
        <MetricCard
          variant="red"
          title="Bounced"
          value={metrics.bounced.count}
          meta={money(metrics.bounced.amount)}
        />
      </section>

      <section className="table-card">
        <form className="filter-bar" onSubmit={(event) => event.preventDefault()}>
          <label>
            Search
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cheque no, party, journal"
            />
          </label>
          <label>
            Status
            <Select
              value={status}
              onChange={(value) => setStatus(value as StatusFilter)}
              options={STATUS_OPTIONS}
            />
          </label>
          <label>
            Type
            <Select
              value={direction}
              onChange={setDirection}
              options={[
                { value: '', label: 'Received & issued' },
                { value: 'receipt', label: 'Received' },
                { value: 'payment', label: 'Issued' },
              ]}
            />
          </label>
          <label>
            Cheque date from
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
          <div className="form-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setSearch('')
                setStatus('')
                setDirection('')
                setFromDate('')
                setToDate('')
              }}
            >
              Reset
            </button>
          </div>
        </form>

        {error ? <p className="form-error">{error}</p> : null}
        {notice ? <p className="form-success">{notice}</p> : null}

        <table className="cheque-table">
          <thead>
            <tr>
              <th>Cheque date</th>
              <th>Cheque no</th>
              <th>Type</th>
              <th>Party</th>
              <th>Bank</th>
              <th className="numeric">Amount</th>
              <th>Status</th>
              <th>Journal</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {visible.map(({ row, state }) => {
              const hint = chequeStateHint(row, today)
              return (
                <tr key={row.id} className={`cheque-row-${state}`}>
                  <td>{row.chequeDate ?? row.date.slice(0, 10)}</td>
                  <td>
                    <strong>{row.chequeNumber ?? '—'}</strong>
                  </td>
                  <td>
                    {row.direction ? DIRECTION_LABEL[row.direction] : '—'}
                    {row.isPdc ? <span className="cheque-pdc-tag">PDC</span> : null}
                  </td>
                  <td>
                    {row.partyName ?? '—'}
                    {row.partyType && row.partyType !== 'account' ? (
                      <span className="muted ledger-reference-no">{row.partyType}</span>
                    ) : null}
                  </td>
                  <td>{row.bankAccountName ?? row.bankAccountCode ?? '—'}</td>
                  <td className="numeric">{money(row.chequeAmount)}</td>
                  <td>
                    <span className={`status-pill cheque-${state}`}>{CHEQUE_STATE_LABEL[state]}</span>
                    {hint ? <span className="muted ledger-reference-no">{hint}</span> : null}
                  </td>
                  <td>
                    <Link to={`/journals/${row.id}`}>{row.entryNumber}</Link>
                    <span className="muted ledger-reference-no">entered {row.date.slice(0, 10)}</span>
                  </td>
                  <td>
                    <ActionMenu items={actionsFor(row, state)} />
                  </td>
                </tr>
              )
            })}
            {!loading && visible.length === 0 ? (
              <tr>
                <td colSpan={9} className="muted">
                  No cheques match these filters.
                </td>
              </tr>
            ) : null}
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="muted">
                  Loading…
                </td>
              </tr>
            ) : null}
          </tbody>
          {visible.length > 0 ? (
            <tfoot>
              <tr>
                <td colSpan={5}>Total · {visible.length} cheque(s)</td>
                <td className="numeric">
                  {money(visible.reduce((sum, item) => sum + item.row.chequeAmount, 0))}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </section>

      <Modal
        open={Boolean(dialog)}
        title={
          dialog?.kind === 'clear'
            ? 'Clear post-dated cheque'
            : dialog?.kind === 'bounce'
              ? 'Mark cheque bounced'
              : 'Undo cheque clearing'
        }
        description={
          dialogRow
            ? `Cheque ${dialogRow.chequeNumber ?? '—'} · ${dialogRow.partyName ?? ''} · ${money(dialogRow.chequeAmount)}`
            : undefined
        }
        onClose={() => setDialog(null)}
      >
        {dialog && dialogRow ? (
          <form className="stack-form" onSubmit={(event) => void runAction(event)}>
            {dialog.kind === 'clear' ? (
              <>
                <div className="name-row">
                  <label>
                    Clearing date
                    <input
                      type="date"
                      value={actionDate}
                      min={dialogRow.date.slice(0, 10)}
                      onChange={(e) => setActionDate(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Memo (optional)
                    <input
                      value={actionMemo}
                      onChange={(e) => setActionMemo(e.target.value)}
                      maxLength={500}
                      placeholder={`PDC cleared · Chq ${dialogRow.chequeNumber ?? ''}`}
                    />
                  </label>
                </div>
                <div className="cheque-preview">
                  <div className="cheque-preview-head">
                    <strong>New clearing journal</strong>
                    <span className="muted">
                      {dialogReceipt
                        ? 'Money moves from PDC Receivable into the bank.'
                        : 'Money leaves the bank and PDC Payable is settled.'}
                    </span>
                  </div>
                  <table className="cheque-preview-lines">
                    <tbody>
                      <tr>
                        <td>Dr</td>
                        <td>{dialogReceipt ? dialogBank : dialogHold}</td>
                        <td className="amount-debit-cell">{money(dialogRow.chequeAmount)}</td>
                      </tr>
                      <tr>
                        <td>Cr</td>
                        <td>{dialogReceipt ? dialogHold : dialogBank}</td>
                        <td className="amount-credit-cell">{money(dialogRow.chequeAmount)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {earlyClear ? (
                  <p className="badge-warn cheque-warning">
                    The cheque is dated {dialogRow.chequeDate}. You are clearing it before that date.
                  </p>
                ) : null}
              </>
            ) : null}

            {dialog.kind === 'bounce' ? (
              <>
                <div className="name-row">
                  <label>
                    Reason
                    <Select
                      value={bounceReason}
                      onChange={setBounceReason}
                      options={BOUNCE_REASONS.map((value) => ({ value, label: value }))}
                    />
                  </label>
                  <label>
                    Note (optional)
                    <input
                      value={bounceNote}
                      onChange={(e) => setBounceNote(e.target.value)}
                      maxLength={180}
                    />
                  </label>
                </div>
                <p className="muted">
                  {dialogRow.entryNumber} will be reversed.{' '}
                  {dialogRow.isPdc
                    ? `The cheque leaves ${dialogReceipt ? 'PDC Receivable' : 'PDC Payable'}`
                    : `${dialogRow.bankAccountName ?? 'The bank'} is ${dialogReceipt ? 'reduced' : 'restored'}`}{' '}
                  and {dialogRow.partyName ?? 'the party'}'s balance comes back.
                </p>
              </>
            ) : null}

            {dialog.kind === 'undo' ? (
              <p className="muted">
                {dialogRow.clearingEntryNumber ?? 'The clearing journal'} will be reversed, the bank
                entry is taken back out, and the cheque returns to Pending in{' '}
                {dialogReceipt ? 'PDC Receivable' : 'PDC Payable'}.
              </p>
            ) : null}

            <div className="form-actions">
              <button type="button" className="ghost" onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button type="submit" disabled={acting}>
                {acting
                  ? 'Working…'
                  : dialog.kind === 'clear'
                    ? 'Post clearing'
                    : dialog.kind === 'bounce'
                      ? 'Mark bounced'
                      : 'Undo clearing'}
              </button>
            </div>
            {actionError ? <p className="form-error">{actionError}</p> : null}
          </form>
        ) : null}
      </Modal>
    </>
  )
}
