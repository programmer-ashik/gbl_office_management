import { useLayoutEffect, useRef, useState } from 'react'
import { money } from '../types/accounting'
import type { CashFlowWeek } from '../types/analytics'

type Props = {
  weeks: CashFlowWeek[]
  openingCash: number
}

const HEIGHT = 300
const PAD = { top: 16, right: 16, bottom: 40, left: 64 }

const compact = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** Rounded axis ticks covering [min, max]. */
function niceTicks(min: number, max: number, count = 5): number[] {
  const raw = (max - min || 1) / count
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ??
    10 * magnitude
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let value = lo; value <= hi + step / 2; value += step) {
    ticks.push(Number(value.toFixed(6)))
  }
  return ticks
}

/** Weekly inflow vs outflow bars with the net as a line. */
export function CashFlowChart({ weeks, openingCash }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)
  const [active, setActive] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(320, Math.floor(entry.contentRect.width)))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  if (weeks.length === 0) {
    return (
      <div className="cf-chart" ref={wrapRef}>
        <p className="muted">No forecast weeks yet.</p>
      </div>
    )
  }

  const plotW = width - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const ticks = niceTicks(
    Math.min(0, ...weeks.map((week) => week.net)),
    Math.max(1, ...weeks.flatMap((week) => [week.inflow, week.outflow, week.net])),
  )
  const lo = ticks[0]!
  const hi = ticks[ticks.length - 1]!
  const y = (value: number) => PAD.top + ((hi - value) / (hi - lo)) * plotH
  const band = plotW / weeks.length
  const barW = Math.max(4, Math.min(26, band * 0.3))
  const centerX = (index: number) => PAD.left + band * index + band / 2
  const zeroY = y(0)

  let balance = openingCash
  const balances = weeks.map((week) => (balance += week.net))
  const netPath = weeks
    .map((week, index) => `${index === 0 ? 'M' : 'L'}${centerX(index)},${y(week.net)}`)
    .join(' ')
  const activeWeek = active === null ? null : weeks[active]
  const labelEvery = band < 56 ? 2 : 1

  return (
    <div className="cf-chart" ref={wrapRef}>
      <div className="cf-legend" aria-hidden>
        <span>
          <i className="cf-swatch cf-swatch-in" /> Inflow
        </span>
        <span>
          <i className="cf-swatch cf-swatch-out" /> Outflow
        </span>
        <span>
          <i className="cf-swatch cf-swatch-net" /> Net
        </span>
      </div>
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label="Weekly cash inflow and outflow forecast"
        onMouseLeave={() => setActive(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              className={tick === 0 ? 'cf-axis' : 'cf-grid'}
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text className="cf-tick" x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">
              {compact.format(tick)}
            </text>
          </g>
        ))}

        {weeks.map((week, index) => {
          const cx = centerX(index)
          return (
            <g key={week.weekStart}>
              {active === index ? (
                <rect
                  className="cf-hover-band"
                  x={PAD.left + band * index}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                />
              ) : null}
              <rect
                className="cf-bar-in"
                x={cx - barW - 1}
                y={y(week.inflow)}
                width={barW}
                height={Math.max(0, zeroY - y(week.inflow))}
                rx={3}
              />
              <rect
                className="cf-bar-out"
                x={cx + 1}
                y={y(week.outflow)}
                width={barW}
                height={Math.max(0, zeroY - y(week.outflow))}
                rx={3}
              />
              {index % labelEvery === 0 ? (
                <text className="cf-label" x={cx} y={HEIGHT - PAD.bottom + 18} textAnchor="middle">
                  {week.weekLabel}
                </text>
              ) : null}
            </g>
          )
        })}

        <path className="cf-net-line" d={netPath} />
        {weeks.map((week, index) => (
          <circle
            key={week.weekStart}
            className={week.net < 0 ? 'cf-net-dot is-negative' : 'cf-net-dot'}
            cx={centerX(index)}
            cy={y(week.net)}
            r={active === index ? 5 : 3.5}
          />
        ))}

        {weeks.map((week, index) => (
          <rect
            key={week.weekStart}
            className="cf-hit"
            x={PAD.left + band * index}
            y={PAD.top}
            width={band}
            height={plotH + PAD.bottom}
            onMouseEnter={() => setActive(index)}
            onClick={() => setActive(index)}
          />
        ))}
      </svg>

      {activeWeek && active !== null ? (
        <div
          className="cf-tooltip"
          style={{
            left: Math.min(Math.max(centerX(active), 90), width - 90),
            top: PAD.top,
          }}
        >
          <strong>{activeWeek.weekLabel}</strong>
          <span className="cf-tip-row">
            <i className="cf-swatch cf-swatch-in" /> In
            <b>{money(activeWeek.inflow)}</b>
          </span>
          <span className="cf-tip-row">
            <i className="cf-swatch cf-swatch-out" /> Out
            <b>{money(activeWeek.outflow)}</b>
          </span>
          <span className="cf-tip-row">
            <i className="cf-swatch cf-swatch-net" /> Net
            <b className={activeWeek.net < 0 ? 'loss' : 'gain'}>{money(activeWeek.net)}</b>
          </span>
          <span className="cf-tip-row cf-tip-balance">
            Projected cash
            <b className={balances[active]! < 0 ? 'loss' : undefined}>
              {money(balances[active]!)}
            </b>
          </span>
        </div>
      ) : null}
    </div>
  )
}
