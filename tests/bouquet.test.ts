import { describe, expect, it } from 'vitest';
import {
  BouquetEditor, BouquetStore, History, HISTORY_LIMIT, MAX_SAVED_LENGTH, MAX_STEMS, STORAGE_KEY, type Bouquet, type Store,
} from '../src/bouquet';
import { Catalog, FLOWERS } from '../src/catalog';
import { DEFAULT_HEIGHT, TAU } from '../src/shapes';

const editor = new BouquetEditor(new Catalog(FLOWERS));

const base = () => editor.createDefault();
const full = () => {
  let b = base();
  while (b.stems.length < MAX_STEMS) b = editor.add(b, 'rose');
  return b;
};
const single = () => {
  let b = base();
  while (b.stems.length > 1) b = editor.remove(b, b.stems[0].id);
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
    expect(editor.validate(JSON.parse(JSON.stringify(b)))).toEqual(b);
  });
});

describe('addStem', () => {
  it('adds one stem in the first colour of its type, with a new id', () => {
    const b = base();
    const next = editor.add(b, 'lily');
    const added = next.stems[next.stems.length - 1];
    expect(next.stems).toHaveLength(13);
    expect(added).toMatchObject({ flower: 'lily', colour: 'white', height: DEFAULT_HEIGHT, tilt: 0 });
    expect(b.stems.some((s) => s.id === added.id)).toBe(false);
  });

  it('does not move the existing stems', () => {
    const b = base();
    expect(editor.add(b, 'lily').stems.slice(0, 12)).toEqual(b.stems);
  });

  it('never reuses the id of a removed stem that is still the highest', () => {
    const b = base();
    const removed = editor.remove(b, 's3');
    const added = editor.add(removed, 'rose').stems.at(-1)!;
    expect(removed.stems.some((s) => s.id === added.id)).toBe(false);
  });

  it('does nothing at the 40-stem limit', () => {
    const b = full();
    expect(b.stems).toHaveLength(MAX_STEMS);
    expect(editor.add(b, 'rose')).toBe(b);
  });

  it('does nothing for a flower not in the catalogue', () => {
    const b = base();
    expect(editor.add(b, 'cactus')).toBe(b);
  });
});

describe('removing', () => {
  it('removes the named stem and leaves the others unchanged', () => {
    const b = base();
    const next = editor.remove(b, b.stems[2].id);
    expect(next.stems).toEqual(b.stems.filter((_, i) => i !== 2));
  });

  it('does nothing for an unknown id', () => {
    const b = base();
    expect(editor.remove(b, 'nope')).toBe(b);
  });

  it('never removes the last stem', () => {
    const b = single();
    expect(editor.remove(b, b.stems[0].id)).toBe(b);
  });

  it('removeOneOfType removes exactly one stem of that type', () => {
    const b = base();
    const roses = b.stems.filter((s) => s.flower === 'rose').length;
    const next = editor.removeOneOfType(b, 'rose');
    expect(next.stems.filter((s) => s.flower === 'rose')).toHaveLength(roses - 1);
    expect(next.stems).toHaveLength(b.stems.length - 1);
  });

  it('removeOneOfType does nothing when there is none of that type', () => {
    const b = base();
    expect(editor.removeOneOfType(b, 'sunflower')).toBe(b);
  });
});

describe('swapStem and recolourStem', () => {
  it('swap keeps the position and takes the first colour of the new type', () => {
    const b = base();
    const before = b.stems[0];
    const after = editor.swap(b, before.id, 'sunflower').stems[0];
    expect(after).toEqual({ ...before, flower: 'sunflower', colour: 'yellow' });
  });

  it('swap does nothing for an unknown flower or stem', () => {
    const b = base();
    expect(editor.swap(b, b.stems[0].id, 'cactus')).toBe(b);
    expect(editor.swap(b, 'nope', 'rose')).toBe(b);
  });

  it('recolour accepts a colour the flower comes in', () => {
    const b = base();
    const rose = b.stems.find((s) => s.flower === 'rose')!;
    expect(editor.recolour(b, rose.id, 'white').stems.find((s) => s.id === rose.id)!.colour).toBe('white');
  });

  it('recolour refuses a colour the flower does not come in', () => {
    const b = base();
    const rose = b.stems.find((s) => s.flower === 'rose')!;
    expect(editor.recolour(b, rose.id, 'blue')).toBe(b);
  });
});

