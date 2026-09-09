import { Role } from '../types/auth'
import type { NavIconName } from './icons'

export type NavItem = {
  label: string
  to: string
  end?: boolean
  hint?: string
  icon: NavIconName
  roles: Role[]
  /** Nested submenu items (e.g. Voucher Template → BS / JV). */
  children?: NavItem[]
}

export type NavSection = {
  id: string
  label: string
  icon: NavIconName
  roles: Role[]
  defaultOpen?: boolean
  items: NavItem[]
}

const ALL: Role[] = [
  Role.ADMIN,
  Role.ACCOUNTANT,
  Role.PROJECT_MANAGER,
  Role.EMPLOYEE,
]
const FINANCE: Role[] = [Role.ADMIN, Role.ACCOUNTANT]
const PROJECT_VIEW: Role[] = [
  Role.ADMIN,
  Role.ACCOUNTANT,
  Role.PROJECT_MANAGER,
]
const APPROVALS: Role[] = [
  Role.ADMIN,
  Role.ACCOUNTANT,
  Role.PROJECT_MANAGER,
]

/** Enterprise navigation — every submenu has a unique route. */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'dashboard',
    label: 'Dashboard & Analytics',
    icon: 'dashboard',
    roles: ALL,
    defaultOpen: true,
    items: [
      {
        label: 'Executive Overview',
        to: '/',
        end: true,
        icon: 'dashboard',
        hint: 'Admin / MD',
        roles: ALL,
      },
      {
        label: 'Project Financials',
        to: '/analytics/project-financials',
        icon: 'chart',
        hint: 'Burn rate & KPIs',
        roles: PROJECT_VIEW,
      },
    ],
  },
  {
    id: 'projects',
    label: 'Projects & Budgeting',
    icon: 'projects',
    roles: ALL,
    items: [
      {
        label: 'All Projects',
        to: '/projects',
        end: true,
        icon: 'projects',
        hint: 'List · Status · Profitability',
        roles: PROJECT_VIEW,
      },
      {
        label: 'Project Budgets',
        to: '/projects/budgets',
        icon: 'budget',
        hint: 'Budget vs actual',
        roles: PROJECT_VIEW,
      },
      {
        label: 'Site & Material View',
        to: '/projects/sites',
        icon: 'site',
        hint: 'Site · Material mapping',
        roles: PROJECT_VIEW,
      },
      {
        label: 'Quotations',
        to: '/quotations',
        end: true,
        icon: 'invoice',
        hint: 'Create · Audit · PDF',
        roles: ALL,
      },
    ],
  },
  {
    id: 'advances',
    label: 'Advance & Expense',
    icon: 'advance',
    roles: ALL,
    items: [
      {
        label: 'Advance Requisitions',
        to: '/advances',
        end: true,
        icon: 'advance',
        hint: 'Request · Filter',
        roles: ALL,
      },
      {
        label: 'Expense Settlements',
        to: '/advances/settlements',
        icon: 'settlement',
        hint: 'Voucher · Case A/B/C',
        roles: ALL,
      },
      {
        label: 'Approval Queue',
        to: '/approvals',
        icon: 'approval',
        hint: 'Multi-level review',
        roles: APPROVALS,
      },
    ],
  },
  {
    id: 'banking',
    label: 'Banking & Cash',
    icon: 'banking',
    roles: FINANCE,
    items: [
      {
        label: 'Accounts & Wallets',
        to: '/banking',
        end: true,
        icon: 'banking',
        hint: 'Banks · Cash · Mobile',
        roles: FINANCE,
      },
      {
        label: 'Internal Transfers',
        to: '/banking/transfers',
        icon: 'transfer',
        hint: 'Cash-in / deposits',
        roles: FINANCE,
      },
      {
        label: 'Bank Reconciliation',
        to: '/banking/reconciliation',
        icon: 'reconcile',
        hint: 'Statement · Match · Adjust',
        roles: FINANCE,
      },
    ],
  },
  {
    id: 'arap',
    label: 'Payables & Receivables',
    icon: 'arap',
    roles: FINANCE,
    items: [
      {
        label: 'Client Invoices (AR)',
        to: '/receivables',
        icon: 'invoice',
        hint: 'Milestone · Collections',
        roles: FINANCE,
      },
      {
        label: 'Supplier Bills (AP)',
        to: '/payables',
        icon: 'bill',
        hint: 'Purchases · Payments',
        roles: FINANCE,
      },
      {
        label: 'Aging Reports',
        to: '/aging',
        icon: 'aging',
        hint: '30 / 60 / 90+ days',
        roles: FINANCE,
      },
    ],
  },
  {
    id: 'procurement',
    label: 'Procurement & Inventory',
    icon: 'procurement',
    roles: PROJECT_VIEW,
    items: [
      {
        label: 'Purchase Orders',
        to: '/procurement',
        end: true,
        icon: 'procurement',
        hint: 'Issuance · Tracking',
        roles: PROJECT_VIEW,
      },
      {
        label: 'Product Catalog',
        to: '/procurement/catalog',
        icon: 'inventory',
        hint: 'Categories · Products',
        roles: PROJECT_VIEW,
      },
      {
        label: 'Material Allocation',
        to: '/inventory',
        icon: 'inventory',
        hint: 'Site · Warehouse',
        roles: PROJECT_VIEW,
      },
      {
        label: 'Vendor Directory',
        to: '/procurement/vendors',
        icon: 'vendor',
        hint: 'Suppliers · Ledgers',
        roles: PROJECT_VIEW,
      },
    ],
  },
  {
    id: 'payroll',
    label: 'Payroll & Human Resources',
    icon: 'payroll',
    roles: FINANCE,
    items: [
      {
        label: 'Employee Directory',
        to: '/employees',
        icon: 'employees',
        hint: 'Staff profiles',
        roles: FINANCE,
      },
      {
        label: 'Attendance & Time',
        to: '/payroll/time',
        icon: 'time',
        hint: 'Labor · Allocation',
        roles: FINANCE,
      },
      {
        label: 'Salary Structures',
        to: '/payroll/structures',
        icon: 'payroll',
        hint: 'Gross · Breakdown',
        roles: FINANCE,
      },
      {
        label: 'Process Payroll',
        to: '/payroll/process',
        icon: 'payroll',
        hint: 'Accrue · Disburse',
        roles: FINANCE,
      },
    ],
  },
  {
    id: 'reporting',
    label: 'Financial Reporting',
    icon: 'reports',
    roles: FINANCE,
    items: [
      {
        label: 'Journal Register',
        to: '/reports',
        icon: 'reports',
        hint: 'Full report suite',
        roles: FINANCE,
      },
      {
        label: 'Journals',
        to: '/journals',
        icon: 'journal',
        hint: 'Post · Draft · Reverse',
        roles: FINANCE,
      },
      {
        label: 'General Ledger',
        to: '/ledgers',
        icon: 'accounts',
        hint: 'Account inquiry',
        roles: FINANCE,
      },
      {
        label: 'Customers (AR)',
        to: '/customers',
        icon: 'invoice',
        hint: 'Receivable parties',
        roles: FINANCE,
      },
      {
        label: 'Trial Balance',
        to: '/trial-balance',
        icon: 'balance',
        hint: 'Debit · Credit check',
        roles: FINANCE,
      },
      {
        label: 'Balance Sheet',
        to: '/balance-sheet',
        icon: 'balance',
        hint: 'Statement of position',
        roles: FINANCE,
      },
      {
        label: 'Chart of Accounts',
        to: '/accounts',
        icon: 'accounts',
        hint: 'General ledger heads',
        roles: FINANCE,
      },
      {
        label: 'Cash Flow & Burn Rate',
        to: '/analytics/cash-flow',
        icon: 'cashflow',
        hint: 'Forecasts · Analytics',
        roles: FINANCE,
      },
    ],
  },
  {
    id: 'settings',
    label: 'System Settings',
    icon: 'settings',
    roles: ALL,
    items: [
      {
        label: 'Profile',
        to: '/settings/profile',
        icon: 'profile',
        hint: 'Account · Session',
        roles: ALL,
      },
      {
        label: 'Chart of Accounts',
        to: '/settings/accounts',
        icon: 'accounts',
        hint: 'Double-entry CoA',
        roles: FINANCE,
      },
      {
        label: 'Payroll Rules',
        to: '/settings/payroll',
        icon: 'payroll',
        hint: 'Salary % · Allowances',
        roles: FINANCE,
      },
      {
        label: 'Approvals Engine',
        to: '/settings/approvals',
        icon: 'approval',
        hint: 'Workflows',
        roles: APPROVALS,
      },
      {
        label: 'User Roles & Staff',
        to: '/settings/users',
        icon: 'users',
        hint: 'RBAC directory',
        roles: [Role.ADMIN, Role.ACCOUNTANT],
      },
      {
        label: 'Audit Trail',
        to: '/settings/audit',
        icon: 'audit',
        hint: 'Security · History',
        roles: FINANCE,
      },
      {
        label: 'Voucher Template',
        to: '/settings/templates/balance-sheet',
        icon: 'reports',
        hint: 'PDF · Layout · Appearance',
        roles: [Role.ADMIN],
        children: [
          {
            label: 'Appearance',
            to: '/settings/appearance',
            icon: 'settings',
            hint: 'Theme · Table headers',
            roles: [Role.ADMIN],
          },
          {
            label: 'BS Template',
            to: '/settings/templates/balance-sheet',
            icon: 'balance',
            hint: 'Balance sheet layout',
            roles: [Role.ADMIN],
          },
          {
            label: 'Journal Voucher Template',
            to: '/settings/templates/journal-voucher',
            icon: 'journal',
            hint: 'JV PDF layout',
            roles: [Role.ADMIN],
          },
        ],
      },
    ],
  },
]

