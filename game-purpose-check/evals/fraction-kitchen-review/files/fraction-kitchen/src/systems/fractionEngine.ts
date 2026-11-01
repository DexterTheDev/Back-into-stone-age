export interface Fraction { numerator: number; denominator: number }
export interface FractionItem { id: string; value: Fraction }

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

export function simplify(f: Fraction): Fraction {
  const d = gcd(f.numerator, f.denominator);
  return { numerator: f.numerator / d, denominator: f.denominator / d };
}

export function add(a: Fraction, b: Fraction): Fraction {
  return simplify({
    numerator: a.numerator * b.denominator + b.numerator * a.denominator,
    denominator: a.denominator * b.denominator,
  });
}

export function compare(a: Fraction, b: Fraction): number {
  return a.numerator * b.denominator - b.numerator * a.denominator;
}

export function equivalent(a: Fraction, b: Fraction): boolean {
  return compare(a, b) === 0;
}
