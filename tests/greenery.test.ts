import { describe, expect, it } from 'vitest';
import { BouquetEditor, SHAPES } from '../src/bouquet';
import { Catalog, FLOWERS } from '../src/catalog';
import { GREENERY_MODELS, sprigPoses } from '../src/greenery';
import { BINDING, distance, SHAPE_OF } from '../src/shapes';

const editor = new BouquetEditor(new Catalog(FLOWERS));
const bouquet = (n: number) => {
  let b = editor.createDefault();
  while (b.stems.length < n) b = editor.add(b, 'rose');
  while (b.stems.length > n) b = editor.remove(b, b.stems[b.stems.length - 1].id);
  return editor.rearrange(b);
};

describe('sprigPoses', () => {
  it('tucks in more sprigs for a bigger bouquet, between 4 and 12', () => {
    const radius = (n: number) => editor.arranger.surfaceRadius(bouquet(n).stems);
    expect(sprigPoses(SHAPE_OF.round, radius(1), 1)).toHaveLength(4);
    expect(sprigPoses(SHAPE_OF.round, radius(20), 20).length).toBeGreaterThan(4);
    expect(sprigPoses(SHAPE_OF.round, radius(40), 40)).toHaveLength(12);
  });

  for (const shape of SHAPES) {
    it(`${shape}: every sprig starts at the tie and reaches just past the outer flowers`, () => {
      const b = bouquet(24);
      const radius = editor.arranger.surfaceRadius(b.stems);
      const rim = Math.max(...b.stems.map((s) => distance(SHAPE_OF[shape].stemPose(s, radius).head, BINDING)));
      for (const sprig of sprigPoses(SHAPE_OF[shape], radius, b.stems.length)) {
        expect(sprig.base).toEqual(BINDING);
        expect(Math.hypot(sprig.dir.x, sprig.dir.y, sprig.dir.z)).toBeCloseTo(1, 9);
        expect(sprig.length).toBeGreaterThan(rim);
        expect(sprig.length).toBeLessThan(rim * 1.4);
      }
    });
  }

  for (const shape of SHAPES) {
    it(`${shape}: no sprig leans further out than the outer flowers, so none sticks out past the paper`, () => {
      for (const sprig of sprigPoses(SHAPE_OF[shape], 0.2, 24)) {
        const tip = { x: sprig.base.x + sprig.dir.x * sprig.length, y: sprig.base.y + sprig.dir.y * sprig.length, z: sprig.base.z + sprig.dir.z * sprig.length };
        expect(SHAPE_OF[shape].surfaceFromPoint(tip, 0.2).dist).toBeLessThan(1);
      }
    });
  }

  it('spreads the sprigs all the way around', () => {
    const poses = sprigPoses(SHAPE_OF.round, 0.2, 24);
    const around = poses.map((p) => Math.atan2(p.dir.x, -p.dir.z)).sort((a, b) => a - b);
    const gaps = around.map((a, i) => (i ? a - around[i - 1] : a + 2 * Math.PI - around[around.length - 1]));
    expect(Math.max(...gaps)).toBeLessThan((2 * Math.PI / poses.length) * 1.5);
  });

  it('gives the same sprigs for the same bouquet', () => {
    expect(sprigPoses(SHAPE_OF.cascade, 0.2, 18)).toEqual(sprigPoses(SHAPE_OF.cascade, 0.2, 18));
  });

  it('has models for every kind of greenery but none', () => {
    expect(GREENERY_MODELS.none).toEqual([]);
    for (const kind of ['fern', 'eucalyptus', 'leafy'] as const) expect(GREENERY_MODELS[kind].length).toBeGreaterThan(0);
  });
});
