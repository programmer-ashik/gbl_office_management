import { badRequest } from '../errors/app-error';

export const QTY_SCALE = 1000;

export function toMilliQty(quantity: number): number {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity)) {
    throw badRequest('Quantity must be a valid number');
  }
  if (quantity <= 0) {
    throw badRequest('Quantity must be greater than zero');
  }
  const scaled = quantity * QTY_SCALE;
  const milli = Math.round(scaled);
  if (Math.abs(scaled - milli) > 1e-8) {
    throw badRequest('Quantity cannot have more than 3 decimal places');
  }
  return milli;
}

export function fromMilliQty(milli: number): number {
  return Number((milli / QTY_SCALE).toFixed(3));
}

export function lineAmountMinor(
  quantityMilli: number,
  unitCostMinor: number,
): number {
  return Math.round((quantityMilli * unitCostMinor) / QTY_SCALE);
}
