import { describe, expect, it } from 'vitest';
import { BouquetEditor, SHAPES, type Bouquet, type GreeneryId } from '../src/bouquet';
import { Catalog, FLOWERS } from '../src/catalog';
import { LEAF_LEVELS, leafPlans, type LeafItem } from '../src/greenery';
import { BINDING, SEPALS_BELOW_HEAD, SHAPE_OF, distance, type ShapeId } from '../src/shapes';

const catalog = new Catalog(FLOWERS);
const editor = new BouquetEditor(catalog);
const bouquet = (n: number, flower = 'rose') => {
  let b = editor.createDefault();
  while (b.stems.length < n) b = editor.add(b, flower);
  while (b.stems.length > n) b = editor.remove(b, b.stems[b.stems.length - 1].id);
  return editor.rearrange(b);
};

const itemsOf = (b: Bouquet, shape: ShapeId = b.shape): { items: LeafItem[]; radius: number } => {
  const radius = editor.arranger.surfaceRadius(b.stems);
  return {
    radius,
    items: b.stems.map((s) => ({ id: s.id, name: catalog.find(s.flower)!.name, pose: SHAPE_OF[shape].stemPose(s, radius), headDiameter: catalog.find(s.flower)!.headDiameter })),
  };
};
const plans = (level: GreeneryId, b: Bouquet) => {
  const { items, radius } = itemsOf(b);
  return { items, plans: leafPlans(level, SHAPE_OF[b.shape], radius, items) };
};
const tipOf = (p: { base: { x: number; y: number; z: number }; dir: { x: number; y: number; z: number }; length: number }) =>
  ({ x: p.base.x + p.dir.x * p.length, y: p.base.y + p.dir.y * p.length, z: p.base.z + p.dir.z * p.length });
const angleBetween = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z))) * 180 / Math.PI;

describe('leafPlans', () => {
  it('gives no leaves when greenery is none', () => {
    expect(plans('none', bouquet(24)).plans).toEqual([]);
  });

  it('gives the same leaves for the same bouquet, in whatever order the stems are listed', () => {
    const b = bouquet(30);
    const { items, radius } = itemsOf(b);
    const forward = leafPlans('more', SHAPE_OF[b.shape], radius, items);
    const backward = leafPlans('more', SHAPE_OF[b.shape], radius, [...items].reverse());
    expect(forward.length).toBeGreaterThan(0);
    const byStem = (list: typeof forward) => [...list].sort((a, c) => a.stemId.localeCompare(c.stemId) || a.base.y - c.base.y);
    expect(byStem(backward)).toEqual(byStem(forward));
  });

  it('keeps leaves few: some for a bigger bouquet, never over the cap, and "more" has more than "few"', () => {
    for (const n of [12, 24, 40]) {
      const few = plans('few', bouquet(n)).plans.length;
      const more = plans('more', bouquet(n)).plans.length;
      expect(few).toBeLessThanOrEqual(LEAF_LEVELS.few.max);
      expect(more).toBeLessThanOrEqual(LEAF_LEVELS.more.max);
      expect(more).toBeGreaterThanOrEqual(few);
    }
    expect(plans('few', bouquet(40)).plans.length).toBeGreaterThan(0);
    expect(plans('more', bouquet(40)).plans.length).toBeGreaterThan(plans('few', bouquet(40)).plans.length);
  });

  it('puts at most one leaf on a stem for "few", and never more than two for "more"', () => {
    const count = (list: { stemId: string }[]) => {
      const per = new Map<string, number>();
      for (const p of list) per.set(p.stemId, (per.get(p.stemId) ?? 0) + 1);
      return Math.max(0, ...per.values());
    };
    expect(count(plans('few', bouquet(40)).plans)).toBeLessThanOrEqual(1);
    expect(count(plans('more', bouquet(40)).plans)).toBeLessThanOrEqual(2);
  });

  for (const shape of SHAPES) {
    it(`${shape}: every leaf starts on its own stem, in its upper part, and is a sensible size`, () => {
      const b = { ...bouquet(40), shape };
      const { items, plans: list } = plans('more', b);
      expect(list.length).toBeGreaterThan(0);
      for (const p of list) {
        const item = items.find((i) => i.id === p.stemId)!;
        const along = (p.base.x - BINDING.x) * item.pose.dir.x + (p.base.y - BINDING.y) * item.pose.dir.y + (p.base.z - BINDING.z) * item.pose.dir.z;
        const top = distance(BINDING, item.pose.head) - item.headDiameter * SEPALS_BELOW_HEAD;
        // On the stem's line...
        const onAxis = { x: BINDING.x + item.pose.dir.x * along, y: BINDING.y + item.pose.dir.y * along, z: BINDING.z + item.pose.dir.z * along };
        expect(distance(onAxis, p.base)).toBeLessThan(1e-6);
        // ...between 12 % and 45 % of the way down from the head to the tie.
        expect(top - along).toBeGreaterThanOrEqual(top * 0.12 - 1e-9);
        expect(top - along).toBeLessThanOrEqual(top * 0.45 + 1e-9);
        expect(Math.hypot(p.dir.x, p.dir.y, p.dir.z)).toBeCloseTo(1, 9);
        expect(p.length).toBeGreaterThanOrEqual(0.04);
        expect(p.length).toBeLessThanOrEqual(0.12);
        // Out from the stem by 35 to 60 degrees, then drooping up to 30 more.
        const angle = angleBetween(p.dir, item.pose.dir);
        expect(angle).toBeGreaterThanOrEqual(30);
        expect(angle).toBeLessThanOrEqual(95);
      }
    });

    it(`${shape}: no leaf pokes out of the bouquet or into a flower head`, () => {
      const b = { ...bouquet(40), shape };
      const { items, radius } = itemsOf(b);
      const list = leafPlans('more', SHAPE_OF[shape], radius, items);
      expect(list.length).toBeGreaterThan(0);
      for (const p of list) {
        const tip = tipOf(p);
        expect(SHAPE_OF[shape].surfaceFromPoint(tip, radius).dist).toBeLessThan(1);
        for (const item of items) {
          const clear = item.headDiameter / 2;
          expect(distance(tip, item.pose.head)).toBeGreaterThanOrEqual(clear);
          expect(distance({ x: (p.base.x + tip.x) / 2, y: (p.base.y + tip.y) / 2, z: (p.base.z + tip.z) / 2 }, item.pose.head)).toBeGreaterThanOrEqual(clear);
        }
      }
    });
  }

  it('leaves flowers that florists strip bare without leaves', () => {
    const b = bouquet(40);
    const { items, radius } = itemsOf(b);
    expect(leafPlans('more', SHAPE_OF[b.shape], radius, items).length).toBeGreaterThan(0);
    for (const name of ['Gerbera', 'Daisy', 'Lily', 'Carnation', 'Chrysanthemum', 'Orchid']) {
      expect(leafPlans('more', SHAPE_OF[b.shape], radius, items.map((i) => ({ ...i, name })))).toEqual([]);
    }
  });

  it('puts leaves on the flowers that are left', () => {
    const b = bouquet(40, 'rose');
    expect(plans('more', b).plans.every((p) => b.stems.some((s) => s.id === p.stemId))).toBe(true);
  });
});
