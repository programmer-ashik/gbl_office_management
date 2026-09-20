import type { ReactNode } from 'react'

export type MetricCardVariant =
  | 'teal'
  | 'blue'
  | 'purple'
  | 'green'
  | 'red'
  | 'amber'

export type MetricChartKind = 'spark' | 'bars' | 'donut' | 'wave' | 'steps'

type MetricCardProps = {
  title: string
  value: ReactNode
  meta?: ReactNode
  variant?: MetricCardVariant
  icon?: ReactNode
  /** Optional tone for the primary figure (inflow/outflow). */
  valueTone?: 'default' | 'up' | 'down'
  /** Override mini-chart style; defaults follow variant. */
  chart?: MetricChartKind | 'none'
  /** Optional explicit series (0–1 or absolute); otherwise derived from value. */
  chartSeries?: number[]
  className?: string
}

const VARIANT_CHART: Record<MetricCardVariant, MetricChartKind> = {
  teal: 'wave',
  blue: 'bars',
  purple: 'donut',
  green: 'spark',
  red: 'spark',
  amber: 'steps',
}

const VARIANT_STROKE: Record<MetricCardVariant, string> = {
  teal: '#99f6e4',
  blue: '#bfdbfe',
  purple: '#e9d5ff',
  green: '#bbf7d0',
  red: '#fecdd3',
  amber: '#fde68a',
}

function parseMetricSeed(value: ReactNode, title: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.abs(value)
  }
  if (typeof value === 'string') {
    const n = Number(value.replace(/[^0-9.-]+/g, ''))
    if (Number.isFinite(n)) return Math.abs(n)
  }
  let hash = 0
  for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return hash % 10_000
}

/** Deterministic mini series so charts feel tied to the metric without extra API data. */
function buildSeries(
  seed: number,
  tone: 'default' | 'up' | 'down',
  count = 7,
): number[] {
  const out: number[] = []
  let x = (seed % 997) / 997
  for (let i = 0; i < count; i += 1) {
    x = (x * 1.37 + 0.17 * Math.sin(seed + i * 1.7)) % 1
    let y = 0.28 + x * 0.62
    if (tone === 'up') y = 0.22 + (i / (count - 1)) * 0.65 + x * 0.12
    if (tone === 'down') y = 0.88 - (i / (count - 1)) * 0.6 + x * 0.1
    out.push(Math.min(0.98, Math.max(0.08, y)))
  }
  return out
}

function normalizeSeries(series: number[]): number[] {
  const max = Math.max(...series.map((n) => Math.abs(n)), 1e-9)
  return series.map((n) => Math.min(1, Math.max(0.06, Math.abs(n) / max)))
}

