import { useEffect, useMemo, useState } from 'react'
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { api } from '../api/client'
import { MetricCard } from '../components/MetricCard'
import { Select } from '../components/ui'
import {
  JournalEntityType,
  dimensionRuleForAccount,
  money,
  type Account,
  type AccountLedger,
  type Customer,
  type JournalEntityType as EntityType,
} from '../types/accounting'
import type { PublicUser } from '../types/auth'
import type { TreasuryAccount } from '../types/banking'
import type { Supplier } from '../types/procurement'
import type { Project } from '../types/project'

type EntityOption = { value: string; label: string }

export function AccountLedgerPage() {
  const { accountCode: routeCode } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountCode, setAccountCode] = useState(routeCode ?? '')
  const [entityId, setEntityId] = useState(
    () => searchParams.get('entityId') ?? '',
  )
  const [projectId, setProjectId] = useState(
    () => searchParams.get('projectId') ?? '',
  )

  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [employees, setEmployees] = useState<PublicUser[]>([])
  const [treasury, setTreasury] = useState<TreasuryAccount[]>([])
  const [projects, setProjects] = useState<Project[]>([])

  const [ledger, setLedger] = useState<AccountLedger | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const dimension = useMemo(
    () => (accountCode ? dimensionRuleForAccount(accountCode) : null),
    [accountCode],
  )

  const entityType: EntityType | null = dimension?.entityType ?? null
  const showEntityFilter = Boolean(entityType)
  const showProjectFilter = Boolean(dimension?.projectRequired)
  const isSupplierPayable =
    accountCode === '2111' || accountCode === '2113'

  useEffect(() => {
    api
      .accounts()
      .then((rows) => {
        const postable = rows.filter((row) => row.isPostable && row.isActive)
        setAccounts(postable)
        if (!accountCode && postable[0]) {
          setAccountCode(postable[0].code)
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load accounts')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (routeCode) setAccountCode(routeCode)
  }, [routeCode])

  useEffect(() => {
    const fromUrl = searchParams.get('entityId') ?? ''
    if (fromUrl !== entityId) setEntityId(fromUrl)
    const projectFromUrl = searchParams.get('projectId') ?? ''
    if (projectFromUrl !== projectId) setProjectId(projectFromUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  useEffect(() => {
    if (!showEntityFilter && !showProjectFilter) return

    const tasks: Promise<void>[] = []

    if (entityType === JournalEntityType.CUSTOMER && customers.length === 0) {
      tasks.push(
        api
          .customers(true)
          .then(setCustomers)
          .catch(() => setCustomers([])),
      )
    }
    if (entityType === JournalEntityType.SUPPLIER && suppliers.length === 0) {
      tasks.push(
        api
          .suppliers()
          .then(setSuppliers)
          .catch(() => setSuppliers([])),
      )
    }
    if (entityType === JournalEntityType.EMPLOYEE && employees.length === 0) {
      tasks.push(
        api
          .employees()
          .then(setEmployees)
          .catch(() => setEmployees([])),
      )
    }
    if (entityType === JournalEntityType.TREASURY && treasury.length === 0) {
      tasks.push(
        api
          .treasury()
          .then(setTreasury)
          .catch(() => setTreasury([])),
      )
    }
    if (showProjectFilter && projects.length === 0) {
      tasks.push(
        api
          .projects()
          .then(setProjects)
          .catch(() => setProjects([])),
      )
    }

    void Promise.all(tasks)
  }, [
    entityType,
    showEntityFilter,
    showProjectFilter,
    customers.length,
    suppliers.length,
    employees.length,
    treasury.length,
    projects.length,
  ])

  useEffect(() => {
    if (!accountCode) return
    setLoading(true)
    setError(null)

    const params =
      showEntityFilter && entityType && entityId
        ? { entityType, entityId }
        : undefined

    api
      .ledger(accountCode, params)
      .then(setLedger)
      .catch((err: unknown) => {
        setLedger(null)
        setError(err instanceof Error ? err.message : 'Unable to load ledger')
      })
      .finally(() => setLoading(false))
  }, [accountCode, entityId, entityType, showEntityFilter])

  const entityOptions: EntityOption[] = useMemo(() => {
    if (entityType === JournalEntityType.CUSTOMER) {
      return customers.map((row) => ({
        value: row.id,
        label: `${row.customerNumber} · ${row.name}`,
      }))
    }
    if (entityType === JournalEntityType.SUPPLIER) {
      return suppliers.map((row) => ({
        value: row.id,
        label: `${row.supplierNumber} · ${row.name}`,
      }))
    }
    if (entityType === JournalEntityType.EMPLOYEE) {
      return employees.map((row) => ({
        value: row.id,
        label: `${row.firstName} ${row.lastName}`,
      }))
    }
    if (entityType === JournalEntityType.TREASURY) {
      return treasury.map((row) => ({
        value: row.id,
        label: `${row.name} · ${row.glAccountCode}`,
      }))
    }
    return []
  }, [entityType, customers, suppliers, employees, treasury])

  const projectOptions = useMemo(
    () =>
      projects.map((project) => ({
        value: project.id,
        label: `${project.code} · ${project.name}`,
      })),
    [projects],
  )

  const filteredEntries = useMemo(() => {
    if (!ledger) return []
    if (!showProjectFilter || !projectId) return ledger.entries
    return ledger.entries.filter((row) => row.projectId === projectId)
  }, [ledger, showProjectFilter, projectId])

  const running = useMemo(() => {
    const creditNormal = ledger?.account.normalBalance === 'credit'
    let balance = 0
    return filteredEntries.map((row) => {
      // Liabilities / equity / revenue: credits increase the balance.
      balance += creditNormal
        ? row.credit - row.debit
        : row.debit - row.credit
      return { ...row, runningBalance: balance }
    })
  }, [filteredEntries, ledger?.account.normalBalance])

  const filteredTotals = useMemo(() => {
    const debit = filteredEntries.reduce((sum, row) => sum + row.debit, 0)
    const credit = filteredEntries.reduce((sum, row) => sum + row.credit, 0)
    return {
      debit,
      credit,
      balance: running.length
        ? running[running.length - 1]!.runningBalance
        : 0,
    }
  }, [filteredEntries, running])

  const accountOptions = accounts.map((account) => ({
    value: account.code,
    label: `${account.code} · ${account.name}`,
  }))

  const entityFilterLabel = dimension?.label ?? 'Entity'
  const allEntitiesLabel = useMemo(() => {
    if (entityType === JournalEntityType.CUSTOMER) return 'All customers'
    if (entityType === JournalEntityType.SUPPLIER) return 'All suppliers'
    if (entityType === JournalEntityType.EMPLOYEE) return 'All employees'
    if (entityType === JournalEntityType.TREASURY) return 'All treasury channels'
    return `All ${entityFilterLabel.toLowerCase()}`
  }, [entityType, entityFilterLabel])

  const selectedSupplier = useMemo(
    () =>
      entityType === JournalEntityType.SUPPLIER
        ? suppliers.find((row) => row.id === entityId)
        : undefined,
    [entityType, suppliers, entityId],
  )

  function syncFilterParams(nextEntityId: string, nextProjectId: string) {
    const params = new URLSearchParams()
    if (nextEntityId) params.set('entityId', nextEntityId)
    if (nextProjectId) params.set('projectId', nextProjectId)
    if (entityType && nextEntityId) params.set('entityType', entityType)
    setSearchParams(params, { replace: true })
  }

  function onAccountChange(next: string) {
    setAccountCode(next)
    setEntityId('')
    setProjectId('')
    navigate(`/ledgers/${encodeURIComponent(next)}`, { replace: true })
  }

  function onEntityChange(next: string) {
    setEntityId(next)
    syncFilterParams(next, projectId)
  }

  function onProjectChange(next: string) {
    setProjectId(next)
    syncFilterParams(entityId, next)
  }

  function entityCell(row: (typeof running)[number]) {
    if (
      row.entityType === JournalEntityType.SUPPLIER &&
      row.entityId
    ) {
      return (
        <Link to={`/suppliers/${row.entityId}`}>
          {row.entityName ?? 'Supplier'}
        </Link>
      )
    }
    if (
      row.entityType === JournalEntityType.CUSTOMER &&
      row.entityId
    ) {
      return row.entityName ?? 'Customer'
    }
    return row.entityName ?? '—'
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>General ledger</h1>
        </div>
        <div className="form-actions">
          {isSupplierPayable && entityId ? (
            <Link to={`/suppliers/${entityId}`} className="ghost-link">
              Supplier details
            </Link>
          ) : null}
          <Link to="/journals" className="ghost-link">
            Journals
          </Link>
        </div>
      </header>

      <section className="table-card">
        <div className="table-head">
          <h2>Account inquiry</h2>
          <p className="muted">
            Supplier bills always hit <strong>2111</strong>: credit bills leave
            an open Cr; cash bills also Cr then Dr 2111 (cleared same day). The
            expense debit still posts to <strong>5240</strong> (or the chosen
            expense account).
          </p>
        </div>

        <form
          className="filter-bar ledger-filter-bar"
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="ledger-filter-row">
            <label className="ledger-filter-account">
              Account
              <Select
                value={accountCode}
                onChange={onAccountChange}
                options={accountOptions}
                searchable
                portal
                placeholder="Select account"
              />
            </label>

            {showEntityFilter ? (
              <label className="ledger-filter-party">
                {isSupplierPayable ? 'Supplier' : entityFilterLabel}
                <Select
                  value={entityId}
                  onChange={onEntityChange}
                  options={[
                    { value: '', label: allEntitiesLabel },
                    ...entityOptions,
                  ]}
                  searchable
                  portal
                  placeholder={
                    isSupplierPayable ? 'All suppliers' : allEntitiesLabel
                  }
                />
              </label>
            ) : null}
          </div>

          {showProjectFilter ? (
            <div className="ledger-filter-row">
              <label className="ledger-filter-project">
                Project
                <Select
                  value={projectId}
                  onChange={onProjectChange}
                  options={[
                    { value: '', label: 'All projects' },
                    ...projectOptions,
                  ]}
                  searchable
                  portal
                  placeholder="All projects"
                />
              </label>
            </div>
          ) : null}

          {showEntityFilter || showProjectFilter ? (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setEntityId('')
                setProjectId('')
                setSearchParams({}, { replace: true })
              }}
            >
              Clear filters
            </button>
          ) : null}
        </form>

        {selectedSupplier ? (
          <p className="muted ledger-supplier-hint">
            Showing transactions for{' '}
            <Link to={`/suppliers/${selectedSupplier.id}`}>
              {selectedSupplier.supplierNumber} · {selectedSupplier.name}
            </Link>
            {' · '}
            <Link to={`/suppliers/${selectedSupplier.id}`}>
              Open vendor ledger / history
            </Link>
          </p>
        ) : null}

        {error ? <p className="form-error">{error}</p> : null}
        {loading ? <p className="muted">Loading ledger…</p> : null}

        {ledger ? (
          <>
            <section className="grid metric-card-grid">
              <MetricCard
                variant="blue"
                title={ledger.account.accountCode}
                value={ledger.account.accountName}
              />
              <MetricCard
                variant="teal"
                title={
                  entityId || projectId ? 'Filtered balance' : 'Balance'
                }
                value={money(
                  entityId || projectId
                    ? filteredTotals.balance
                    : ledger.account.balance,
                )}
              />
              <MetricCard
                variant="purple"
                title="Lines"
                value={filteredEntries.length}
                meta={
                  ledger.entries.length !== filteredEntries.length
                    ? `of ${ledger.entries.length} total`
                    : undefined
                }
              />
            </section>

            <div className="journal-lines-scroll">
              <table className="journal-lines-table ledger-inquiry-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Journal</th>
                    <th>Memo No</th>
                    <th>Description</th>
                    <th>Reference</th>
                    <th>Entity</th>
                    <th className="num">Debit</th>
                    <th className="num">Credit</th>
                    <th className="num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {running.map((row) => (
                    <tr key={row.id}>
                      <td>{row.date.slice(0, 10)}</td>
                      <td>
                        <Link
                          to={
                            row.journalEntryId
                              ? `/journals/${row.journalEntryId}`
                              : '/journals'
                          }
                        >
                          {row.entryNumber}
                        </Link>
                      </td>
                      <td className="ledger-memo-cell" title={row.memo}>
                        {row.memo}
                      </td>
                      <td
                        className="ledger-description-cell"
                        title={row.description || row.memo}
                      >
                        {row.description || row.memo}
                      </td>
                      <td>{row.reference ?? '—'}</td>
                      <td>{entityCell(row)}</td>
                      <td className="num amount-debit-cell">
                        {row.debit > 0 ? money(row.debit) : '—'}
                      </td>
                      <td className="num amount-credit-cell">
                        {row.credit > 0 ? money(row.credit) : '—'}
                      </td>
                      <td className="num">{money(row.runningBalance)}</td>
                    </tr>
                  ))}
                  {running.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="muted">
                        No posted lines for this account
                        {entityId || projectId
                          ? ' with the selected filters'
                          : ''}
                        .
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>
    </>
  )
}
