import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Select } from "../components/ui";
import { AccountType, money, type Account } from "../types/accounting";
import { PAYROLL_STATUS_LABEL, type PayrollRun } from "../types/payroll";
import type { TreasuryAccount } from "../types/banking";
import { MetricCard } from "../components/MetricCard";
import { SalarySlipDocument } from "../components/SalarySlipDocument";
import { MONTH_OPTIONS } from "../utils/months";

const DEFAULT_SALARY_EXPENSE = "5230";

function accountPathLabel(
  account: Account,
  byCode: Map<string, Account>,
): string {
  const parts: string[] = [];
  let current: Account | undefined = account;
  const seen = new Set<string>();
  while (current && !seen.has(current.code)) {
    seen.add(current.code);
    parts.unshift(`${current.code} ${current.name}`);
    current = current.parentCode ? byCode.get(current.parentCode) : undefined;
  }
  return parts.join(" › ");
}

export function PayrollProcessPage() {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [treasury, setTreasury] = useState<TreasuryAccount[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear());
  const [periodMonth, setPeriodMonth] = useState(new Date().getMonth() + 1);
  const [treasuryId, setTreasuryId] = useState("");
  const [salaryExpenseAccountCode, setSalaryExpenseAccountCode] = useState(
    DEFAULT_SALARY_EXPENSE,
  );
  const [disburseDate, setDisburseDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("GBL Enterprise");
  const [showSlipPreview, setShowSlipPreview] = useState(false);

  async function load() {
    const [runRows, channels, chart, jvTpl] = await Promise.all([
      api.payrollRuns(),
      api.treasury(),
      api.accounts().catch(() => [] as Account[]),
      api.journalVoucherTemplate().catch(() => null),
    ]);
    setRuns(runRows);
    setTreasury(channels);
    setAccounts(chart);
    if (!treasuryId && channels[0]) setTreasuryId(channels[0].id);
    const has5230 = chart.some(
      (row) => row.code === DEFAULT_SALARY_EXPENSE && row.isPostable,
    );
    if (
      has5230 &&
      (!salaryExpenseAccountCode ||
        !chart.some((row) => row.code === salaryExpenseAccountCode))
    ) {
      setSalaryExpenseAccountCode(DEFAULT_SALARY_EXPENSE);
    }
    if (jvTpl) {
      setCompanyLogoUrl(jvTpl.companyLogoUrl ?? null);
      if (jvTpl.headerConfig?.companyName) {
        setCompanyName(jvTpl.headerConfig.companyName);
      }
    }
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Unable to load payroll");
    });
  }, []);

  const periodRun = runs.find(
    (row) => row.periodYear === periodYear && row.periodMonth === periodMonth,
  );

  const salaryExpenseOptions = useMemo(() => {
    const byCode = new Map(accounts.map((row) => [row.code, row]));
    return accounts
      .filter(
        (row) =>
          row.isPostable &&
          row.isActive &&
          row.type === AccountType.EXPENSE &&
          (row.code.startsWith("52") || row.code === "5120"),
      )
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((row) => ({
        value: row.code,
        label: accountPathLabel(row, byCode),
      }));
  }, [accounts]);

  async function onGenerate() {
    setSaving(true);
    setError(null);
    try {
      await api.generatePayroll({ periodYear, periodMonth });
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to generate payroll",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onPost(runId: string) {
    setSaving(true);
    setError(null);
    try {
      await api.postPayroll(runId, {
        salaryExpenseAccountCode,
      });
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to post monthly payroll",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onDisburse(runId: string) {
    setSaving(true);
    setError(null);
    try {
      await api.disbursePayroll(runId, { treasuryId, date: disburseDate });
      await load();
      await api.downloadPayrollSalarySlipsPdf(runId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to disburse payroll",
      );
    } finally {
      setSaving(false);
    }
  }

  const treasuryOptions = treasury.map((row) => ({
    value: row.id,
    label: `${row.name} · GL ${row.glAccountCode}`,
  }));

  return (
    <>
      <header className='workspace-header'>
        <div>
          <h1>Monthly payroll process</h1>
          <p className='text-xs text-muted'>
            Generate → Post accrual (Dr salary expense / Cr 2121) → Disburse{" "}
            <br></br>
            from cash or bank (Dr 2121 / Cr treasury).
          </p>
        </div>
        <div className='form-actions'>
          <Link className='ghost-link' to='/payroll/structures'>
            Salary structures
          </Link>
          <Link className='ghost-link' to='/payroll/time'>
            Time logs
          </Link>
          <Link className='ghost-link' to='/settings/payroll'>
            Payroll rules
          </Link>
        </div>
      </header>

      <section className='grid metric-card-grid'>
        <MetricCard
          variant='blue'
          title='Gross (period)'
          value={periodRun ? money(periodRun.totalGross) : "—"}
        />
        <MetricCard
          variant='amber'
          title='Advances'
          value={periodRun ? money(periodRun.totalAdvanceDeductions) : "—"}
        />
        <MetricCard
          variant='green'
          title='Net pay'
          value={periodRun ? money(periodRun.totalNetPay) : "—"}
        />
      </section>

      <section className='table-card'>
        <h2>Select period</h2>
        <div className='name-row'>
          <label>
            Year
            <input
              type='number'
              value={periodYear}
              onChange={(e) => setPeriodYear(Number(e.target.value))}
            />
          </label>
          <label>
            Month
            <Select
              value={String(periodMonth)}
              onChange={(value) => setPeriodMonth(Number(value))}
              options={[...MONTH_OPTIONS]}
              placeholder='Select month'
            />
          </label>
        </div>

        {!periodRun ? (
          <div className='form-actions'>
            <button
              type='button'
              disabled={saving}
              onClick={() => void onGenerate()}
            >
              {saving ? "Generating…" : "Generate payroll preview"}
            </button>
          </div>
        ) : (
          <>
            <p className='muted'>
              Sheet {periodRun.sheetNumber} ·{" "}
              <span className={`status-pill status-${periodRun.status}`}>
                {PAYROLL_STATUS_LABEL[periodRun.status]}
              </span>
              {periodRun.accrualJournalNumber
                ? ` · Accrual ${periodRun.accrualJournalNumber}`
                : ""}
              {periodRun.journalNumber
                ? ` · Payout ${periodRun.journalNumber}`
                : ""}
            </p>

            <div className='table-wrap'>
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th className='num'>Gross</th>
                    <th className='num'>PF / Tax / Adv</th>
                    <th className='num'>Open advances</th>
                    <th className='num'>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {periodRun.lines.map((line) => (
                    <tr key={line.employeeId}>
                      <td>{line.employeeName}</td>
                      <td className='num'>{money(line.gross)}</td>
                      <td className='num'>
                        {money(
                          (line.providentFund ?? 0) +
                            (line.taxDeduction ?? 0) +
                            (line.structureAdvance ?? 0),
                        )}
                      </td>
                      <td className='num'>
                        {money(line.totalAdvanceDeductions)}
                      </td>
                      <td className='num'>{money(line.netPay)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {periodRun.status === "draft" ? (
              <>
                <div className='name-row'>
                  <label>
                    Salary expense account (chart of accounts)
                    <Select
                      value={salaryExpenseAccountCode}
                      onChange={setSalaryExpenseAccountCode}
                      options={salaryExpenseOptions}
                      placeholder='Select expense head'
                      searchable
                    />
                  </label>
                </div>
                <p className='muted'>
                  Accrual posts Dr this head for HQ / office salary (default{" "}
                  {DEFAULT_SALARY_EXPENSE} Office Employee Salary). Project time
                  still allocates to 5120. Credits: advances, PF, tax, unpaid
                  salaries (2121).
                </p>
                <div className='form-actions'>
                  <button
                    type='button'
                    disabled={saving || !salaryExpenseAccountCode}
                    onClick={() => void onPost(periodRun.id)}
                  >
                    {saving ? "Posting…" : "Post Monthly Payroll"}
                  </button>
                </div>
              </>
            ) : null}

            {periodRun.status === "posted" ? (
              <>
                <div className='name-row'>
                  <label>
                    Payout date
                    <input
                      type='date'
                      value={disburseDate}
                      onChange={(e) => setDisburseDate(e.target.value)}
                    />
                  </label>
                  <label>
                    Pay from (Cash / Bank treasury)
                    <Select
                      value={treasuryId}
                      onChange={setTreasuryId}
                      options={treasuryOptions}
                      placeholder='Select treasury'
                    />
                  </label>
                </div>
                <p className='muted'>
                  Disbursement clears Unpaid Staff Salaries (Dr 2121) against
                  the selected cash or bank GL — not the salary expense head.
                </p>
                <div className='form-actions mt-2'>
                  <button
                    type='button'
                    disabled={saving || !treasuryId}
                    onClick={() => void onDisburse(periodRun.id)}
                  >
                    {saving ? "Disbursing…" : "Execute Disbursement"}
                  </button>
                </div>
              </>
            ) : null}

            {periodRun.status === "disbursed" ? (
              <div className='form-actions mt-4'>
                <button
                  type='button'
                  className='ghost'
                  onClick={() => setShowSlipPreview((v) => !v)}
                >
                  {showSlipPreview
                    ? "Hide salary slip preview"
                    : "Preview salary slips"}
                </button>
                <button
                  type='button'
                  className='ghost'
                  onClick={() =>
                    void api.downloadPayrollSalarySlipsPdf(periodRun.id)
                  }
                >
                  Download salary slips PDF
                </button>
                <Link className='ghost-link' to={`/payroll/${periodRun.id}`}>
                  View run detail
                </Link>
              </div>
            ) : null}
          </>
        )}
      </section>

      {periodRun?.status === "disbursed" &&
      showSlipPreview &&
      periodRun.lines.length > 0 ? (
        <section className='table-card'>
          <div className='table-head'>
            <h2>Salary slip preview</h2>
            <p className='muted'>
              Optional preview · installment reasons shown on each slip
            </p>
          </div>
          <SalarySlipDocument
            run={periodRun}
            logoUrl={companyLogoUrl}
            companyName={companyName}
          />
        </section>
      ) : null}

      <section className='table-card'>
        <h2>All payroll runs</h2>
        <table>
          <thead>
            <tr>
              <th>Sheet</th>
              <th>Period</th>
              <th>Gross</th>
              <th>Net</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link to={`/payroll/${row.id}`}>{row.sheetNumber}</Link>
                </td>
                <td>
                  {row.periodYear}-
                  {MONTH_OPTIONS.find(
                    (m) => Number(m.value) === row.periodMonth,
                  )?.label ?? String(row.periodMonth).padStart(2, "0")}
                </td>
                <td>{money(row.totalGross)}</td>
                <td>{money(row.totalNetPay)}</td>
                <td>
                  <span className={`status-pill status-${row.status}`}>
                    {PAYROLL_STATUS_LABEL[row.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {error ? <p className='form-error'>{error}</p> : null}
    </>
  );
}
