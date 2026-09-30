import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { MetricCard } from '../components/MetricCard'
import { ReportExportMenu } from '../components/ReportExportMenu'
import { ActionMenu, Modal, Select } from '../components/ui'
import {
  money,
  type ChequeBook,
  type ChequeLeaf,
  type ChequeLeafStatus,
} from '../types/accounting'
import type { TreasuryAccount } from '../types/banking'
import { localToday } from '../utils/cheque'

const LEAF_STATUS_LABEL: Record<ChequeLeafStatus, string> = {
  available: 'Unused',
  issued: 'Issued',
  cancelled: 'Cancelled',
}

const CANCEL_REASONS = ['Spoiled while writing', 'Torn / damaged', 'Lost', 'Signature error']

/** Mirrors the server: leading zeros in the start number set the padding width. */
function previewRange(prefix: string, start: string, count: number) {
  if (!/^\d{1,12}$/.test(start) || !(count > 0)) return null
  const width = start.length
  const first = Number.parseInt(start, 10)
  const format = (value: number) =>
    `${prefix.trim().toUpperCase()}${String(value).padStart(width, '0')}`
  return { first: format(first), last: format(first + count - 1) }
}

function leafJournalHint(leaf: ChequeLeaf): string | null {
  if (leaf.status !== 'issued') return null
  if (leaf.journalStatus === 'reversed') {
    return leaf.pdcStatus === 'Bounced' ? 'Bounced' : 'Reversed'
  }
  if (leaf.pdcStatus === 'Pending') return 'PDC pending'
  if (leaf.pdcStatus === 'Cleared') return 'Cleared'
  return 'Posted'
}

