import { describe, expect, it } from 'vitest';
import {
  autoArrange, BINDING, distance, headDiameter, largestGap, maxReach,
  stemPose, surfaceFromPoint, surfacePoint, surfaceRadius, TAU,
} from '../src/arrange';
import { SHAPES, type Stem } from '../src/bouquet';
import { FLOWERS } from '../src/catalog';

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

describe('autoArrange', () => {
  for (const [name, spec] of Object.entries(SETS)) {
    for (const shape of SHAPES) {
      it(`${name} in ${shape}: no two heads crowd closer than 60%`, () => {
        const stems = autoArrange(make(spec), FLOWERS);
        const radius = surfaceRadius(stems, FLOWERS);
        const heads = stems.map((s) => stemPose(shape, s, radius).head);
        for (let i = 0; i < stems.length; i++) {
          for (let j = i + 1; j < stems.length; j++) {
            const needed = (headDiameter(stems[i].flower, FLOWERS) + headDiameter(stems[j].flower, FLOWERS)) / 2;
            expect(distance(heads[i], heads[j])).toBeGreaterThanOrEqual(needed * CLOSEST);
          }
        }
      });

      it(`${name} in ${shape}: every head is within reach of the binding point`, () => {
        const stems = autoArrange(make(spec), FLOWERS);
        const radius = surfaceRadius(stems, FLOWERS);
        for (const s of stems) {
          const { head } = stemPose(shape, s, radius);
          expect(Number.isFinite(head.x + head.y + head.z)).toBe(true);
          expect(distance(head, BINDING)).toBeLessThanOrEqual(maxReach(shape, radius) + 1e-9);
        }
      });
    }
  }

  it('gives the same result for the same input', () => {
    expect(autoArrange(make(SETS.fortyMixed), FLOWERS)).toEqual(autoArrange(make(SETS.fortyMixed), FLOWERS));
  });

  it('keeps every stem, with valid positions and no tilt', () => {
    const input = make(SETS.fortyMixed);
    const out = autoArrange(input, FLOWERS);
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
    expect(autoArrange(make(SETS.one), FLOWERS)[0]).toMatchObject({ angle: 0, dist: 0 });
  });

  it('spreads each flower type across the bouquet', () => {
    const out = autoArrange(make([['rose', 6], ['tulip', 6]]), FLOWERS);
    expect(out.slice(0, 4).map((s) => s.flower)).toEqual(['rose', 'tulip', 'rose', 'tulip']);
  });
});

describe('surface conversion', () => {
  for (const shape of SHAPES) {
    it(`${shape}: surface to 3D and back returns the starting position`, () => {
      for (let angle = 0.05; angle < TAU; angle += 0.37) {
        for (let dist = 0.1; dist <= 1; dist += 0.15) {
          const back = surfaceFromPoint(shape, surfacePoint(shape, angle, dist, 0.2).head, 0.2);
          expect(back.angle).toBeCloseTo(angle, 6);
          expect(back.dist).toBeCloseTo(dist, 6);
        }
      }
    });
  }

  it('returns the centre for the binding point itself', () => {
    expect(surfaceFromPoint('round', BINDING, 0.2)).toEqual({ angle: 0, dist: 0 });
  });

  it('clamps a point below the rim to the rim', () => {
    expect(surfaceFromPoint('round', { x: 1, y: BINDING.y - 1, z: 0 }, 0.2).dist).toBe(1);
  });

  it('height moves the head along its stem and tilt turns only the face', () => {
    const flat = surfacePoint('round', 1, 0.5, 0.2);
    const raised = surfacePoint('round', 1, 0.5, 0.2, 1);
    const tilted = surfacePoint('round', 1, 0.5, 0.2, 0, 0.3);
    expect(distance(raised.head, BINDING)).toBeGreaterThan(distance(flat.head, BINDING));
    expect(tilted.head).toEqual(flat.head);
    expect(tilted.face).not.toEqual(flat.face);
    expect(flat.face).toEqual(flat.dir);
  });

  it('cascade drops below the binding point at the front only', () => {
    expect(surfacePoint('cascade', 0, 1, 0.2).head.y).toBeLessThan(BINDING.y);
    expect(surfacePoint('cascade', Math.PI, 1, 0.2).head.y).toBeGreaterThan(BINDING.y);
  });

  it('one-sided keeps every head in the front half', () => {
    for (let angle = 0; angle < TAU; angle += 0.2) {
      expect(surfacePoint('onesided', angle, 1, 0.2).head.z).toBeLessThanOrEqual(1e-9);
    }
  });
});

