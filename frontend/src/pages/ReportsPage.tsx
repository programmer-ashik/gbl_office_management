import { Link, useNavigate } from 'react-router-dom'
import { JournalRegister } from '../components/JournalRegister'
import type { JournalEntry } from '../types/accounting'

export function ReportsPage() {
  const navigate = useNavigate()

  function onEdit(entry: JournalEntry) {
    navigate(`/journals?edit=${entry.id}`)
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Reports</h1>
        </div>
        <Link to="/journals" className="action-link">
          Add journal
        </Link>
      </header>

      <JournalRegister
        title="Journal register"
        description="All posted journals. Filter by date range, preview or download vouchers, and manage entries."
        showRangeFilter
        onEdit={onEdit}
      />

      <section className="table-card">
        <div className="table-head">
          <h2>Other reports</h2>
          <p className="muted">More financial reports will be added next.</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Report</th>
              <th>Description</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Trial balance</td>
              <td>Account balances as of the current ledger</td>
              <td>
                <Link to="/trial-balance" className="action-link">
                  Open
                </Link>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </>
  )
}
