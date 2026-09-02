import { badRequest } from '../../common/errors/app-error';

export type OcrVoucherLine = {
  accountCode: string;
  amount: number;
  description: string;
  confidence: number;
};

export type OcrScanResult = {
  vendor: string | null;
  date: string | null;
  total: number | null;
  lines: OcrVoucherLine[];
  rawText: string;
  mock: true;
};

/**
 * Mock OCR: derives expense voucher suggestions from free text or a filename hint.
 * No real image processing — Phase 9 interface for settlement auto-fill.
 */
export class OcrService {
  scanReceipt(input: {
    textHint?: string;
    imageName?: string;
    imageBase64?: string;
  }): OcrScanResult {
    const raw =
      input.textHint?.trim() ||
      input.imageName?.trim() ||
      (input.imageBase64 ? 'receipt scan' : '');
    if (!raw) {
      throw badRequest('Provide textHint, imageName, or imageBase64');
    }

    const lower = raw.toLowerCase();
    const amountMatch = raw.match(/(\d+(?:\.\d{1,2})?)/);
    const amount = amountMatch ? Number(amountMatch[1]) : 1250;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw badRequest('Could not parse a positive amount from the receipt hint');
    }

    let accountCode = '5200';
    let description = 'Office expense (OCR)';
    let vendor: string | null = null;

    if (/travel|taxi|uber|fuel|convey|transport/.test(lower)) {
      accountCode = '5300';
      description = 'Travel & conveyance (OCR)';
      vendor = 'Transport vendor';
    } else if (/cement|steel|material|hardware|supply/.test(lower)) {
      accountCode = '5000';
      description = 'Project materials (OCR)';
      vendor = 'Materials supplier';
    } else if (/labor|wage|worker|site/.test(lower)) {
      accountCode = '5100';
      description = 'Labor cost (OCR)';
      vendor = 'Site labor';
    } else if (/stationery|print|office|utility|internet/.test(lower)) {
      accountCode = '5200';
      description = 'Office expenses (OCR)';
      vendor = 'Office vendor';
    }

    const vendorMatch = raw.match(/(?:from|vendor|supplier)\s*[:\-]?\s*([A-Za-z0-9 &.-]{2,40})/i);
    if (vendorMatch?.[1]) {
      vendor = vendorMatch[1].trim();
    }

    const dateMatch = raw.match(/(\d{4}-\d{2}-\d{2})/);

    return {
      vendor,
      date: dateMatch?.[1] ?? new Date().toISOString().slice(0, 10),
      total: amount,
      lines: [
        {
          accountCode,
          amount,
          description: vendor ? `${description} · ${vendor}` : description,
          confidence: input.imageBase64 ? 0.82 : 0.71,
        },
      ],
      rawText: raw.slice(0, 500),
      mock: true,
    };
  }
}
