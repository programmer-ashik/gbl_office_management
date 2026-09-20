import pdfParse from 'pdf-parse';
import { badRequest } from '../../common/errors/app-error';
import type { ParsedStatementLine } from './csv';
import { parseStatementCsv } from './csv';
import {
  buildStatementParseResult,
  type StatementParseResult,
} from './statement-meta';

/**
 * Extract statement lines + opening/closing/period metadata from a bank PDF.
 */
export async function parseStatementPdf(
  buffer: Buffer,
): Promise<ParsedStatementLine[]> {
  const parsed = await parseStatementPdfDetailed(buffer);
  return parsed.lines;
}

export async function parseStatementPdfDetailed(
  buffer: Buffer,
): Promise<StatementParseResult> {
  let text = '';
  try {
    const parsed = await pdfParse(buffer);
    text = (parsed.text ?? '').replace(/\r/g, '\n');
  } catch {
    throw badRequest('Unable to read PDF bank statement');
  }

  const normalized = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');

  if (!normalized) {
    throw badRequest('PDF contains no extractable text');
  }

  // Prefer embedded CSV-looking content when present.
  if (
    /date[,|\t].*(description|narration|particulars)/i.test(normalized) &&
    /amount/i.test(normalized)
  ) {
    try {
      const lines = parseStatementCsv(normalized);
      return buildStatementParseResult(lines, normalized);
    } catch {
      /* fall through */
    }
  }

  // City Bank / Citytouch style: DATE+DESC+WITHDRAWAL/DEPOSIT+BALANCE (often concatenated).
  if (
    /account\s*activity/i.test(normalized) &&
    /withdrawal/i.test(normalized) &&
    /deposit/i.test(normalized)
  ) {
    const cityLines = extractCityBankActivityLines(normalized);
    if (cityLines.length > 0) {
      return buildStatementParseResult(cityLines, normalized);
    }
  }

  const lines = extractHeuristicPdfLines(normalized);
  if (lines.length === 0) {
    throw badRequest(
      'Could not detect transactions in PDF. Export the statement as CSV, or use a text-based PDF.',
    );
  }
  return buildStatementParseResult(lines, normalized);
}

/**
 * Parse City Bank "ACCOUNT ACTIVITY" rows where columns are often glued together.
 * Amounts come from running-balance deltas so glued refs (e.g. CHARGE-2050703010.00)
 * cannot inflate the transaction value.
 */
