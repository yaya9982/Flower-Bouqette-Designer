import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HELP, HELP_KEYS } from '../src/help';

describe('the ? help for panel sections', () => {
  it('covers Your bouquet, Actions, Shape and Selected', () => {
    expect([...HELP_KEYS].sort()).toEqual(['actions', 'bouquet', 'selected', 'shape']);
  });

  it.each([...HELP_KEYS])('%s has short text and a demo clip that exists', (key) => {
    const h = HELP[key];
    expect(h.title.length).toBeGreaterThan(0);
    expect(h.text.length).toBeGreaterThan(60);
    expect(h.text.length).toBeLessThan(420);
    expect(existsSync(`public/demos/${h.clip}`)).toBe(true);
  });
});
