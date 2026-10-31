import { describe, expect, it } from 'vitest';
import { Arranger } from '../src/arrange';
import { BouquetEditor, MAX_STEMS, type Bouquet, type Stem } from '../src/bouquet';
import { Catalog, FLOWERS } from '../src/catalog';
import { FlowerPhysics } from '../src/physics';
import { Presets } from '../src/presets';
import { BINDING, distance, SHAPE_OF, SHAPES, type ShapeId } from '../src/shapes';

const catalog = new Catalog(FLOWERS);
const editor = new BouquetEditor(catalog);
const presets = new Presets(editor);
const arranger = new Arranger(catalog);
const FRAME = 1 / 60;

function sim(b: Bouquet, shape: ShapeId = b.shape) {
  const physics = new FlowerPhysics((f) => catalog.headDiameter(f));
  physics.load(b.stems, shape, arranger.surfaceRadius(b.stems));
  return physics;
}

const run = (physics: FlowerPhysics, seconds: number) => {
  for (let t = 0; t < seconds; t += FRAME) physics.step(FRAME);
};

/** The fullest bouquet there can be. */
function full(): Bouquet {
  let b = editor.createDefault();
  while (b.stems.length < MAX_STEMS) b = editor.add(b, 'rose');
  return editor.rearrange(b);
}

function headOf(physics: FlowerPhysics, id: string) {
  return physics.poses().find((p) => p.id === id)!.pose.head;
}

function expectSane(physics: FlowerPhysics, shape: ShapeId, radius: number) {
  for (const { pose } of physics.poses()) {
    for (const n of [pose.head.x, pose.head.y, pose.head.z, pose.dir.x, pose.dir.y, pose.dir.z]) expect(Number.isFinite(n)).toBe(true);
    // Never further from the tie than the shape allows, even mid-shake.
    expect(distance(pose.head, BINDING)).toBeLessThan(SHAPE_OF[shape].maxReach(radius) + 0.01);
    // Never past the bouquet's rim.
    expect(SHAPE_OF[shape].surfaceFromPoint(pose.head, radius).dist).toBeLessThanOrEqual(1);
  }
  expect(physics.topSpeed).toBeLessThanOrEqual(8 + 1e-9);
}

/** A closest neighbour to a stem, and a spot on the far side of it. */
function pushAcross(b: Bouquet) {
  const stem = b.stems.find((s) => s.dist > 0.3 && s.dist < 0.8)!;
  const others = b.stems.filter((s) => s.id !== stem.id);
  const radius = arranger.surfaceRadius(b.stems);
  const shape = SHAPE_OF[b.shape];
  const head = (s: Stem) => shape.stemPose(s, radius).head;
  const neighbour = others.reduce((best, s) => (distance(head(s), head(stem)) < distance(head(best), head(stem)) ? s : best));
  return { stem, neighbour };
}

describe('FlowerPhysics at rest', () => {
  it('does nothing and stays asleep when nothing touches the bouquet', () => {
    const physics = sim(editor.createDefault());
    expect(physics.step(FRAME)).toBe(false);
    expect(physics.isAwake).toBe(false);
  });

  it('picking up a flower without moving it does not disturb any preset, in any shape', () => {
    for (const preset of presets.all) {
      for (const shape of SHAPES) {
        const b = { ...presets.build(preset)!, shape };
        const physics = sim(b);
        physics.hold(b.stems[0]);
        physics.step(FRAME);
        run(physics, 1);
        const radius = arranger.surfaceRadius(b.stems);
        for (const stem of b.stems) expect(distance(headOf(physics, stem.id), SHAPE_OF[shape].stemPose(stem, radius).head)).toBeLessThan(1e-9);
      }
    }
  });

  it('shaking a flower about and dropping it back where it started changes nothing', () => {
    const b = full();
    const physics = sim(b);
    const stem = b.stems[5];
    for (let i = 0; i < 120; i++) {
      physics.hold({ ...stem, angle: (i * 2.4) % 6, dist: (i % 7) / 7 });
      physics.step(FRAME);
    }
    expect(physics.settle(b.stems, stem.id)).toBe(b.stems);
  });

  it('settle changes nothing when a flower is picked up and put down in place', () => {
    const b = editor.createDefault();
    const physics = sim(b);
    expect(physics.settle(b.stems, b.stems[0].id)).toBe(b.stems);
  });
});

