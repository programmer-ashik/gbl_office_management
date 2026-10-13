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

  if (url) {
    // Stored as /uploads/logos/...
    const relative = url.replace(/^\//, '');
    const absolutePath = path.resolve(process.cwd(), relative);
    try {
      await fs.access(absolutePath);
      return { absolutePath: await pdfSizedLogo(absolutePath), url, companyName };
    } catch {
      /* uploaded file missing — use the bundled logo */
    }
  }
  return { absolutePath: await defaultLogoPath(), url, companyName };
}

/** Bundled GBL logo (already PDF-sized), used until a logo is uploaded in Settings. */
const DEFAULT_LOGO_PATH = path.resolve(__dirname, '../../../assets/gbl-logo.png');

async function defaultLogoPath(): Promise<string | null> {
  try {
    await fs.access(DEFAULT_LOGO_PATH);
    return DEFAULT_LOGO_PATH;
  } catch {
    return null;
  }
}

/** Longest side in pixels; logos are drawn ~13 mm tall, so this is >300 dpi. */
const PDF_LOGO_MAX_PX = 320;
const PDF_CACHE_DIR = path.resolve(process.cwd(), 'uploads', 'pdf-cache');

/**
 * pdfkit embeds images at their stored resolution, so a full-size upload makes
 * every PDF megabytes. Returns a cached downscaled PNG (transparency kept), or
 * the original path if resizing is unavailable.
 */
async function pdfSizedLogo(sourcePath: string): Promise<string> {
  try {
    const stat = await fs.stat(sourcePath);
    const base = path.basename(sourcePath, path.extname(sourcePath));
    const cached = path.join(
      PDF_CACHE_DIR,
      `${base}-${Math.round(stat.mtimeMs)}-${PDF_LOGO_MAX_PX}.png`,
    );
    try {
      await fs.access(cached);
      return cached;
    } catch {
      /* not cached yet */
    }
    const { default: sharp } = await import('sharp');
    await fs.mkdir(PDF_CACHE_DIR, { recursive: true });
    const tmp = `${cached}.${process.pid}.tmp`;
    await sharp(sourcePath)
      .resize(PDF_LOGO_MAX_PX, PDF_LOGO_MAX_PX, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png({ compressionLevel: 9 })
      .toFile(tmp);
    await fs.rename(tmp, cached);
    return cached;
  } catch {
    return sourcePath;
  }
}
