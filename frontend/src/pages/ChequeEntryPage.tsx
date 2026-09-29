import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Select } from '../components/ui'
import {
  money,
  type Account,
  type ChequeLeaf,
  type ChequeRegisterRow,
  type Customer,
  type JournalEntry,
  type JournalWriteBody,
  type PdcDirection,
} from '../types/accounting'
import { Role } from '../types/auth'
import type { TreasuryAccount } from '../types/banking'
import type { Supplier } from '../types/procurement'
import { projectBelongsToCustomer, type Project } from '../types/project'
import {
  CHEQUE_STATE_LABEL,
  DIRECTION_LABEL,
  PDC_PAYABLE_CODE,
  PDC_RECEIVABLE_CODE,
  chequeState,
  localToday,
} from '../utils/cheque'

type PartyKind = 'party' | 'account'

/** Accounts that need their own module / entity and are not a cheque counter-account. */
const EXCLUDED_COUNTER_CODES = new Set([
  '1151',
  '1161',
  '2111',
  '2113',
  '2121',
  PDC_RECEIVABLE_CODE,
  PDC_PAYABLE_CODE,
])

const isTreasuryCode = (code: string) => /^11[123]/.test(code)

type Saved = { journal: JournalEntry } | { queued: true }

export function ChequeEntryPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === Role.ADMIN
  const today = localToday()

  const [banks, setBanks] = useState<TreasuryAccount[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [recent, setRecent] = useState<ChequeRegisterRow[]>([])

  const [direction, setDirection] = useState<PdcDirection>('receipt')
  const [bankId, setBankId] = useState('')
  const [chequeNumber, setChequeNumber] = useState('')
  const [chequeDate, setChequeDate] = useState(today)
  const [entryDate, setEntryDate] = useState(today)
  const [partyKind, setPartyKind] = useState<PartyKind>('party')
  const [partyId, setPartyId] = useState('')
  const [counterCode, setCounterCode] = useState('')
  const [amount, setAmount] = useState('')
  const [projectId, setProjectId] = useState('')
  const [memo, setMemo] = useState('')
  const [description, setDescription] = useState('')
  const [override, setOverride] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [leaves, setLeaves] = useState<ChequeLeaf[]>([])
  const [leafId, setLeafId] = useState('')
  const [leavesLoading, setLeavesLoading] = useState(false)
  const [manualNumber, setManualNumber] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<Saved | null>(null)

  async function loadRecent() {
    const rows = await api.chequeRegister()
    setRecent(rows.slice(0, 8))
  }

  useEffect(() => {
    Promise.all([
      api.treasury(),
      api.customers(true),
      api.suppliers(),
      api.accounts(),
      api.projects(),
    ])
      .then(([treasury, customerRows, supplierRows, accountRows, projectRows]) => {
        const bankRows = treasury.filter((row) => row.kind === 'commercial_bank' && row.isActive)
        setBanks(bankRows)
        setBankId((current) => current || bankRows[0]?.id || '')
        setCustomers(customerRows)
        setSuppliers(supplierRows.filter((row) => row.isActive))
        setAccounts(accountRows)
        setProjects(projectRows)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load cheque entry')
      })
    loadRecent().catch(() => undefined)
  }, [])

  const bank = banks.find((row) => row.id === bankId)
  const isReceipt = direction === 'receipt'
  const postDated = Boolean(chequeDate) && chequeDate > today
  const numericAmount = Number(amount)

  async function loadLeaves(treasuryId: string) {
    setLeavesLoading(true)
    try {
      const rows = await api.availableChequeLeaves(treasuryId)
      setLeaves(rows)
      setLeafId(rows[0]?.id ?? '')
    } catch {
      setLeaves([])
      setLeafId('')
    } finally {
      setLeavesLoading(false)
    }
  }

  useEffect(() => {
    if (isReceipt || !bankId) {
      setLeaves([])
      setLeafId('')
      return
    }
    setManualNumber(false)
    void loadLeaves(bankId)
  }, [isReceipt, bankId])

  const usesLeaf = !isReceipt && !manualNumber && leaves.length > 0
  const selectedLeaf = usesLeaf ? leaves.find((row) => row.id === leafId) : undefined
  const effectiveChequeNumber = selectedLeaf ? selectedLeaf.chequeNumber : chequeNumber.trim()
  const leafOptions = leaves.map((row) => ({
    value: row.id,
    label: `${row.chequeNumber} · ${row.bookName}`,
  }))

  const partyOptions = useMemo(
    () =>
      isReceipt
        ? customers.map((row) => ({ value: row.id, label: `${row.customerNumber} · ${row.name}` }))
        : suppliers.map((row) => ({ value: row.id, label: `${row.supplierNumber} · ${row.name}` })),
    [isReceipt, customers, suppliers],
  )

  /** A receipt from a customer offers that customer's projects (all, if it has none). */
  const partyProjects = useMemo(() => {
    const customer =
      isReceipt && partyKind === 'party'
        ? customers.find((row) => row.id === partyId)
        : undefined
    if (!customer) return projects
    const own = projects.filter((row) => projectBelongsToCustomer(row, customer))
    return own.length > 0 ? own : projects
  }, [isReceipt, partyKind, partyId, customers, projects])

  useEffect(() => {
    if (projectId && !partyProjects.some((row) => row.id === projectId)) {
      setProjectId('')
    }
  }, [partyProjects, projectId])

  const counterOptions = useMemo(
    () =>
      accounts
        .filter(
          (row) =>
            row.isPostable &&
            row.isActive &&
            !EXCLUDED_COUNTER_CODES.has(row.code) &&
            !isTreasuryCode(row.code),
        )
        .map((row) => ({ value: row.code, label: `${row.code} · ${row.name}` })),
    [accounts],
  )

  const partyName =
    partyKind === 'party'
      ? isReceipt
        ? customers.find((row) => row.id === partyId)?.name
        : suppliers.find((row) => row.id === partyId)?.name
      : accounts.find((row) => row.code === counterCode)?.name

  const counterAccountLabel =
    partyKind === 'party'
      ? isReceipt
        ? '1151 · Client Receivables'
        : '2111 · Supplier Payables'
      : counterOptions.find((row) => row.value === counterCode)?.label ?? 'Counter account'

  const bankLabel = bank ? `${bank.glAccountCode} · ${bank.name}` : 'Bank'
  const holdLabel = isReceipt
    ? `${PDC_RECEIVABLE_CODE} · PDC Receivable`
    : `${PDC_PAYABLE_CODE} · PDC Payable`
  const debitLabel = isReceipt ? (postDated ? holdLabel : bankLabel) : counterAccountLabel
  const creditLabel = isReceipt ? counterAccountLabel : postDated ? holdLabel : bankLabel

  function switchDirection(next: PdcDirection) {
    setDirection(next)
    setPartyId('')
    setOverride(false)
    setOverrideReason('')
  }

  function resetForm() {
    setChequeNumber('')
    setChequeDate(today)
    setPartyId('')
    setCounterCode('')
    setAmount('')
    setMemo('')
    setDescription('')
    setOverride(false)
    setOverrideReason('')
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!bank) {
      setError('Select the bank account the cheque is drawn on / deposited to')
      return
    }
    if (!(numericAmount > 0)) {
      setError('Enter a cheque amount greater than zero')
      return
    }
    if (partyKind === 'party' && !partyId) {
      setError(isReceipt ? 'Select the customer' : 'Select the supplier')
      return
    }
    if (partyKind === 'account' && !counterCode) {
      setError('Select the counter account')
      return
    }
    if (usesLeaf && !selectedLeaf) {
      setError('Select the cheque leaf you are issuing')
      return
    }
    if (!effectiveChequeNumber) {
      setError('Enter the cheque number')
      return
    }
    const chequeNo = effectiveChequeNumber

    const counterLine =
      partyKind === 'party'
        ? {
            accountCode: isReceipt ? '1151' : '2111',
            entityType: isReceipt ? 'customer' : 'supplier',
            entityId: partyId,
          }
        : { accountCode: counterCode }
    const lineDescription =
      description.trim() ||
      `Cheque ${chequeNo} ${isReceipt ? 'from' : 'to'} ${partyName ?? ''}`.trim()
    const bankLine = {
      accountCode: bank.glAccountCode,
      entityType: 'treasury',
      entityId: bank.id,
      description: lineDescription,
    }
    const project = projectId || undefined

    const body: JournalWriteBody = {
      date: entryDate,
      memo:
        memo.trim() ||
        `Cheque ${chequeNo} ${isReceipt ? 'received from' : 'issued to'} ${partyName ?? ''}`.trim(),
      reference: `CHQ-${chequeNo}`.slice(0, 80),
      journalType: isReceipt
        ? partyKind === 'party'
          ? 'customer_receipt'
          : 'bank_deposit'
        : partyKind === 'party'
          ? 'supplier_payment'
          : 'bank_withdrawal',
      intent: 'post',
      projectId: project,
      chequeNumber: chequeNo,
      chequeLeafId: selectedLeaf?.id,
      chequeDate,
      overrideSupplierPayable: override || undefined,
      overrideReason: override ? overrideReason.trim() : undefined,
      lines: isReceipt
        ? [
            { ...bankLine, debit: numericAmount, projectId: project },
            { ...counterLine, credit: numericAmount, description: lineDescription, projectId: project },
          ]
        : [
            { ...counterLine, debit: numericAmount, description: lineDescription, projectId: project },
            { ...bankLine, credit: numericAmount, projectId: project },
          ],
    }

    setSaving(true)
    setError(null)
    setSaved(null)
    try {
      const result = (await api.postJournal(body)) as JournalEntry | { requiresApproval: true }
      if ('requiresApproval' in result) {
        setSaved({ queued: true })
      } else {
        setSaved({ journal: result })
      }
      resetForm()
      await loadRecent()
      if (!isReceipt) await loadLeaves(bank.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save cheque')
      if (!isReceipt) await loadLeaves(bank.id)
    } finally {
      setSaving(false)
    }
  }

  const bankOptions = banks.map((row) => ({
    value: row.id,
    label: `${row.glAccountCode} · ${row.name}${row.accountNumber ? ` · ${row.accountNumber}` : ''}`,
  }))

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Cheque entry</h1>
          <p className="muted">
            Record a cheque received or issued. A cheque dated after today is held as a
            post-dated cheque (PDC) and reaches the bank only when you clear it.
          </p>
        </div>
        <div className="table-actions">
          <Link to="/banking/cheque-books" className="ghost-link">
            Cheque books
          </Link>
          <Link to="/banking/cheques" className="action-link">
            Cheque register
          </Link>
        </div>
      </header>

      <section className="table-card">
        <div className="cheque-direction-toggle" role="tablist" aria-label="Cheque direction">
          <button
            type="button"
            role="tab"
            aria-selected={isReceipt}
            className={isReceipt ? 'ghost is-active' : 'ghost'}
            onClick={() => switchDirection('receipt')}
          >
            Cheque received
            <span>Customer / income → bank</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isReceipt}
            className={!isReceipt ? 'ghost is-active' : 'ghost'}
            onClick={() => switchDirection('payment')}
          >
            Cheque issued
            <span>Bank → supplier / expense</span>
          </button>
        </div>

        <form className="stack-form" onSubmit={(event) => void onSubmit(event)}>
          <div className="name-row triple-row">
            <label>
              {isReceipt ? 'Deposit to bank' : 'Drawn on bank'}
              <Select
                value={bankId}
                onChange={setBankId}
                options={bankOptions}
                placeholder={banks.length ? 'Select bank' : 'No bank accounts'}
                searchable
                required
              />
            </label>
            <label className="cheque-leaf-picker">
              {usesLeaf ? 'Cheque leaf (unused)' : 'Cheque number'}
              {usesLeaf ? (
                <Select
                  value={leafId}
                  onChange={setLeafId}
                  options={leafOptions}
                  placeholder="Select cheque number"
                  searchable
                  required
                />
              ) : (
                <input
                  value={chequeNumber}
                  onChange={(e) => setChequeNumber(e.target.value)}
                  maxLength={40}
                  placeholder="e.g. 0045871"
                  required
                />
              )}
              {!isReceipt ? (
                <span className="muted">
                  {leavesLoading ? (
                    'Loading unused leaves…'
                  ) : usesLeaf ? (
                    <>
                      {leaves.length} unused leaf{leaves.length === 1 ? '' : 'ves'} in{' '}
                      {bank?.name ?? 'this bank'} ·{' '}
                      <button type="button" className="ghost link-button" onClick={() => setManualNumber(true)}>
                        type a number instead
                      </button>
                    </>
                  ) : leaves.length > 0 ? (
                    <button type="button" className="ghost link-button" onClick={() => setManualNumber(false)}>
                      Pick from {leaves.length} unused leaves
                    </button>
                  ) : (
                    <>
                      No unused chequebook leaves for this bank ·{' '}
                      <Link to="/banking/cheque-books">Add chequebook</Link>
                    </>
                  )}
                </span>
              ) : null}
            </label>
            <label>
              Cheque date
              <input
                type="date"
                value={chequeDate}
                onChange={(e) => setChequeDate(e.target.value)}
                required
              />
            </label>
          </div>

          <div className="name-row triple-row">
            <label>
              {isReceipt ? 'Received from' : 'Paid to'}
              <Select
                value={partyKind}
                onChange={(value) => {
                  setPartyKind(value as PartyKind)
                  setPartyId('')
                  setCounterCode('')
                }}
                options={[
                  { value: 'party', label: isReceipt ? 'Customer' : 'Supplier' },
                  { value: 'account', label: isReceipt ? 'Other income / account' : 'Expense / other account' },
                ]}
              />
            </label>
            <label>
              {partyKind === 'party' ? (isReceipt ? 'Customer' : 'Supplier') : 'Account'}
              {partyKind === 'party' ? (
                <Select
                  value={partyId}
                  onChange={setPartyId}
                  options={partyOptions}
                  placeholder={isReceipt ? 'Select customer' : 'Select supplier'}
                  searchable
                  required
                />
              ) : (
                <Select
                  value={counterCode}
                  onChange={setCounterCode}
                  options={counterOptions}
                  placeholder="Select account"
                  searchable
                  required
                />
              )}
            </label>
            <label>
              Amount
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
              />
            </label>
          </div>

          <div className="name-row triple-row">
            <label>
              Entry date
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                required
              />
            </label>
            <label>
              Project (optional)
              <Select
                value={projectId}
                onChange={setProjectId}
                options={[
                  { value: '', label: 'None' },
                  ...partyProjects.map((row) => ({ value: row.id, label: `${row.code} · ${row.name}` })),
                ]}
                placeholder="None"
                searchable
              />
            </label>
            <label>
              Memo
              <input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                maxLength={500}
                placeholder={isReceipt ? 'Auto: Cheque … received from …' : 'Auto: Cheque … issued to …'}
              />
            </label>
          </div>

          <label>
            Description (optional)
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={240}
              placeholder="Shown on ledger lines"
            />
          </label>

          {!isReceipt && partyKind === 'party' && isAdmin ? (
            <div className="name-row">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={override}
                  onChange={(e) => setOverride(e.target.checked)}
                />
                Allow payment above supplier outstanding (admin override)
              </label>
              {override ? (
                <label>
                  Override reason
                  <input
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    minLength={5}
                    required
                  />
                </label>
              ) : null}
            </div>
          ) : null}

          <div className={postDated ? 'cheque-preview is-pdc' : 'cheque-preview'}>
            <div className="cheque-preview-head">
              <strong>{postDated ? 'Post-dated cheque (PDC)' : 'Current cheque'}</strong>
              <span className="muted">
                {postDated
                  ? `Held until ${chequeDate}. ${bank?.name ?? 'The bank'} balance changes only when you clear it in the register.`
                  : `Posts straight to ${bank?.name ?? 'the bank'} today.`}
              </span>
            </div>
            <table className="cheque-preview-lines">
              <tbody>
                <tr>
                  <td>Dr</td>
                  <td>{debitLabel}</td>
                  <td className="amount-debit-cell">{numericAmount > 0 ? money(numericAmount) : '—'}</td>
                </tr>
                <tr>
                  <td>Cr</td>
                  <td>{creditLabel}</td>
                  <td className="amount-credit-cell">{numericAmount > 0 ? money(numericAmount) : '—'}</td>
                </tr>
              </tbody>
            </table>
            {postDated ? (
              <p className="muted cheque-preview-foot">
                On clearing: Dr {isReceipt ? bankLabel : holdLabel} / Cr{' '}
                {isReceipt ? holdLabel : bankLabel}
              </p>
            ) : null}
          </div>

          <div className="form-actions">
            <button type="submit" disabled={saving || !bank}>
              {saving ? 'Saving…' : postDated ? 'Save post-dated cheque' : 'Save cheque'}
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
          {saved ? (
            <p className="form-success">
              {'queued' in saved ? (
                'Cheque queued for approval. It posts once the approval is complete.'
              ) : (
                <>
                  Saved <Link to={`/journals/${saved.journal.id}`}>{saved.journal.entryNumber}</Link>
                  {saved.journal.isPdc
                    ? ` as a pending PDC (clears on ${saved.journal.chequeDate}).`
                    : ' and posted to the bank.'}{' '}
                  <Link to="/banking/cheques">Open register</Link>
                </>
              )}
            </p>
          ) : null}
        </form>
      </section>

      <section className="table-card">
        <div className="table-head">
          <h2>Recent cheques</h2>
          <Link to="/banking/cheques" className="ghost-link">
            View all
          </Link>
        </div>
        <table>
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
            </tr>
          </thead>
          <tbody>
            {recent.map((row) => {
              const state = chequeState(row, today)
              return (
                <tr key={row.id}>
                  <td>{row.chequeDate ?? row.date.slice(0, 10)}</td>
                  <td>{row.chequeNumber ?? '—'}</td>
                  <td>{row.direction ? DIRECTION_LABEL[row.direction] : '—'}</td>
                  <td>{row.partyName ?? '—'}</td>
                  <td>{row.bankAccountName ?? row.bankAccountCode ?? '—'}</td>
                  <td className="numeric">{money(row.chequeAmount)}</td>
                  <td>
                    <span className={`status-pill cheque-${state}`}>{CHEQUE_STATE_LABEL[state]}</span>
                  </td>
                  <td>
                    <Link to={`/journals/${row.id}`}>{row.entryNumber}</Link>
                  </td>
                </tr>
              )
            })}
            {recent.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted">
                  No cheques recorded yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </>
  )
}
