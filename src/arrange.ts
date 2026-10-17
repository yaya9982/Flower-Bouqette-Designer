import type { ShapeId, Stem } from './bouquet';
import type { FlowerType } from './catalog';

export interface Vec3 { x: number; y: number; z: number }
/** head: centre of the flower head. dir: unit vector along the stem. face: unit vector the head points along. */
export interface Pose { head: Vec3; dir: Vec3; face: Vec3 }
export interface SurfacePos { angle: number; dist: number }

/** Where every stem crosses and the ribbon is tied. */
export const BINDING: Vec3 = { x: 0, y: 0.25, z: 0 };
export const TAU = Math.PI * 2;

const rad = (degrees: number) => (degrees * Math.PI) / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** Spacing between heads. Tight enough that heads bunch and overlap a little, as in a real bouquet; the tests cap how far. */
const PACKING = 0.66;
/** Metres a head moves along its stem when height is 1, and the rate it moves for small changes either way. */
const HEIGHT_STEP = 0.05;
/** Height setting a flower starts at: heads sit low, close to the paper's edge. */
export const DEFAULT_HEIGHT = -0.6;
/** Metres above the tie that a head sits at the lowest height setting: just above the bow. */
const LOWEST_HEAD = 0.06;
/** How far the cascading bouquet leans forward. */
const CASCADE_LEAN = rad(40);
/** Shortest a stem may be above the binding point, so a lowered head never passes through it. */
const MIN_LENGTH = 0.02;
const DEFAULT_DIAMETER = 0.07;
const MIN_RADIUS = 0.05;
const GAP_RINGS = 10;
const GAP_SPOKES = 36;


/** Widest the bouquet may open: angle from straight up at the rim (dist = 1), before any per-angle change. */
const MAX_POLAR: Record<ShapeId, number> = { round: rad(55), loose: rad(68), cascade: rad(55), onesided: rad(60) };
/** Narrowest it may close, so a few flowers still form a small dome rather than a single stalk. */
const MIN_POLAR = rad(28);
/** Metres from the tie to the heads that a bouquet keeps while it can; it opens wider instead of growing taller. */
const REACH: Record<ShapeId, number> = { round: 0.42, loose: 0.36, cascade: 0.42, onesided: 0.42 };

/**
 * Angle from straight up at the rim for a bouquet of this size. A small bouquet is a tight bundle;
 * a full one opens into a wide dome, as a hand-tied bouquet does.
 */
function basePolar(shape: ShapeId, radius: number): number {
  return clamp(radius / REACH[shape], MIN_POLAR, MAX_POLAR[shape]);
}
/** Largest value lengthFactor can return for each shape. */
const MAX_LENGTH_FACTOR: Record<ShapeId, number> = { round: 1, loose: 1.15, cascade: 1.2, onesided: 1.3 };

/** 1 at the front (angle 0), falling to 0 at the sides and back. */
function frontness(angle: number): number {
  const c = Math.cos(angle);
  return c > 0 ? c * c : 0;
}

/** Direction around the vertical axis. One-sided squeezes the full circle into the front half. */
function azimuth(shape: ShapeId, angle: number): number {
  return shape === 'onesided' ? (angle - Math.PI) / 2 : angle;
}

function maxPolar(shape: ShapeId, angle: number, radius: number): number {
  const base = basePolar(shape, radius);
  // The cascade's lean does most of the dropping; the front only opens a little further, so its flowers stay together.
  return shape === 'cascade' ? base + rad(24) * frontness(angle) : base;
}

function lengthFactor(shape: ShapeId, angle: number, dist: number): number {
  if (shape === 'loose') return 1 + 0.15 * dist * dist;
  if (shape === 'cascade') return 1 + 0.2 * frontness(angle) * dist * dist;
  if (shape === 'onesided') return 1 + 0.3 * dist * Math.abs(Math.sin(azimuth(shape, angle)));
  return 1;
}