describe('FlowerPhysics while dragging', () => {
  it('moves a neighbour out of the way, and it springs back once the way is clear', () => {
    const b = editor.createDefault();
    const { stem, neighbour } = pushAcross(b);
    const physics = sim(b);
    const start = { ...headOf2(physics, neighbour.id) };
    physics.hold({ ...stem, angle: neighbour.angle, dist: neighbour.dist });
    run(physics, 0.5);
    expect(distance(headOf(physics, neighbour.id), start)).toBeGreaterThan(0.01);
    physics.hold(stem);
    run(physics, 0.3);
    physics.load(b.stems, b.shape, arranger.surfaceRadius(b.stems));
    run(physics, 2);
    expect(physics.isAwake).toBe(false);
    expect(distance(headOf(physics, neighbour.id), start)).toBeLessThan(1e-6);
  });

  it('never lets the held flower pass through a neighbour at rest in its path', () => {
    const b = editor.createDefault();
    const { stem, neighbour } = pushAcross(b);
    const physics = sim(b);
    physics.hold({ ...stem, angle: neighbour.angle, dist: neighbour.dist });
    let closest = Infinity;
    for (let i = 0; i < 90; i++) {
      physics.step(FRAME);
      if (i > 30) closest = Math.min(closest, distance(headOf(physics, stem.id), headOf(physics, neighbour.id)));
    }
    const combined = (catalog.headDiameter(stem.flower) + catalog.headDiameter(neighbour.flower)) / 2;
    expect(closest).toBeGreaterThan(combined * 0.5);
  });

  it('reaches flowers it does not touch through the crowd', () => {
    const b = full();
    const stem = b.stems.find((s) => s.dist < 0.2)!;
    const physics = sim(b);
    const before = new Map(b.stems.map((s) => [s.id, { ...headOf2(physics, s.id) }]));
    physics.hold({ ...stem, angle: stem.angle, dist: 0.8 });
    run(physics, 0.6);
    const moved = b.stems.filter((s) => distance(headOf(physics, s.id), before.get(s.id)!) > 0.002);
    expect(moved.length).toBeGreaterThan(5);
  });
});

/** Before the first step there are poses only once something measured them, so ask for them through a harmless hold. */
function headOf2(physics: FlowerPhysics, id: string) {
  return physics.poses().find((p) => p.id === id)!.pose.head;
}

describe('FlowerPhysics under abuse', () => {
  const random = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  it.each(SHAPES)('survives violent shaking in the %s shape, with the fullest bouquet, and comes to rest', (shape) => {
    const b = { ...full(), shape };
    const radius = arranger.surfaceRadius(b.stems);
    const physics = sim(b);
    const next = random(7);
    const stem = b.stems[5];
    for (let frame = 0; frame < 600; frame++) {
      // A new far-away target every frame: worse than any hand.
      physics.hold({ ...stem, angle: next() * Math.PI * 2, dist: next(), height: next() * 2 - 1 });
      physics.step(FRAME);
      expectSane(physics, shape, radius);
    }
    const settled = physics.settle(b.stems, stem.id);
    for (const s of settled) {
      expect(Number.isFinite(s.angle)).toBe(true);
      expect(s.dist).toBeGreaterThanOrEqual(0);
      expect(s.dist).toBeLessThanOrEqual(1);
    }
    physics.load(settled, shape, radius);
    run(physics, 4);
    expect(physics.isAwake).toBe(false);
    expectSane(physics, shape, radius);
  });

  it('survives frames that arrive late, not at all, or backwards', () => {
    const b = editor.createDefault();
    const physics = sim(b);
    physics.hold({ ...b.stems[0], dist: 1 });
    for (const seconds of [0, -1, 5, 1e9, Number.MIN_VALUE, 0.2]) {
      physics.step(seconds);
      expectSane(physics, b.shape, arranger.surfaceRadius(b.stems));
    }
  });

  it('survives press and release spam, and each drop is at rest afterwards', () => {
    let b = editor.createDefault();
    const radius = arranger.surfaceRadius(b.stems);
    const physics = sim(b);
    const next = random(3);
    for (let round = 0; round < 200; round++) {
      const stem = b.stems[round % b.stems.length];
      const moved = { ...stem, angle: next() * Math.PI * 2, dist: next() };
      physics.hold(moved);
      physics.step(FRAME);
      const stems = physics.settle(b.stems.map((s) => (s.id === stem.id ? moved : s)), stem.id);
      b = { ...b, stems: [...stems] };
      physics.load(b.stems, b.shape, radius);
      physics.step(FRAME);
      expectSane(physics, b.shape, radius);
    }
    run(physics, 4);
    expect(physics.isAwake).toBe(false);
  });

  it('survives one flower sitting exactly on another', () => {
    const b = editor.createDefault();
    const [first, second] = b.stems;
    const stacked = b.stems.map((s) => (s.id === second.id ? { ...s, angle: first.angle, dist: first.dist, height: first.height } : s));
    const physics = sim({ ...b, stems: stacked });
    physics.hold({ ...first, dist: 1 });
    run(physics, 1);
    expectSane(physics, b.shape, arranger.surfaceRadius(b.stems));
  });

  it('settling costs too little to notice, even at its worst', () => {
    const b = full();
    const physics = sim(b);
    const stem = b.stems[0];
    const started = performance.now();
    physics.settle(b.stems.map((s) => (s.id === stem.id ? { ...s, angle: s.angle + 3, dist: 1 } : s)), stem.id);
    expect(performance.now() - started).toBeLessThan(250);
  });
});

