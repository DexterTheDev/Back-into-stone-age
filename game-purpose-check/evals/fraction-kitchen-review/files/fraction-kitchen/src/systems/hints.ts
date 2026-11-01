import { Fraction } from './fractionEngine';

// TODO(M4): hints repeat on level 7. Show a new visual model on the second miss.
export function hintFor(target: Fraction, attempts: number): string {
  return attempts > 1 ? 'Try cutting into equal pieces first.' : 'Look at the size of each piece.';
}
