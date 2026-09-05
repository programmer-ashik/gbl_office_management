import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { MetricCard } from '../components/MetricCard'
import { useTheme, type UiTheme } from '../theme/ThemeContext'
import { Role } from '../types/auth'

const OPTIONS: Array<{
  id: UiTheme
  title: string
  description: string
}> = [
  {
    id: 'classic',
    title: 'Classic',
    description:
      'Banking-style navy & paper surfaces. Calm borders, restrained accents.',
  },
  {
    id: 'colorful',
    title: 'Colorful',
    description:
      'Vibrant metric banners, solid table headers, and richer focus states across the app.',
  },
]

const FONT_SIZES = [
  { value: '12px', label: '12px · Compact' },
  { value: '13px', label: '13px · Default' },
  { value: '14px', label: '14px · Comfortable' },
  { value: '15px', label: '15px · Large' },
  { value: '16px', label: '16px · Extra large' },
]

function AppearanceSettingsInner() {
  const {
    theme,
    setTheme,
    tableHeader,
    setTableHeader,
    resetTableHeader,
  } = useTheme()
  const { user } = useAuth()

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>Appearance</h1>
          <p className="muted">
            Theme, table headers, and form look. Managed under Voucher Template.
          </p>
        </div>
      </header>

      <section className="theme-picker-grid">
        {OPTIONS.map((option) => {
          const selected = theme === option.id
          return (
            <button
              key={option.id}
              type="button"
              className={
                selected
                  ? 'theme-picker-card is-selected'
                  : 'theme-picker-card'
              }
              onClick={() => setTheme(option.id)}
            >
              <div
                className={`theme-picker-swatch theme-picker-swatch--${option.id}`}
                aria-hidden
              />
              <div className="theme-picker-copy">
                <strong>{option.title}</strong>
                <span className="muted">{option.description}</span>
                {selected ? (
                  <span className="theme-picker-active">Active</span>
                ) : null}
              </div>
            </button>
          )
        })}
      </section>

      <section className="table-card theme-preview-block">
        <div className="table-head">
          <h2>Table header style</h2>
          <p className="muted">
            Applies to every data table across the app (Admin only)
          </p>
        </div>
        <div className="theme-table-controls">
          <label>
            Header background
            <input
              type="color"
              value={tableHeader.bg}
              onChange={(e) => setTableHeader({ bg: e.target.value })}
            />
          </label>
          <label>
            Header text color
            <input
              type="color"
              value={tableHeader.color}
              onChange={(e) => setTableHeader({ color: e.target.value })}
            />
          </label>
          <label>
            Header text size
            <select
              value={tableHeader.fontSize}
              onChange={(e) => setTableHeader({ fontSize: e.target.value })}
            >
              {FONT_SIZES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <div className="theme-table-controls-actions">
            <button type="button" className="ghost" onClick={resetTableHeader}>
              Reset headers
            </button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Debit</th>
              <th>Credit</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1111 · Petty Cash</td>
              <td>150,000</td>
              <td></td>
            </tr>
            <tr>
              <td>3100 · Capital</td>
              <td></td>
              <td>150,000</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="table-card theme-preview-block">
        <div className="table-head">
          <h2>Live preview</h2>
          <p className="muted">Sample cards and form fields</p>
        </div>
        <div className="grid metric-card-grid theme-preview-cards">
          <MetricCard variant="teal" title="Cash sample" value="৳ 1,50,000" />
          <MetricCard
            variant="green"
            title="Inflow sample"
            value="৳ 85,000"
            valueTone="up"
          />
          <MetricCard
            variant="red"
            title="Outflow sample"
            value="৳ 42,000"
            valueTone="down"
          />
        </div>
        <div className="theme-preview-form">
          <label>
            Sample input
            <input defaultValue="GBL Enterprise" readOnly />
          </label>
          <label>
            Sample field
            <input defaultValue="Theme preview" readOnly />
          </label>
        </div>
      </section>

      {user?.role === Role.ADMIN ? (
        <p className="muted">
          Preferences are stored in this browser. Open{' '}
          <Link to="/settings/profile">Profile</Link> for account details.
        </p>
      ) : null}
    </>
  )
}

export function AppearanceSettingsPage() {
  return <AppearanceSettingsInner />
}
