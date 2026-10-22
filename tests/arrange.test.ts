import { describe, expect, it } from 'vitest';
import { SHAPES, type Stem } from '../src/bouquet';
import { Catalog, FLOWERS } from '../src/catalog';
import { Arranger } from '../src/arrange';
import { BINDING, distance, SHAPE_OF, TAU } from '../src/shapes';
import { measure, MIN_COVERED } from '../src/compact';
import { seeded } from './soak/prompts';

const catalog = new Catalog(FLOWERS);
const arranger = new Arranger(catalog);

type Spec = [flower: string, count: number][];

/** Heads are bunched like a real bouquet: neighbours may overlap, but but their centres stay at least 60% of their combined size apart. */
const CLOSEST = 0.6;

const make = (spec: Spec): Stem[] =>
  spec.flatMap(([flower, count]) =>
    Array.from({ length: count }, (_, i) => ({
      id: `${flower}${i}`, flower, colour: 'any', angle: 0, dist: 0, height: 0, tilt: 0,
    })),
  );

const SETS: Record<string, Spec> = {
  one: [['rose', 1]],
  two: [['rose', 2]],
  twelveMixed: [['rose', 5], ['tulip', 4], ['daisy', 3]],
  fortyRoses: [['rose', 40]],
  fortyMixed: [['rose', 10], ['tulip', 10], ['daisy', 8], ['lily', 6], ['sunflower', 6]],
  bigAndSmall: [['sunflower', 20], ['tulip', 20]],
  oneBigAmongSmall: [['tulip', 39], ['sunflower', 1]],
};

const covered = (stems: Stem[], shape: (typeof SHAPES)[number]) => measure(stems, shape, catalog, arranger).covered;

describe('autoArrange', () => {
  for (const name of ['twelveMixed', 'fortyRoses', 'fortyMixed', 'bigAndSmall']) {
    for (const shape of SHAPES) {
      it(`${name} in ${shape}: heads form a closed face, not a spread-out fan`, () => {
        expect(covered(arranger.autoArrange(make(SETS[name])), shape)).toBeGreaterThanOrEqual(MIN_COVERED);
      });
    }
  }

  for (const [name, spec] of Object.entries(SETS)) {
    for (const shape of SHAPES) {
      it(`${name} in ${shape}: no two heads crowd closer than 60%`, () => {
        const stems = arranger.autoArrange(make(spec));
        const radius = arranger.surfaceRadius(stems);
        const heads = stems.map((s) => SHAPE_OF[shape].stemPose(s, radius).head);
        for (let i = 0; i < stems.length; i++) {
          for (let j = i + 1; j < stems.length; j++) {
            const needed = (catalog.headDiameter(stems[i].flower) + catalog.headDiameter(stems[j].flower)) / 2;
            expect(distance(heads[i], heads[j])).toBeGreaterThanOrEqual(needed * CLOSEST);
          }
        }
      });

      it(`${name} in ${shape}: every head is within reach of the binding point`, () => {
        const stems = arranger.autoArrange(make(spec));
        const radius = arranger.surfaceRadius(stems);
        for (const s of stems) {
          const { head } = SHAPE_OF[shape].stemPose(s, radius);
          expect(Number.isFinite(head.x + head.y + head.z)).toBe(true);
          expect(distance(head, BINDING)).toBeLessThanOrEqual(SHAPE_OF[shape].maxReach(radius) + 1e-9);
        }
      });
    }
  }

  it('gives the same result for the same input', () => {
    expect(arranger.autoArrange(make(SETS.fortyMixed))).toEqual(arranger.autoArrange(make(SETS.fortyMixed)));
  });

  it('keeps every stem, with valid positions and no tilt', () => {
    const input = make(SETS.fortyMixed);
    const out = arranger.autoArrange(input);
    expect(out.map((s) => s.id).sort()).toEqual(input.map((s) => s.id).sort());
    for (const s of out) {
      expect(s.angle).toBeGreaterThanOrEqual(0);
      expect(s.angle).toBeLessThan(TAU);
      expect(s.dist).toBeGreaterThanOrEqual(0);
      expect(s.dist).toBeLessThanOrEqual(1);
      expect(Math.abs(s.height)).toBeLessThanOrEqual(1);
      expect(s.tilt).toBe(0);
    }
  });

  it('puts a single flower at the centre', () => {
    expect(arranger.autoArrange(make(SETS.one))[0]).toMatchObject({ angle: 0, dist: 0 });
  });

  it('spreads each flower type across the bouquet', () => {
    const out = arranger.autoArrange(make([['rose', 6], ['tulip', 6]]));
    expect(out.slice(0, 4).map((s) => s.flower)).toEqual(['rose', 'tulip', 'rose', 'tulip']);
  });
});

