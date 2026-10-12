import { describe, expect, it } from 'vitest';
import { compositionIsComplete, compositionTotal, rebalancePercentages } from './compositionMath';
import { isValidCas } from './casValidation';

describe('compositionMath', () => {
  it('accepts totals within tolerance', () => {
    expect(compositionIsComplete(compositionTotal([{ pct: '50' }, { pct: '50' }]))).toBe(true);
    expect(compositionIsComplete(compositionTotal([{ pct: '33.333' }, { pct: '33.333' }, { pct: '33.334' }]))).toBe(true);
  });

  it('rebalances onto the largest row', () => {
    const rows = rebalancePercentages([
      { pct: '40', key: 'a' },
      { pct: '30', key: 'b' },
    ]);
    expect(compositionTotal(rows)).toBeCloseTo(100, 3);
  });
});

describe('casValidation', () => {
  it('validates water CAS', () => {
    expect(isValidCas('7732-18-5')).toBe(true);
    expect(isValidCas('7732-18-6')).toBe(false);
  });
});