describe('moveStem and adjustStem', () => {
  it('moves one stem and leaves the rest', () => {
    const b = base();
    const next = editor.move(b, b.stems[1].id, 1, 0.5);
    expect(next.stems[1]).toMatchObject({ angle: 1, dist: 0.5 });
    expect(next.stems[0]).toBe(b.stems[0]);
  });

  it('wraps the angle into 0..2π and clamps the distance', () => {
    const b = base();
    const id = b.stems[0].id;
    expect(editor.move(b, id, -1, 5).stems[0]).toMatchObject({ dist: 1 });
    expect(editor.move(b, id, -1, 5).stems[0].angle).toBeCloseTo(TAU - 1);
    expect(editor.move(b, id, TAU + 1, -3).stems[0].angle).toBeCloseTo(1);
    expect(editor.move(b, id, 0, -3).stems[0].dist).toBe(0);
  });

  it('ignores a position that is not a number', () => {
    const b = base();
    expect(editor.move(b, b.stems[0].id, NaN, 0.5)).toBe(b);
    expect(editor.move(b, b.stems[0].id, 1, Infinity)).toBe(b);
  });

  it('clamps height and tilt, and ignores values that are not numbers', () => {
    const b = base();
    const id = b.stems[0].id;
    expect(editor.adjust(b, id, { height: 9, tilt: -9 }).stems[0]).toMatchObject({ height: 1, tilt: -0.5 });
    expect(editor.adjust(b, id, { height: NaN }).stems[0].height).toBe(b.stems[0].height);
    expect(editor.adjust(b, 'nope', { height: 0.2 })).toBe(b);
  });
});

describe('shape, wrap and rearrange', () => {
  it('switching shape keeps every stem exactly as it was', () => {
    const b = editor.move(base(), 's1', 2, 0.3);
    const next = editor.setShape(b, 'cascade');
    expect(next.shape).toBe('cascade');
    expect(next.stems).toBe(b.stems);
  });

  it('refuses an unknown shape', () => {
    const b = base();
    expect(editor.setShape(b, 'pyramid' as never)).toBe(b);
  });

  it('sets wrap fields and refuses unknown values', () => {
    const b = base();
    expect(editor.setWrap(b, { paper: 'tissue', ribbonColour: 'navy' }).wrap).toEqual({ ...b.wrap, paper: 'tissue', ribbonColour: 'navy' });
    expect(editor.setWrap(b, { paperColour: 'neon' })).toBe(b);
    expect(editor.setWrap(b, { paper: 'foil' as never })).toBe(b);
  });

  it('sets the bow and greenery, and refuses unknown ones', () => {
    const b = base();
    expect(editor.setWrap(b, { bow: 'star', greenery: 'more' }).wrap).toEqual({ ...b.wrap, bow: 'star', greenery: 'more' });
    expect(editor.setWrap(b, { bow: 'bowtie' as never })).toBe(b);
    expect(editor.setWrap(b, { greenery: 'moss' as never })).toBe(b);
    expect(editor.setWrap(b, { bow: b.wrap.bow, greenery: b.wrap.greenery })).toBe(b);
  });

  it('rearrange resets hand adjustments', () => {
    const b = editor.adjust(editor.move(base(), 's1', 2, 0.3), 's1', { tilt: 0.4 });
    expect(editor.rearrange(b).stems).toEqual(base().stems);
  });
});

describe('resolveSelection', () => {
  it('keeps a selection that still exists and clears one that does not', () => {
    const b = base();
    expect(BouquetEditor.resolveSelection(b, 's1')).toBe('s1');
    expect(BouquetEditor.resolveSelection(editor.remove(b, 's1'), 's1')).toBeNull();
    expect(BouquetEditor.resolveSelection(b, null)).toBeNull();
  });
});

describe('validateBouquet', () => {
  const good = () => JSON.parse(JSON.stringify(base())) as Record<string, any>;

  it('accepts a saved default bouquet', () => {
    expect(editor.validate(good())).toEqual(base());
  });

  it('drops unknown extra fields', () => {
    const data = good();
    data.extra = 1;
    data.stems[0].extra = 1;
    expect(editor.validate(data)).toEqual(base());
  });

  it('gives a bouquet saved before bows and greenery a ribbon bow and no greenery', () => {
    const data = good();
    delete data.wrap.bow;
    delete data.wrap.greenery;
    expect(editor.validate(data)!.wrap).toEqual({ ...base().wrap, bow: 'ribbon', greenery: 'none' });
  });

  it('turns the old kinds of greenery (sprigs) into leaves on the stems', () => {
    for (const [old, now] of [['fern', 'few'], ['eucalyptus', 'few'], ['leafy', 'more'], ['few', 'few'], ['more', 'more'], ['none', 'none']]) {
      const data = good();
      data.wrap.greenery = old;
      expect(editor.validate(data)!.wrap.greenery).toBe(now);
    }
  });

  const bad: [string, (d: Record<string, any>) => unknown][] = [
    ['not an object', () => 'hello'],
    ['null', () => null],
    ['wrong version', (d) => ({ ...d, version: 2 })],
    ['unknown shape', (d) => ({ ...d, shape: 'pyramid' })],
    ['missing wrap', (d) => ({ ...d, wrap: undefined })],
    ['unknown paper', (d) => ({ ...d, wrap: { ...d.wrap, paper: 'foil' } })],
    ['unknown ribbon colour', (d) => ({ ...d, wrap: { ...d.wrap, ribbonColour: 'neon' } })],
    ['unknown bow', (d) => ({ ...d, wrap: { ...d.wrap, bow: 'bowtie' } })],
    ['unknown greenery', (d) => ({ ...d, wrap: { ...d.wrap, greenery: 'moss' } })],
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
      expect(editor.validate(breakIt(good()))).toBeNull();
    });
  }
});

