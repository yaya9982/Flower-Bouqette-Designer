import { describe, expect, it } from 'vitest';
import { rowAt } from '../src/preview-hit';

// Five rows 40 px tall with a 4 px gap, the first at y = 100.
const spans = Array.from({ length: 5 }, (_, i) => ({ top: 100 + i * 44, bottom: 140 + i * 44 }));

describe('rowAt', () => {
  it('picks the row the pointer is over, including its first and last pixel', () => {
    expect(rowAt(spans, 100)).toBe(0);
    expect(rowAt(spans, 120)).toBe(0);
    expect(rowAt(spans, 140)).toBe(0);
    expect(rowAt(spans, 144)).toBe(1);
    expect(rowAt(spans, 276)).toBe(4);
  });

  it('gives a gap between two rows to the nearer one, so there is no dead strip', () => {
    expect(rowAt(spans, 141)).toBe(0);
    expect(rowAt(spans, 143)).toBe(1);
    for (let y = 100; y <= 276; y += 0.5) expect(rowAt(spans, y)).toBeGreaterThanOrEqual(0);
  });

  it('gives the padding above and below the list to the first and last row', () => {
    expect(rowAt(spans, 60)).toBe(0);
    expect(rowAt(spans, -5000)).toBe(0);
    expect(rowAt(spans, 300)).toBe(4);
    expect(rowAt(spans, 99999)).toBe(4);
  });

  it('breaks an exact tie towards the row above', () => {
    expect(rowAt(spans, 142)).toBe(0);
  });

  it('copes with overlapping rows, a single row and no rows', () => {
    expect(rowAt([{ top: 0, bottom: 50 }, { top: 40, bottom: 90 }], 45)).toBe(0);
    expect(rowAt([{ top: 10, bottom: 20 }], 500)).toBe(0);
    expect(rowAt([], 10)).toBe(-1);
  });

  it('survives odd coordinates: fractions, NaN, infinities', () => {
    expect(rowAt(spans, 140.4)).toBe(0);
    expect(rowAt(spans, 143.6)).toBe(1);
    expect(rowAt(spans, Number.NaN)).toBe(-1);
    expect(rowAt(spans, Infinity)).toBe(4);
    expect(rowAt(spans, -Infinity)).toBe(0);
  });
});
