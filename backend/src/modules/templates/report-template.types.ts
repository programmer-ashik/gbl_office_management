import { Types } from 'mongoose';

export const REPORT_TYPE_BALANCE_SHEET = 'BALANCE_SHEET' as const;
export const REPORT_TYPE_JOURNAL_VOUCHER = 'JOURNAL_VOUCHER' as const;

export type ReportTypeValue =
  | typeof REPORT_TYPE_BALANCE_SHEET
  | typeof REPORT_TYPE_JOURNAL_VOUCHER;

export type ReportTemplateType =
  | 'LOGO'
  | 'COMPANY_HEADER'
  | 'METRIC_TILES'
  | 'ASSETS_SECTION'
  | 'LIABILITIES_SECTION'
  | 'EQUITY_SECTION'
  | 'VOUCHER_META'
  | 'LINES_TABLE'
  | 'FOOTER_SIGNATURES';

export type LogoAlign = 'left' | 'center' | 'right';

export type TemplateBlockStyles = {
  logoAlign?: LogoAlign;
  showAccountCodes?: boolean;
  showPartyBreakdown?: boolean;
};

export type TemplateBlock = {
  id: string;
  type: ReportTemplateType;
  position: number;
  visible: boolean;
  styles: TemplateBlockStyles;
};

export type HeaderConfig = {
  companyName: string;
  reportTitle: string;
  address: string;
  taxId: string;
  showDate: boolean;
  showStatusBadge: boolean;
};

export type FooterConfig = {
  preparedByLabel: string;
  checkedByLabel: string;
  authorizedLabel: string;
  showManagingDirector: boolean;
  showAuditor: boolean;
  managingDirectorLabel: string;
  auditorLabel: string;
};

export type PublicReportTemplate = {
  id: string | null;
  templateName: string;
  reportType: ReportTypeValue;
  companyLogoUrl: string | null;
  headerConfig: HeaderConfig;
  layoutStructure: TemplateBlock[];
  footerConfig: FooterConfig;
  isDefault: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
};

const defaultHeader = (
  companyName: string,
  reportTitle: string,
): HeaderConfig => ({
  companyName,
  reportTitle,
  address: '',
  taxId: '',
  showDate: true,
  showStatusBadge: true,
});

const defaultFooter = (): FooterConfig => ({
  preparedByLabel: 'Prepared by',
  checkedByLabel: 'Checked by',
  authorizedLabel: 'Authorized signature',
  showManagingDirector: true,
  showAuditor: false,
  managingDirectorLabel: 'Managing Director',
  auditorLabel: 'Auditor',
});

export function defaultBalanceSheetTemplate(): PublicReportTemplate {
  return {
    id: null,
    templateName: 'Default Balance Sheet',
    reportType: REPORT_TYPE_BALANCE_SHEET,
    companyLogoUrl: null,
    headerConfig: defaultHeader(
      'GBL Enterprise',
      'Statement of Financial Position',
    ),
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
  };
}

export function defaultJournalVoucherTemplate(): PublicReportTemplate {
  return {
    id: null,
    templateName: 'Default Journal Voucher',
    reportType: REPORT_TYPE_JOURNAL_VOUCHER,
    companyLogoUrl: null,
    headerConfig: defaultHeader('GBL Enterprise', 'Journal Voucher'),
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
    footerConfig: {
      ...defaultFooter(),
      authorizedLabel: 'Approved by',
      showManagingDirector: false,
      showAuditor: false,
    },
    isDefault: true,
    updatedBy: null,
    updatedAt: null,
  };
}

export function normalizeLayout(blocks: TemplateBlock[]): TemplateBlock[] {
  return [...blocks]
    .sort((a, b) => a.position - b.position)
    .map((block, index) => ({
      id: block.id,
      type: block.type,
      position: index,
      visible: block.visible !== false,
      styles: {
        logoAlign: block.styles?.logoAlign,
        showAccountCodes: block.styles?.showAccountCodes,
      },
    }));
}

/** Merge DB layout with defaults so missing blocks never blank the report. */
export function hydrateTemplate(
  partial: Partial<PublicReportTemplate> | null | undefined,
  fallback: PublicReportTemplate,
): PublicReportTemplate {
  const base = fallback;
  if (!partial) return base;

  const incoming = normalizeLayout(
    (partial.layoutStructure ?? []).filter(Boolean) as TemplateBlock[],
  );
  const byId = new Map(incoming.map((b) => [b.id, b]));
  const byType = new Map(incoming.map((b) => [b.type, b]));

  const mergedBlocks = base.layoutStructure.map((def, index) => {
    const found = byId.get(def.id) ?? byType.get(def.type);
    if (!found) {
      return { ...def, position: index };
    }
    return {
      ...def,
      ...found,
      id: def.id,
      type: def.type,
      position: index,
      visible: found.visible !== false,
      styles: { ...def.styles, ...(found.styles ?? {}) },
    };
  });

  // Keep any extra custom-ordered blocks that match known types, by saved order
  const knownTypes = new Set(base.layoutStructure.map((b) => b.type));
  const ordered = normalizeLayout(
    incoming.length > 0
      ? incoming
          .filter((b) => knownTypes.has(b.type))
          .map((b) => {
            const def = base.layoutStructure.find((d) => d.type === b.type)!;
            return {
              ...def,
              ...b,
              id: def.id,
              type: def.type,
              visible: b.visible !== false,
              styles: { ...def.styles, ...(b.styles ?? {}) },
            };
          })
      : mergedBlocks,
  );

  return {
    id: partial.id ?? base.id,
    templateName: partial.templateName?.trim() || base.templateName,
    reportType: base.reportType,
    companyLogoUrl: partial.companyLogoUrl?.trim()
      ? partial.companyLogoUrl
      : null,
    headerConfig: {
      ...base.headerConfig,
      ...(partial.headerConfig ?? {}),
      companyName:
        partial.headerConfig?.companyName?.trim() ||
        base.headerConfig.companyName,
      reportTitle:
        partial.headerConfig?.reportTitle?.trim() ||
        base.headerConfig.reportTitle,
      address: partial.headerConfig?.address ?? base.headerConfig.address,
      taxId: partial.headerConfig?.taxId ?? base.headerConfig.taxId,
      showDate: partial.headerConfig?.showDate ?? base.headerConfig.showDate,
      showStatusBadge:
        partial.headerConfig?.showStatusBadge ??
        base.headerConfig.showStatusBadge,
    },
    layoutStructure: ordered.length > 0 ? ordered : mergedBlocks,
    footerConfig: {
      ...base.footerConfig,
      ...(partial.footerConfig ?? {}),
    },
    isDefault: partial.isDefault ?? true,
    updatedBy: partial.updatedBy ?? null,
    updatedAt: partial.updatedAt ?? null,
  };
}

export type ReportTemplateDocFields = {
  _id: Types.ObjectId;
  templateName: string;
  reportType: string;
  companyLogoUrl?: string;
  headerConfig: HeaderConfig;
  layoutStructure: TemplateBlock[];
  footerConfig: FooterConfig;
  isDefault: boolean;
  updatedBy?: Types.ObjectId;
  updatedAt?: Date;
};