describe('surfaceRadius', () => {
  it('grows with the number and size of flowers', () => {
    const few = surfaceRadius(make([['rose', 5]]), FLOWERS);
    const many = surfaceRadius(make([['rose', 20]]), FLOWERS);
    const bigger = surfaceRadius(make([['sunflower', 20]]), FLOWERS);
    expect(many).toBeGreaterThan(few);
    expect(bigger).toBeGreaterThan(many);
  });

  it('uses a default size for a flower missing from the catalogue', () => {
    expect(headDiameter('not-a-flower', FLOWERS)).toBe(0.07);
  });
});

describe('largestGap', () => {
  it('finds a free spot in a full-looking bouquet', () => {
    for (const shape of SHAPES) {
      const stems = autoArrange(make(SETS.twelveMixed), FLOWERS);
      const gap = largestGap(stems, FLOWERS, 'rose');
      const radius = surfaceRadius([...stems, { flower: 'rose' }], FLOWERS);
      const spot = surfacePoint(shape, gap.angle, gap.dist, radius).head;
      for (const s of stems) {
        const needed = (headDiameter(s.flower, FLOWERS) + headDiameter('rose', FLOWERS)) / 2;
        expect(distance(spot, stemPose(shape, s, radius).head)).toBeGreaterThanOrEqual(needed * CLOSEST);
      }
    }
  });

  it('returns the centre when there are no stems', () => {
    expect(largestGap([], FLOWERS, 'rose')).toEqual({ angle: 0, dist: 0 });
  });
});

describe('stem length', () => {
  it('never lets a lowered head reach or pass the binding point', () => {
    for (const shape of SHAPES) {
      for (const flower of ['tulip', 'rose', 'carnation']) {
        const radius = surfaceRadius(make([[flower, 1]]), FLOWERS);
        for (const dist of [0, 0.5, 1]) {
          const { head, dir } = surfacePoint(shape, 0.3, dist, radius, -1);
          const along = (head.x - BINDING.x) * dir.x + (head.y - BINDING.y) * dir.y + (head.z - BINDING.z) * dir.z;
          expect(along).toBeGreaterThan(0.0199);
        }
      }
    }
  });
});

describe('adding flowers one at a time', () => {
  const overlaps = (stems: Stem[], shape: (typeof SHAPES)[number]) => {
    const radius = surfaceRadius(stems, FLOWERS);
    const heads = stems.map((s) => stemPose(shape, s, radius).head);
    let count = 0;
    for (let i = 0; i < stems.length; i++) {
      for (let j = i + 1; j < stems.length; j++) {
        const needed = (headDiameter(stems[i].flower, FLOWERS) + headDiameter(stems[j].flower, FLOWERS)) / 2;
        if (distance(heads[i], heads[j]) < needed * CLOSEST) count++;
      }
    }
    return count;
  };

  it('keeps heads from overlapping too far in any shape, whichever shape they were added in', () => {
    const order = ['lily', 'carnation', 'sunflower', 'rose', 'tulip', 'daisy'];
    let stems = autoArrange(make(SETS.twelveMixed), FLOWERS);
    for (let i = 0; i < 28; i++) {
      const flower = order[i % order.length];
      const gap = largestGap(stems, FLOWERS, flower);
      stems = [...stems, { id: `x${i}`, flower, colour: 'any', angle: gap.angle, dist: gap.dist, height: 0, tilt: 0 }];
    }
    expect(stems).toHaveLength(40);
    for (const shape of SHAPES) expect(overlaps(stems, shape), shape).toBe(0);
  });
});

describe('height range', () => {
  const radius = surfaceRadius(make(SETS.twelveMixed), FLOWERS);

  it('the lowest setting brings a head down to about the bow, in every shape', () => {
    for (const shape of SHAPES) {
      for (const dist of [0, 0.5, 1]) {
        const reach = distance(surfacePoint(shape, 1, dist, radius, -1).head, BINDING);
        expect(reach, `${shape} at ${dist}`).toBeCloseTo(0.06, 6);
      }
    }
  });

  it('small natural variation still moves a head only a little', () => {
    const level = distance(surfacePoint('round', 1, 0.5, radius).head, BINDING);
    const lowered = distance(surfacePoint('round', 1, 0.5, radius, -0.4).head, BINDING);
    expect(level - lowered).toBeGreaterThan(0.015);
    expect(level - lowered).toBeLessThan(0.03);
  });
});

describe('cascade', () => {
  it('trails down the front without stretching the flowers far apart', () => {
    const radius = surfaceRadius(make(SETS.twelveMixed), FLOWERS);
    const gap = (shape: (typeof SHAPES)[number]) =>
      distance(surfacePoint(shape, 0, 1, radius).head, surfacePoint(shape, 0, 0.8, radius).head);
    expect(gap('cascade')).toBeLessThan(gap('round') * 2.5);
  });
});
