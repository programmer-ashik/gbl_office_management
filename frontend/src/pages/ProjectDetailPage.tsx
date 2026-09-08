import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { MetricCard } from '../components/MetricCard'
import { money } from '../types/accounting'
import {
  PROJECT_STATUS_LABEL,
  type Project,
} from '../types/project'
import { qty } from '../types/procurement'
import {
  QUOTATION_STATUS_LABEL,
  type Quotation,
} from '../types/quotation'
import { downloadQuotationPdf } from '../utils/quotationPdf'

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [clientName, setClientName] = useState('')
  const [contractValue, setContractValue] = useState('')
  const [totalBudget, setTotalBudget] = useState('')
  const [endDate, setEndDate] = useState('')

  async function load() {
    if (!id) {
      return
    }
    const [row, quoteRows] = await Promise.all([
      api.projectProfitability(id),
      api.quotations({ projectId: id }).catch(() => [] as Quotation[]),
    ])
    setProject(row)
    setQuotations(quoteRows)
    setName(row.name)
    setClientName(row.client.name)
    setContractValue(String(row.contractValue))
    setTotalBudget(String(row.totalBudget))
    setEndDate(row.endDate ? row.endDate.slice(0, 10) : '')
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load project')
    })
  }, [id])

  async function onSave(event: FormEvent) {
    event.preventDefault()
    if (!id) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.updateProject(id, {
        name,
        client: { name: clientName },
        contractValue: Number(contractValue),
        totalBudget: Number(totalBudget),
        endDate: endDate || undefined,
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update project')
    } finally {
      setSaving(false)
    }
  }

  async function onStatus(status: Project['status']) {
    if (!id) {
      return
    }
    setError(null)
    try {
      await api.updateProjectStatus(id, status)
      await load()
      if (status === 'completed') {
        navigate(`/projects/${id}/invoice`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to change status')
    }
  }

  if (!project) {
    return error ? <p className="form-error">{error}</p> : <p className="muted">Loading…</p>
  }

  const { financials } = project
  const usedPct = Math.min(financials.budgetUsedPct ?? 0, 100)

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{project.code}</p>
          <h1>{project.name}</h1>
          <p className="muted">{project.client.name}</p>
        </div>
        <div className="form-actions">
          {project.status === 'completed' ? (
            <Link to={`/projects/${id}/invoice`} className="ghost-link">
              Project invoice
            </Link>
          ) : null}
          <Link to="/projects" className="ghost-link">
            All projects
          </Link>
        </div>
      </header>

      <section className="status-row">
        {(Object.keys(PROJECT_STATUS_LABEL) as Project['status'][]).map((status) => (
          <button
            key={status}
            type="button"
            className={project.status === status ? '' : 'ghost'}
            onClick={() => void onStatus(status)}
          >
            {PROJECT_STATUS_LABEL[status]}
          </button>
        ))}
      </section>

      <section className="grid metric-card-grid">
        <MetricCard
          variant="blue"
          title="Recognized revenue"
          value={money(financials.recognizedRevenue)}
          meta={`Contract remaining ${money(financials.contractRemaining)}`}
        />
        <MetricCard
          variant="teal"
          title="Gross profit"
          value={money(financials.grossProfit)}
          valueTone={financials.grossProfit < 0 ? 'down' : 'default'}
          meta={`Revenue minus materials and labor${
            financials.grossMarginPct !== null
              ? ` · ${financials.grossMarginPct}%`
              : ''
          }`}
        />
        <MetricCard
          variant="green"
          title="Net profit"
          value={money(financials.netProfit)}
          valueTone={financials.netProfit < 0 ? 'down' : 'default'}
          meta={`After all project expenses${
            financials.netMarginPct !== null
              ? ` · ${financials.netMarginPct}%`
              : ''
          }`}
        />
      </section>

      <section className="table-card">
        <div className="table-head">
          <h2>Budget threshold</h2>
          <span className={financials.isOverBudget ? 'badge-bad' : 'badge-ok'}>
            {financials.isOverBudget ? 'Over budget' : 'Within budget'}
          </span>
        </div>
        <div className="budget-meter" aria-label="Budget used">
          <div
            className={`budget-meter-fill ${financials.isOverBudget ? 'over' : ''}`}
            style={{ width: `${usedPct}%` }}
          />
        </div>
        <p className="muted">
          Spent {money(financials.totalCost)} of {money(financials.totalBudget)} · remaining{' '}
          {money(financials.budgetRemaining)}
        </p>
      </section>

      <section className="table-card">
        <h2>Quotations</h2>
        <p className="muted">
          Quotes approved and assigned to this project for{' '}
          {project.client.name}.
        </p>
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Customer</th>
              <th>Status</th>
              <th>Total</th>
              <th>Date</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {quotations.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link to={`/quotations/${row.id}`}>{row.quotationNumber}</Link>
                </td>
                <td>{row.clientInfo.name}</td>
                <td>{QUOTATION_STATUS_LABEL[row.status]}</td>
                <td>{money(row.grandTotal)}</td>
                <td>{row.createdAt.slice(0, 10)}</td>
                <td>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => downloadQuotationPdf(row)}
                  >
                    PDF
                  </button>
                </td>
              </tr>
            ))}
            {quotations.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No quotations assigned yet. Approve a quotation with this
                  project selected.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="table-card">
        <h2>Materials issued from warehouse</h2>
        <p className="muted">
          Stock issued to this project (FIFO cost). Totals post to materials
          expense 5110.
        </p>
        {(project.materialsSummary?.length ?? 0) > 0 ? (
          <>
            <h3>By item</h3>
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Avg unit cost</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {project.materialsSummary?.map((row) => (
                  <tr key={row.itemId}>
                    <td>{row.sku}</td>
                    <td>{row.name}</td>
                    <td>
                      {qty(row.quantity)} {row.unit}
                    </td>
                    <td>{money(row.unitCost)}</td>
                    <td>{money(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}
        <h3>Issue history</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Issue</th>
              <th>SKU</th>
              <th>Item</th>
              <th>Qty</th>
              <th>Unit cost</th>
              <th>Amount</th>
              <th>Journal</th>
            </tr>
          </thead>
          <tbody>
            {(project.materialIssues ?? []).map((row) => (
              <tr key={row.id}>
                <td>{row.date.slice(0, 10)}</td>
                <td>{row.issueNumber}</td>
                <td>{row.sku}</td>
                <td>{row.name}</td>
                <td>
                  {qty(row.quantity)} {row.unit}
                </td>
                <td>{money(row.unitCost)}</td>
                <td>{money(row.amount)}</td>
                <td>{row.journalNumber}</td>
              </tr>
            ))}
            {(project.materialIssues?.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={8} className="muted">
                  No warehouse issues yet. Receive stock into inventory, then use
                  Inventory → Issue to project.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <p className="muted">
          <Link to="/inventory">Open inventory</Link>
        </p>
      </section>

      <section className="table-card">
        <h2>Cost and revenue by account</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Code</th>
              <th>Account</th>
              <th>Class</th>
              <th>Debit</th>
              <th>Credit</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {financials.breakdown.map((row) => (
              <tr key={row.accountCode}>
                <td>{row.date ?? '—'}</td>
                <td>{row.accountCode}</td>
                <td>{row.accountName}</td>
                <td>
                  {row.accountType === 'revenue'
                    ? 'Revenue'
                    : row.isDirectCost
                      ? 'Direct cost'
                      : 'Other expense'}
                </td>
                <td>{money(row.debit ?? 0)}</td>
                <td>{money(row.credit ?? 0)}</td>
                <td>{money(row.amount)}</td>
              </tr>
            ))}
            {financials.breakdown.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  No tagged journals yet. Post a journal with this project selected.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="table-card">
        <h2>Edit project</h2>
        <form className="stack-form" onSubmit={(event) => void onSave(event)}>
          <div className="name-row">
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Client
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                required
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
          <label>
            End date
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </section>
    </>
  )
}
