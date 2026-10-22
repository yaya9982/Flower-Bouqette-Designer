import type { Arranger } from './arrange';
import type { Stem } from './bouquet';
import type { Catalog } from './catalog';
import { distance, SHAPE_OF, type ShapeId } from './shapes';

/**
 * How compact a bouquet looks: a real one is a dense dome of heads, not a ball of spikes with gaps. The florist keeps its
 * designs above these bars (src/florist-tools.ts) and the tests hold every preset and random session to them.
 */

/** A real bouquet is a closed face of heads: seen from the way they face, at least this much of its outline is flowers. */
export const MIN_COVERED = 0.75;
/** A head whose nearest neighbour is further than this many times their combined size floats alone, like a spike. */
export const ISOLATED = 1.6;
/** Below this many flowers a bouquet has no outline to judge. */
export const MIN_FOR_OUTLINE = 4;

export interface Compactness {
  /** Share of the outline of head centres, seen along the heads' average facing direction, that heads cover. */
  covered: number;
  /** Smallest centre distance between two heads, as a share of their combined size (below ~0.5 they sink into each other). */
  closest: number;
  /** How many heads have no neighbour within ISOLATED times their combined size. */
  isolated: number;
}

export function measure(stems: readonly Stem[], shape: ShapeId, catalog: Catalog, arranger: Arranger): Compactness {
  const radius = arranger.surfaceRadius(stems);
  const poses = stems.map((s) => SHAPE_OF[shape].stemPose(s, radius));
  const size = stems.map((s) => catalog.headDiameter(s.flower));

  let closest = Infinity;
  let isolated = 0;
  for (let i = 0; i < stems.length; i++) {
    let nearest = Infinity;
    for (let j = 0; j < stems.length; j++) {
      if (i === j) continue;
      const share = distance(poses[i].head, poses[j].head) / ((size[i] + size[j]) / 2);
      nearest = Math.min(nearest, share);
      if (j > i) closest = Math.min(closest, share);
    }
    if (stems.length > 1 && nearest > ISOLATED) isolated++;
  }

  const sum = poses.reduce((a, p) => ({ x: a.x + p.face.x, y: a.y + p.face.y, z: a.z + p.face.z }), { x: 0, y: 0, z: 0 });
  const len = Math.hypot(sum.x, sum.y, sum.z);
  type V = { x: number; y: number; z: number };
  const view: V = { x: sum.x / len, y: sum.y / len, z: sum.z / len };
  const cross = (a: V, b: V): V => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  const side = cross(Math.abs(view.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: -1 }, view);
  const sideLen = Math.hypot(side.x, side.y, side.z);
  const u = { x: side.x / sideLen, y: side.y / sideLen, z: side.z / sideLen };
  const w = cross(view, u);
  const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z;
  const pts = poses.map((p, i) => ({ a: dot(p.head, u), b: dot(p.head, w), r: size[i] / 2 }));
  // Convex hull of the head centres (monotone chain), anticlockwise.
  const turn = (o: typeof pts[0], p: typeof pts[0], q: typeof pts[0]) => (p.a - o.a) * (q.b - o.b) - (p.b - o.b) * (q.a - o.a);
  const sorted = [...pts].sort((p, q) => p.a - q.a || p.b - q.b);
  const chain = (list: typeof pts) => list.reduce<typeof pts>((h, p) => { while (h.length >= 2 && turn(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop(); h.push(p); return h; }, []);
  const hull = [...chain(sorted).slice(0, -1), ...chain([...sorted].reverse()).slice(0, -1)];
  const inside = (a: number, b: number) => hull.every((p, i) => turn(p, hull[(i + 1) % hull.length], { a, b, r: 0 }) >= 0);
  const [minA, maxA, minB, maxB] = [Math.min(...pts.map((p) => p.a)), Math.max(...pts.map((p) => p.a)), Math.min(...pts.map((p) => p.b)), Math.max(...pts.map((p) => p.b))];
  let total = 0;
  let hit = 0;
  for (let i = 0; i < 120; i++) {
    for (let j = 0; j < 120; j++) {
      const a = minA + ((maxA - minA) * (i + 0.5)) / 120;
      const b = minB + ((maxB - minB) * (j + 0.5)) / 120;
      if (!inside(a, b)) continue;
      total++;
      if (pts.some((p) => (p.a - a) ** 2 + (p.b - b) ** 2 <= p.r * p.r)) hit++;
    }
  }
  // One or two flowers have no outline to cover: they are one closed face by definition.
  return { covered: total === 0 ? 1 : hit / total, closest: stems.length > 1 ? closest : Infinity, isolated };
}
