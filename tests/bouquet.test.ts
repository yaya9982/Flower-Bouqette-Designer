import { describe, expect, it } from 'vitest';
import { DEFAULT_HEIGHT, TAU } from '../src/arrange';
import {
  addStem, adjustStem, commit, createDefaultBouquet, createHistory, HISTORY_LIMIT, loadBouquet,
  MAX_SAVED_LENGTH, MAX_STEMS, moveStem, rearrange, recolourStem, redo, removeOneOfType, removeStem, resolveSelection,
  saveBouquet, setShape, setWrap, STORAGE_KEY, swapStem, undo, validateBouquet, type Bouquet, type Store,
} from '../src/bouquet';
import { FLOWERS } from '../src/catalog';

const base = () => createDefaultBouquet(FLOWERS);
const full = () => {
  let b = base();
  while (b.stems.length < MAX_STEMS) b = addStem(b, 'rose', FLOWERS);
  return b;
};
const single = () => {
  let b = base();
  while (b.stems.length > 1) b = removeStem(b, b.stems[0].id);
  return b;
};
const memoryStore = (initial: Record<string, string> = {}): Store & { data: Record<string, string> } => {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
};

describe('createDefaultBouquet', () => {
  it('makes a valid 12-stem bouquet with unique ids', () => {
    const b = base();
    expect(b.stems).toHaveLength(12);
    expect(new Set(b.stems.map((s) => s.id)).size).toBe(12);
    expect(validateBouquet(JSON.parse(JSON.stringify(b)), FLOWERS)).toEqual(b);
  });
});

describe('addStem', () => {
  it('adds one stem in the first colour of its type, with a new id', () => {
    const b = base();
    const next = addStem(b, 'lily', FLOWERS);
    const added = next.stems[next.stems.length - 1];
    expect(next.stems).toHaveLength(13);
    expect(added).toMatchObject({ flower: 'lily', colour: 'white', height: DEFAULT_HEIGHT, tilt: 0 });
    expect(b.stems.some((s) => s.id === added.id)).toBe(false);
  });

  it('does not move the existing stems', () => {
    const b = base();
    expect(addStem(b, 'lily', FLOWERS).stems.slice(0, 12)).toEqual(b.stems);
  });

  it('never reuses the id of a removed stem that is still the highest', () => {
    const b = base();
    const removed = removeStem(b, 's3');
    const added = addStem(removed, 'rose', FLOWERS).stems.at(-1)!;
    expect(removed.stems.some((s) => s.id === added.id)).toBe(false);
  });

  it('does nothing at the 40-stem limit', () => {
    const b = full();
    expect(b.stems).toHaveLength(MAX_STEMS);
    expect(addStem(b, 'rose', FLOWERS)).toBe(b);
  });

  it('does nothing for a flower not in the catalogue', () => {
    const b = base();
    expect(addStem(b, 'cactus', FLOWERS)).toBe(b);
  });
});

describe('removing', () => {
  it('removes the named stem and leaves the others unchanged', () => {
    const b = base();
    const next = removeStem(b, b.stems[2].id);
    expect(next.stems).toEqual(b.stems.filter((_, i) => i !== 2));
  });

  it('does nothing for an unknown id', () => {
    const b = base();
    expect(removeStem(b, 'nope')).toBe(b);
  });

  it('never removes the last stem', () => {
    const b = single();
    expect(removeStem(b, b.stems[0].id)).toBe(b);
  });

  it('removeOneOfType removes exactly one stem of that type', () => {
    const b = base();
    const roses = b.stems.filter((s) => s.flower === 'rose').length;
    const next = removeOneOfType(b, 'rose');
    expect(next.stems.filter((s) => s.flower === 'rose')).toHaveLength(roses - 1);
    expect(next.stems).toHaveLength(b.stems.length - 1);
  });

  it('removeOneOfType does nothing when there is none of that type', () => {
    const b = base();
    expect(removeOneOfType(b, 'sunflower')).toBe(b);
  });
});

describe('swapStem and recolourStem', () => {
  it('swap keeps the position and takes the first colour of the new type', () => {
    const b = base();
    const before = b.stems[0];
    const after = swapStem(b, before.id, 'sunflower', FLOWERS).stems[0];
    expect(after).toEqual({ ...before, flower: 'sunflower', colour: 'yellow' });
  });

  it('swap does nothing for an unknown flower or stem', () => {
    const b = base();
    expect(swapStem(b, b.stems[0].id, 'cactus', FLOWERS)).toBe(b);
    expect(swapStem(b, 'nope', 'rose', FLOWERS)).toBe(b);
  });

  it('recolour accepts a colour the flower comes in', () => {
    const b = base();
    const rose = b.stems.find((s) => s.flower === 'rose')!;
    expect(recolourStem(b, rose.id, 'white', FLOWERS).stems.find((s) => s.id === rose.id)!.colour).toBe('white');
  });

  it('recolour refuses a colour the flower does not come in', () => {
    const b = base();
    const rose = b.stems.find((s) => s.flower === 'rose')!;
    expect(recolourStem(b, rose.id, 'blue', FLOWERS)).toBe(b);
  });
});

