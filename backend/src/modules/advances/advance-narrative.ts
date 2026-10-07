import { AdvanceModel } from './advance.model';

const ADVANCE_NUMBER = /^ADV-\d{4}-\d+$/i;

/** Line texts the advance module wrote before it carried the employee's purpose. */
const AUTO_LINE_TEXT = [
  /^Advance to .+/i,
  /^Disburse ADV-\S+$/i,
  /^Close employee advance$/i,
  /^Unspent advance returned$/i,
  /^Excess spend due to employee$/i,
  /^Reimburse .+ · ADV-\S+$/i,
];

export function isAdvanceNumber(value: string | null | undefined): boolean {
  return Boolean(value && ADVANCE_NUMBER.test(value.trim()));
}

export function isAutoAdvanceLineText(
  text: string | null | undefined,
  accountName?: string | null,
): boolean {
  const value = text?.trim() ?? '';
  if (!value) return true;
  if (accountName && value === accountName.trim()) return true;
  return AUTO_LINE_TEXT.some((pattern) => pattern.test(value));
}

/** Requisition purpose keyed by advance number, for journals referencing advances. */
export async function advancePurposesByNumber(
  references: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const numbers = [
    ...new Set(
      references
        .filter((ref): ref is string => isAdvanceNumber(ref))
        .map((ref) => ref.trim().toUpperCase()),
    ),
  ];
  if (!numbers.length) return new Map();
  const rows = await AdvanceModel.find({ advanceNumber: { $in: numbers } })
    .select({ advanceNumber: 1, purpose: 1 })
    .lean()
    .exec();
  return new Map(
    rows
      .filter((row) => row.purpose?.trim())
      .map((row) => [row.advanceNumber.toUpperCase(), row.purpose.trim()]),
  );
}

export function purposeFor(
  purposes: Map<string, string>,
  reference: string | null | undefined,
): string | undefined {
  if (!reference) return undefined;
  return purposes.get(reference.trim().toUpperCase());
}

type NarratedLine = {
  accountName?: string | null;
  description?: string | null;
};

/** Swaps generated advance wording for the employee's purpose; typed text stays. */
export function withAdvancePurpose<T extends NarratedLine>(
  lines: T[],
  purpose: string | undefined,
): T[] {
  if (!purpose) return lines;
  return lines.map((line) =>
    isAutoAdvanceLineText(line.description, line.accountName)
      ? { ...line, description: purpose }
      : line,
  );
}

/** Applies the advance purpose to public journals (register, day report, voucher). */
export async function withAdvancePurposeJournals<
  T extends { reference?: string | null; memo: string; lines: NarratedLine[] },
>(journals: T[]): Promise<T[]> {
  const purposes = await advancePurposesByNumber(
    journals.map((row) => row.reference),
  );
  if (!purposes.size) return journals;
  return journals.map((journal) => {
    const purpose = purposeFor(purposes, journal.reference);
    if (!purpose) return journal;
    return { ...journal, lines: withAdvancePurpose(journal.lines, purpose) };
  });
}