function baseLength(shape: ShapeId, radius: number): number {
  return (shape === 'onesided' ? radius * Math.SQRT2 : radius) / basePolar(shape, radius);
}

/** Unit vector at `polar` radians from straight up, turned `around` radians from the front (-z). */
function direction(polar: number, around: number): Vec3 {
  return { x: Math.sin(polar) * Math.sin(around), y: Math.cos(polar), z: -Math.sin(polar) * Math.cos(around) };
}

/** Leans a direction forward (towards -z) by `lean` radians, as if the whole bouquet were tipped. */
function leanForward(v: Vec3, lean: number): Vec3 {
  const c = Math.cos(lean);
  const sn = Math.sin(lean);
  return { x: v.x, y: v.y * c + v.z * sn, z: -v.y * sn + v.z * c };
}

/**
 * Stem length for a height setting. Small changes move the head HEIGHT_STEP per unit either way;
 * towards -1 it sinks faster, ending just above the bow.
 */
function stemLength(level: number, shape: ShapeId, height: number): number {
  const step = HEIGHT_STEP * (shape === 'loose' ? 1.6 : 1);
  if (height >= 0) return level + height * step;
  const room = Math.max(0, level - LOWEST_HEAD);
  const gentle = Math.min(step, room);
  return Math.max(MIN_LENGTH, level + height * gentle - height ** 4 * (room - gentle));
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function headDiameter(flowerId: string, catalog: FlowerType[]): number {
  return catalog.find((f) => f.id === flowerId)?.headDiameter ?? DEFAULT_DIAMETER;
}

/** Size of the bouquet surface, measured along it from centre to rim. Grows with the flowers. */
export function surfaceRadius(stems: { flower: string }[], catalog: FlowerType[]): number {
  if (stems.length === 0) return MIN_RADIUS;
  // Each head needs room in proportion to its own area, so the surface grows with the total head area.
  const area = stems.reduce((sum, s) => sum + headDiameter(s.flower, catalog) ** 2, 0);
  return Math.max(MIN_RADIUS, PACKING * Math.sqrt(area));
}

/** Furthest a head can be from the binding point for this shape and size. */
export function maxReach(shape: ShapeId, radius: number): number {
  return baseLength(shape, radius) * MAX_LENGTH_FACTOR[shape] + HEIGHT_STEP * 1.6;
}

export function surfacePoint(shape: ShapeId, angle: number, dist: number, radius: number, height = 0, tilt = 0): Pose {
  const around = azimuth(shape, angle);
  const polar = dist * maxPolar(shape, angle, radius);
  const length = stemLength(baseLength(shape, radius) * lengthFactor(shape, angle, dist), shape, height);
  const lean = shapeLean(shape);
  const dir = leanForward(direction(polar, around), lean);
  return {
    head: { x: BINDING.x + dir.x * length, y: BINDING.y + dir.y * length, z: BINDING.z + dir.z * length },
    dir,
    face: leanForward(direction(polar + tilt, around), lean),
  };
}

/** How far a shape leans forward as a whole, in radians. The wrap leans with it. */
export function shapeLean(shape: ShapeId): number {
  return shape === 'cascade' ? CASCADE_LEAN : 0;
}

/** Where a stem ends below the tie: the handle, which leans with the bouquet. */
export function stemFoot(shape: ShapeId, pose: Pose): Vec3 {
  const lean = shapeLean(shape);
  const upright = leanForward(pose.dir, -lean);
  const foot = leanForward({ x: -upright.x * 0.04, y: 0.01 - BINDING.y, z: -upright.z * 0.04 }, lean);
  return { x: BINDING.x + foot.x, y: BINDING.y + foot.y, z: BINDING.z + foot.z };
}

export function stemPose(shape: ShapeId, stem: Stem, radius: number): Pose {
  return surfacePoint(shape, stem.angle, stem.dist, radius, stem.height, stem.tilt);
}

/** The surface position whose stem points at `point`, for a bouquet of this size. Only the direction from the binding point matters. */
export function surfaceFromPoint(shape: ShapeId, point: Vec3, radius: number): SurfacePos {
  const raw = { x: point.x - BINDING.x, y: point.y - BINDING.y, z: point.z - BINDING.z };
  const v = leanForward(raw, -shapeLean(shape));
  const length = Math.hypot(v.x, v.y, v.z);
  if (length < 1e-9) return { angle: 0, dist: 0 };
  const polar = Math.acos(clamp(v.y / length, -1, 1));
  const around = Math.atan2(v.x, -v.z);
  const angle = shape === 'onesided'
    ? clamp(2 * clamp(around, -Math.PI / 2, Math.PI / 2) + Math.PI, 0, TAU - 1e-6)
    : (around + TAU) % TAU;
  return { angle, dist: clamp(polar / maxPolar(shape, angle, radius), 0, 1) };
}

/** Stable pseudo-random number in [0, 1) from a string, so variation never changes between runs. */
function hash01(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * Places every stem on a spiral, alternating flower types so each type is spread out,
 * with slight natural variation. Each flower takes up room in proportion to its head
 * size, so small heads tuck in tightly between large ones. Resets height and tilt.
 */
export function autoArrange(stems: Stem[], catalog: FlowerType[]): Stem[] {
  const byType = new Map<string, Stem[]>();
  for (const stem of stems) {
    const list = byType.get(stem.flower);
    if (list) list.push(stem);
    else byType.set(stem.flower, [stem]);
  }
  const lists = [...byType.values()];
  const ordered: Stem[] = [];
  for (let round = 0; ordered.length < stems.length; round++) {
    for (const list of lists) if (list[round]) ordered.push(list[round]);
  }
  const n = ordered.length;
  const areas = ordered.map((stem) => headDiameter(stem.flower, catalog) ** 2);
  const total = areas.reduce((sum, a) => sum + a, 0);
  let used = 0;
  return ordered.map((stem, i) => {
    // Distance from the centre at which the area inside equals the area of the heads placed so far.
    const dist = Math.sqrt((used + areas[i] / 2) / total);
    used += areas[i];
    return {
    ...stem,
    angle: n === 1 ? 0 : (i * GOLDEN_ANGLE + (hash01(`${stem.id}a`) - 0.5) * 0.06 + TAU) % TAU,
    dist: n === 1 ? 0 : dist,
    height: DEFAULT_HEIGHT + (hash01(stem.id) - 0.5) * 0.2,
    tilt: 0,
    };
  });
}

const ALL_SHAPES: ShapeId[] = ['round', 'cascade', 'loose', 'onesided'];

/**
 * The emptiest spot on the surface for one more flower of the given type. A spot is judged by its
 * tightest fit across every shape, so the flower still has room after the customer switches shape.
 */
export function largestGap(stems: Stem[], catalog: FlowerType[], flowerId: string): SurfacePos {
  const size = headDiameter(flowerId, catalog);
  const radius = surfaceRadius([...stems, { flower: flowerId }], catalog);
  const sizes = stems.map((s) => headDiameter(s.flower, catalog));
  const headsByShape = ALL_SHAPES.map((shape) => stems.map((s) => stemPose(shape, s, radius).head));
  let best: SurfacePos = { angle: 0, dist: 0 };
  let bestRoom = -Infinity;
  for (let ring = 0; ring <= GAP_RINGS; ring++) {
    const spokes = ring === 0 ? 1 : GAP_SPOKES;
    for (let spoke = 0; spoke < spokes; spoke++) {
      const candidate = { angle: (spoke / spokes) * TAU, dist: ring / GAP_RINGS };
      let room = Infinity;
      ALL_SHAPES.forEach((shape, s) => {
        const at = surfacePoint(shape, candidate.angle, candidate.dist, radius).head;
        headsByShape[s].forEach((head, h) => { room = Math.min(room, distance(at, head) - (sizes[h] + size) / 2); });
      });
      if (room > bestRoom) {
        bestRoom = room;
        best = candidate;
      }
    }
  }
  return best;
}