export function extractCityBankActivityLines(
  text: string,
): ParsedStatementLine[] {
  const moneyRe = /(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})/g;
  const dateRe = /^(\d{2}-\d{2}-\d{4})(.+)$/;

  let openingHint: number | undefined;
  const openingMatch = text.match(
    /opening\s*balance\s*[:\-]?\s*(?:BDT|Tk\.?|৳)?\s*([0-9,]+\.\d{2})/i,
  );
  if (openingMatch?.[1]) {
    openingHint = Number(openingMatch[1].replace(/,/g, ''));
  }

  const rows = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const results: ParsedStatementLine[] = [];
  if (openingHint == null || !Number.isFinite(openingHint)) {
    return results;
  }
  let prevBalance = openingHint;

  for (const row of rows) {
    if (
      /^(date|account\s*activity|this is a computer|page\s+\d|statement of|total\s+withdrawal|total\s+deposit|_{3,}|-{3,}|end of statement)/i.test(
        row,
      )
    ) {
      continue;
    }
    const dated = row.match(dateRe);
    if (!dated) continue;

    const dateIso = normalizePdfDate(dated[1]);
    if (!dateIso) continue;

    const rest = dated[2];
    const amountMatches = [...rest.matchAll(moneyRe)];
    if (amountMatches.length < 1) continue;

    const balanceMatch = amountMatches[amountMatches.length - 1];
    const balance = Number(balanceMatch[1].replace(/,/g, ''));
    if (!Number.isFinite(balance)) continue;

    const signed = Math.round((balance - prevBalance) * 100) / 100;
    if (Math.abs(signed) < 0.005) {
      prevBalance = balance;
      continue;
    }

    let description = rest.slice(0, balanceMatch.index ?? 0).trim();
    description = stripTrailingAmount(description, Math.abs(signed));
    description = description.replace(/\s{2,}/g, ' ').trim();
    if (
      !description ||
      /^(withdrawal|deposit|balance|chq)/i.test(description)
    ) {
      description = 'Bank transaction';
    }

    const refMatch = description.match(
      /\b((?:CHQ|CHK|CHEQUE|REF|TXN|CBLTA|NPSB)[-#:/]?\w[\w-]*)/i,
    );

    results.push({
      date: dateIso,
      description: description.slice(0, 240),
      amount: signed,
      reference: refMatch?.[1]?.replace(/\s+/g, ''),
    });
    prevBalance = balance;
  }

  return results;
}

function stripTrailingAmount(text: string, amount: number): string {
  const plain = amount.toFixed(2);
  const withCommas = plain.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const escaped = [withCommas, plain]
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  return text
    .replace(new RegExp(`(?:\\d{0,12})(?:${escaped})$`), '')
    .trim();
}

function extractHeuristicPdfLines(text: string): ParsedStatementLine[] {
  const rows = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const results: ParsedStatementLine[] = [];

  const rowPattern =
    /^(?<date>\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\s+(?<rest>.+?)\s+(?<amount>\(?-?[0-9,]+\.\d{2}\)?)\s*(?<side>Dr|Cr|DR|CR)?$/;

  for (const row of rows) {
    if (/^(date|txn|opening|closing|balance|page|statement)/i.test(row)) {
      continue;
    }
    const match = row.match(rowPattern);
    if (!match?.groups) {
      continue;
    }
    const dateIso = normalizePdfDate(match.groups.date);
    if (!dateIso) continue;

    let amountRaw = match.groups.amount.replace(/,/g, '');
    const side = (match.groups.side ?? '').toLowerCase();
    let amount = Number(amountRaw.replace(/[()]/g, ''));
    if (!Number.isFinite(amount)) continue;
    if (amountRaw.includes('(') || amountRaw.startsWith('-') || side === 'dr') {
      amount = -Math.abs(amount);
    } else if (side === 'cr') {
      amount = Math.abs(amount);
    }

    const rest = match.groups.rest.trim();
    const refMatch = rest.match(
      /\b((?:CHQ|CHK|CHEQUE|REF|TXN)[-#:\s]?\w+|\b\d{6,}\b)/i,
    );
    const reference = refMatch?.[1]?.replace(/\s+/g, '') || undefined;
    const description = rest
      .replace(refMatch?.[0] ?? '', '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (!description) continue;

    results.push({
      date: dateIso,
      description: description.slice(0, 240),
      amount,
      reference,
    });
  }

  return results;
}

function normalizePdfDate(raw: string): string | null {
  const value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T00:00:00.000Z`;
  }
  const dmy = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const year = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);
    const date = new Date(Date.UTC(year, Number(dmy[2]) - 1, Number(dmy[1])));
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  }
  const mon = value.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (mon) {
    const months: Record<string, number> = {
      jan: 0,
      january: 0,
      feb: 1,
      february: 1,
      mar: 2,
      march: 2,
      apr: 3,
      april: 3,
      may: 4,
      jun: 5,
      june: 5,
      jul: 6,
      july: 6,
      aug: 7,
      august: 7,
      sep: 8,
      sept: 8,
      september: 8,
      oct: 9,
      october: 9,
      nov: 10,
      november: 10,
      dec: 11,
      december: 11,
    };
    const m = months[mon[2].toLowerCase()];
    if (m == null) return null;
    const date = new Date(Date.UTC(Number(mon[3]), m, Number(mon[1])));
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  }
  return null;
}

export function bufferFromPdfBase64(raw: string): Buffer {
  const trimmed = raw.trim();
  const payload = trimmed.includes('base64,')
    ? trimmed.slice(trimmed.indexOf('base64,') + 7)
    : trimmed;
  try {
    return Buffer.from(payload, 'base64');
  } catch {
    throw badRequest('Invalid PDF base64 payload');
  }
}
