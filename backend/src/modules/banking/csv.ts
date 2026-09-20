import { badRequest } from '../../common/errors/app-error';
import {
  buildStatementParseResult,
  type StatementParseResult,
} from './statement-meta';

export type ParsedStatementLine = {
  date: string;
  description: string;
  amount: number;
  reference?: string;
};

const HEADER_DATE = /^(date|txn_date|transaction_date|value_date)$/i;
const HEADER_DESC = /^(description|narration|memo|particulars|details)$/i;
const HEADER_AMOUNT = /^(amount|amt|value)$/i;
const HEADER_REF =
  /^(reference|ref|cheque|check|cheque_no|check_no|txn_id|chequeorrefno)$/i;

export function toSignedMinorUnits(amount: number): number {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw badRequest('Amount must be a valid number');
  }
  const scaled = amount * 100;
  const minor = Math.round(scaled);
  if (Math.abs(scaled - minor) > 1e-8) {
    throw badRequest('Amount cannot have more than 2 decimal places');
  }
  return minor;
}

export function parseStatementCsv(csv: string): ParsedStatementLine[] {
  return parseStatementCsvDetailed(csv).lines;
}

export function parseStatementCsvDetailed(csv: string): StatementParseResult {
  const rows = parseCsvRows(csv);
  if (rows.length < 2) {
    throw badRequest('CSV must include a header row and at least one transaction');
  }

  const header = rows[0].map((cell) => cell.trim());
  const dateIdx = header.findIndex((cell) => HEADER_DATE.test(cell));
  const descIdx = header.findIndex((cell) => HEADER_DESC.test(cell));
  const amountIdx = header.findIndex((cell) => HEADER_AMOUNT.test(cell));
  const refIdx = header.findIndex((cell) => HEADER_REF.test(cell));

  if (dateIdx < 0 || descIdx < 0 || amountIdx < 0) {
    throw badRequest(
      'CSV header must include date, description (or narration), and amount columns',
    );
  }

  const lines: ParsedStatementLine[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.every((cell) => cell.trim() === '')) {
      continue;
    }
    const date = normalizeDate(row[dateIdx] ?? '');
    const description = (row[descIdx] ?? '').trim();
    const amount = parseAmount(row[amountIdx] ?? '');
    const reference =
      refIdx >= 0 ? (row[refIdx] ?? '').trim() || undefined : undefined;
    if (!description) {
      throw badRequest(`CSV row ${i + 1} is missing a description`);
    }
    lines.push({ date, description, amount, reference });
  }

  if (lines.length === 0) {
    throw badRequest('CSV does not contain any statement lines');
  }
  return buildStatementParseResult(lines, csv);
}

export function sameUtcDay(a: Date, b: Date): boolean {
  return utcDayKey(a) === utcDayKey(b);
}

export function daysApartUtc(a: Date, b: Date): number {
  const ms = Math.abs(utcDayStart(a).getTime() - utcDayStart(b).getTime());
  return Math.round(ms / 86_400_000);
}

function utcDayStart(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function utcDayKey(date: Date): string {
  return utcDayStart(date).toISOString().slice(0, 10);
}

export function normalizeRef(value?: string | null): string {
  return (value ?? '').trim().toLowerCase().replace(/[\s#-]+/g, '');
}

export function refsCompatible(
  statementRef?: string | null,
  bookRef?: string | null,
  bookMemo?: string | null,
): boolean {
  const needle = normalizeRef(statementRef);
  if (!needle || needle.length < 2) {
    return false;
  }
  const haystacks = [normalizeRef(bookRef), normalizeRef(bookMemo)].filter(
    Boolean,
  );
  return haystacks.some(
    (hay) => hay === needle || hay.includes(needle) || needle.includes(hay),
  );
}

export type MatchableBookLine = {
  id: string;
  date: Date;
  debitMinor: number;
  creditMinor: number;
  reference?: string | null;
  memo?: string | null;
};

export type MatchableStatementLine = {
  index: number;
  date: Date;
  amountMinor: number;
  reference?: string | null;
};

/**
 * Heuristic auto-match:
 * Amount must match exactly AND (cheque/ref matches OR date within ±7 days).
 * Prefer same-day + ref matches when multiple candidates exist.
 */
export const DATE_MATCH_WINDOW_DAYS = 7;

export function autoMatchStatementLines(
  statement: MatchableStatementLine[],
  book: MatchableBookLine[],
  options?: { dateWindowDays?: number },
): Array<{ statementIndex: number; ledgerLineId: string }> {
  const windowDays = options?.dateWindowDays ?? DATE_MATCH_WINDOW_DAYS;
  const usedBook = new Set<string>();
  const matches: Array<{ statementIndex: number; ledgerLineId: string }> = [];

  for (const line of statement) {
    const candidates = book
      .filter((entry) => {
        if (usedBook.has(entry.id)) {
          return false;
        }
        if (!amountMatches(line.amountMinor, entry)) {
          return false;
        }
        const withinWindow = daysApartUtc(entry.date, line.date) <= windowDays;
        const refHit = refsCompatible(
          line.reference,
          entry.reference,
          entry.memo,
        );
        return withinWindow || refHit;
      })
      .map((entry) => {
        const dayGap = daysApartUtc(entry.date, line.date);
        const refHit = refsCompatible(
          line.reference,
          entry.reference,
          entry.memo,
        );
        let score = 0;
        if (dayGap === 0) score += 100;
        else if (dayGap <= windowDays) score += 50;
        if (refHit) score += 40;
        return { entry, score, dayGap };
      })
      .sort((a, b) => b.score - a.score || a.dayGap - b.dayGap);

    const best = candidates[0];
    if (best) {
      usedBook.add(best.entry.id);
      matches.push({
        statementIndex: line.index,
        ledgerLineId: best.entry.id,
      });
    }
  }

  return matches;
}

function amountMatches(
  amountMinor: number,
  entry: Pick<MatchableBookLine, 'debitMinor' | 'creditMinor'>,
): boolean {
  if (amountMinor > 0) {
    return entry.debitMinor === amountMinor;
  }
  if (amountMinor < 0) {
    return entry.creditMinor === -amountMinor;
  }
  return false;
}

function parseAmount(raw: string): number {
  const trimmed = raw.trim().replace(/,/g, '');
  const wrapped = trimmed.match(/^\((.+)\)$/);
  const negative = Boolean(wrapped) || trimmed.startsWith('-');
  const unsigned = (wrapped ? wrapped[1] : trimmed).replace(/^[+-]/, '');
  const value = Number(unsigned);
  if (!Number.isFinite(value)) {
    throw badRequest(`Invalid amount: ${raw}`);
  }
  const signed = negative ? -Math.abs(value) : value;
  toSignedMinorUnits(signed);
  return signed;
}

function normalizeDate(raw: string): string {
  const value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const date = new Date(value.slice(0, 10) + 'T00:00:00.000Z');
    if (Number.isNaN(date.getTime())) {
      throw badRequest(`Invalid date: ${raw}`);
    }
    return date.toISOString();
  }
  const dmy = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const date = new Date(
      Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])),
    );
    if (Number.isNaN(date.getTime())) {
      throw badRequest(`Invalid date: ${raw}`);
    }
    return date.toISOString();
  }
  throw badRequest(`Invalid date: ${raw}`);
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  const text = csv.replace(/^\uFEFF/, '');

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    if (char !== '\r') {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }
  return rows;
}
