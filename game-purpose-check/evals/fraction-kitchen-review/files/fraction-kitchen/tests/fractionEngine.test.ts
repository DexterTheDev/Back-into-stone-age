import { describe, expect, it } from 'vitest';
import { add, equivalent } from '../src/systems/fractionEngine';

describe('fractions', () => {
  it('adds with unlike denominators', () => {
    expect(add({ numerator: 1, denominator: 2 }, { numerator: 1, denominator: 4 })).toEqual({ numerator: 3, denominator: 4 });
  });
  it('finds equivalents', () => {
    expect(equivalent({ numerator: 2, denominator: 4 }, { numerator: 1, denominator: 2 })).toBe(true);
  });
});
