export type ReportTemplateBlockType =
  | 'LOGO'
  | 'COMPANY_HEADER'
  | 'METRIC_TILES'
  | 'ASSETS_SECTION'
  | 'LIABILITIES_SECTION'
  | 'EQUITY_SECTION'
  | 'VOUCHER_META'
  | 'LINES_TABLE'
  | 'FOOTER_SIGNATURES'

export type LogoAlign = 'left' | 'center' | 'right'

export type TemplateBlockStyles = {
  logoAlign?: LogoAlign
  showAccountCodes?: boolean
  /** Expand Client Receivables, Advance to Staff, Unpaid Salaries, etc. by party name. */
  showPartyBreakdown?: boolean
}

export type TemplateBlock = {
  id: string
  type: ReportTemplateBlockType
  position: number
  visible: boolean
  styles: TemplateBlockStyles
}

export type HeaderConfig = {
  companyName: string
  reportTitle: string
  address: string
  taxId: string
  showDate: boolean
  showStatusBadge: boolean
}

export type FooterConfig = {
  preparedByLabel: string
  checkedByLabel: string
  authorizedLabel: string
  showManagingDirector: boolean
  showAuditor: boolean
  managingDirectorLabel: string
  auditorLabel: string
}

export type BalanceSheetTemplate = {
  id: string | null
  templateName: string
  reportType: 'BALANCE_SHEET' | 'JOURNAL_VOUCHER'
  companyLogoUrl: string | null
  headerConfig: HeaderConfig
  layoutStructure: TemplateBlock[]
  footerConfig: FooterConfig
  isDefault: boolean
  updatedBy: string | null
  updatedAt: string | null
}

export type JournalVoucherTemplate = BalanceSheetTemplate & {
  reportType: 'JOURNAL_VOUCHER'
}

export const BLOCK_LABELS: Record<ReportTemplateBlockType, string> = {
  LOGO: 'Logo',
  COMPANY_HEADER: 'Company header',
  METRIC_TILES: 'Metric summary cards',
  ASSETS_SECTION: 'Assets section',
  LIABILITIES_SECTION: 'Liabilities section',
  EQUITY_SECTION: 'Equity section',
  VOUCHER_META: 'Voucher details',
  LINES_TABLE: 'Journal lines table',
  FOOTER_SIGNATURES: 'Footer signatures',
}

function defaultFooter(overrides?: Partial<FooterConfig>): FooterConfig {
  return {
    preparedByLabel: 'Prepared by',
    checkedByLabel: 'Checked by',
    authorizedLabel: 'Authorized signature',
    showManagingDirector: true,
    showAuditor: false,
    managingDirectorLabel: 'Managing Director',
    auditorLabel: 'Auditor',
    ...overrides,
  }
}

export function defaultBalanceSheetTemplate(): BalanceSheetTemplate {
  return {
    id: null,
    templateName: 'Default Balance Sheet',
    reportType: 'BALANCE_SHEET',
    companyLogoUrl: null,
    headerConfig: {
      companyName: 'GBL Enterprise',
      reportTitle: 'Statement of Financial Position',
      address: '',
      taxId: '',
      showDate: true,
      showStatusBadge: true,
    },
    layoutStructure: [
      {
        id: 'logo',
        type: 'LOGO',
        position: 0,
        visible: true,
        styles: { logoAlign: 'center' },
      },
      {
        id: 'company_header',
        type: 'COMPANY_HEADER',
        position: 1,
        visible: true,
        styles: {},
      },
      {
        id: 'metric_tiles',
        type: 'METRIC_TILES',
        position: 2,
        visible: true,
        styles: {},
      },
      {
        id: 'assets_section',
        type: 'ASSETS_SECTION',
        position: 3,
        visible: true,
        styles: { showAccountCodes: true, showPartyBreakdown: true },
      },
      {
        id: 'liabilities_section',
        type: 'LIABILITIES_SECTION',
        position: 4,
        visible: true,
        styles: { showAccountCodes: true, showPartyBreakdown: true },
      },
      {
        id: 'equity_section',
        type: 'EQUITY_SECTION',
        position: 5,
        visible: true,
        styles: { showAccountCodes: true },
      },
      {
        id: 'footer_signatures',
        type: 'FOOTER_SIGNATURES',
        position: 6,
        visible: true,
        styles: {},
      },
    ],
    footerConfig: defaultFooter(),
    isDefault: true,
    updatedBy: null,
    updatedAt: null,
  }
}

