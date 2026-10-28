import { describe, expect, it } from 'vitest';
import { BouquetEditor, BouquetStore, History, SHAPES, type Bouquet, type Stem } from '../src/bouquet';
import { Arranger } from '../src/arrange';
import { Catalog, FLOWERS } from '../src/catalog';
import { measure, MIN_COVERED } from '../src/compact';
import { Designer } from '../src/designer';
import { Presets } from '../src/presets';
import { distance, SHAPE_OF } from '../src/shapes';

const catalog = new Catalog(FLOWERS);
const arranger = new Arranger(catalog);
const editor = new BouquetEditor(catalog);

const make = (spec: [string, number][]): Stem[] =>
  spec.flatMap(([flower, count]) =>
    Array.from({ length: count }, (_, i) => ({ id: `${flower}${i}`, flower, colour: `c${i % 2}`, angle: 0, dist: 0, height: 0, tilt: 0 })),
  );
const MIXES: Record<string, [string, number][]> = {
  roses: [['rose', 12]],
  mixed: [['rose', 5], ['tulip', 4], ['daisy', 3]],
  big: [['sunflower', 10], ['tulip', 20], ['lily', 6]],
};

describe('autoArrange variants', () => {
  for (const [name, spec] of Object.entries(MIXES)) {
    it(`${name}: variant 0 is the default layout`, () => {
      expect(arranger.autoArrange(make(spec), 0)).toEqual(arranger.autoArrange(make(spec)));
    });

    it(`${name}: variants 0..20 are all different and repeatable`, () => {
      const seen = new Set<string>();
      for (let v = 0; v <= 20; v++) {
        const out = arranger.autoArrange(make(spec), v);
        expect(arranger.autoArrange(make(spec), v)).toEqual(out);
        seen.add(JSON.stringify(out));
      }
      expect(seen.size).toBe(21);
    });

    it(`${name}: variants 1..20 keep the quality bars in every shape`, () => {
      const bad: string[] = [];
      for (let v = 1; v <= 20; v++) {
        const stems = arranger.autoArrange(make(spec), v);
        const radius = arranger.surfaceRadius(stems);
        for (const shape of SHAPES) {
          const m = measure(stems, shape, catalog, arranger);
          if (m.covered < MIN_COVERED || m.isolated > 0 || m.closest < 0.6) bad.push(`v${v} ${shape}: ${m.covered.toFixed(2)} ${m.isolated} ${m.closest.toFixed(2)}`);
          const heads = stems.map((s) => SHAPE_OF[shape].stemPose(s, radius).head);
          for (const s of stems.map((_, i) => i)) if (stems[s].tilt !== 0 || !Number.isFinite(heads[s].x) || distance(heads[s], heads[0]) < 0) bad.push(`v${v} bad stem`);
        }
      }
      expect(bad).toEqual([]);
    });
  }

  it('a single stem has no other layout', () => {
    expect(arranger.autoArrange(make([['rose', 1]]), 3)).toEqual(arranger.autoArrange(make([['rose', 1]])));
  });
});

describe('Designer.rearrange', () => {
  function setup(b: Bouquet = editor.createDefault()) {
    const view = { render() {}, resetView() {}, dispose() {}, onSelect: (_: string | null) => {}, onDragMove: (_s: string, _a: number, _d: number) => {}, onDragEnd: () => {} };
    const panel = { render() {}, dispose() {} };
    const store = new BouquetStore(editor, { getItem: () => null, setItem: () => {} });
    const history = new History(b);
    const designer = new Designer({ editor, history, store, presets: new Presets(editor), view, panel, keys: new EventTarget() });
    designer.start();
    return { designer, history };
  }

  it('each click gives a new layout and undo steps back through them one by one, redo forward', () => {
    const { designer, history } = setup();
    const layouts = [history.present];
    for (let i = 0; i < 3; i++) { designer.rearrange(); layouts.push(history.present); }
    expect(new Set(layouts.map((b) => JSON.stringify(b.stems))).size).toBe(4);
    for (let i = 2; i >= 0; i--) { designer.undo(); expect(history.present).toEqual(layouts[i]); }
    expect(history.canUndo).toBe(false);
    for (let i = 1; i <= 3; i++) { designer.redo(); expect(history.present).toEqual(layouts[i]); }
  });

  it('one stem: no undo step', () => {
    const one = editor.remove(editor.createDefault(), 's1');
    let b = one;
    while (b.stems.length > 1) b = editor.remove(b, b.stems[0].id);
    const { designer, history } = setup(editor.rearrange(b));
    designer.rearrange();
    expect(history.canUndo).toBe(false);
  });
});
