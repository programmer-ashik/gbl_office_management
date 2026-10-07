import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { QuickCustomerForm } from '../components/QuickCustomerForm'
import { ActionMenu, Modal, Select } from '../components/ui'
import { money, type Customer } from '../types/accounting'
import type { ClientInvoice } from '../types/ar-ap'
import { Role } from '../types/auth'
import {
  PROJECT_STATUS_LABEL,
  projectBelongsToCustomer,
  type CreateProjectBody,
  type Project,
} from '../types/project'
import {
  DEFAULT_INVOICE_VAT_RATE,
  grossUpTotals,
} from '../types/project-invoice'

export function ProjectsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const canCreateClient =
    user?.role === Role.ADMIN || user?.role === Role.ACCOUNTANT
  const [projects, setProjects] = useState<Project[]>([])
  const [invoices, setInvoices] = useState<ClientInvoice[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState('')
  const [newClientName, setNewClientName] = useState<string | null>(null)
  const [clientHint, setClientHint] = useState<string | null>(null)
  const [clientFilter, setClientFilter] = useState('')
  const [completing, setCompleting] = useState<Project | null>(null)
  const [completeBusy, setCompleteBusy] = useState(false)
  const [completeError, setCompleteError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState('')
  const [contractValue, setContractValue] = useState('')
  const [totalBudget, setTotalBudget] = useState('')
  const [description, setDescription] = useState('')

  async function load() {
    const [rows, invoiceRows, customerRows] = await Promise.all([
      api.projects(),
      api.invoices().catch(() => [] as ClientInvoice[]),
      api.customers(true).catch(() => [] as Customer[]),
    ])
    setProjects(rows)
    setInvoices(invoiceRows)
    setCustomers(customerRows)
  }

  const selectedCustomer = customers.find((row) => row.id === customerId)

  const customerOptions = customers.map((row) => ({
    value: row.id,
    label: `${row.customerNumber} · ${row.name}`,
  }))

  function selectCustomer(customer: Customer) {
    setCustomerId(customer.id)
    setContactName(customer.contactName ?? '')
    setEmail(customer.email ?? '')
    setPhone(customer.phone ?? '')
    setClientHint(null)
  }

  function onAddNewClient(query: string) {
    if (!canCreateClient) {
      setClientHint(
        query
          ? `"${query}" is not a client yet. Ask an Admin or Accountant to add it under Customers, then pick it here.`
          : 'Ask an Admin or Accountant to add the client under Customers, then pick it here.',
      )
      return
    }
    setNewClientName(query)
  }

  const filterCustomer = customers.find((row) => row.id === clientFilter)
  const visibleProjects = filterCustomer
    ? projects.filter((project) =>
        projectBelongsToCustomer(project, filterCustomer),
      )
    : projects

  function projectCountFor(customer: Customer) {
    return projects.filter((project) =>
      projectBelongsToCustomer(project, customer),
    ).length
  }

  function closeCreateModal() {
    setModalOpen(false)
    setNewClientName(null)
    setClientHint(null)
  }

  const invoiceByProject = useMemo(() => {
    const map = new Map<string, ClientInvoice>()
    for (const row of invoices) {
      if (row.status !== 'void' && !map.has(row.projectId)) {
        map.set(row.projectId, row)
      }
    }
    return map
  }, [invoices])

  function openInvoice(project: Project) {
    navigate(`/projects/${project.id}/invoice`)
  }

  async function onCompleteAndInvoice() {
    if (!completing) return
    setCompleteBusy(true)
    setCompleteError(null)
    try {
      await api.updateProjectStatus(completing.id, 'completed')
      const project = completing
      setCompleting(null)
      openInvoice(project)
    } catch (err) {
      setCompleteError(
        err instanceof Error ? err.message : 'Unable to complete project',
      )
    } finally {
      setCompleteBusy(false)
    }
  }

  const completingPreview = completing
    ? grossUpTotals(completing.contractValue, DEFAULT_INVOICE_VAT_RATE)
    : null

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load projects')
    })
  }, [])

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    if (!selectedCustomer) {
      setError('Select a client, or add a new one')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const body: CreateProjectBody = {
        name,
        customerId: selectedCustomer.id,
        client: {
          name: selectedCustomer.name,
          contactName: contactName || undefined,
          email: email || undefined,
          phone: phone || undefined,
        },
        startDate,
        endDate: endDate || undefined,
        contractValue: Number(contractValue),
        totalBudget: Number(totalBudget),
        description: description || undefined,
      }
      await api.createProject(body)
      setName('')
      setCustomerId('')
      setContactName('')
      setEmail('')
      setPhone('')
      setEndDate('')
      setContractValue('')
      setTotalBudget('')
      setDescription('')
      closeCreateModal()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create project')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Project management</h1>
        </div>
        <button
          type="button"
          onClick={() => {
            setError(null)
            setModalOpen(true)
          }}
        >
          Add project
        </button>
      </header>

      <Modal
        open={modalOpen}
        title={newClientName !== null ? 'New client' : 'New project'}
        description={
          newClientName !== null
            ? 'Client is saved under Customers, then selected for this project.'
            : undefined
        }
        onClose={closeCreateModal}
        wide
      >
        {newClientName !== null ? (
          <QuickCustomerForm
            initialName={newClientName}
            submitLabel="Add client & continue"
            onCancel={() => setNewClientName(null)}
            onCreated={(customer) => {
              setCustomers((rows) =>
                [...rows, customer].sort((a, b) => a.name.localeCompare(b.name)),
              )
              selectCustomer(customer)
              setNewClientName(null)
            }}
          />
        ) : (
        <form className="stack-form" onSubmit={(event) => void onCreate(event)}>
          <div className="name-row">
            <label>
              Project name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Client
              <Select
                value={customerId}
                onChange={(value) => {
                  const customer = customers.find((row) => row.id === value)
                  if (customer) selectCustomer(customer)
                }}
                options={customerOptions}
                placeholder="Search existing client…"
                searchable
                required
                onCreate={onAddNewClient}
                createLabel={(query) =>
                  query ? `+ Add "${query}" as a new client` : '+ Add new client'
                }
              />
              {selectedCustomer ? (
                <span className="muted field-hint">
                  Project goes under {selectedCustomer.name}
                  {(() => {
                    const count = projectCountFor(selectedCustomer)
                    return count
                      ? ` · ${count} existing project${count === 1 ? '' : 's'}`
                      : ' · first project'
                  })()}
                </span>
              ) : null}
              {clientHint ? (
                <span className="form-error field-hint">{clientHint}</span>
              ) : null}
            </label>
          </div>
          <div className="name-row">
            <label>
              Contact
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          </div>
          <div className="name-row">
            <label>
              Phone
              <input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label>
              Description
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          </div>
          <div className="name-row">
            <label>
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </label>
            <label>
              End date
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
          </div>
          <div className="name-row">
            <label>
              Contract value
              <input
                inputMode="decimal"
                value={contractValue}
                onChange={(e) => setContractValue(e.target.value)}
                required
              />
            </label>
            <label>
              Total budget
              <input
                inputMode="decimal"
                value={totalBudget}
                onChange={(e) => setTotalBudget(e.target.value)}
                required
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Create project'}
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
        )}
      </Modal>

      <section className="table-card">
        <div className="table-head">
          <div>
            <h2>Projects</h2>
            <p className="muted">Budget used and profit update from tagged journals.</p>
          </div>
          <label className="projects-client-filter">
            Client
            <Select
              value={clientFilter}
              onChange={setClientFilter}
              options={[
                { value: '', label: 'All clients' },
                ...customers.map((row) => ({
                  value: row.id,
                  label: `${row.name} (${projectCountFor(row)})`,
                })),
              ]}
              searchable
            />
          </label>
        </div>
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Client</th>
              <th>Status</th>
              <th>Budget used</th>
              <th>Net profit</th>
              <th>Invoice</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {visibleProjects.map((project) => (
              <tr key={project.id}>
                <td>{project.code}</td>
                <td>
                  <Link to={`/projects/${project.id}`}>{project.name}</Link>
                </td>
                <td>{project.client.name}</td>
                <td>
                  <span className={`status-pill status-${project.status}`}>
                    {PROJECT_STATUS_LABEL[project.status]}
                  </span>
                </td>
                <td>
                  {project.financials.budgetUsedPct === null
                    ? money(project.financials.totalCost)
                    : `${project.financials.budgetUsedPct.toFixed(0)}%`}
                  {project.financials.isOverBudget ? (
                    <span className="badge-bad budget-flag">Over</span>
                  ) : null}
                </td>
                <td className={project.financials.netProfit < 0 ? 'loss' : 'gain'}>
                  {money(project.financials.netProfit)}
                </td>
                <td>
                  {(() => {
                    const invoice = invoiceByProject.get(project.id)
                    if (invoice) {
                      return (
                        <Link to={`/projects/${project.id}/invoice`}>
                          {invoice.invoiceNumber} · {money(invoice.amount)}
                        </Link>
                      )
                    }
                    return project.status === 'completed' ? (
                      <span className="badge-warn">Not sent</span>
                    ) : (
                      <span className="muted">—</span>
                    )
                  })()}
                </td>
                <td>
                  <ActionMenu
                    items={[
                      project.status === 'completed'
                        ? {
                            label: invoiceByProject.has(project.id)
                              ? 'View invoice'
                              : 'Send invoice',
                            onSelect: () => openInvoice(project),
                          }
                        : {
                            label: 'Complete & send invoice',
                            onSelect: () => {
                              setCompleteError(null)
                              setCompleting(project)
                            },
                          },
                      {
                        label: 'Open project',
                        onSelect: () => navigate(`/projects/${project.id}`),
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
            {visibleProjects.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted">
                  {filterCustomer
                    ? `No projects under ${filterCustomer.name}.`
                    : 'No projects yet.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <Modal
        open={completing !== null}
        title="Complete project & send invoice"
        description={
          completing ? `${completing.code} · ${completing.name}` : undefined
        }
        onClose={() => (completeBusy ? undefined : setCompleting(null))}
      >
        {completing && completingPreview ? (
          <div className="stack-form">
            <p className="muted">
              The project is marked <strong>Completed</strong> and the invoice
              template opens with every material used on it. VAT &amp; Tax is
              grossed up exactly like quotations.
            </p>
            <dl className="inv-grossup-breakdown">
              <div>
                <dt>Contract value (net)</dt>
                <dd>{money(completingPreview.net)}</dd>
              </div>
              <div>
                <dt>VAT &amp; Tax ({DEFAULT_INVOICE_VAT_RATE}%)</dt>
                <dd>{money(completingPreview.taxAmount)}</dd>
              </div>
              <div className="is-total">
                <dt>Invoice total</dt>
                <dd>{money(completingPreview.grandTotal)}</dd>
              </div>
              <p className="muted">
                Estimate from the contract value. Final lines and rate can be
                edited in the template before sending to receivables.
              </p>
            </dl>
            {completeError ? (
              <p className="form-error">{completeError}</p>
            ) : null}
            <div className="form-actions">
              <button
                type="button"
                className="ghost"
                disabled={completeBusy}
                onClick={() => setCompleting(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={completeBusy}
                onClick={() => void onCompleteAndInvoice()}
              >
                {completeBusy ? 'Completing…' : 'Complete & open invoice'}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      {!modalOpen && error ? <p className="form-error">{error}</p> : null}
    </>
  )
}
