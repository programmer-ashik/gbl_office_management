/** Lightweight route-change placeholder — presentational only. */
export function PageSkeleton() {
  return (
    <div className="page-skeleton" aria-hidden>
      <div className="page-skeleton-header">
        <div className="page-skeleton-line page-skeleton-title" />
        <div className="page-skeleton-line page-skeleton-sub" />
      </div>
      <div className="page-skeleton-metrics">
        <div className="page-skeleton-card" />
        <div className="page-skeleton-card" />
        <div className="page-skeleton-card" />
      </div>
      <div className="page-skeleton-panel">
        <div className="page-skeleton-line page-skeleton-row" />
        <div className="page-skeleton-line page-skeleton-row" />
        <div className="page-skeleton-line page-skeleton-row" />
        <div className="page-skeleton-line page-skeleton-row is-short" />
      </div>
    </div>
  )
}
