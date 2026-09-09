import type { ParsedStatementLine } from './csv';

export type StatementParseResult = {
  lines: ParsedStatementLine[];
  openingBalance?: number;
  closingBalance?: number;
  /** Inclusive statement period start (ISO). */
  periodFrom?: string;
  /** Inclusive statement period end / as-of (ISO). */
  periodTo?: string;
  /** YYYY-MM-DD for form controls. */
  asOf?: string;
};

const AMOUNT_TOKEN = String.raw`(?:BDT|Tk\.?|৳)?\s*([+-]?\(?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?\)?)`;

const OPENING_PATTERNS = [
  new RegExp(
    String.raw`(?:opening\s*(?:bal(?:ance)?|b\/d)|brought\s*(?:forward|fwd)|balance\s*b\/d|opening\s*bal)\s*[:\-]?\s*${AMOUNT_TOKEN}`,
    'i',
  ),
  new RegExp(
    String.raw`${AMOUNT_TOKEN}\s*(?:opening\s*(?:bal(?:ance)?|b\/d)|brought\s*(?:forward|fwd))`,
    'i',
  ),
];

const CLOSING_PATTERNS = [
  new RegExp(
    String.raw`(?:closing\s*(?:bal(?:ance)?|c\/d)|ending\s*bal(?:ance)?|closing\s*balance|carried\s*(?:forward|fwd)|balance\s*c\/d|available\s*balance(?:\s*as\s*of\s*[\d/-]+)?)\s*[:\-]?\s*${AMOUNT_TOKEN}`,
    'i',
  ),
  new RegExp(
    String.raw`${AMOUNT_TOKEN}\s*(?:closing\s*(?:bal(?:ance)?|c\/d)|ending\s*bal(?:ance)?|available\s*balance)`,
    'i',
  ),
];

const PERIOD_PATTERNS = [
  /(?:statement\s*)?period\s*(?:from)?\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\s*(?:to|-|–|—)\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i,
  /from\s+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\s+to\s+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})/i,
];

/**
 * Merge transaction lines with opening/closing/period metadata scraped from
 * raw statement text (PDF extract or CSV body).
 */
export function buildStatementParseResult(
  lines: ParsedStatementLine[],
  sourceText?: string,
): StatementParseResult {
  const text = sourceText ?? '';
  const fromLabels = extractLabeledBalances(text);
  const fromRows = extractBalanceRows(lines);
  const period = extractPeriod(text);

  let openingBalance = fromLabels.opening ?? fromRows.opening;
  let closingBalance = fromLabels.closing ?? fromRows.closing;

  const txnLines = lines.filter((line) => !isBalanceDescription(line.description));

  if (
    openingBalance != null &&
    closingBalance == null &&
    txnLines.length > 0
  ) {
    const movement = txnLines.reduce((sum, line) => sum + line.amount, 0);
    closingBalance = roundMoney(openingBalance + movement);
  }

  let periodFrom = period.from;
  let periodTo = period.to;

  if (txnLines.length > 0) {
    const dates = txnLines
      .map((line) => line.date.slice(0, 10))
      .sort();
    periodFrom = periodFrom ?? `${dates[0]}T00:00:00.000Z`;
    periodTo = periodTo ?? `${dates[dates.length - 1]}T00:00:00.000Z`;
  }

  const asOf = periodTo ? periodTo.slice(0, 10) : undefined;

  return {
    lines: txnLines,
    openingBalance,
    closingBalance,
    periodFrom,
    periodTo,
    asOf,
  };
}

export function isBalanceDescription(description: string): boolean {
  return /^(opening|closing|ending)\b.*\bbal(ance)?\b|brought\s*(forward|fwd)|carried\s*(forward|fwd)|balance\s*[bc]\/d/i.test(
    description.trim(),
  );
}

function extractLabeledBalances(text: string): {
  opening?: number;
  closing?: number;
} {
  if (!text.trim()) return {};
  let opening: number | undefined;
  let closing: number | undefined;

  for (const pattern of OPENING_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const value = parseLooseAmount(match[1]);
      if (value != null) {
        opening = value;
        break;
      }
    }
  }
  for (const pattern of CLOSING_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const value = parseLooseAmount(match[1]);
      if (value != null) {
        closing = value;
        break;
      }
    }
  }
  return { opening, closing };
}

function extractBalanceRows(lines: ParsedStatementLine[]): {
  opening?: number;
  closing?: number;
} {
  let opening: number | undefined;
  let closing: number | undefined;
  for (const line of lines) {
    if (!isBalanceDescription(line.description)) continue;
    if (/opening|brought|b\/d/i.test(line.description)) {
      opening = Math.abs(line.amount);
    } else if (/closing|ending|carried|c\/d/i.test(line.description)) {
      closing = Math.abs(line.amount);
    }
  }
  return { opening, closing };
}

function extractPeriod(text: string): { from?: string; to?: string } {
  for (const pattern of PERIOD_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1] && match[2]) {
      const from = normalizeLooseDate(match[1]);
      const to = normalizeLooseDate(match[2]);
      if (from && to) return { from, to };
    }
  }
  return {};
}

function parseLooseAmount(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, '');
  const wrapped = trimmed.match(/^\((.+)\)$/);
  const negative = Boolean(wrapped) || trimmed.startsWith('-');
  const unsigned = (wrapped ? wrapped[1] : trimmed).replace(/^[+-]/, '');
  const value = Number(unsigned);
  if (!Number.isFinite(value)) return null;
  return roundMoney(negative ? -Math.abs(value) : value);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeLooseDate(raw: string): string | null {
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
