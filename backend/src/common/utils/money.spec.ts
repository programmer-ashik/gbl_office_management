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
    expect(() => toMinorUnits(1221806.145)).toThrow(AppError);
    expect(() => toMinorUnits(987654321.001)).toThrow(AppError);
  });

  it('accepts large two-decimal amounts despite floating-point noise', () => {
    expect(toMinorUnits(1221806.14)).toBe(122180614);
    expect(toMinorUnits(1234567.89)).toBe(123456789);
    expect(toMinorUnits(2500000.07)).toBe(250000007);
    for (let minor = 100_000_000; minor < 2_000_000_000; minor += 7919) {
      expect(toMinorUnits(fromMinorUnits(minor))).toBe(minor);
    }
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
