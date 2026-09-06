import type {
  Account,
  AccountLedger,
  Customer,
  JournalEntry,
  JournalSummary,
  JournalWriteBody,
  BalanceSheetReport,
  TrialBalance,
} from '../types/accounting'
import type {
  AgingReport,
  ClientInvoice,
  InvoiceCollection,
  OverdueNotice,
  SupplierBill,
  SupplierPayment,
  VendorLedger,
} from '../types/ar-ap'
import type {
  ApprovalRequest,
  AuditLog,
  OcrScanResult,
} from '../types/governance'
import type {
  Advance,
  AdvanceProjectOption,
  EmployeeLedgerReport,
  ExpenseAccountOption,
} from '../types/advance'
import type { ApiError, ApiSuccess, AuthResult, HealthStatus, PublicUser, Role } from '../types/auth'
import type {
  FundTransfer,
  Reconciliation,
  TreasuryAccount,
  TreasuryKind,
} from '../types/banking'
import type { CreateProjectBody, Project, ProjectStatus } from '../types/project'
import type {
  PayrollEmployee,
  PayrollRun,
  SalaryStructure,
  TimeLog,
} from '../types/payroll'
import type {
  BurnRateRow,
  CashFlowForecast,
  FinancialStatements,
} from '../types/analytics'
import type { BalanceSheetTemplate } from '../types/report-template'
import type {
  Item,
  PurchaseOrder,
  StockIssue,
  StockRow,
  Supplier,
  Warehouse,
} from '../types/procurement'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api/v1'

const TOKEN_KEY = 'gbl.accessToken'

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setAccessToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

class ApiRequestError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
  }
}

let refreshInFlight: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  if (refreshInFlight) {
    return refreshInFlight
  }

  refreshInFlight = (async () => {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    })
    if (!res.ok) {
      setAccessToken(null)
      return false
    }
    const json = (await res.json()) as ApiSuccess<AuthResult>
    setAccessToken(json.data.tokens.accessToken)
    return true
  })().finally(() => {
    refreshInFlight = null
  })

  return refreshInFlight
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getAccessToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })

  const json = (await res.json()) as ApiSuccess<T> | ApiError

  if (res.status === 401 && retry && !path.startsWith('/auth/login') && !path.startsWith('/auth/signup')) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      return request<T>(path, options, false)
    }
  }

  if (!res.ok || json.success === false) {
    const message = 'message' in json ? json.message : 'Request failed'
    throw new ApiRequestError(message, res.status)
  }

  return json.data
}

