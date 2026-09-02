import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { Select } from '../components/ui'
import type { AuditLog } from '../types/governance'

const ENTITY_OPTIONS = [
  { value: 'journal_entry', label: 'Journal entries' },
  { value: 'approval_request', label: 'Approvals' },
  { value: '', label: 'All' },
]

export function AuditPage() {
  const [rows, setRows] = useState<AuditLog[]>([])
  const [entityType, setEntityType] = useState('journal_entry')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .auditLogs(entityType || undefined)
      .then(setRows)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load audit logs')
      })
  }, [entityType])

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Immutable audit trail</h1>
          <p className="muted">
            CREATE / UPDATE / DELETE history for financial records, including every
            ledger journal post.
          </p>
        </div>
      </header>

      <section className="table-card">
        <label>
          Entity type
          <Select
            value={entityType}
            onChange={setEntityType}
            options={ENTITY_OPTIONS}
          />
        </label>
      </section>

      <section className="table-card">
        <h2>Recent events</h2>
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Actor</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.createdAt.slice(0, 19).replace('T', ' ')}</td>
                <td>{row.action}</td>
                <td>
                  {row.entityType}
                  <span className="muted"> · {row.entityId.slice(-6)}</span>
                </td>
                <td>
                  {row.actorEmail}
                  <span className="muted"> · {row.actorRole}</span>
                </td>
                <td>{row.summary}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No audit events yet.
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
