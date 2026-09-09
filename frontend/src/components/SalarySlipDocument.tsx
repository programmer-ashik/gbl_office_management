import { resolveAssetUrl } from '../types/report-template'
import { money } from '../types/accounting'
import type { PayrollRun } from '../types/payroll'

type Props = {
  run: PayrollRun
  logoUrl?: string | null
  companyName?: string
}

function periodLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Tailwind payslip sheet — mirrors invoice document theming (brand header,
 * ruled tables, net emphasis). Used for on-screen preview / print.
 */
export function SalarySlipDocument({
  run,
  logoUrl,
  companyName = 'GBL Enterprise',
}: Props) {
  const logo = resolveAssetUrl(logoUrl ?? null)

  return (
    <div className="space-y-6 print:space-y-4">
      {run.lines.map((line) => {
        return (
          <article
            key={line.employeeId}
            className="mx-auto max-w-[210mm] overflow-hidden rounded-[var(--theme-card-radius,12px)] border border-[var(--line-strong,#cfd6e0)] bg-white shadow-sm print:shadow-none"
          >
            <header className="flex items-start justify-between gap-4 border-b border-[var(--line-strong,#cfd6e0)] bg-[color-mix(in_srgb,var(--theme-table-head-bg,#1d4ed8)_8%,white)] px-6 py-5">
              <div className="flex items-center gap-3">
                {logo ? (
                  <img
                    src={logo}
                    alt=""
                    className="h-12 w-auto max-w-[120px] object-contain"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[var(--theme-table-head-bg,#1d4ed8)] text-sm font-bold text-white">
                    GBL
                  </div>
                )}
                <div>
                  <p className="text-lg font-semibold text-[var(--ink,#152033)]">
                    {companyName}
                  </p>
                  <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted,#5a6578)]">
                    Salary slip
                  </p>
                </div>
              </div>
              <div className="text-right text-sm text-[var(--muted,#5a6578)]">
                <p className="font-semibold text-[var(--ink,#152033)]">
                  {run.sheetNumber}
                </p>
                <p>{periodLabel(run.periodYear, run.periodMonth)}</p>
              </div>
            </header>

            <div className="grid gap-4 px-6 py-4 sm:grid-cols-2">
              <div className="text-sm">
                <p className="text-xs uppercase tracking-wide text-[var(--muted,#5a6578)]">
                  Employee
                </p>
                <p className="font-semibold text-[var(--ink,#152033)]">
                  {line.employeeName}
                </p>
              </div>
              <div className="text-sm sm:text-right">
                <p className="text-xs uppercase tracking-wide text-[var(--muted,#5a6578)]">
                  Payment
                </p>
                <p className="font-medium text-[var(--ink,#152033)]">
                  {run.treasuryAccountCode ?? '—'}
                  {run.journalNumber ? ` · ${run.journalNumber}` : ''}
                </p>
              </div>
            </div>

            <div className="grid gap-0 border-t border-[var(--line-strong,#cfd6e0)] sm:grid-cols-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--theme-table-head-bg,#1d4ed8)] text-[var(--theme-table-head-color,#fff)]">
                    <th className="px-4 py-2 text-left font-semibold">
                      Earnings
                    </th>
                    <th className="px-4 py-2 text-right font-semibold">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[var(--line,#e5e7eb)]">
                    <td className="px-4 py-2">Basic</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {money(line.basic)}
                    </td>
                  </tr>
                  <tr className="border-b border-[var(--line,#e5e7eb)]">
                    <td className="px-4 py-2">Allowances</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {money(line.allowances)}
                    </td>
                  </tr>
                  <tr className="bg-[color-mix(in_srgb,var(--theme-table-head-bg,#1d4ed8)_6%,white)] font-semibold">
                    <td className="px-4 py-2">Gross</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {money(line.gross)}
                    </td>
                  </tr>
                </tbody>
              </table>

              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--theme-table-head-bg,#1d4ed8)] text-[var(--theme-table-head-color,#fff)]">
                    <th className="px-4 py-2 text-left font-semibold">
                      Deductions
                    </th>
                    <th className="px-4 py-2 text-right font-semibold">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[var(--line,#e5e7eb)]">
                    <td className="px-4 py-2">Provident fund</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {money(line.providentFund ?? 0)}
                    </td>
                  </tr>
                  <tr className="border-b border-[var(--line,#e5e7eb)]">
                    <td className="px-4 py-2">Tax (AIT)</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {money(line.taxDeduction ?? 0)}
                    </td>
                  </tr>
                  {(line.structureAdvance ?? 0) > 0 ? (
                    <tr className="border-b border-[var(--line,#e5e7eb)]">
                      <td className="px-4 py-2">Structure advance</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {money(line.structureAdvance ?? 0)}
                      </td>
                    </tr>
                  ) : null}
                  {(line.advanceDeductions ?? []).map((item) => (
                    <tr
                      key={item.advanceId}
                      className="border-b border-[var(--line,#e5e7eb)]"
                    >
                      <td className="px-4 py-2">
                        Project advance {item.advanceNumber}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {money(item.amount)}
                      </td>
                    </tr>
                  ))}
                  {(line.facilityDeductions ?? []).map((item) => (
                    <tr
                      key={item.facilityId}
                      className="border-b border-[var(--line,#e5e7eb)]"
                    >
                      <td className="px-4 py-2">{item.label}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {money(item.amount)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-[color-mix(in_srgb,var(--theme-table-head-bg,#1d4ed8)_6%,white)] font-semibold">
                    <td className="px-4 py-2">Total deductions</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {money(
                        (line.structuralDeductions ?? 0) +
                          (line.totalAdvanceDeductions ?? 0) +
                          (line.totalFacilityDeductions ?? 0),
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <footer className="flex items-center justify-between gap-4 border-t border-[var(--line-strong,#cfd6e0)] px-6 py-4">
              <p className="text-xs text-[var(--muted,#5a6578)]">
                Accrual Dr 5120/5230 · Disbursement Dr 2121 · System generated
              </p>
              <div className="rounded-md bg-[var(--theme-table-head-bg,#1d4ed8)] px-4 py-2 text-right text-white">
                <p className="text-[10px] uppercase tracking-wider opacity-90">
                  Net payable
                </p>
                <p className="text-lg font-semibold tabular-nums">
                  {money(line.netPay)}
                </p>
              </div>
            </footer>
          </article>
        )
      })}
    </div>
  )
}