describe('FlowerPhysics and height', () => {
  /** A stem and the heads straight above and below where it will travel. */
  const b = editor.createDefault();
  const radius = arranger.surfaceRadius(b.stems);

  it('a flower raised into the neighbours above it pushes them aside', () => {
    const stem = b.stems.find((s) => s.height < 0)!;
    const low = { ...stem, height: -1 };
    const stems = b.stems.map((s) => (s.id === stem.id ? low : s));
    const physics = sim({ ...b, stems });
    const before = new Map(stems.map((s) => [s.id, { ...headOf2(physics, s.id) }]));
    physics.hold({ ...low, height: 1 });
    // It only meets them on the way past, so watch the whole journey.
    const pushed = new Set<string>();
    for (let i = 0; i < 40; i++) {
      physics.step(FRAME);
      for (const s of stems) if (s.id !== stem.id && distance(headOf(physics, s.id), before.get(s.id)!) > 0.003) pushed.add(s.id);
    }
    expect(pushed.size).toBeGreaterThan(0);
    expectSane(physics, b.shape, radius);
  });

  it('a flower pulled down pushes through the stems beneath it instead of passing them', () => {
    const tall = full();
    const fullRadius = arranger.surfaceRadius(tall.stems);
    const stem = tall.stems.find((s) => s.dist > 0.5)!;
    const raised = { ...stem, height: 1 };
    const stems = tall.stems.map((s) => (s.id === stem.id ? raised : s));
    const physics = sim({ ...tall, stems });
    const before = new Map(stems.map((s) => [s.id, { ...headOf2(physics, s.id) }]));
    physics.hold({ ...raised, height: -1 });
    const pushed = new Set<string>();
    for (let i = 0; i < 48; i++) {
      physics.step(FRAME);
      for (const s of stems) if (s.id !== stem.id && distance(headOf(physics, s.id), before.get(s.id)!) > 0.003) pushed.add(s.id);
    }
    expect(pushed.size).toBeGreaterThan(0);
    expectSane(physics, tall.shape, fullRadius);
  });

  it('a flower sunk to the bottom nestles among the stems and does not burst the bouquet', () => {
    for (const shape of SHAPES) {
      const tall = { ...full(), shape };
      const stem = tall.stems[10];
      const physics = sim(tall);
      const before = new Map(tall.stems.map((s) => [s.id, { ...headOf2(physics, s.id) }]));
      physics.hold({ ...stem, height: -1 });
      let worst = 0;
      for (let i = 0; i < 90; i++) {
        physics.step(FRAME);
        for (const s of tall.stems) if (s.id !== stem.id) worst = Math.max(worst, distance(headOf(physics, s.id), before.get(s.id)!));
      }
      expect(worst).toBeLessThan(0.06);
      // It ripples through the crowd on the way past; what stays moved afterwards is a small part of it.
      const radius = arranger.surfaceRadius(tall.stems);
      const settled = physics.settle(tall.stems.map((s) => (s.id === stem.id ? { ...s, height: -1 } : s)), stem.id);
      const stayed = settled.filter((s) => s.id !== stem.id && distance(SHAPE_OF[shape].stemPose(s, radius).head, before.get(s.id)!) > 0.01);
      expect(stayed.length).toBeLessThan(tall.stems.length / 4);
    }
  });

  it('height spam stays sane and ends at the setting it was left on', () => {
    const physics = sim(b);
    const stem = b.stems[3];
    for (let i = 0; i < 300; i++) {
      physics.hold({ ...stem, height: i % 2 ? 1 : -1 });
      physics.step(FRAME);
      expectSane(physics, b.shape, radius);
    }
    physics.hold({ ...stem, height: 0.4 });
    run(physics, 1);
    const want = SHAPE_OF[b.shape].stemPose({ ...stem, height: 0.4 }, radius).head;
    expect(distance(headOf(physics, stem.id), want)).toBeLessThan(1e-6);
  });

  it('tilt alone moves nobody', () => {
    const physics = sim(b);
    const stem = b.stems[3];
    expect(physics.settle(b.stems.map((s) => (s.id === stem.id ? { ...s, tilt: 0.5 } : s)), stem.id).filter((s) => s.id !== stem.id)).toEqual(b.stems.filter((s) => s.id !== stem.id));
  });
});

