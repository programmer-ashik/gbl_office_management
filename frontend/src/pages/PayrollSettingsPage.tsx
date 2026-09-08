import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { MetricCard } from '../components/MetricCard'
import { Select } from '../components/ui'
import { Role } from '../types/auth'
import type { PayrollSettings } from '../types/payroll'
import {
  calculateBdSalaryFromGross,
  ConveyanceType,
  DEFAULT_PAYROLL_RULE_CONFIG,
  describePayrollRules,
  MedicalAllowanceType,
} from '../utils/salaryBreakdown'
import { money } from '../types/accounting'

const MEDICAL_TYPE_OPTIONS = [
  {
    value: MedicalAllowanceType.FIXED_AMOUNT,
    label: 'Fixed amount (BDT)',
  },
  {
    value: MedicalAllowanceType.PERCENT_OF_BASIC,
    label: 'Percent of Basic',
  },
]

const CONVEYANCE_TYPE_OPTIONS = [
  {
    value: ConveyanceType.REMAINING_BALANCE,
    label: 'Remaining balance of Gross',
  },
  {
    value: ConveyanceType.FIXED_AMOUNT,
    label: 'Fixed amount (BDT)',
  },
]

function toForm(settings: PayrollSettings) {
  return {
    basicPercentOfGross: String(settings.basicPercentOfGross),
    houseRentPercentOfBasic: String(settings.houseRentPercentOfBasic),
    medicalType: settings.medicalType,
    medicalValue: String(settings.medicalValue),
    conveyanceType: settings.conveyanceType,
    conveyanceValue: String(settings.conveyanceValue),
  }
}

export function PayrollSettingsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === Role.ADMIN
  const [form, setForm] = useState(toForm(DEFAULT_PAYROLL_RULE_CONFIG))
  const [previewGross, setPreviewGross] = useState('50000')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .payrollSettings()
      .then((row) => setForm(toForm(row)))
      .catch((err: unknown) => {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load payroll settings',
        )
      })
      .finally(() => setLoading(false))
  }, [])

  const config: PayrollSettings = useMemo(
    () => ({
      basicPercentOfGross: Number(form.basicPercentOfGross) || 0,
      houseRentPercentOfBasic: Number(form.houseRentPercentOfBasic) || 0,
      medicalType: form.medicalType,
      medicalValue: Number(form.medicalValue) || 0,
      conveyanceType: form.conveyanceType,
      conveyanceValue: Number(form.conveyanceValue) || 0,
    }),
    [form],
  )

  const preview = useMemo(() => {
    const gross = Number(previewGross) || 0
    return calculateBdSalaryFromGross(gross, config)
  }, [config, previewGross])

  async function onSave(event: FormEvent) {
    event.preventDefault()
    if (!isAdmin) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const saved = await api.updatePayrollSettings(config)
      setForm(toForm(saved))
      setMessage('Payroll percentage rules saved')
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to save payroll settings',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Payroll percentage rules</h1>
          <p className="muted">
            Company-wide salary breakdown. Used when building employee salary
            structures from Gross. Does not change Chart of Accounts or journal
            posting logic.
          </p>
        </div>
        <div className="form-actions">
          <Link className="ghost-link" to="/payroll/process">
            Back to payroll
          </Link>
        </div>
      </header>

      <section className="grid metric-card-grid">
        <MetricCard
          variant="blue"
          title="Basic of Gross"
          value={`${config.basicPercentOfGross}%`}
        />
        <MetricCard
          variant="teal"
          title="House Rent of Basic"
          value={`${config.houseRentPercentOfBasic}%`}
        />
        <MetricCard
          variant="purple"
          title="Medical"
          value={
            config.medicalType === MedicalAllowanceType.PERCENT_OF_BASIC
              ? `${config.medicalValue}%`
              : money(config.medicalValue)
          }
        />
      </section>

      {loading ? <p className="muted">Loading…</p> : null}

      <section className="table-card">
        <form className="stack-form" onSubmit={(e) => void onSave(e)}>
          <div className="name-row">
            <label>
              Basic % of Gross
              <input
                inputMode="decimal"
                value={form.basicPercentOfGross}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    basicPercentOfGross: e.target.value,
                  }))
                }
                disabled={!isAdmin}
                required
              />
            </label>
            <label>
              House Rent % of Basic
              <input
                inputMode="decimal"
                value={form.houseRentPercentOfBasic}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    houseRentPercentOfBasic: e.target.value,
                  }))
                }
                disabled={!isAdmin}
                required
              />
            </label>
          </div>

          <div className="name-row">
            <label>
              Medical type
              <Select
                value={form.medicalType}
                disabled={!isAdmin}
                options={MEDICAL_TYPE_OPTIONS}
                onChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    medicalType: value as PayrollSettings['medicalType'],
                    medicalValue:
                      value === MedicalAllowanceType.PERCENT_OF_BASIC
                        ? prev.medicalValue === '2500'
                          ? '10'
                          : prev.medicalValue
                        : prev.medicalValue === '10'
                          ? '2500'
                          : prev.medicalValue,
                  }))
                }
              />
            </label>
            <label>
              Medical value
              <input
                inputMode="decimal"
                value={form.medicalValue}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    medicalValue: e.target.value,
                  }))
                }
                disabled={!isAdmin}
                required
              />
            </label>
          </div>

          <div className="name-row">
            <label>
              Conveyance type
              <Select
                value={form.conveyanceType}
                disabled={!isAdmin}
                options={CONVEYANCE_TYPE_OPTIONS}
                onChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    conveyanceType: value as PayrollSettings['conveyanceType'],
                    conveyanceValue:
                      value === ConveyanceType.REMAINING_BALANCE
                        ? '0'
                        : prev.conveyanceValue || '0',
                  }))
                }
              />
            </label>
            <label>
              Conveyance value
              <input
                inputMode="decimal"
                value={form.conveyanceValue}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    conveyanceValue: e.target.value,
                  }))
                }
                disabled={
                  !isAdmin ||
                  form.conveyanceType === ConveyanceType.REMAINING_BALANCE
                }
              />
            </label>
          </div>

          <p className="muted">{describePayrollRules(config)}</p>

          {!isAdmin ? (
            <p className="muted">Only Admin can change these rules.</p>
          ) : (
            <div className="form-actions">
              <button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save payroll rules'}
              </button>
            </div>
          )}
          {message ? <p className="muted">{message}</p> : null}
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </section>

      <section className="table-card">
        <div className="table-head">
          <h2>Live preview</h2>
          <p className="muted">Does not save an employee structure</p>
        </div>
        <div className="name-row">
          <label>
            Sample Gross
            <input
              inputMode="decimal"
              value={previewGross}
              onChange={(e) => setPreviewGross(e.target.value)}
            />
          </label>
        </div>
        <div className="table-wrap mt-4">
          <table>
            <thead>
              <tr>
                <th>Component</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Basic</td>
                <td className="num">{money(preview.basic)}</td>
              </tr>
              <tr>
                <td>House Rent</td>
                <td className="num">{money(preview.houseRent)}</td>
              </tr>
              <tr>
                <td>Medical</td>
                <td className="num">{money(preview.medical)}</td>
              </tr>
              <tr>
                <td>Conveyance</td>
                <td className="num">{money(preview.conveyance)}</td>
              </tr>
              <tr>
                <td>Other</td>
                <td className="num">{money(preview.otherAllowances)}</td>
              </tr>
              <tr>
                <td>
                  <strong>Gross</strong>
                </td>
                <td className="num">
                  <strong>{money(preview.gross)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