export function ChequeBooksPage() {
  const today = localToday()
  const [banks, setBanks] = useState<TreasuryAccount[]>([])
  const [books, setBooks] = useState<ChequeBook[]>([])
  const [bankFilter, setBankFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [treasuryId, setTreasuryId] = useState('')
  const [bookName, setBookName] = useState('')
  const [prefix, setPrefix] = useState('')
  const [startNumber, setStartNumber] = useState('')
  const [leafCount, setLeafCount] = useState('25')
  const [receivedDate, setReceivedDate] = useState(today)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [selectedBookId, setSelectedBookId] = useState('')
  const [leaves, setLeaves] = useState<ChequeLeaf[]>([])
  const [leafStatus, setLeafStatus] = useState('')
  const [leafSearch, setLeafSearch] = useState('')
  const [leavesLoading, setLeavesLoading] = useState(false)

  const [cancelLeaf, setCancelLeaf] = useState<ChequeLeaf | null>(null)
  const [cancelReason, setCancelReason] = useState(CANCEL_REASONS[0]!)
  const [cancelNote, setCancelNote] = useState('')
  const [deleteBook, setDeleteBook] = useState<ChequeBook | null>(null)
  const [acting, setActing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const loadBooks = useCallback(async () => {
    const rows = await api.chequeBooks(bankFilter || undefined)
    setBooks(rows)
    setSelectedBookId((current) =>
      current && rows.some((row) => row.id === current) ? current : rows[0]?.id ?? '',
    )
  }, [bankFilter])

  const loadLeaves = useCallback(async () => {
    if (!selectedBookId) {
      setLeaves([])
      return
    }
    setLeavesLoading(true)
    try {
      setLeaves(await api.chequeLeaves({ bookId: selectedBookId }))
    } finally {
      setLeavesLoading(false)
    }
  }, [selectedBookId])

  useEffect(() => {
    api
      .treasury()
      .then((rows) => {
        const bankRows = rows.filter((row) => row.kind === 'commercial_bank' && row.isActive)
        setBanks(bankRows)
        setTreasuryId((current) => current || bankRows[0]?.id || '')
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load bank accounts')
      })
  }, [])

  useEffect(() => {
    loadBooks().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load chequebooks')
    })
  }, [loadBooks])

  useEffect(() => {
    loadLeaves().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load cheque leaves')
    })
  }, [loadLeaves])

  const selectedBook = books.find((row) => row.id === selectedBookId) ?? null
  const range = previewRange(prefix, startNumber, Number(leafCount))

  const totals = useMemo(
    () =>
      books.reduce(
        (sum, book) => ({
          books: sum.books + 1,
          available: sum.available + book.availableCount,
          issued: sum.issued + book.issuedCount,
          cancelled: sum.cancelled + book.cancelledCount,
        }),
        { books: 0, available: 0, issued: 0, cancelled: 0 },
      ),
    [books],
  )

  const lowStock = books.filter(
    (book) => book.availableCount > 0 && book.availableCount <= 5,
  ).length

  const visibleLeaves = useMemo(() => {
    const needle = leafSearch.trim().toLowerCase()
    return leaves.filter((leaf) => {
      if (leafStatus && leaf.status !== leafStatus) return false
      if (!needle) return true
      return [leaf.chequeNumber, leaf.payeeName ?? '', leaf.journalNumber ?? '']
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [leaves, leafStatus, leafSearch])

  const bankOptions = banks.map((row) => ({
    value: row.id,
    label: `${row.glAccountCode} · ${row.name}${row.accountNumber ? ` · ${row.accountNumber}` : ''}`,
  }))

  function resetForm() {
    setBookName('')
    setPrefix('')
    setStartNumber('')
    setLeafCount('25')
    setReceivedDate(today)
    setNotes('')
    setFormError(null)
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    if (!treasuryId) {
      setFormError('Select the bank account this chequebook belongs to')
      return
    }
    if (!range) {
      setFormError('Enter the first cheque number (digits only) and the number of leaves')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const book = await api.createChequeBook({
        treasuryId,
        bookName: bookName.trim() || undefined,
        prefix: prefix.trim() || undefined,
        startNumber: startNumber.trim(),
        leafCount: Number(leafCount),
        receivedDate: receivedDate || undefined,
        notes: notes.trim() || undefined,
      })
      setNotice(
        `Registered ${book.bookName}: ${book.leafCount} leaves (${book.startNumber} – ${book.endNumber}) for ${book.bankName}.`,
      )
      resetForm()
      setFormOpen(false)
      await loadBooks()
      setSelectedBookId(book.id)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to register chequebook')
    } finally {
      setSaving(false)
    }
  }

  async function onCancelLeaf() {
    if (!cancelLeaf) return
    setActing(true)
    setActionError(null)
    try {
      const reason = [cancelReason, cancelNote.trim()].filter(Boolean).join(' — ')
      await api.cancelChequeLeaf(cancelLeaf.id, reason)
      setNotice(`Cheque ${cancelLeaf.chequeNumber} cancelled.`)
      setCancelLeaf(null)
      await Promise.all([loadLeaves(), loadBooks()])
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to cancel leaf')
    } finally {
      setActing(false)
    }
  }

  async function onRestoreLeaf(leaf: ChequeLeaf) {
    setError(null)
    try {
      await api.restoreChequeLeaf(leaf.id)
      setNotice(`Cheque ${leaf.chequeNumber} is unused again.`)
      await Promise.all([loadLeaves(), loadBooks()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to restore leaf')
    }
  }

  async function onDeleteBook() {
    if (!deleteBook) return
    setActing(true)
    setActionError(null)
    try {
      const result = await api.deleteChequeBook(deleteBook.id)
      setNotice(`Deleted ${deleteBook.bookName} (${result.deletedLeaves} leaves).`)
      setDeleteBook(null)
      await loadBooks()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to delete chequebook')
    } finally {
      setActing(false)
    }
  }

  function exportPayload() {
    return {
      title: selectedBook
        ? `Chequebook ${selectedBook.bookName} — ${selectedBook.bankName}`
        : 'Chequebook leaves',
      filters: [
        { label: 'Book', value: selectedBook?.bookName ?? '—' },
        { label: 'Range', value: selectedBook ? `${selectedBook.startNumber} – ${selectedBook.endNumber}` : '—' },
        { label: 'Status', value: leafStatus ? LEAF_STATUS_LABEL[leafStatus as ChequeLeafStatus] : 'All' },
      ],
      headers: ['Cheque no', 'Status', 'Payee', 'Cheque date', 'Amount', 'Journal', 'Note'],
      rows: visibleLeaves.map((leaf) => [
        leaf.chequeNumber,
        LEAF_STATUS_LABEL[leaf.status],
        leaf.payeeName ?? '',
        leaf.chequeDate ?? '',
        leaf.amount != null ? money(leaf.amount) : '',
        leaf.journalNumber ?? '',
        leaf.cancelReason ?? leafJournalHint(leaf) ?? '',
      ]),
      rightAlign: [4],
    }
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Company chequebooks</h1>
          <p className="muted">
            Register the chequebooks the bank gave you. When you issue a cheque, Cheque Entry
            offers only the unused leaves of that bank and marks the leaf used once it posts.
          </p>
        </div>
        <div className="table-actions">
          <Link to="/banking/cheques/new" className="ghost-link">
            Issue a cheque
          </Link>
          <button type="button" onClick={() => setFormOpen(true)}>
            Add chequebook
          </button>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-success">{notice}</p> : null}

      <section className="grid metric-card-grid">
        <MetricCard variant="blue" title="Chequebooks" value={String(totals.books)} meta="Registered" />
        <MetricCard
          variant="green"
          title="Unused leaves"
          value={String(totals.available)}
          meta={lowStock ? `${lowStock} book(s) running low` : 'Ready to issue'}
        />
        <MetricCard variant="purple" title="Issued" value={String(totals.issued)} meta="Linked to journals" />
        <MetricCard variant="red" title="Cancelled" value={String(totals.cancelled)} meta="Spoiled / lost" />
      </section>

      <section className="table-card">
        <div className="table-head">
          <h2>Chequebooks</h2>
          <label className="chequebook-bank-filter">
            Bank
            <Select
              value={bankFilter}
              onChange={setBankFilter}
              options={[{ value: '', label: 'All banks' }, ...bankOptions]}
            />
          </label>
        </div>
        <table className="cheque-table">
          <thead>
            <tr>
              <th>Book</th>
              <th>Bank</th>
              <th>Range</th>
              <th>Usage</th>
              <th>Next unused</th>
              <th>Received</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {books.map((book) => {
              const usedPct = Math.round(
                ((book.issuedCount + book.cancelledCount) / Math.max(book.leafCount, 1)) * 100,
              )
              return (
                <tr
                  key={book.id}
                  className={book.id === selectedBookId ? 'chequebook-row is-selected' : 'chequebook-row'}
                  onClick={() => setSelectedBookId(book.id)}
                >
                  <td>
                    <strong>{book.bookName}</strong>
                    {book.notes ? <div className="muted">{book.notes}</div> : null}
                  </td>
                  <td>
                    {book.bankAccountCode} · {book.bankName}
                  </td>
                  <td>
                    {book.startNumber} – {book.endNumber}
                  </td>
                  <td>
                    <div className="chequebook-usage">
                      <div className="chequebook-usage-bar">
                        <span style={{ width: `${usedPct}%` }} />
                      </div>
                      <span className="muted">
                        {book.availableCount} unused · {book.issuedCount} issued
                        {book.cancelledCount ? ` · ${book.cancelledCount} cancelled` : ''}
                      </span>
                    </div>
                  </td>
                  <td>
                    {book.nextAvailable ? (
                      <span className="status-pill cheque-current">{book.nextAvailable}</span>
                    ) : (
                      <span className="status-pill cheque-bounced">Finished</span>
                    )}
                  </td>
                  <td>{book.receivedDate ?? '—'}</td>
                  <td onClick={(event) => event.stopPropagation()}>
                    <ActionMenu
                      items={[
                        { label: 'View leaves', onSelect: () => setSelectedBookId(book.id) },
                        {
                          label: 'Delete book',
                          danger: true,
                          disabled: book.issuedCount > 0,
                          disabledReason: 'Books with issued cheques cannot be deleted.',
                          onSelect: () => {
                            setActionError(null)
                            setDeleteBook(book)
                          },
                        },
                      ]}
                    />
                  </td>
                </tr>
              )
            })}
            {books.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  No chequebooks yet. Use “Add chequebook” to register the first cheque number and
                  the number of leaves.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {selectedBook ? (
        <section className="table-card">
          <div className="table-head">
            <div>
              <h2>
                Leaves · {selectedBook.bookName}
              </h2>
              <p className="muted">
                {selectedBook.bankName} · {selectedBook.startNumber} – {selectedBook.endNumber}
              </p>
            </div>
            <ReportExportMenu payload={exportPayload} disabled={visibleLeaves.length === 0} />
          </div>
          <div className="filter-bar filter-bar-compact">
            <label>
              Search
              <input
                value={leafSearch}
                onChange={(e) => setLeafSearch(e.target.value)}
                placeholder="Cheque no, payee, journal…"
              />
            </label>
            <label>
              Status
              <Select
                value={leafStatus}
                onChange={setLeafStatus}
                options={[
                  { value: '', label: 'All leaves' },
                  { value: 'available', label: 'Unused' },
                  { value: 'issued', label: 'Issued' },
                  { value: 'cancelled', label: 'Cancelled' },
                ]}
              />
            </label>
          </div>
          <table className="cheque-table">
            <thead>
              <tr>
                <th>Cheque no</th>
                <th>Status</th>
                <th>Payee</th>
                <th>Cheque date</th>
                <th className="numeric">Amount</th>
                <th>Journal</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visibleLeaves.map((leaf) => {
                const hint = leafJournalHint(leaf)
                return (
                  <tr key={leaf.id}>
                    <td>
                      <strong>{leaf.chequeNumber}</strong>
                    </td>
                    <td>
                      <span className={`status-pill leaf-${leaf.status}`}>
                        {LEAF_STATUS_LABEL[leaf.status]}
                      </span>
                      {hint ? <div className="muted">{hint}</div> : null}
                      {leaf.cancelReason ? <div className="muted">{leaf.cancelReason}</div> : null}
                    </td>
                    <td>{leaf.payeeName ?? '—'}</td>
                    <td>{leaf.chequeDate ?? '—'}</td>
                    <td className="numeric">{leaf.amount != null ? money(leaf.amount) : '—'}</td>
                    <td>
                      {leaf.journalId ? (
                        <Link to={`/journals/${leaf.journalId}`}>{leaf.journalNumber}</Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {leaf.status === 'available' ? (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            setActionError(null)
                            setCancelReason(CANCEL_REASONS[0]!)
                            setCancelNote('')
                            setCancelLeaf(leaf)
                          }}
                        >
                          Cancel leaf
                        </button>
                      ) : leaf.status === 'cancelled' ? (
                        <button type="button" className="ghost" onClick={() => void onRestoreLeaf(leaf)}>
                          Restore
                        </button>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
              {!leavesLoading && visibleLeaves.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted">
                    No leaves match the filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      ) : null}

      <Modal
        open={formOpen}
        title="Add company chequebook"
        description="Enter the first cheque number printed in the book and how many leaves it has."
        onClose={() => (saving ? undefined : setFormOpen(false))}
        wide
      >
        <form className="stack-form" onSubmit={(event) => void onCreate(event)}>
          <div className="name-row">
            <label>
              Bank account
              <Select
                value={treasuryId}
                onChange={setTreasuryId}
                options={bankOptions}
                placeholder={banks.length ? 'Select bank' : 'No bank accounts'}
                searchable
                required
              />
            </label>
            <label>
              Book name (optional)
              <input
                value={bookName}
                onChange={(e) => setBookName(e.target.value)}
                maxLength={80}
                placeholder="Auto: first – last number"
              />
            </label>
          </div>
          <div className="name-row triple-row">
            <label>
              Prefix (optional)
              <input
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                maxLength={12}
                placeholder="e.g. CA"
              />
            </label>
            <label>
              First cheque number
              <input
                value={startNumber}
                onChange={(e) => setStartNumber(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                maxLength={12}
                placeholder="e.g. 0045801"
                required
              />
            </label>
            <label>
              Number of leaves
              <input
                type="number"
                min={1}
                max={500}
                value={leafCount}
                onChange={(e) => setLeafCount(e.target.value)}
                required
              />
            </label>
          </div>
          <div className="name-row">
            <label>
              Received on
              <input
                type="date"
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
              />
            </label>
            <label>
              Notes (optional)
              <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
            </label>
          </div>
          <div className="quick-leaf-counts">
            <span className="muted">Common sizes:</span>
            {[10, 25, 50, 100].map((size) => (
              <button
                key={size}
                type="button"
                className={Number(leafCount) === size ? 'ghost is-active' : 'ghost'}
                onClick={() => setLeafCount(String(size))}
              >
                {size}
              </button>
            ))}
          </div>
          <div className={range ? 'cheque-preview' : 'cheque-preview is-empty'}>
            <div className="cheque-preview-head">
              <strong>
                {range ? `${range.first} → ${range.last}` : 'Leaf range preview'}
              </strong>
              <span className="muted">
                {range
                  ? `${Number(leafCount)} leaves will be available to issue from ${
                      banks.find((row) => row.id === treasuryId)?.name ?? 'the selected bank'
                    }.`
                  : 'Enter the first number to see the full range.'}
              </span>
            </div>
          </div>
          {formError ? <p className="form-error">{formError}</p> : null}
          <div className="form-actions">
            <button type="button" className="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" disabled={saving || !range}>
              {saving ? 'Saving…' : 'Register chequebook'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={cancelLeaf !== null}
        title={`Cancel cheque ${cancelLeaf?.chequeNumber ?? ''}`}
        description="A cancelled leaf is never offered for issue. You can restore it if this was a mistake."
        onClose={() => (acting ? undefined : setCancelLeaf(null))}
      >
        <div className="stack-form">
          <label>
            Reason
            <Select
              value={cancelReason}
              onChange={setCancelReason}
              options={CANCEL_REASONS.map((reason) => ({ value: reason, label: reason }))}
            />
          </label>
          <label>
            Note (optional)
            <input value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} maxLength={180} />
          </label>
          {actionError ? <p className="form-error">{actionError}</p> : null}
          <div className="form-actions">
            <button type="button" className="ghost" onClick={() => setCancelLeaf(null)} disabled={acting}>
              Keep leaf
            </button>
            <button type="button" onClick={() => void onCancelLeaf()} disabled={acting}>
              {acting ? 'Cancelling…' : 'Cancel leaf'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteBook !== null}
        title={`Delete ${deleteBook?.bookName ?? 'chequebook'}?`}
        description="All leaves of this book are removed. Only books with no issued cheques can be deleted."
        onClose={() => (acting ? undefined : setDeleteBook(null))}
      >
        <div className="stack-form">
          {actionError ? <p className="form-error">{actionError}</p> : null}
          <div className="form-actions">
            <button type="button" className="ghost" onClick={() => setDeleteBook(null)} disabled={acting}>
              Keep book
            </button>
            <button type="button" onClick={() => void onDeleteBook()} disabled={acting}>
              {acting ? 'Deleting…' : 'Delete book'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
