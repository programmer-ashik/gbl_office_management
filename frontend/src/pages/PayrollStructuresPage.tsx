import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Modal, Select } from "../components/ui";
import { money } from "../types/accounting";
import type {
  PayrollEmployee,
  PayrollSettings,
  SalaryStructure,
} from "../types/payroll";
import { MetricCard } from "../components/MetricCard";
import {
  balanceConveyance,
  calculateBdSalaryFromGross,
  DEFAULT_PAYROLL_RULE_CONFIG,
  describePayrollRules,
  deductionsTotal,
  earningsTotal,
  suggestedProvidentFund,
  toSalaryStructurePayload,
} from "../utils/salaryBreakdown";

function emptySalaryForm() {
  return {
    gross: "",
    basic: "",
    houseRent: "",
    medical: "",
    conveyance: "",
    otherAllowances: "",
    providentFund: "",
    advanceAdjustment: "",
    incomeTax: "",
    includePf: false,
    customOverride: false,
  };
}

export function PayrollStructuresPage() {
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [structures, setStructures] = useState<SalaryStructure[]>([]);
  const [payrollSettings, setPayrollSettings] = useState<PayrollSettings>(
    DEFAULT_PAYROLL_RULE_CONFIG,
  );
  const [employeeId, setEmployeeId] = useState("");
  const [salaryForm, setSalaryForm] = useState(emptySalaryForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  async function load() {
    const [employeeRows, structureRows, settings] = await Promise.all([
      api.payrollEmployees(),
      api.salaryStructures(),
      api.payrollSettings(),
    ]);
    setEmployees(employeeRows);
    setStructures(structureRows);
    setPayrollSettings(settings);
    if (!employeeId && employeeRows[0]) setEmployeeId(employeeRows[0].id);
  }

  useEffect(() => {
    load().catch((err: unknown) => {
      setError(
        err instanceof Error ? err.message : "Unable to load structures",
      );
    });
  }, []);

  function applyGrossDefaults(
    grossValue: string,
    opts?: { includePf?: boolean },
  ) {
    const gross = Number(grossValue);
    if (!Number.isFinite(gross) || gross <= 0) return;
    const includePf = opts?.includePf ?? salaryForm.includePf;
    const row = calculateBdSalaryFromGross(gross, payrollSettings);
    const pf = includePf ? suggestedProvidentFund(row.basic) : 0;
    setSalaryForm((prev) => ({
      ...prev,
      gross: String(row.gross),
      basic: String(row.basic),
      houseRent: String(row.houseRent),
      medical: String(row.medical),
      conveyance: String(row.conveyance),
      otherAllowances:
        row.otherAllowances > 0 ? String(row.otherAllowances) : "",
      providentFund: pf > 0 ? String(pf) : "",
      includePf,
      customOverride: false,
    }));
  }

  function patchSalary(
    patch: Partial<ReturnType<typeof emptySalaryForm>>,
    rebalanceConveyance = false,
  ) {
    setSalaryForm((prev) => {
      const next = {
        ...prev,
        ...patch,
        customOverride:
          patch.customOverride ??
          (patch.basic != null ||
          patch.houseRent != null ||
          patch.medical != null ||
          patch.conveyance != null ||
          patch.otherAllowances != null
            ? true
            : prev.customOverride),
      };
      if (rebalanceConveyance) {
        next.conveyance = String(
          balanceConveyance(
            Number(next.gross) || 0,
            Number(next.basic) || 0,
            Number(next.houseRent) || 0,
            Number(next.medical) || 0,
            Number(next.otherAllowances) || 0,
          ),
        );
      }
      return next;
    });
  }

  const salaryPreview = useMemo(() => {
    const breakdown = {
      basic: Number(salaryForm.basic) || 0,
      houseRent: Number(salaryForm.houseRent) || 0,
      medical: Number(salaryForm.medical) || 0,
      conveyance: Number(salaryForm.conveyance) || 0,
      otherAllowances: Number(salaryForm.otherAllowances) || 0,
      providentFund: Number(salaryForm.providentFund) || 0,
      advanceAdjustment: Number(salaryForm.advanceAdjustment) || 0,
      incomeTax: Number(salaryForm.incomeTax) || 0,
    };
    const earn = earningsTotal(breakdown);
    const deduct = deductionsTotal(breakdown);
    const gross = Number(salaryForm.gross) || 0;
    return {
      earn,
      deduct,
      net: Number((earn - deduct).toFixed(2)),
      balanced: Math.abs(earn - gross) < 0.02,
    };
  }, [salaryForm]);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!employeeId) return;
    const gross = Number(salaryForm.gross) || 0;
    const basic = Number(salaryForm.basic) || 0;
    if (gross <= 0 || basic <= 0) {
      setError("Enter gross monthly salary and basic salary");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = toSalaryStructurePayload({
        gross,
        basic,
        houseRent: Number(salaryForm.houseRent) || 0,
        medical: Number(salaryForm.medical) || 0,
        conveyance: Number(salaryForm.conveyance) || 0,
        otherAllowances: Number(salaryForm.otherAllowances) || 0,
        providentFund: Number(salaryForm.providentFund) || 0,
        advanceAdjustment: Number(salaryForm.advanceAdjustment) || 0,
        incomeTax: Number(salaryForm.incomeTax) || 0,
        netPayable: salaryPreview.net,
      });
      await api.upsertSalaryStructure({
        employeeId,
        ...payload,
        customBreakdownApplied: salaryForm.customOverride,
        customOverride: salaryForm.customOverride,
      });
      setModalOpen(false);
      setSalaryForm(emptySalaryForm());
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save salary structure",
      );
    } finally {
      setSaving(false);
    }
  }

  const employeeOptions = employees.map((row) => ({
    value: row.id,
    label: row.name,
  }));

  return (
    <>
      <header className='flex justify-between items-center mb-4'>
        <div className='w-1/3'>
          <h1>Employee salary structures</h1>
        </div>
        <div className='form-actions'>
          <Link className='ghost-link' to='/settings/payroll'>
            Payroll rules
          </Link>
          <Link className='ghost-link' to='/payroll/process'>
            Process payroll
          </Link>
          <button
            type='button'
            onClick={() => {
              setSalaryForm(emptySalaryForm());
              setModalOpen(true);
            }}
          >
            Add salary structure
          </button>
        </div>
      </header>

      <section className='grid metric-card-grid'>
        <MetricCard
          variant='blue'
          title='Structures on file'
          value={structures.length}
        />
      </section>

      <Modal
        open={modalOpen}
        title='Salary structure'
        description='Enter Gross to auto-fill from Payroll Settings. Enable override to edit components.'
        onClose={() => setModalOpen(false)}
        wide
      >
        <form className='stack-form' onSubmit={(e) => void onSave(e)}>
          <div className='name-row'>
            <label>
              Employee
              <Select
                value={employeeId}
                onChange={setEmployeeId}
                options={employeeOptions}
                placeholder='Select employee'
                required
              />
            </label>
            <label>
              Gross monthly salary
              <input
                inputMode='decimal'
                value={salaryForm.gross}
                onChange={(e) => {
                  const value = e.target.value;
                  patchSalary({ gross: value, customOverride: false });
                  applyGrossDefaults(value);
                }}
                placeholder='e.g. 50000'
                required
              />
            </label>
          </div>

          <p className='muted'>
            {describePayrollRules(payrollSettings)}{" "}
            <Link to='/settings/payroll'>Change rules</Link>
          </p>

          <label className='checkbox-row'>
            <input
              type='checkbox'
              checked={salaryForm.customOverride}
              onChange={(e) => {
                const checked = e.target.checked;
                if (!checked && salaryForm.gross) {
                  applyGrossDefaults(salaryForm.gross);
                } else {
                  patchSalary({ customOverride: checked });
                }
              }}
            />
            <span>Custom override (ignore company % for this employee)</span>
          </label>

          <div className='name-row'>
            <label>
              Basic salary
              <input
                inputMode='decimal'
                value={salaryForm.basic}
                onChange={(e) => patchSalary({ basic: e.target.value }, true)}
                disabled={!salaryForm.customOverride}
                required
              />
            </label>
            <label>
              House Rent
              <input
                inputMode='decimal'
                value={salaryForm.houseRent}
                onChange={(e) =>
                  patchSalary({ houseRent: e.target.value }, true)
                }
                disabled={!salaryForm.customOverride}
              />
            </label>
          </div>
          <div className='name-row'>
            <label>
              Medical
              <input
                inputMode='decimal'
                value={salaryForm.medical}
                onChange={(e) => patchSalary({ medical: e.target.value }, true)}
                disabled={!salaryForm.customOverride}
              />
            </label>
            <label>
              Conveyance
              <input
                inputMode='decimal'
                value={salaryForm.conveyance}
                onChange={(e) => patchSalary({ conveyance: e.target.value })}
                disabled={!salaryForm.customOverride}
              />
            </label>
          </div>
          <div className='name-row'>
            <label>
              Other allowances
              <input
                inputMode='decimal'
                value={salaryForm.otherAllowances}
                onChange={(e) =>
                  patchSalary({ otherAllowances: e.target.value }, true)
                }
                disabled={!salaryForm.customOverride}
              />
            </label>
            <button
              type='button'
              className='ghost'
              onClick={() => applyGrossDefaults(salaryForm.gross)}
              disabled={!salaryForm.gross}
            >
              Reset from Gross
            </button>
          </div>

          <h3>Optional deductions</h3>
          <div className='name-row'>
            <label className='checkbox-row'>
              <input
                type='checkbox'
                checked={salaryForm.includePf}
                onChange={(e) => {
                  const checked = e.target.checked;
                  const basic = Number(salaryForm.basic) || 0;
                  patchSalary({
                    includePf: checked,
                    providentFund: checked
                      ? String(suggestedProvidentFund(basic))
                      : "",
                  });
                }}
              />
              <span>Provident Fund (7% of Basic)</span>
            </label>
            <label>
              PF amount
              <input
                inputMode='decimal'
                value={salaryForm.providentFund}
                onChange={(e) =>
                  patchSalary({
                    providentFund: e.target.value,
                    includePf: Number(e.target.value) > 0,
                  })
                }
              />
            </label>
          </div>
          <div className='name-row'>
            <label>
              Advance adjustment
              <input
                inputMode='decimal'
                value={salaryForm.advanceAdjustment}
                onChange={(e) =>
                  patchSalary({ advanceAdjustment: e.target.value })
                }
              />
            </label>
            <label>
              Income Tax (AIT)
              <input
                inputMode='decimal'
                value={salaryForm.incomeTax}
                onChange={(e) => patchSalary({ incomeTax: e.target.value })}
              />
            </label>
          </div>

          <p className='muted'>
            Earnings {money(salaryPreview.earn)}
            {salaryPreview.balanced
              ? ""
              : ` (≠ Gross ${money(Number(salaryForm.gross) || 0)})`}
            {" · "}
            Deductions {money(salaryPreview.deduct)}
            {" · "}
            Net <strong>{money(salaryPreview.net)}</strong>
          </p>

          <div className='form-actions'>
            <button type='submit' disabled={saving || !employeeId}>
              {saving ? "Saving…" : "Save structure"}
            </button>
          </div>
          {error ? <p className='form-error'>{error}</p> : null}
        </form>
      </Modal>

      <section className='table-card'>
        <h2>Salary structures on file</h2>
        <div className='table-wrap'>
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th className='num'>Gross</th>
                <th className='num'>Basic</th>
                <th className='num'>House Rent</th>
                <th className='num'>Medical</th>
                <th className='num'>Conveyance</th>
                <th className='num'>Other</th>
                <th className='num'>Net</th>
                <th>Override</th>
              </tr>
            </thead>
            <tbody>
              {structures.map((row) => (
                <tr key={row.id}>
                  <td>{row.employeeName}</td>
                  <td className='num'>{money(row.grossSalary ?? row.gross)}</td>
                  <td className='num'>
                    {money(row.breakdown?.basicSalary ?? row.basic)}
                  </td>
                  <td className='num'>
                    {money(row.breakdown?.houseRent ?? 0)}
                  </td>
                  <td className='num'>
                    {money(row.breakdown?.medicalAllowance ?? 0)}
                  </td>
                  <td className='num'>
                    {money(row.breakdown?.conveyanceAllowance ?? 0)}
                  </td>
                  <td className='num'>
                    {money(row.breakdown?.otherAllowances ?? 0)}
                  </td>
                  <td className='num'>{money(row.netPayable)}</td>
                  <td>{row.customBreakdownApplied ? "Yes" : "No"}</td>
                </tr>
              ))}
              {structures.length === 0 ? (
                <tr>
                  <td colSpan={9} className='muted'>
                    No salary structures yet
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {!modalOpen && error ? <p className='form-error'>{error}</p> : null}
    </>
  );
}
