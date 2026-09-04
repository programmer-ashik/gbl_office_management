import type { ReactNode, SVGProps } from 'react'

export type NavIconName =
  | 'dashboard'
  | 'chart'
  | 'projects'
  | 'budget'
  | 'site'
  | 'advance'
  | 'settlement'
  | 'approval'
  | 'banking'
  | 'transfer'
  | 'reconcile'
  | 'invoice'
  | 'bill'
  | 'aging'
  | 'procurement'
  | 'inventory'
  | 'vendor'
  | 'employees'
  | 'time'
  | 'payroll'
  | 'reports'
  | 'journal'
  | 'balance'
  | 'accounts'
  | 'cashflow'
  | 'settings'
  | 'profile'
  | 'audit'
  | 'users'
  | 'arap'
  | 'chevron'
  | 'panel'
  | 'logout'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 16, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  )
}

const ICONS: Record<NavIconName, (props: IconProps) => ReactNode> = {
  dashboard: (p) => (
    <Svg {...p}>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </Svg>
  ),
  chart: (p) => (
    <Svg {...p}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 15v-4" />
      <path d="M12 15V8" />
      <path d="M16 15v-6" />
    </Svg>
  ),
  projects: (p) => (
    <Svg {...p}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h10" />
      <path d="M8 4v3" />
      <path d="M16 9v3" />
    </Svg>
  ),
  budget: (p) => (
    <Svg {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 15h3" />
      <path d="M14 15h3" />
    </Svg>
  ),
  site: (p) => (
    <Svg {...p}>
      <path d="M3 21h18" />
      <path d="M5 21V9l7-5 7 5v12" />
      <path d="M9 21v-6h6v6" />
    </Svg>
  ),
  advance: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10" />
      <path d="M9 10h4.5a1.5 1.5 0 0 1 0 3H9" />
      <path d="M9 13h5a1.5 1.5 0 0 1 0 3H9" />
    </Svg>
  ),
  settlement: (p) => (
    <Svg {...p}>
      <path d="M9 11l3 3 8-8" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </Svg>
  ),
  approval: (p) => (
    <Svg {...p}>
      <path d="M12 3l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4L7.5 16.7l.9-5L4.8 8.2l5-.7L12 3z" />
    </Svg>
  ),
  banking: (p) => (
    <Svg {...p}>
      <path d="M3 10l9-6 9 6" />
      <path d="M5 10v8h14v-8" />
      <path d="M3 18h18" />
      <path d="M9 14v4" />
      <path d="M15 14v4" />
    </Svg>
  ),
  transfer: (p) => (
    <Svg {...p}>
      <path d="M7 7h12" />
      <path d="M15 3l4 4-4 4" />
      <path d="M17 17H5" />
      <path d="M9 13l-4 4 4 4" />
    </Svg>
  ),
  reconcile: (p) => (
    <Svg {...p}>
      <path d="M4 7h12" />
      <path d="M4 12h16" />
      <path d="M4 17h10" />
      <path d="M18 5v4" />
      <path d="M16 7h4" />
    </Svg>
  ),
  invoice: (p) => (
    <Svg {...p}>
      <path d="M7 3h8l4 4v14H7V3z" />
      <path d="M15 3v4h4" />
      <path d="M10 12h6" />
      <path d="M10 16h6" />
    </Svg>
  ),
  bill: (p) => (
    <Svg {...p}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
    </Svg>
  ),
  aging: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  ),
  procurement: (p) => (
    <Svg {...p}>
      <path d="M6 7h15l-1.5 8H8L6 7z" />
      <path d="M6 7l-1-3H2" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="17" cy="19" r="1.5" />
    </Svg>
  ),
  inventory: (p) => (
    <Svg {...p}>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </Svg>
  ),
  vendor: (p) => (
    <Svg {...p}>
      <path d="M3 21V8l9-5 9 5v13" />
      <path d="M9 21v-7h6v7" />
      <path d="M9 11h6" />
    </Svg>
  ),
  employees: (p) => (
    <Svg {...p}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M21 20c0-2.5-1.8-4.5-4-5" />
    </Svg>
  ),
  time: (p) => (
    <Svg {...p}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M4 10h16" />
    </Svg>
  ),
  payroll: (p) => (
    <Svg {...p}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 15h4" />
    </Svg>
  ),
  reports: (p) => (
    <Svg {...p}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </Svg>
  ),
  journal: (p) => (
    <Svg {...p}>
      <path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 0-2 2V4z" />
      <path d="M9 9h6" />
      <path d="M9 13h6" />
    </Svg>
  ),
  balance: (p) => (
    <Svg {...p}>
      <path d="M12 3v3" />
      <path d="M5 10h14" />
      <path d="M7 10l-2 10h6" />
      <path d="M17 10l2 10h-6" />
      <path d="M12 7a2 2 0 1 0 0-0.01" />
    </Svg>
  ),
  accounts: (p) => (
    <Svg {...p}>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h10" />
      <circle cx="18" cy="18" r="2" />
    </Svg>
  ),
  cashflow: (p) => (
    <Svg {...p}>
      <path d="M3 17l5-5 4 3 8-9" />
      <path d="M15 6h5v5" />
    </Svg>
  ),
  settings: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
    </Svg>
  ),
  profile: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" />
    </Svg>
  ),
  audit: (p) => (
    <Svg {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
      <path d="M8 11h6" />
      <path d="M11 8v6" />
    </Svg>
  ),
  users: (p) => (
    <Svg {...p}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6" />
      <circle cx="16.5" cy="9.5" r="2.5" />
      <path d="M14 20c.4-2.4 2.2-4.3 4.5-4.8" />
    </Svg>
  ),
  arap: (p) => (
    <Svg {...p}>
      <path d="M4 7h16v10H4z" />
      <path d="M4 11h16" />
      <path d="M8 15h3" />
      <path d="M14 7V5h4v2" />
    </Svg>
  ),
  chevron: (p) => (
    <Svg {...p}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  ),
  panel: (p) => (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </Svg>
  ),
  logout: (p) => (
    <Svg {...p}>
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
      <path d="M15 16l4-4-4-4" />
      <path d="M19 12H9" />
    </Svg>
  ),
}

export function NavIcon({
  name,
  size = 16,
  className,
}: {
  name: NavIconName
  size?: number
  className?: string
}) {
  const render = ICONS[name]
  return <span className={className ?? 'nav-icon'}>{render({ size })}</span>
}