describe('moveStem and adjustStem', () => {
  it('moves one stem and leaves the rest', () => {
    const b = base();
    const next = moveStem(b, b.stems[1].id, 1, 0.5);
    expect(next.stems[1]).toMatchObject({ angle: 1, dist: 0.5 });
    expect(next.stems[0]).toBe(b.stems[0]);
  });

  it('wraps the angle into 0..2π and clamps the distance', () => {
    const b = base();
    const id = b.stems[0].id;
    expect(moveStem(b, id, -1, 5).stems[0]).toMatchObject({ dist: 1 });
    expect(moveStem(b, id, -1, 5).stems[0].angle).toBeCloseTo(TAU - 1);
    expect(moveStem(b, id, TAU + 1, -3).stems[0].angle).toBeCloseTo(1);
    expect(moveStem(b, id, 0, -3).stems[0].dist).toBe(0);
  });

  it('ignores a position that is not a number', () => {
    const b = base();
    expect(moveStem(b, b.stems[0].id, NaN, 0.5)).toBe(b);
    expect(moveStem(b, b.stems[0].id, 1, Infinity)).toBe(b);
  });

  it('clamps height and tilt, and ignores values that are not numbers', () => {
    const b = base();
    const id = b.stems[0].id;
    expect(adjustStem(b, id, { height: 9, tilt: -9 }).stems[0]).toMatchObject({ height: 1, tilt: -0.5 });
    expect(adjustStem(b, id, { height: NaN }).stems[0].height).toBe(b.stems[0].height);
    expect(adjustStem(b, 'nope', { height: 0.2 })).toBe(b);
  });
});

describe('shape, wrap and rearrange', () => {
  it('switching shape keeps every stem exactly as it was', () => {
    const b = moveStem(base(), 's1', 2, 0.3);
    const next = setShape(b, 'cascade');
    expect(next.shape).toBe('cascade');
    expect(next.stems).toBe(b.stems);
  });

  it('refuses an unknown shape', () => {
    const b = base();
    expect(setShape(b, 'pyramid' as never)).toBe(b);
  });

  it('sets wrap fields and refuses unknown values', () => {
    const b = base();
    expect(setWrap(b, { paper: 'tissue', ribbonColour: 'navy' }).wrap).toEqual({ ...b.wrap, paper: 'tissue', ribbonColour: 'navy' });
    expect(setWrap(b, { paperColour: 'neon' })).toBe(b);
    expect(setWrap(b, { paper: 'foil' as never })).toBe(b);
  });

  it('rearrange resets hand adjustments', () => {
    const b = adjustStem(moveStem(base(), 's1', 2, 0.3), 's1', { tilt: 0.4 });
    expect(rearrange(b, FLOWERS).stems).toEqual(base().stems);
  });
});

describe('resolveSelection', () => {
  it('keeps a selection that still exists and clears one that does not', () => {
    const b = base();
    expect(resolveSelection(b, 's1')).toBe('s1');
    expect(resolveSelection(removeStem(b, 's1'), 's1')).toBeNull();
    expect(resolveSelection(b, null)).toBeNull();
  });
});

