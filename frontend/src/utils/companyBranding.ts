import { api } from '../api/client'
import {
  DEFAULT_COMPANY_ADDRESS,
  DEFAULT_COMPANY_LOGO_URL,
  DEFAULT_COMPANY_NAME,
  defaultJournalVoucherTemplate,
  hydrateClientTemplate,
  voucherAddress,
  voucherLogoUrl,
  type BalanceSheetTemplate,
} from '../types/report-template'
import { loadPdfImage } from './pdfImage'

/** Company name, address and PDF-sized logo printed on every report PDF. */
export type CompanyBranding = {
  companyName: string
  address: string
  logoDataUrl: string | null
  taxId?: string
}

let cached: Promise<CompanyBranding> | null = null

async function resolveBranding(): Promise<CompanyBranding> {
  let template: BalanceSheetTemplate = defaultJournalVoucherTemplate()
  try {
    template = hydrateClientTemplate(await api.journalVoucherTemplate(), template)
  } catch {
    /* fall back to the defaults below */
  }
  const logoDataUrl =
    (await loadPdfImage(voucherLogoUrl(template))) ??
    (template.companyLogoUrl ? await loadPdfImage(DEFAULT_COMPANY_LOGO_URL) : null)
  return {
    companyName: template.headerConfig.companyName?.trim() || DEFAULT_COMPANY_NAME,
    address: voucherAddress(template) || DEFAULT_COMPANY_ADDRESS,
    logoDataUrl,
    taxId: template.headerConfig.taxId?.trim() || undefined,
  }
}

/** Settings → Debit / Credit Voucher template branding, loaded once per session. */
export function loadCompanyBranding(): Promise<CompanyBranding> {
  cached ??= resolveBranding().catch(() => {
    cached = null
    return { companyName: DEFAULT_COMPANY_NAME, address: DEFAULT_COMPANY_ADDRESS, logoDataUrl: null }
  })
  return cached
}

export function clearCompanyBrandingCache(): void {
  cached = null
}
