import { badRequest } from '../../common/errors/app-error';

export type ParsedStatementLine = {
  date: string;
  description: string;
  amount: number;
  reference?: string;
};

const HEADER_DATE = /^(date|txn_date|transaction_date|value_date)$/i;
const HEADER_DESC = /^(description|narration|memo|particulars|details)$/i;
const HEADER_AMOUNT = /^(amount|amt|value)$/i;
const HEADER_REF = /^(reference|ref|cheque|check|txn_id)$/i;

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
  return lines;
}

export function sameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export type MatchableBookLine = {
  id: string;
  date: Date;
  debitMinor: number;
  creditMinor: number;
};

export type MatchableStatementLine = {
  index: number;
  date: Date;
  amountMinor: number;
};

export function autoMatchStatementLines(
  statement: MatchableStatementLine[],
  book: MatchableBookLine[],
): Array<{ statementIndex: number; ledgerLineId: string }> {
  const usedBook = new Set<string>();
  const matches: Array<{ statementIndex: number; ledgerLineId: string }> = [];

  for (const line of statement) {
    const candidate = book.find((entry) => {
      if (usedBook.has(entry.id)) {
        return false;
      }
      if (!sameUtcDay(entry.date, line.date)) {
        return false;
      }
      if (line.amountMinor > 0) {
        return entry.debitMinor === line.amountMinor;
      }
      if (line.amountMinor < 0) {
        return entry.creditMinor === -line.amountMinor;
      }
      return false;
    });
    if (candidate) {
      usedBook.add(candidate.id);
      matches.push({ statementIndex: line.index, ledgerLineId: candidate.id });
    }
  }

  return matches;
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
