import { AppError } from '../errors/app-error';
import {
  assertDebitsEqualCredits,
  fromMinorUnits,
  toMinorUnits,
} from './money';

describe('money', () => {
  it('converts major units to integer minor units', () => {
    expect(toMinorUnits(10)).toBe(1000);
    expect(toMinorUnits(10.5)).toBe(1050);
    expect(toMinorUnits(10.55)).toBe(1055);
  });

  it('rejects more than two decimal places', () => {
    expect(() => toMinorUnits(10.555)).toThrow(AppError);
  });

  it('round-trips through major units', () => {
    expect(fromMinorUnits(toMinorUnits(1250.75))).toBe(1250.75);
  });

  it('accepts a balanced journal', () => {
    expect(() => assertDebitsEqualCredits(50000, 50000)).not.toThrow();
  });

  it('rejects an unbalanced journal', () => {
    expect(() => assertDebitsEqualCredits(50000, 49900)).toThrow(AppError);
  });
});
