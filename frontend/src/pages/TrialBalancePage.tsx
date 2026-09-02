import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { ACCOUNT_TYPE_LABEL, money, type TrialBalance } from '../types/accounting'

export function TrialBalancePage() {
  const [report, setReport] = useState<TrialBalance | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .trialBalance()
      .then(setReport)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load trial balance')
      })
  }, [])

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Trial balance</h1>
        </div>
        {report ? (
          <span className={report.isBalanced ? 'badge-ok' : 'badge-bad'}>
            {report.isBalanced ? 'In balance' : 'Out of balance'}
          </span>
        ) : null}
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="table-card">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Account</th>
              <th>Type</th>
              <th>Debit</th>
              <th>Credit</th>
            </tr>
          </thead>
          <tbody>
            {(report?.rows ?? [])
              .filter((row) => row.debitColumn > 0 || row.creditColumn > 0)
              .map((row) => (
                <tr key={row.accountCode}>
                  <td>{row.accountCode}</td>
                  <td>{row.accountName}</td>
                  <td>{ACCOUNT_TYPE_LABEL[row.type]}</td>
                  <td>{row.debitColumn ? money(row.debitColumn) : ''}</td>
                  <td>{row.creditColumn ? money(row.creditColumn) : ''}</td>
                </tr>
              ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={3}>Totals</th>
              <th>{money(report?.totalDebit ?? 0)}</th>
              <th>{money(report?.totalCredit ?? 0)}</th>
            </tr>
          </tfoot>
        </table>
      </section>
    </>
  )
}
