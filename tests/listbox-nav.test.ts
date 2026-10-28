import { describe, expect, it } from 'vitest';
import { moveIndex, typeAhead } from '../src/listbox-nav';

describe('moveIndex', () => {
  it('moves by one and stops at the ends', () => {
    expect(moveIndex(1, 4, 'ArrowDown')).toBe(2);
    expect(moveIndex(3, 4, 'ArrowDown')).toBe(3);
    expect(moveIndex(1, 4, 'ArrowUp')).toBe(0);
    expect(moveIndex(0, 4, 'ArrowUp')).toBe(0);
  });
  it('jumps with Home and End', () => {
    expect(moveIndex(2, 4, 'Home')).toBe(0);
    expect(moveIndex(1, 4, 'End')).toBe(3);
  });
  it('ignores other keys and empty lists', () => {
    expect(moveIndex(2, 4, 'a')).toBe(2);
    expect(moveIndex(0, 0, 'ArrowDown')).toBe(-1);
  });
});

describe('typeAhead', () => {
  const labels = ['Rose – Red', 'Rose – Pink', 'Sunflower', 'Tulip'];
  it('finds the next label starting with the typed text, ignoring case', () => {
    expect(typeAhead(labels, 'su', 0)).toBe(2);
    expect(typeAhead(labels, 'TU', 0)).toBe(3);
  });
  it('a repeated single letter cycles through matches after the current one', () => {
    expect(typeAhead(labels, 'r', 0)).toBe(1);
    expect(typeAhead(labels, 'r', 1)).toBe(0);
  });
  it('returns -1 when nothing matches', () => {
    expect(typeAhead(labels, 'z', 0)).toBe(-1);
  });
});