describe('history', () => {
  const step = (b: Bouquet, i: number) => editor.move(b, 's1', i / 1000, 0.5);

  it('undo then redo returns to the same bouquet', () => {
    const a = base();
    const b = editor.setShape(a, 'loose');
    const h = new History(a);
    expect(h.commit(b)).toBe(true);
    expect(h.undo()).toBe(true);
    expect(h.present).toBe(a);
    expect(h.redo()).toBe(true);
    expect(h.present).toBe(b);
  });

  it('undo and redo do nothing when there is nothing to undo or redo', () => {
    const start = base();
    const h = new History(start);
    expect(h.undo()).toBe(false);
    expect(h.redo()).toBe(false);
    expect(h.present).toBe(start);
    expect(h.canUndo || h.canRedo).toBe(false);
  });

  it('a change that returned the same bouquet is not recorded', () => {
    const h = new History(base());
    expect(h.commit(h.present)).toBe(false);
    expect(h.past).toHaveLength(0);
  });

  it('a new change after undo clears redo', () => {
    const a = base();
    const h = new History(a);
    h.commit(editor.setShape(a, 'loose'));
    h.undo();
    expect(h.canRedo).toBe(true);
    expect(h.commit(editor.setShape(a, 'cascade'))).toBe(true);
    expect(h.future).toEqual([]);
  });

  it('keeps at most 100 steps', () => {
    const h = new History(base());
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h.commit(step(h.present, i));
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });
});

describe('saving', () => {
  it('saves and loads the same bouquet', () => {
    const store = memoryStore();
    const b = editor.setShape(base(), 'cascade');
    new BouquetStore(editor, store).save(b);
    expect(new BouquetStore(editor, store).load()).toEqual(b);
  });

  it('returns null when nothing is saved', () => {
    expect(new BouquetStore(editor, memoryStore()).load()).toBeNull();
  });

  it('returns null for corrupt text', () => {
    expect(new BouquetStore(editor, memoryStore({ [STORAGE_KEY]: '{not json' })).load()).toBeNull();
  });

  it('ignores saved text far bigger than a full bouquet, and a full bouquet fits', () => {
    let full = base();
    while (full.stems.length < MAX_STEMS) full = editor.add(full, 'rose');
    expect(JSON.stringify(full).length).toBeLessThan(MAX_SAVED_LENGTH);
    expect(new BouquetStore(editor, memoryStore({ [STORAGE_KEY]: JSON.stringify(base()) + ' '.repeat(MAX_SAVED_LENGTH) })).load()).toBeNull();
  });

  it('returns null for a saved flower that is no longer in the catalogue', () => {
    const store = memoryStore();
    new BouquetStore(editor, store).save(base());
    const withoutRoses = new BouquetEditor(new Catalog(FLOWERS.filter((f) => f.id !== 'rose')));
    expect(new BouquetStore(withoutRoses, store).load()).toBeNull();
  });

  it('does not throw when storage is blocked', () => {
    const blocked: Store = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('full'); },
    };
    expect(() => new BouquetStore(editor, blocked).save(base())).not.toThrow();
    expect(new BouquetStore(editor, blocked).load()).toBeNull();
  });
});

describe('changes that change nothing', () => {
  it('return the same bouquet, so they add no undo step', () => {
    const b = base();
    const s = b.stems[0];
    expect(editor.recolour(b, s.id, s.colour)).toBe(b);
    expect(editor.move(b, s.id, s.angle, s.dist)).toBe(b);
    expect(editor.adjust(b, s.id, { height: s.height, tilt: s.tilt })).toBe(b);
    expect(editor.swap(b, s.id, s.flower)).toBe(b);
    expect(editor.setWrap(b, { paper: b.wrap.paper, ribbonColour: b.wrap.ribbonColour })).toBe(b);
    expect(editor.setShape(b, b.shape)).toBe(b);
    expect(editor.rearrange(b)).toBe(b);
  });
});