export function defaultJournalVoucherTemplate(): JournalVoucherTemplate {
  return {
    id: null,
    templateName: 'Default Journal Voucher',
    reportType: 'JOURNAL_VOUCHER',
    companyLogoUrl: null,
    headerConfig: {
      companyName: 'GBL Enterprise',
      reportTitle: 'Journal Voucher',
      address: '',
      taxId: '',
      showDate: true,
      showStatusBadge: true,
    },
    layoutStructure: [
      {
        id: 'logo',
        type: 'LOGO',
        position: 0,
        visible: true,
        styles: { logoAlign: 'center' },
      },
      {
        id: 'company_header',
        type: 'COMPANY_HEADER',
        position: 1,
        visible: true,
        styles: {},
      },
      {
        id: 'voucher_meta',
        type: 'VOUCHER_META',
        position: 2,
        visible: true,
        styles: {},
      },
      {
        id: 'lines_table',
        type: 'LINES_TABLE',
        position: 3,
        visible: true,
        styles: { showAccountCodes: true },
      },
      {
        id: 'footer_signatures',
        type: 'FOOTER_SIGNATURES',
        position: 4,
        visible: true,
        styles: {},
      },
    ],
    footerConfig: defaultFooter({
      authorizedLabel: 'Approved by',
      showManagingDirector: false,
      showAuditor: false,
    }),
    isDefault: true,
    updatedBy: null,
    updatedAt: null,
  }
}

export function normalizeTemplateLayout(
  blocks: TemplateBlock[],
): TemplateBlock[] {
  return [...blocks]
    .sort((a, b) => a.position - b.position)
    .map((block, index) => ({
      ...block,
      position: index,
      visible: block.visible !== false,
      styles: block.styles ?? {},
    }))
}

export function hydrateClientTemplate(
  partial: Partial<BalanceSheetTemplate> | null | undefined,
  fallback: BalanceSheetTemplate,
): BalanceSheetTemplate {
  if (!partial) return fallback
  const incoming = normalizeTemplateLayout(partial.layoutStructure ?? [])
  const known = new Set(fallback.layoutStructure.map((b) => b.type))
  const ordered =
    incoming.length > 0
      ? normalizeTemplateLayout(
          incoming
            .filter((b) => known.has(b.type))
            .map((b) => {
              const def = fallback.layoutStructure.find((d) => d.type === b.type)!
              return {
                ...def,
                ...b,
                id: def.id,
                type: def.type,
                visible: b.visible !== false,
                styles: { ...def.styles, ...(b.styles ?? {}) },
              }
            }),
        )
      : fallback.layoutStructure

  return {
    ...fallback,
    id: partial.id ?? fallback.id,
    templateName: partial.templateName?.trim() || fallback.templateName,
    companyLogoUrl: partial.companyLogoUrl?.trim()
      ? partial.companyLogoUrl
      : null,
    headerConfig: {
      ...fallback.headerConfig,
      ...(partial.headerConfig ?? {}),
    },
    footerConfig: {
      ...fallback.footerConfig,
      ...(partial.footerConfig ?? {}),
    },
    layoutStructure: ordered.length ? ordered : fallback.layoutStructure,
    isDefault: partial.isDefault ?? true,
    updatedBy: partial.updatedBy ?? null,
    updatedAt: partial.updatedAt ?? null,
  }
}

export function isBlockVisible(block: TemplateBlock): boolean {
  return block.visible !== false
}

export function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url
  return url.startsWith('/') ? url : `/${url}`
}