describe('validateBouquet', () => {
  const good = () => JSON.parse(JSON.stringify(base())) as Record<string, any>;

  it('accepts a saved default bouquet', () => {
    expect(validateBouquet(good(), FLOWERS)).toEqual(base());
  });

  it('drops unknown extra fields', () => {
    const data = good();
    data.extra = 1;
    data.stems[0].extra = 1;
    expect(validateBouquet(data, FLOWERS)).toEqual(base());
  });

  const bad: [string, (d: Record<string, any>) => unknown][] = [
    ['not an object', () => 'hello'],
    ['null', () => null],
    ['wrong version', (d) => ({ ...d, version: 2 })],
    ['unknown shape', (d) => ({ ...d, shape: 'pyramid' })],
    ['missing wrap', (d) => ({ ...d, wrap: undefined })],
    ['unknown paper', (d) => ({ ...d, wrap: { ...d.wrap, paper: 'foil' } })],
    ['unknown ribbon colour', (d) => ({ ...d, wrap: { ...d.wrap, ribbonColour: 'neon' } })],
    ['stems not a list', (d) => ({ ...d, stems: {} })],
    ['no stems', (d) => ({ ...d, stems: [] })],
    ['too many stems', (d) => ({ ...d, stems: Array.from({ length: 41 }, (_, i) => ({ ...d.stems[0], id: `s${i + 1}` })) })],
    ['duplicate ids', (d) => ({ ...d, stems: [d.stems[0], d.stems[0]] })],
    ['flower not in the catalogue', (d) => ({ ...d, stems: [{ ...d.stems[0], flower: 'cactus' }] })],
    ['colour the flower does not come in', (d) => ({ ...d, stems: [{ ...d.stems[0], flower: 'rose', colour: 'blue' }] })],
    ['id in the wrong form', (d) => ({ ...d, stems: [{ ...d.stems[0], id: 'first' }] })],
    ['id too large to count from exactly', (d) => ({ ...d, stems: [{ ...d.stems[0], id: 's9007199254740993' }] })],
    ['distance out of range', (d) => ({ ...d, stems: [{ ...d.stems[0], dist: 1.5 }] })],
    ['angle not a number', (d) => ({ ...d, stems: [{ ...d.stems[0], angle: 'north' }] })],
    ['height missing', (d) => ({ ...d, stems: [{ ...d.stems[0], height: undefined }] })],
    ['tilt out of range', (d) => ({ ...d, stems: [{ ...d.stems[0], tilt: 2 }] })],
    ['stem is null', (d) => ({ ...d, stems: [null] })],
  ];
  for (const [name, breakIt] of bad) {
    it(`rejects: ${name}`, () => {
      expect(validateBouquet(breakIt(good()), FLOWERS)).toBeNull();
    });
  }
});

describe('history', () => {
  const step = (b: Bouquet, i: number) => moveStem(b, 's1', i / 1000, 0.5);

  it('undo then redo returns to the same bouquet', () => {
    const a = base();
    const b = setShape(a, 'loose');
    const h = commit(createHistory(a), b);
    expect(undo(h).present).toBe(a);
    expect(redo(undo(h)).present).toBe(b);
  });

  it('undo and redo do nothing when there is nothing to undo or redo', () => {
    const h = createHistory(base());
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it('a change that returned the same bouquet is not recorded', () => {
    const h = createHistory(base());
    expect(commit(h, h.present)).toBe(h);
  });

  it('a new change after undo clears redo', () => {
    const a = base();
    const h = undo(commit(createHistory(a), setShape(a, 'loose')));
    expect(commit(h, setShape(a, 'cascade')).future).toEqual([]);
  });

  it('keeps at most 100 steps', () => {
    let h = createHistory(base());
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = commit(h, step(h.present, i));
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });
});

describe('saving', () => {
  it('saves and loads the same bouquet', () => {
    const store = memoryStore();
    const b = setShape(base(), 'cascade');
    saveBouquet(b, store);
    expect(loadBouquet(FLOWERS, store)).toEqual(b);
  });

  it('returns null when nothing is saved', () => {
    expect(loadBouquet(FLOWERS, memoryStore())).toBeNull();
  });

  it('returns null for corrupt text', () => {
    expect(loadBouquet(FLOWERS, memoryStore({ [STORAGE_KEY]: '{not json' }))).toBeNull();
  });

  it('ignores saved text far bigger than a full bouquet, and a full bouquet fits', () => {
    let full = base();
    while (full.stems.length < MAX_STEMS) full = addStem(full, 'rose', FLOWERS);
    expect(JSON.stringify(full).length).toBeLessThan(MAX_SAVED_LENGTH);
    expect(loadBouquet(FLOWERS, memoryStore({ [STORAGE_KEY]: JSON.stringify(base()) + ' '.repeat(MAX_SAVED_LENGTH) }))).toBeNull();
  });

  it('returns null for a saved flower that is no longer in the catalogue', () => {
    const store = memoryStore();
    saveBouquet(base(), store);
    expect(loadBouquet(FLOWERS.filter((f) => f.id !== 'rose'), store)).toBeNull();
  });

  it('does not throw when storage is blocked', () => {
    const blocked: Store = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('full'); },
    };
    expect(() => saveBouquet(base(), blocked)).not.toThrow();
    expect(loadBouquet(FLOWERS, blocked)).toBeNull();
  });
});

describe('changes that change nothing', () => {
  it('return the same bouquet, so they add no undo step', () => {
    const b = base();
    const s = b.stems[0];
    expect(recolourStem(b, s.id, s.colour, FLOWERS)).toBe(b);
    expect(moveStem(b, s.id, s.angle, s.dist)).toBe(b);
    expect(adjustStem(b, s.id, { height: s.height, tilt: s.tilt })).toBe(b);
    expect(swapStem(b, s.id, s.flower, FLOWERS)).toBe(b);
    expect(setWrap(b, { paper: b.wrap.paper, ribbonColour: b.wrap.ribbonColour })).toBe(b);
    expect(setShape(b, b.shape)).toBe(b);
    expect(rearrange(b, FLOWERS)).toBe(b);
  });
});
