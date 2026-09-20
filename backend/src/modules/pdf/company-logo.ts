import fs from 'fs/promises';
import path from 'path';
import { ReportTemplateModel } from '../templates/report-template.model';

export type CompanyBrandForPdf = {
  absolutePath: string | null;
  url: string | null;
  companyName: string;
};

/**
 * Resolve admin-uploaded company logo + name for PDFs
 * (JV / Balance Sheet templates). Prefers journal voucher.
 */
export async function resolveCompanyLogoForPdf(): Promise<CompanyBrandForPdf> {
  const docs = await ReportTemplateModel.find({
    $or: [
      { companyLogoUrl: { $exists: true, $ne: '' } },
      { 'headerConfig.companyName': { $exists: true, $ne: '' } },
    ],
  })
    .select('reportType companyLogoUrl headerConfig')
    .lean()
    .exec();

  const preferred =
    docs.find((row) => String(row.reportType) === 'JOURNAL_VOUCHER') ??
    docs.find((row) => String(row.reportType) === 'BALANCE_SHEET') ??
    docs[0];

  const url = preferred?.companyLogoUrl?.trim() || null;
  const companyName =
    preferred?.headerConfig?.companyName?.trim() || 'GBL Enterprise';

  if (!url) {
    return { absolutePath: null, url: null, companyName };
  }

  // Stored as /uploads/logos/...
  const relative = url.replace(/^\//, '');
  const absolutePath = path.resolve(process.cwd(), relative);
  try {
    await fs.access(absolutePath);
    return { absolutePath, url, companyName };
  } catch {
    return { absolutePath: null, url, companyName };
  }
}
