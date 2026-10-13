import { badRequest } from '../errors/app-error';

export const MONEY_SCALE = 100;

/**
 * True when `scaled` is a whole number up to floating-point noise. The noise
 * grows with magnitude (1221806.14 * 100 = 122180613.99999999), so a fixed
 * epsilon wrongly rejects large amounts.
 */
export function isWholeAfterScaling(scaled: number): boolean {
  return Math.abs(scaled - Math.round(scaled)) <= Math.max(1e-8, Math.abs(scaled) * 1e-13);
}

export function toMinorUnits(amount: number): number {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw badRequest('Amount must be a valid number');
  }
  if (amount < 0) {
    throw badRequest('Amount cannot be negative');
  }
  const scaled = amount * MONEY_SCALE;
  const minor = Math.round(scaled);
  if (!isWholeAfterScaling(scaled)) {
    throw badRequest('Amount cannot have more than 2 decimal places');
  }
  return minor;
}

export function fromMinorUnits(minor: number): number {
  return Number((minor / MONEY_SCALE).toFixed(2));
}

export function assertDebitsEqualCredits(
  debitMinor: number,
  creditMinor: number,
): void {
  if (debitMinor !== creditMinor) {
    throw badRequest(
      `Journal is not balanced: debits (${fromMinorUnits(debitMinor)}) must equal credits (${fromMinorUnits(creditMinor)})`,
    );
  }
  if (debitMinor <= 0) {
    throw badRequest('Journal totals must be greater than zero');
  }
}
