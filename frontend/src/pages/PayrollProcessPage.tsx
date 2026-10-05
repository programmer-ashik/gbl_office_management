import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { ActionMenu, Modal, Select } from "../components/ui";
import { Role } from "../types/auth";
import { AccountType, money, type Account } from "../types/accounting";
import {
  PAYROLL_STATUS_LABEL,
  type PayrollOpenAdvance,
  type PayrollRun,
} from "../types/payroll";
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

type RunAction = { kind: "reopen" | "delete"; run: PayrollRun };

function periodLabel(run: PayrollRun): string {
  const month =
    MONTH_OPTIONS.find((m) => Number(m.value) === run.periodMonth)?.label ??
    String(run.periodMonth).padStart(2, "0");
  return `${run.periodYear}-${month}`;
}

export function PayrollProcessPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === Role.ADMIN;
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [runAction, setRunAction] = useState<RunAction | null>(null);
  const [runActionReason, setRunActionReason] = useState("");
  const [runActionError, setRunActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
  const draftRunId = periodRun?.status === "draft" ? periodRun.id : null;

  const [openAdvances, setOpenAdvances] = useState<PayrollOpenAdvance[]>([]);
  const [adjustEmployeeId, setAdjustEmployeeId] = useState<string | null>(null);
  const [adjustAmounts, setAdjustAmounts] = useState<Record<string, string>>({});
  const [adjustError, setAdjustError] = useState<string | null>(null);

  async function loadOpenAdvances(runId: string) {
    setOpenAdvances(await api.payrollOpenAdvances(runId));
  }

  useEffect(() => {
    if (!draftRunId) {
      setOpenAdvances([]);
      return;
    }
    loadOpenAdvances(draftRunId).catch(() => setOpenAdvances([]));
  }, [draftRunId]);

  const advancesByEmployee = useMemo(() => {
    const map = new Map<string, PayrollOpenAdvance[]>();
    for (const row of openAdvances) {
      map.set(row.employeeId, [...(map.get(row.employeeId) ?? []), row]);
    }
    return map;
  }, [openAdvances]);

  const adjustLine = periodRun?.lines.find(
    (line) => line.employeeId === adjustEmployeeId,
  );
  const adjustRows = adjustEmployeeId
    ? (advancesByEmployee.get(adjustEmployeeId) ?? [])
    : [];
  const adjustAvailable = adjustLine
    ? adjustLine.gross -
      adjustLine.structuralDeductions -
      (adjustLine.totalFacilityDeductions ?? 0)
    : 0;
  const adjustTotal = adjustRows.reduce(
    (sum, row) => sum + (Number(adjustAmounts[row.advanceId]) || 0),
    0,
  );
  const adjustOver =
    Math.round(adjustTotal * 100) > Math.round(adjustAvailable * 100);

  function openAdjust(employeeId: string) {
    const rows = advancesByEmployee.get(employeeId) ?? [];
    setAdjustAmounts(
      Object.fromEntries(
        rows.map((row) => [row.advanceId, row.deducting ? String(row.deducting) : ""]),
      ),
    );
    setAdjustError(null);
    setAdjustEmployeeId(employeeId);
  }

  function showRun(run: PayrollRun) {
    setPeriodYear(run.periodYear);
    setPeriodMonth(run.periodMonth);
  }

  async function onRegenerate(run: PayrollRun) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const refreshed = await api.regeneratePayroll(run.id);
      await Promise.all([load(), loadOpenAdvances(run.id)]);
      showRun(refreshed);
      setNotice(
        `${refreshed.sheetNumber} refreshed from current salary structures · ${refreshed.lines.length} employee(s)`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to refresh payroll");
    } finally {
      setSaving(false);
    }
  }

  function askRunAction(kind: RunAction["kind"], run: PayrollRun) {
    setRunActionReason("");
    setRunActionError(null);
    setRunAction({ kind, run });
  }

  async function onConfirmRunAction() {
    if (!runAction) return;
    const { kind, run } = runAction;
    const reason = runActionReason.trim() || undefined;
    setSaving(true);
    setRunActionError(null);
    setNotice(null);
    try {
      if (kind === "reopen") {
        const reopened = await api.reopenPayroll(run.id, { reason });
        const last = reopened.reopenHistory?.at(-1);
        await load();
        showRun(reopened);
        setNotice(
          `${reopened.sheetNumber} is a draft again${
            last?.reversalJournalNumbers.length
              ? ` · reversed by ${last.reversalJournalNumbers.join(", ")}`
              : ""
          }. Refresh or adjust it, then post again.`,
        );
      } else {
        const deleted = await api.deletePayroll(run.id, reason);
        await load();
        setNotice(
          `${deleted.sheetNumber} deleted${
            deleted.reversalJournalNumbers.length
              ? ` · journals reversed by ${deleted.reversalJournalNumbers.join(", ")}`
              : ""
          }.`,
        );
      }
      setRunAction(null);
    } catch (err) {
      setRunActionError(
        err instanceof Error ? err.message : "Unable to update payroll run",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onSaveAdjust() {
    if (!draftRunId || !adjustEmployeeId) return;
    setSaving(true);
    setAdjustError(null);
    try {
      await api.setPayrollAdvanceDeductions(draftRunId, {
        employeeId: adjustEmployeeId,
        deductions: adjustRows
          .map((row) => ({
            advanceId: row.advanceId,
            amount: Number(adjustAmounts[row.advanceId]) || 0,
          }))
          .filter((row) => row.amount > 0),
      });
      await Promise.all([load(), loadOpenAdvances(draftRunId)]);
      setAdjustEmployeeId(null);
    } catch (err) {
      setAdjustError(
        err instanceof Error ? err.message : "Unable to update advance deduction",
      );
    } finally {
      setSaving(false);
    }
  }

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
                    <th className='num'>Advance recovery</th>
                    <th className='num'>Net</th>
                    {draftRunId ? <th>Open project advances</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {periodRun.lines.map((line) => {
                    const open = advancesByEmployee.get(line.employeeId) ?? [];
                    const openTotal = open.reduce(
                      (sum, row) => sum + row.outstanding,
                      0,
                    );
                    return (
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
                        {draftRunId ? (
                          <td>
                            {open.length > 0 ? (
                              <button
                                type='button'
                                className='ghost'
                                disabled={saving}
                                onClick={() => openAdjust(line.employeeId)}
                              >
                                Adjust · {open.length} open ({money(openTotal)})
                              </button>
                            ) : (
                              <span className='muted'>None</span>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
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
                  Project advances are not cut from salary automatically. Use
                  Adjust on an employee to recover an open advance in this
                  payroll before posting.
                </p>
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
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((row) => {
              const isDraft = row.status === "draft";
              const lockedReason = "Only an admin can change a posted payroll";
              return (
                <tr key={row.id}>
                  <td>
                    <Link to={`/payroll/${row.id}`}>{row.sheetNumber}</Link>
                    {row.reopenHistory?.length ? (
                      <span className='muted'> · reopened {row.reopenHistory.length}×</span>
                    ) : null}
                  </td>
                  <td>{periodLabel(row)}</td>
                  <td>{money(row.totalGross)}</td>
                  <td>{money(row.totalNetPay)}</td>
                  <td>
                    <span className={`status-pill status-${row.status}`}>
                      {PAYROLL_STATUS_LABEL[row.status]}
                    </span>
                  </td>
                  <td>
                    <ActionMenu
                      disabled={saving}
                      items={[
                        { label: "Open in editor", onSelect: () => showRun(row) },
                        ...(isDraft
                          ? [
                              {
                                label: "Update (refresh employees & salaries)",
                                onSelect: () => void onRegenerate(row),
                              },
                              {
                                label: "Delete draft",
                                danger: true,
                                onSelect: () => askRunAction("delete", row),
                              },
                            ]
                          : [
                              {
                                label: "Update (reopen as draft)",
                                disabled: !isAdmin,
                                disabledReason: lockedReason,
                                onSelect: () => askRunAction("reopen", row),
                              },
                              {
                                label: "Delete (reverse journals)",
                                danger: true,
                                disabled: !isAdmin,
                                disabledReason: lockedReason,
                                onSelect: () => askRunAction("delete", row),
                              },
                            ]),
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {notice ? <p className='muted'>{notice}</p> : null}
      {error ? <p className='form-error'>{error}</p> : null}

      <Modal
        open={runAction != null}
        title={
          runAction
            ? `${runAction.kind === "reopen" ? "Reopen" : "Delete"} ${runAction.run.sheetNumber} · ${periodLabel(runAction.run)}`
            : ""
        }
        onClose={() => setRunAction(null)}
      >
        {runAction?.run.status === "draft" ? (
          <p>
            This draft has no journals. Deleting it removes the sheet so you can
            generate {periodLabel(runAction.run)} again.
          </p>
        ) : runAction ? (
          <>
            <p>
              {runAction.run.status === "disbursed"
                ? `The payout journal ${runAction.run.journalNumber ?? ""} and the accrual journal ${runAction.run.accrualJournalNumber ?? ""}`
                : `The accrual journal ${runAction.run.accrualJournalNumber ?? ""}`}{" "}
              will be reversed with new reversal journals (nothing is erased from
              the books). Advance recoveries and loan installments taken in this
              payroll are put back on the employees.
            </p>
            <p className='muted'>
              {runAction.kind === "reopen"
                ? "The sheet becomes a draft: use Update to add the missing employee, adjust, then post and disburse again."
                : "The sheet is then removed so the month can be generated from scratch."}
            </p>
            <label>
              Reason (kept with the reversal)
              <textarea
                rows={2}
                maxLength={300}
                value={runActionReason}
                placeholder='e.g. Missed an employee in the September payroll'
                onChange={(e) => setRunActionReason(e.target.value)}
              />
            </label>
          </>
        ) : null}
        {runActionError ? <p className='form-error'>{runActionError}</p> : null}
        <div className='form-actions'>
          <button type='button' className='ghost' onClick={() => setRunAction(null)}>
            Cancel
          </button>
          <button
            type='button'
            disabled={saving}
            onClick={() => void onConfirmRunAction()}
          >
            {saving
              ? "Working…"
              : runAction?.kind === "reopen"
                ? "Reverse and reopen"
                : runAction?.run.status === "draft"
                  ? "Delete draft"
                  : "Reverse and delete"}
          </button>
        </div>
      </Modal>

      <Modal
        open={adjustEmployeeId != null && adjustLine != null}
        title={`Advance recovery · ${adjustLine?.employeeName ?? ""}`}
        description='Choose how much of each open project advance to cut from this salary. Leave blank to skip.'
        onClose={() => setAdjustEmployeeId(null)}
        wide
      >
        <div className='table-wrap'>
          <table>
            <thead>
              <tr>
                <th>Advance</th>
                <th>Purpose</th>
                <th className='num'>Disbursed</th>
                <th className='num'>Recovered</th>
                <th className='num'>Outstanding</th>
                <th className='num'>Deduct now</th>
              </tr>
            </thead>
            <tbody>
              {adjustRows.map((row) => (
                <tr key={row.advanceId}>
                  <td>
                    <Link to={`/advances/${row.advanceId}`}>{row.advanceNumber}</Link>
                    {row.projectCode ? (
                      <span className='muted'> · {row.projectCode}</span>
                    ) : null}
                  </td>
                  <td>{row.purpose}</td>
                  <td className='num'>{money(row.disbursed)}</td>
                  <td className='num'>{money(row.recovered)}</td>
                  <td className='num'>{money(row.outstanding)}</td>
                  <td className='num'>
                    <div className='form-actions'>
                      <input
                        inputMode='decimal'
                        value={adjustAmounts[row.advanceId] ?? ""}
                        placeholder='0.00'
                        style={{ maxWidth: 120 }}
                        onChange={(e) =>
                          setAdjustAmounts((current) => ({
                            ...current,
                            [row.advanceId]: e.target.value,
                          }))
                        }
                      />
                      <button
                        type='button'
                        className='ghost'
                        onClick={() =>
                          setAdjustAmounts((current) => ({
                            ...current,
                            [row.advanceId]: String(row.outstanding),
                          }))
                        }
                      >
                        Full
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className='muted'>
          Salary available after PF, tax and installments{" "}
          {money(adjustAvailable)} · Recovering {money(adjustTotal)} · Net pay
          becomes {money(adjustAvailable - adjustTotal)}
        </p>
        {adjustOver ? (
          <p className='form-error'>
            Recovery is more than the salary available this month.
          </p>
        ) : null}
        {adjustError ? <p className='form-error'>{adjustError}</p> : null}
        <div className='form-actions'>
          <button
            type='button'
            className='ghost'
            onClick={() =>
              setAdjustAmounts(
                Object.fromEntries(adjustRows.map((row) => [row.advanceId, ""])),
              )
            }
          >
            Clear all
          </button>
          <button
            type='button'
            disabled={saving || adjustOver}
            onClick={() => void onSaveAdjust()}
          >
            {saving ? "Saving…" : "Save recovery"}
          </button>
        </div>
      </Modal>
    </>
  );
}