export function sectionsForRole(role: Role): NavSection[] {
  return NAV_SECTIONS.filter((section) => section.roles.includes(role))
    .map((section) => ({
      ...section,
      items: section.items
        .filter((item) => item.roles.includes(role))
        .map((item) =>
          item.children
            ? {
                ...item,
                children: item.children.filter((child) =>
                  child.roles.includes(role),
                ),
              }
            : item,
        ),
    }))
    .filter((section) => section.items.length > 0)
}

const COLLAPSED_KEY = 'gbl.sidebar.railCollapsed'
const OPEN_SECTION_KEY = 'gbl.sidebar.openSection'

export function readRailCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export function writeRailCollapsed(value: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

/** Accordion: at most one section id open. */
export function readOpenSectionId(role: Role): string | null {
  const sections = sectionsForRole(role)
  const preferred = sections.find((section) => section.defaultOpen)?.id ?? sections[0]?.id ?? null
  try {
    const raw = localStorage.getItem(OPEN_SECTION_KEY)
    if (raw && sections.some((section) => section.id === raw)) return raw
    return preferred
  } catch {
    return preferred
  }
}

export function writeOpenSectionId(id: string | null): void {
  try {
    if (id) localStorage.setItem(OPEN_SECTION_KEY, id)
    else localStorage.removeItem(OPEN_SECTION_KEY)
  } catch {
    /* ignore */
  }
}