describe('autoArrange on random mixes', () => {
  it('is a compact bouquet in every shape, whatever mix of big and small heads', () => {
    const bad: string[] = [];
    for (let seed = 0; seed < 150; seed++) {
      const rng = seeded(seed);
      const n = 4 + Math.floor(rng() * 37);
      const types = Array.from({ length: 1 + Math.floor(rng() * 4) }, () => FLOWERS[Math.floor(rng() * FLOWERS.length)].id);
      const stems = arranger.autoArrange(make(types.map((id, i) => [id, Math.floor(n / types.length) + (i < n % types.length ? 1 : 0)] as [string, number])));
      for (const shape of SHAPES) {
        const m = measure(stems, shape, catalog, arranger);
        if (m.covered < MIN_COVERED || m.isolated > 0 || m.closest < CLOSEST) bad.push(`seed ${seed} ${shape} x${stems.length}: covered ${m.covered.toFixed(2)}, ${m.isolated} alone, closest ${m.closest.toFixed(2)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('surface conversion', () => {
  for (const shape of SHAPES) {
    it(`${shape}: surface to 3D and back returns the starting position`, () => {
      for (let angle = 0.05; angle < TAU; angle += 0.37) {
        for (let dist = 0.1; dist <= 1; dist += 0.15) {
          const back = SHAPE_OF[shape].surfaceFromPoint(SHAPE_OF[shape].surfacePoint(angle, dist, 0.2).head, 0.2);
          expect(back.angle).toBeCloseTo(angle, 6);
          expect(back.dist).toBeCloseTo(dist, 6);
        }
      }
    });
  }

  it('returns the centre for the binding point itself', () => {
    expect(SHAPE_OF['round'].surfaceFromPoint(BINDING, 0.2)).toEqual({ angle: 0, dist: 0 });
  });

  it('clamps a point below the rim to the rim', () => {
    expect(SHAPE_OF['round'].surfaceFromPoint({ x: 1, y: BINDING.y - 1, z: 0 }, 0.2).dist).toBe(1);
  });

  it('height moves the head along its stem and tilt turns only the face', () => {
    const flat = SHAPE_OF['round'].surfacePoint(1, 0.5, 0.2);
    const raised = SHAPE_OF['round'].surfacePoint(1, 0.5, 0.2, 1);
    const tilted = SHAPE_OF['round'].surfacePoint(1, 0.5, 0.2, 0, 0.3);
    expect(distance(raised.head, BINDING)).toBeGreaterThan(distance(flat.head, BINDING));
    expect(tilted.head).toEqual(flat.head);
    expect(tilted.face).not.toEqual(flat.face);
    expect(flat.face).toEqual(flat.dir);
  });

  it('cascade drops below the binding point at the front only', () => {
    expect(SHAPE_OF['cascade'].surfacePoint(0, 1, 0.2).head.y).toBeLessThan(BINDING.y);
    expect(SHAPE_OF['cascade'].surfacePoint(Math.PI, 1, 0.2).head.y).toBeGreaterThan(BINDING.y);
  });

  it('one-sided keeps every head in the front half', () => {
    for (let angle = 0; angle < TAU; angle += 0.2) {
      expect(SHAPE_OF['onesided'].surfacePoint(angle, 1, 0.2).head.z).toBeLessThanOrEqual(1e-9);
    }
  });
});

describe('surfaceRadius', () => {
  it('grows with the number and size of flowers', () => {
    const few = arranger.surfaceRadius(make([['rose', 5]]));
    const many = arranger.surfaceRadius(make([['rose', 20]]));
    const bigger = arranger.surfaceRadius(make([['sunflower', 20]]));
    expect(many).toBeGreaterThan(few);
    expect(bigger).toBeGreaterThan(many);
  });

  it('uses a default size for a flower missing from the catalogue', () => {
    expect(catalog.headDiameter('not-a-flower')).toBe(0.07);
  });
});

describe('largestGap', () => {
  it('finds a free spot in a full-looking bouquet', () => {
    for (const shape of SHAPES) {
      const stems = arranger.autoArrange(make(SETS.twelveMixed));
      const gap = arranger.largestGap(stems, 'rose');
      const radius = arranger.surfaceRadius([...stems, { flower: 'rose' }]);
      const spot = SHAPE_OF[shape].surfacePoint(gap.angle, gap.dist, radius).head;
      for (const s of stems) {
        const needed = (catalog.headDiameter(s.flower) + catalog.headDiameter('rose')) / 2;
        expect(distance(spot, SHAPE_OF[shape].stemPose(s, radius).head)).toBeGreaterThanOrEqual(needed * CLOSEST);
      }
    }
  });

  it('returns the centre when there are no stems', () => {
    expect(arranger.largestGap([], 'rose')).toEqual({ angle: 0, dist: 0 });
  });
});

describe('stem length', () => {
  it('never lets a lowered head reach or pass the binding point', () => {
    for (const shape of SHAPES) {
      for (const flower of ['tulip', 'rose', 'carnation']) {
        const radius = arranger.surfaceRadius(make([[flower, 1]]));
        for (const dist of [0, 0.5, 1]) {
          const { head, dir } = SHAPE_OF[shape].surfacePoint(0.3, dist, radius, -1);
          const along = (head.x - BINDING.x) * dir.x + (head.y - BINDING.y) * dir.y + (head.z - BINDING.z) * dir.z;
          expect(along).toBeGreaterThan(0.0199);
        }
      }
    }
  });
});

describe('adding flowers one at a time', () => {
  const overlaps = (stems: Stem[], shape: (typeof SHAPES)[number]) => {
    const radius = arranger.surfaceRadius(stems);
    const heads = stems.map((s) => SHAPE_OF[shape].stemPose(s, radius).head);
    let count = 0;
    for (let i = 0; i < stems.length; i++) {
      for (let j = i + 1; j < stems.length; j++) {
        const needed = (catalog.headDiameter(stems[i].flower) + catalog.headDiameter(stems[j].flower)) / 2;
        if (distance(heads[i], heads[j]) < needed * CLOSEST) count++;
      }
    }
    return count;
  };

  it('keeps heads from overlapping too far in any shape, whichever shape they were added in', () => {
    const order = ['lily', 'carnation', 'sunflower', 'rose', 'tulip', 'daisy'];
    let stems = arranger.autoArrange(make(SETS.twelveMixed));
    for (let i = 0; i < 28; i++) {
      const flower = order[i % order.length];
      const gap = arranger.largestGap(stems, flower);
      stems = [...stems, { id: `x${i}`, flower, colour: 'any', angle: gap.angle, dist: gap.dist, height: 0, tilt: 0 }];
    }
    expect(stems).toHaveLength(40);
    for (const shape of SHAPES) expect(overlaps(stems, shape), shape).toBe(0);
  });
});

describe('height range', () => {
  const radius = arranger.surfaceRadius(make(SETS.twelveMixed));

  it('the lowest setting brings a head down to about the bow, in every shape', () => {
    for (const shape of SHAPES) {
      for (const dist of [0, 0.5, 1]) {
        const reach = distance(SHAPE_OF[shape].surfacePoint(1, dist, radius, -1).head, BINDING);
        expect(reach, `${shape} at ${dist}`).toBeCloseTo(0.06, 6);
      }
    }
  });

  it('small natural variation still moves a head only a little', () => {
    const level = distance(SHAPE_OF['round'].surfacePoint(1, 0.5, radius).head, BINDING);
    const lowered = distance(SHAPE_OF['round'].surfacePoint(1, 0.5, radius, -0.4).head, BINDING);
    expect(level - lowered).toBeGreaterThan(0.015);
    expect(level - lowered).toBeLessThan(0.03);
  });
});

describe('cascade', () => {
  it('trails down the front without stretching the flowers far apart', () => {
    const radius = arranger.surfaceRadius(make(SETS.twelveMixed));
    const gap = (shape: (typeof SHAPES)[number]) =>
      distance(SHAPE_OF[shape].surfacePoint(0, 1, radius).head, SHAPE_OF[shape].surfacePoint(0, 0.8, radius).head);
    expect(gap('cascade')).toBeLessThan(gap('round') * 2.5);
  });
});