function MetricMiniChart({
  kind,
  series,
  stroke,
  tone,
}: {
  kind: MetricChartKind
  series: number[]
  stroke: string
  tone: 'default' | 'up' | 'down'
}) {
  const w = 28
  const h = 18
  const pad = 1.5
  const points = series.length ? series : [0.4, 0.55, 0.45, 0.7]

  if (kind === 'donut') {
    const last = points[points.length - 1] ?? 0.65
    const r = 7
    const c = 2 * Math.PI * r
    const filled = c * last
    return (
      <svg
        className="metric-mini-chart"
        viewBox="0 0 28 28"
        width="22"
        height="22"
        aria-hidden
      >
        <circle
          cx="14"
          cy="14"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.28)"
          strokeWidth="3.2"
        />
        <circle
          cx="14"
          cy="14"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c - filled}`}
          transform="rotate(-90 14 14)"
        />
        <circle cx="14" cy="14" r="2.4" fill={stroke} opacity="0.95" />
      </svg>
    )
  }

  const xs = points.map((_, i) =>
    points.length === 1
      ? w / 2
      : pad + (i * (w - pad * 2)) / (points.length - 1),
  )
  const ys = points.map((p) => h - pad - p * (h - pad * 2))
  const line = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i]!.toFixed(1)}`).join(' ')
  const area = `${line} L${xs[xs.length - 1]!.toFixed(1)},${h - pad} L${xs[0]!.toFixed(1)},${h - pad} Z`

  if (kind === 'bars' || kind === 'steps') {
    const gap = kind === 'steps' ? 1.2 : 1.6
    const barW = Math.max(1.6, (w - pad * 2 - gap * (points.length - 1)) / points.length)
    return (
      <svg
        className="metric-mini-chart"
        viewBox={`0 0 ${w} ${h}`}
        width="26"
        height="16"
        aria-hidden
      >
        {points.map((p, i) => {
          const bh = Math.max(2, p * (h - pad * 2))
          const x = pad + i * (barW + gap)
          const y = h - pad - bh
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barW}
              height={bh}
              rx={kind === 'steps' ? 0.6 : 1.2}
              fill={stroke}
              opacity={0.55 + p * 0.45}
            />
          )
        })}
      </svg>
    )
  }

  // spark / wave
  return (
    <svg
      className="metric-mini-chart"
      viewBox={`0 0 ${w} ${h}`}
      width="26"
      height="16"
      aria-hidden
    >
      {kind === 'wave' ? (
        <path d={area} fill={stroke} opacity="0.28" />
      ) : null}
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.95"
      />
      <circle
        cx={xs[xs.length - 1]}
        cy={ys[ys.length - 1]}
        r="1.7"
        fill="#fff"
        stroke={stroke}
        strokeWidth="1"
      />
      {tone === 'up' || tone === 'down' ? (
        <path
          d={
            tone === 'up'
              ? `M${w - 6} ${h - 5} l3 -4 3 4`
              : `M${w - 6} ${4} l3 4 3 -4`
          }
          fill="none"
          stroke={stroke}
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.7"
        />
      ) : null}
    </svg>
  )
}

/**
 * Presentational metric card — styling only.
 * Callers keep ownership of values, links, and click handlers.
 * Includes a compact color-matched mini chart (badge) that does not grow the card.
 */
export function MetricCard({
  title,
  value,
  meta,
  variant = 'blue',
  icon,
  valueTone = 'default',
  chart,
  chartSeries,
  className,
}: MetricCardProps) {
  const toneClass =
    valueTone === 'up'
      ? 'metric-card-value is-up'
      : valueTone === 'down'
        ? 'metric-card-value is-down'
        : 'metric-card-value'

  const kind = chart === 'none' ? null : chart ?? VARIANT_CHART[variant]
  const seed = parseMetricSeed(value, title)
  const series = chartSeries?.length
    ? normalizeSeries(chartSeries)
    : buildSeries(seed, valueTone)

  return (
    <article
      className={`metric-card metric-card--${variant}${className ? ` ${className}` : ''}`}
    >
      <header className="metric-card-banner">
        <h3 className="metric-card-title">{title}</h3>
        <span className="metric-card-badge" aria-hidden>
          {icon ??
            (kind ? (
              <MetricMiniChart
                kind={kind}
                series={series}
                stroke={VARIANT_STROKE[variant]}
                tone={valueTone}
              />
            ) : (
              '◆'
            ))}
        </span>
      </header>
      <div className="metric-card-body">
        {kind && kind !== 'donut' ? (
          <div className="metric-card-spark" aria-hidden>
            <MetricMiniChart
              kind={kind === 'bars' || kind === 'steps' ? kind : 'wave'}
              series={series}
              stroke={
                variant === 'green'
                  ? '#34d399'
                  : variant === 'red'
                    ? '#fb7185'
                    : variant === 'amber'
                      ? '#fbbf24'
                      : variant === 'teal'
                        ? '#2dd4bf'
                        : variant === 'purple'
                          ? '#c084fc'
                          : '#60a5fa'
              }
              tone={valueTone}
            />
          </div>
        ) : null}
        <p className={toneClass}>{value}</p>
        {meta ? <div className="metric-card-meta">{meta}</div> : null}
      </div>
    </article>
  )
}