describe('FlowerPhysics on drop', () => {
  it('leaves the dropped flower exactly where it was put and clears the flower it landed on', () => {
    const b = full();
    const radius = arranger.surfaceRadius(b.stems);
    const { stem, neighbour } = pushAcross(b);
    const dropped = { ...stem, angle: neighbour.angle, dist: neighbour.dist, height: neighbour.height };
    const stems = b.stems.map((s) => (s.id === stem.id ? dropped : s));
    const physics = sim(b);
    const settled = physics.settle(stems, stem.id);
    expect(settled.find((s) => s.id === stem.id)).toEqual(dropped);
    const shape = SHAPE_OF[b.shape];
    const moved = settled.find((s) => s.id === neighbour.id)!;
    const combined = (catalog.headDiameter(stem.flower) + catalog.headDiameter(neighbour.flower)) / 2;
    expect(distance(shape.stemPose(dropped, radius).head, shape.stemPose(moved, radius).head)).toBeGreaterThan(combined * 0.65);
  });

  it('a small nudge leaves the rest of a full bouquet almost untouched', () => {
    const b = full();
    const radius = arranger.surfaceRadius(b.stems);
    const shape = SHAPE_OF[b.shape];
    for (const stem of b.stems) {
      const moved = { ...stem, dist: Math.max(0, stem.dist - 0.1) };
      const settled = sim(b).settle(b.stems.map((s) => (s.id === stem.id ? moved : s)), stem.id);
      const shifts = settled.filter((s) => s.id !== stem.id).map((s) => distance(shape.stemPose(s, radius).head, shape.stemPose(b.stems.find((o) => o.id === s.id)!, radius).head));
      expect(Math.max(...shifts)).toBeLessThan(0.05);
      expect(shifts.filter((x) => x > 0.01).length).toBeLessThanOrEqual(6);
    }
  });

  it('flowers it did not disturb keep their exact numbers', () => {
    const b = editor.createDefault();
    const { stem } = pushAcross(b);
    const moved = { ...stem, dist: stem.dist + 0.02 };
    const physics = sim(b);
    const settled = physics.settle(b.stems.map((s) => (s.id === stem.id ? moved : s)), stem.id);
    const same = settled.filter((s) => b.stems.includes(s));
    expect(same.length).toBeGreaterThan(0);
  });

  it('the view carries on moving after a drop but stops dead after any other change', () => {
    const b = editor.createDefault();
    const { stem, neighbour } = pushAcross(b);
    const radius = arranger.surfaceRadius(b.stems);
    const physics = sim(b);
    physics.hold({ ...stem, angle: neighbour.angle, dist: neighbour.dist });
    run(physics, 0.3);
    physics.load(editor.rearrange(b, 3).stems, b.shape, radius);
    expect(physics.isAwake).toBe(false);
    const again = sim(b);
    const dropped = { ...stem, angle: neighbour.angle, dist: neighbour.dist };
    again.hold(dropped);
    run(again, 0.1);
    const settled = again.settle(b.stems.map((s) => (s.id === stem.id ? dropped : s)), stem.id);
    again.load(settled, b.shape, radius);
    expect(again.isAwake).toBe(true);
  });
});