async function downloadBlob(path: string, fallbackName: string): Promise<void> {
  const headers = new Headers()
  const token = getAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let res = await fetch(`${API_BASE}${path}`, {
    headers,
    credentials: 'include',
  })

  if (res.status === 401) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      const retryHeaders = new Headers()
      const next = getAccessToken()
      if (next) retryHeaders.set('Authorization', `Bearer ${next}`)
      res = await fetch(`${API_BASE}${path}`, {
        headers: retryHeaders,
        credentials: 'include',
      })
    }
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiError | null
    throw new ApiRequestError(err?.message ?? 'Download failed', res.status)
  }

  const blob = await res.blob()
  const disposition = res.headers.get('Content-Disposition') ?? ''
  const match = /filename="?([^"]+)"?/i.exec(disposition)
  const filename = match?.[1] ?? fallbackName
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export const api = {
  health: () => request<HealthStatus>('/health'),
  signup: (body: {
    email: string
    password: string
    firstName: string
    lastName: string
  }) =>
    request<AuthResult>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  login: (body: { email: string; password: string }) =>
    request<AuthResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  me: () => request<PublicUser>('/auth/me'),
  logout: () =>
    request<{ loggedOut: boolean }>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  users: () => request<PublicUser[]>('/users'),
  employees: () => request<PublicUser[]>('/employees'),
  createEmployee: (body: {
    email: string
    password: string
    firstName: string
    lastName: string
    role?: Role
  }) =>
    request<PublicUser>('/employees', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  accounts: () => request<Account[]>('/accounts'),
  createAccount: (body: {
    code: string
    name: string
    type: Account['type']
    description?: string
    parentCode?: string
    isPostable?: boolean
  }) =>
    request<Account>('/accounts', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateAccount: (
    id: string,
    body: {
      name?: string
      description?: string
      isActive?: boolean
      isPostable?: boolean
    },
  ) =>
    request<Account>(`/accounts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteAccount: (id: string) =>
    request<{ id: string; code: string }>(`/accounts/${id}`, {
      method: 'DELETE',
    }),
  journals: (params?: {
    projectId?: string
    fromDate?: string
    toDate?: string
    status?: string
    journalType?: string
    accountCode?: string
    entityType?: string
    entityId?: string
    search?: string
    source?: string
  }) => {
    const query = new URLSearchParams()
    if (params?.projectId) query.set('projectId', params.projectId)
    if (params?.fromDate) query.set('fromDate', params.fromDate)
    if (params?.toDate) query.set('toDate', params.toDate)
    if (params?.status) query.set('status', params.status)
    if (params?.journalType) query.set('journalType', params.journalType)
    if (params?.accountCode) query.set('accountCode', params.accountCode)
    if (params?.entityType) query.set('entityType', params.entityType)
    if (params?.entityId) query.set('entityId', params.entityId)
    if (params?.search) query.set('search', params.search)
    if (params?.source) query.set('source', params.source)
    const qs = query.toString()
    return request<JournalEntry[]>(qs ? `/journals?${qs}` : '/journals')
  },
  journalSummary: (params?: {
    projectId?: string
    fromDate?: string
    toDate?: string
    status?: string
    journalType?: string
    search?: string
  }) => {
    const query = new URLSearchParams()
    if (params?.projectId) query.set('projectId', params.projectId)
    if (params?.fromDate) query.set('fromDate', params.fromDate)
    if (params?.toDate) query.set('toDate', params.toDate)
    if (params?.status) query.set('status', params.status)
    if (params?.journalType) query.set('journalType', params.journalType)
    if (params?.search) query.set('search', params.search)
    const qs = query.toString()
    return request<JournalSummary>(qs ? `/journals/summary?${qs}` : '/journals/summary')
  },
  journal: (id: string) => request<JournalEntry>(`/journals/${id}`),
  updateJournal: (id: string, body: JournalWriteBody) =>
    request<JournalEntry>(`/journals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  postDraftJournal: (id: string) =>
    request<JournalEntry>(`/journals/${id}/post`, { method: 'POST' }),
  reverseJournal: (id: string) =>
    request<JournalEntry>(`/journals/${id}/reverse`, { method: 'POST' }),
  deleteJournal: (id: string) =>
    request<{ id: string; entryNumber: string }>(`/journals/${id}`, {
      method: 'DELETE',
    }),
  trialBalance: () => request<TrialBalance>('/reports/trial-balance'),
  balanceSheet: (asOfDate?: string) => {
    const query = asOfDate
      ? `?asOfDate=${encodeURIComponent(asOfDate)}`
      : ''
    return request<BalanceSheetReport>(`/reports/balance-sheet${query}`)
  },
  balanceSheetTemplate: () =>
    request<BalanceSheetTemplate>('/templates/balance-sheet'),
  saveBalanceSheetTemplate: (body: Omit<
    BalanceSheetTemplate,
    'id' | 'isDefault' | 'updatedBy' | 'updatedAt' | 'reportType'
  > & {
    templateName?: string
    companyLogoUrl?: string | null
    reportType?: 'BALANCE_SHEET'
  }) =>
    request<BalanceSheetTemplate>('/templates/balance-sheet', {
      method: 'POST',
      body: JSON.stringify({
        templateName: body.templateName,
        companyLogoUrl: body.companyLogoUrl ?? undefined,
        headerConfig: body.headerConfig,
        layoutStructure: body.layoutStructure,
        footerConfig: body.footerConfig,
      }),
    }),
  journalVoucherTemplate: () =>
    request<BalanceSheetTemplate>('/templates/journal-voucher'),
  saveJournalVoucherTemplate: (body: Omit<
    BalanceSheetTemplate,
    'id' | 'isDefault' | 'updatedBy' | 'updatedAt' | 'reportType'
  > & {
    templateName?: string
    companyLogoUrl?: string | null
  }) =>
    request<BalanceSheetTemplate>('/templates/journal-voucher', {
      method: 'POST',
      body: JSON.stringify({
        templateName: body.templateName,
        companyLogoUrl: body.companyLogoUrl ?? undefined,
        headerConfig: body.headerConfig,
        layoutStructure: body.layoutStructure,
        footerConfig: body.footerConfig,
      }),
    }),
  uploadTemplateLogo: async (file: File) => {
    const form = new FormData()
    form.append('logo', file)
    const headers = new Headers()
    const token = getAccessToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const res = await fetch(`${API_BASE}/templates/upload-logo`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: form,
    })
    if (res.status === 401) {
      const refreshed = await tryRefresh()
      if (refreshed) {
        const retryHeaders = new Headers()
        const next = getAccessToken()
        if (next) retryHeaders.set('Authorization', `Bearer ${next}`)
        const retry = await fetch(`${API_BASE}/templates/upload-logo`, {
          method: 'POST',
          headers: retryHeaders,
          credentials: 'include',
          body: form,
        })
        if (!retry.ok) {
          const err = (await retry.json().catch(() => null)) as ApiError | null
          throw new ApiRequestError(
            err?.message ?? 'Logo upload failed',
            retry.status,
          )
        }
        const json = (await retry.json()) as ApiSuccess<{ url: string }>
        return json.data
      }
    }
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as ApiError | null
      throw new ApiRequestError(err?.message ?? 'Logo upload failed', res.status)
    }
    const json = (await res.json()) as ApiSuccess<{ url: string }>
    return json.data
  },
  ledger: (
    accountCode: string,
    params?: { asOf?: string; entityType?: string; entityId?: string },
  ) => {
    const query = new URLSearchParams()
    if (params?.asOf) query.set('asOf', params.asOf)
    if (params?.entityType) query.set('entityType', params.entityType)
    if (params?.entityId) query.set('entityId', params.entityId)
    const qs = query.toString()
    return request<AccountLedger>(
      qs ? `/ledgers/${accountCode}?${qs}` : `/ledgers/${accountCode}`,
    )
  },
  customers: (activeOnly = false) =>
    request<Customer[]>(
      activeOnly ? '/customers?active=1' : '/customers',
    ),
  createCustomer: (body: {
    name: string
    contactName?: string
    email?: string
    phone?: string
    address?: string
  }) =>
    request<Customer>('/customers', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  projects: (status?: ProjectStatus) =>
    request<Project[]>(status ? `/projects?status=${status}` : '/projects'),
  project: (id: string) => request<Project>(`/projects/${id}`),
  projectProfitability: (id: string) =>
    request<Project>(`/projects/${id}/profitability`),
  createProject: (body: CreateProjectBody) =>
    request<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateProject: (id: string, body: Partial<CreateProjectBody>) =>
    request<Project>(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  updateProjectStatus: (id: string, status: ProjectStatus) =>
    request<Project>(`/projects/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  postJournal: (body: JournalWriteBody) =>
    request<JournalEntry>('/journals', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  treasury: () => request<TreasuryAccount[]>('/treasury'),
  treasuryAccount: (id: string) => request<TreasuryAccount>(`/treasury/${id}`),
  createTreasury: (body: {
    name: string
    kind: TreasuryKind
    institution?: string
    accountNumber?: string
  }) =>
    request<TreasuryAccount>('/treasury', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  treasuryLedger: (id: string) =>
    request<{
      account: TreasuryAccount
      entries: Array<{
        id: string
        date: string
        entryNumber: string
        memo: string
        debit: number
        credit: number
      }>
    }>(`/treasury/${id}/ledger`),
  transfers: () => request<FundTransfer[]>('/transfers'),
  createTransfer: (body: {
    fromTreasuryId: string
    toTreasuryId: string
    amount: number
    date: string
    memo: string
    reference?: string
  }) =>
    request<FundTransfer>('/transfers', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  importReconciliation: (
    treasuryId: string,
    body: { asOf: string; statementBalance: number; csv: string },
  ) =>
    request<Reconciliation>(`/treasury/${treasuryId}/reconciliations`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  reconciliation: (id: string) => request<Reconciliation>(`/reconciliations/${id}`),
  matchReconciliation: (
    id: string,
    body: { statementLineId: string; ledgerLineId: string },
  ) =>
    request<Reconciliation>(`/reconciliations/${id}/match`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  completeReconciliation: (id: string) =>
    request<Reconciliation>(`/reconciliations/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  advances: (params?: {
    projectId?: string
    employeeId?: string
    startDate?: string
    endDate?: string
    status?: string
    page?: number
    pageSize?: number
  }) => {
    const query = new URLSearchParams()
    if (params?.projectId) query.set('projectId', params.projectId)
    if (params?.employeeId) query.set('employeeId', params.employeeId)
    if (params?.startDate) query.set('startDate', params.startDate)
    if (params?.endDate) query.set('endDate', params.endDate)
    if (params?.status) query.set('status', params.status)
    if (params?.page) query.set('page', String(params.page))
    if (params?.pageSize) query.set('pageSize', String(params.pageSize))
    const qs = query.toString()
    return request<{
      items: Advance[]
      total: number
      page: number
      pageSize: number
    }>(qs ? `/advances?${qs}` : '/advances')
  },
  downloadAdvancePdf: (id: string) =>
    downloadBlob(`/advances/${id}/pdf`, `advance-${id}.pdf`),
  downloadProjectAdvanceReportPdf: (params: {
    projectId: string
    employeeId?: string
    startDate?: string
    endDate?: string
  }) => {
    const query = new URLSearchParams()
    query.set('projectId', params.projectId)
    if (params.employeeId) query.set('employeeId', params.employeeId)
    if (params.startDate) query.set('startDate', params.startDate)
    if (params.endDate) query.set('endDate', params.endDate)
    return downloadBlob(
      `/advances/project-report/pdf?${query.toString()}`,
      'project-advance-report.pdf',
    )
  },
  employeeAdvanceBalance: (id: string) =>
    request<{ employeeId: string; unsettledAdvanceBalance: number }>(
      `/employees/${id}/advance-balance`,
    ),
  advance: (id: string) => request<Advance>(`/advances/${id}`),
  advanceProjects: () => request<AdvanceProjectOption[]>('/advances/projects'),
  expenseAccounts: () =>
    request<ExpenseAccountOption[]>('/advances/expense-accounts'),
  createAdvance: (body: { projectId: string; amount: number; purpose: string }) =>
    request<Advance>('/advances', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  rejectAdvance: (id: string, reason?: string) =>
    request<Advance>(`/advances/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  disburseAdvance: (id: string, body: { treasuryId: string; date: string; memo?: string }) =>
    request<Advance>(`/advances/${id}/disburse`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  submitSettlement: (
    id: string,
    lines: Array<{ accountCode: string; amount: number; description?: string }>,
  ) =>
    request<Advance>(`/advances/${id}/settlement`, {
      method: 'POST',
      body: JSON.stringify({ lines }),
    }),
  confirmSettlement: (id: string, body?: { returnTreasuryId?: string; date?: string }) =>
    request<Advance>(`/advances/${id}/confirm`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),
  reimburseAdvance: (
    id: string,
    body: { treasuryId: string; date?: string; memo?: string },
  ) =>
    request<Advance>(`/advances/${id}/reimburse`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  employeeLedger: (id: string) =>
    request<EmployeeLedgerReport>(`/employees/${id}/ledger`),
  suppliers: () => request<Supplier[]>('/suppliers'),
  supplier: (id: string) => request<Supplier>(`/suppliers/${id}`),
  vendorLedger: (id: string) => request<VendorLedger>(`/suppliers/${id}/ledger`),
  createSupplier: (body: {
    name: string
    contactName?: string
    phone?: string
    paymentTermsDays?: number
  }) =>
    request<Supplier>('/suppliers', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  items: () => request<Item[]>('/items'),
  createItem: (body: { sku: string; name: string; unit: string }) =>
    request<Item>('/items', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  warehouses: () => request<Warehouse[]>('/warehouses'),
  purchaseOrders: () => request<PurchaseOrder[]>('/purchase-orders'),
  purchaseOrder: (id: string) => request<PurchaseOrder>(`/purchase-orders/${id}`),
  createPurchaseOrder: (body: {
    supplierId: string
    destination: 'direct_to_site' | 'warehouse'
    date: string
    projectId?: string
    warehouseId?: string
    notes?: string
    lines: Array<{ itemId: string; quantity: number; unitCost: number }>
  }) =>
    request<PurchaseOrder>('/purchase-orders', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  receiveGoods: (
    id: string,
    body: {
      date: string
      paymentMethod?: 'due' | 'cash' | 'bank'
      treasuryId?: string
      lines: Array<{ lineId: string; quantity: number }>
    },
  ) =>
    request<PurchaseOrder>(`/purchase-orders/${id}/receive`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  returnGoods: (
    id: string,
    body: { date: string; lines: Array<{ lineId: string; quantity: number }> },
  ) =>
    request<PurchaseOrder>(`/purchase-orders/${id}/returns`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  cancelPurchaseOrder: (id: string) =>
    request<PurchaseOrder>(`/purchase-orders/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  inventory: () => request<StockRow[]>('/inventory'),
  stockIssues: () => request<StockIssue[]>('/inventory/issues'),
  issueStock: (body: {
    warehouseId: string
    projectId: string
    date: string
    lines: Array<{ itemId: string; quantity: number }>
  }) =>
    request<{
      id: string
      issueNumber: string
      journalNumber: string
      amount: number
      projectId: string
    }>('/inventory/issues', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  invoices: () => request<ClientInvoice[]>('/receivables'),
  invoice: (id: string) => request<ClientInvoice>(`/receivables/${id}`),
  overdueInvoices: () => request<OverdueNotice[]>('/receivables/overdue'),
  arAging: (asOf?: string) =>
    request<AgingReport>(`/receivables/aging${asOf ? `?asOf=${asOf}` : ''}`),
  createInvoice: (body: {
    projectId: string
    type: 'milestone' | 'lump_sum'
    date: string
    dueDate: string
    amount: number
    description: string
    milestoneLabel?: string
  }) =>
    request<ClientInvoice>('/receivables', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  collectInvoice: (
    id: string,
    body: { amount: number; treasuryId: string; date: string },
  ) =>
    request<ClientInvoice>(`/receivables/${id}/collect`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  invoiceCollections: (id: string) =>
    request<InvoiceCollection[]>(`/receivables/${id}/collections`),
  supplierBills: () => request<SupplierBill[]>('/payables/bills'),
  createSupplierBill: (body: {
    supplierId: string
    paymentType: 'cash' | 'credit'
    date: string
    dueDate?: string
    amount: number
    description: string
    projectId?: string
    expenseAccountCode?: string
    treasuryId?: string
  }) =>
    request<SupplierBill>('/payables/bills', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  supplierPayments: () => request<SupplierPayment[]>('/payables/payments'),
  scheduleSupplierPayment: (body: {
    supplierId: string
    amount: number
    treasuryId: string
    scheduledDate?: string
    memo?: string
  }) =>
    request<SupplierPayment>('/payables/payments', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  executeSupplierPayment: (id: string, body: { date: string }) =>
    request<SupplierPayment>(`/payables/payments/${id}/execute`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  cancelSupplierPayment: (id: string) =>
    request<SupplierPayment>(`/payables/payments/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  apAging: (asOf?: string) =>
    request<AgingReport>(`/payables/aging${asOf ? `?asOf=${asOf}` : ''}`),
  payrollEmployees: () => request<PayrollEmployee[]>('/payroll/employees'),
  salaryStructures: () => request<SalaryStructure[]>('/payroll/salary-structures'),
  upsertSalaryStructure: (body: {
    employeeId: string
    basic: number
    allowances?: Array<{ name: string; amount: number }>
    deductions?: Array<{ name: string; amount: number }>
  }) =>
    request<SalaryStructure>('/payroll/salary-structures', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  timeLogs: (periodYear: number, periodMonth: number) =>
    request<TimeLog[]>(
      `/payroll/time-logs?periodYear=${periodYear}&periodMonth=${periodMonth}`,
    ),
  createTimeLog: (body: {
    employeeId: string
    projectId: string
    periodYear: number
    periodMonth: number
    unit: 'hours' | 'days'
    quantity: number
    notes?: string
  }) =>
    request<TimeLog>('/payroll/time-logs', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  payrollRuns: () => request<PayrollRun[]>('/payroll/runs'),
  payrollRun: (id: string) => request<PayrollRun>(`/payroll/runs/${id}`),
  generatePayroll: (body: { periodYear: number; periodMonth: number }) =>
    request<PayrollRun>('/payroll/runs', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  disbursePayroll: (id: string, body: { treasuryId: string; date: string }) =>
    request<PayrollRun>(`/payroll/runs/${id}/disburse`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  auditLogs: (entityType?: string) =>
    request<AuditLog[]>(
      `/audit${entityType ? `?entityType=${encodeURIComponent(entityType)}` : ''}`,
    ),
  approvals: () => request<ApprovalRequest[]>('/approvals'),
  approval: (id: string) => request<ApprovalRequest>(`/approvals/${id}`),
  approveRequest: (id: string, note?: string) =>
    request<ApprovalRequest>(`/approvals/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),
  rejectRequest: (id: string, note?: string) =>
    request<ApprovalRequest>(`/approvals/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),
  scanReceipt: (body: {
    textHint?: string
    imageName?: string
    imageBase64?: string
  }) =>
    request<OcrScanResult>('/ocr/receipt', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  cashFlow: () => request<CashFlowForecast>('/analytics/cash-flow'),
  burnRate: () => request<BurnRateRow[]>('/analytics/burn-rate'),
  statements: () => request<FinancialStatements>('/analytics/statements'),
}
