import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { money } from '../types/accounting'
import { Role } from '../types/auth'
import {
  APPROVAL_STATUS_LABEL,
  type ApprovalRequest,
} from '../types/governance'

export function ApprovalsPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState<ApprovalRequest[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    setRows(await api.approvals())
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to load approvals')
    })
  }, [])

  async function onApprove(id: string) {
    setSaving(true)
    setError(null)
    try {
      await api.approveRequest(id, 'Approved')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to approve')
    } finally {
      setSaving(false)
    }
  }

  async function onReject(id: string) {
    setSaving(true)
    setError(null)
    try {
      await api.rejectRequest(id, 'Rejected')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reject')
    } finally {
      setSaving(false)
    }
  }

  function canAct(row: ApprovalRequest): boolean {
    if (row.status !== 'pending') return false
    const step = row.steps[row.currentStepIndex]
    if (!step || !user) return false
    if (step.role === 'admin') return user.role === Role.ADMIN
    if (step.role === 'accountant') {
      return user.role === Role.ACCOUNTANT || user.role === Role.ADMIN
    }
    if (step.role === 'project_manager') {
      return user.role === Role.PROJECT_MANAGER || user.role === Role.ADMIN
    }
    return false
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Multi-level approval queue</h1>
          <p className="muted">
            Transactions at or above 100,000 require Project Manager → Accounts → MD
            (Admin) before posting.
          </p>
        </div>
      </header>

      <section className="table-card">
        <h2>Requests</h2>
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Type</th>
              <th>Project</th>
              <th>Amount</th>
              <th>Summary</th>
              <th>Step</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const step = row.steps[row.currentStepIndex]
              return (
                <tr key={row.id}>
                  <td>{row.requestNumber}</td>
                  <td>{row.entityType}</td>
                  <td>{row.projectCode ?? '—'}</td>
                  <td>{money(row.amount)}</td>
                  <td>{row.summary}</td>
                  <td>
                    {row.status === 'pending'
                      ? step?.role.replace('_', ' ')
                      : '—'}
                  </td>
                  <td>
                    <span className={`status-pill status-${row.status}`}>
                      {APPROVAL_STATUS_LABEL[row.status]}
                    </span>
                  </td>
                  <td>
                    {canAct(row) ? (
                      <div className="form-actions">
                        <button
                          type="button"
                          className="ghost"
                          disabled={saving}
                          onClick={() => void onReject(row.id)}
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void onApprove(row.id)}
                        >
                          Approve
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted">
                  No approval requests yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {error ? <p className="form-error">{error}</p> : null}
    </>
  )
}
