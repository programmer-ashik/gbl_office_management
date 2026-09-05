import type { ReactNode } from 'react'

export type MetricCardVariant =
  | 'teal'
  | 'blue'
  | 'purple'
  | 'green'
  | 'red'
  | 'amber'

type MetricCardProps = {
  title: string
  value: ReactNode
  meta?: ReactNode
  variant?: MetricCardVariant
  icon?: ReactNode
  /** Optional tone for the primary figure (inflow/outflow). */
  valueTone?: 'default' | 'up' | 'down'
  className?: string
}

const VARIANT_ICON: Record<MetricCardVariant, string> = {
  teal: '৳',
  blue: '◆',
  purple: '◈',
  green: '↗',
  red: '↘',
  amber: '▣',
}

/**
 * Presentational metric card — styling only.
 * Callers keep ownership of values, links, and click handlers.
 */
export function MetricCard({
  title,
  value,
  meta,
  variant = 'blue',
  icon,
  valueTone = 'default',
  className,
}: MetricCardProps) {
  const toneClass =
    valueTone === 'up'
      ? 'metric-card-value is-up'
      : valueTone === 'down'
        ? 'metric-card-value is-down'
        : 'metric-card-value'

  return (
    <article
      className={`metric-card metric-card--${variant}${className ? ` ${className}` : ''}`}
    >
      <header className="metric-card-banner">
        <h3 className="metric-card-title">{title}</h3>
        <span className="metric-card-badge" aria-hidden>
          {icon ?? VARIANT_ICON[variant]}
        </span>
      </header>
      <div className="metric-card-body">
        <p className={toneClass}>{value}</p>
        {meta ? <div className="metric-card-meta">{meta}</div> : null}
      </div>
    </article>
  )
}
