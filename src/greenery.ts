import type { GreeneryId } from './bouquet';
import { BINDING, SEPALS_BELOW_HEAD, TAU, distance, type BouquetShape, type Pose, type Vec3 } from './shapes';

/** The one leaf model (public/models/parts/, made by tools/prepare_parts.py): a rose leaf on a short stalk, 1 unit long up +Y. */
export const LEAF_FILE = 'rose-leaf.glb';

/**
 * How many leaves each setting leaves on the stems. Florists strip most of them, so a stem seldom keeps one: `share` is
 * the share of stems that may have a leaf, `max` the most leaves in a bouquet, `second` the chance that such a stem keeps
 * a second one. Numbers from flowers_sources/leaf_references/NOTES.md (reference photos; git-ignored).
 */
export const LEAF_LEVELS: Readonly<Record<GreeneryId, { share: number; max: number; second: number }>> = {
  none: { share: 0, max: 0, second: 0 },
  few: { share: 0.2, max: 6, second: 0 },
  more: { share: 0.4, max: 12, second: 0.3 },
};

/** Flowers a florist sells with bare stems (gerbera, daisies, lilies, carnations, chrysanthemums, orchids). */
const STRIPPED = /gerbera|daisy|lily|carnation|chrysanthem|orchid/i;
/** How far down the visible stem a leaf sits, as a share of the way from the head's sepals to the tie. */
const FIRST_AT = [0.12, 0.3] as const;
const SECOND_AT = [0.3, 0.45] as const;
/** The angle the leaf's stalk makes with the stem, and how far the leaf then droops, in degrees. */
const OUT_DEGREES = [35, 60] as const;
const DROOP_DEGREES = [10, 30] as const;
/** The leaf's length (short stalk and blade) as a share of the head's diameter, and its limits in metres. The blade is about 0.65 of that wide. */
const SIZE_OF_HEAD = [0.7, 1.05] as const;
const MIN_LENGTH = 0.04;
const MAX_LENGTH = 0.12;
/** Shortest visible stem that is given a leaf, in metres above the tie. */
const MIN_VISIBLE = 0.08;
/** The stalk's angle to the stem must stay in this range once drooped, in degrees. */
const ANGLE_LIMITS = [30, 95] as const;
/** Turns tried, after the preferred one, to find a side where the leaf clears the flower heads, in degrees. */
const TURNS = [0, 60, -60, 120, -120, 180];

/** One head the leaves must keep out of, and the stem a leaf may grow on. */
export interface LeafItem { id: string; name: string; pose: Pose; headDiameter: number }

export interface LeafPlan {
  stemId: string;
  /** Where the leaf's stalk leaves the stem. */
  base: Vec3;
  /** Unit vector along the stalk, out and a little down. */
  dir: Vec3;
  /** Metres from the base to the leaf's tip. */
  length: number;
  /** True for some leaves, which are drawn mirrored so they don't all show the same side. */
  mirrored: boolean;
}

/** A number in [0, 1) that depends only on the stem's id and `salt`, so a stem keeps the same leaf however it is edited. */
function unit(id: string, salt: number): number {
  let h = Math.imul(2166136261 ^ salt, 16777619);
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822509);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const lerp = (range: readonly [number, number], t: number) => range[0] + (range[1] - range[0]) * t;
const rad = (degrees: number) => (degrees * Math.PI) / 180;
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const unitOf = (v: Vec3): Vec3 => {
  const n = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / n, y: v.y / n, z: v.z / n };
};
const mix = (a: Vec3, ca: number, b: Vec3, cb: number): Vec3 => ({ x: a.x * ca + b.x * cb, y: a.y * ca + b.y * cb, z: a.z * ca + b.z * cb });

/**
 * Where the leaves go: a few stems keep a leaf, up the visible stem under the head, pointing out and drooping.
 * It depends on the stem ids and poses only, so the same bouquet always gets the same leaves.
 */
export function leafPlans(greenery: GreeneryId, shape: BouquetShape, radius: number, items: readonly LeafItem[]): LeafPlan[] {
  const level = LEAF_LEVELS[greenery];
  const plans: LeafPlan[] = [];
  const candidates = items
    .filter((item) => !STRIPPED.test(item.name) && unit(item.id, 1) < level.share)
    .sort((a, b) => unit(a.id, 1) - unit(b.id, 1) || a.id.localeCompare(b.id));
  for (const item of candidates) {
    const count = unit(item.id, 2) < level.second ? 2 : 1;
    for (let k = 0; k < count && plans.length < level.max; k++) {
      const plan = place(item, k, shape, radius, items);
      if (plan) plans.push(plan);
    }
  }
  return plans;
}

function place(item: LeafItem, k: number, shape: BouquetShape, radius: number, items: readonly LeafItem[]): LeafPlan | null {
  const { pose, headDiameter } = item;
  const top = distance(BINDING, pose.head) - headDiameter * SEPALS_BELOW_HEAD;
  if (top < MIN_VISIBLE) return null;
  const axis = pose.dir;
  const along = top * (1 - lerp(k === 0 ? FIRST_AT : SECOND_AT, unit(item.id, 3 + k)));
  const base = { x: BINDING.x + axis.x * along, y: BINDING.y + axis.y * along, z: BINDING.z + axis.z * along };
  const length = Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, headDiameter * lerp(SIZE_OF_HEAD, unit(item.id, 5))));
  const out = lerp(OUT_DEGREES, unit(item.id, 6));
  const droop = lerp(DROOP_DEGREES, unit(item.id, 7));

  // Prefer the side facing away from the bouquet's middle (where the leaf is seen), the second leaf on the other side.
  const radial: Vec3 = Math.hypot(pose.head.x, pose.head.z) > 1e-6 ? { x: pose.head.x, y: 0, z: pose.head.z } : { x: Math.cos(unit(item.id, 8) * TAU), y: 0, z: Math.sin(unit(item.id, 8) * TAU) };
  let side = mix(radial, 1, axis, -dot(radial, axis));
  if (Math.hypot(side.x, side.y, side.z) < 1e-6) side = cross(axis, { x: 0, y: 1, z: 0 });
  side = unitOf(side);
  const turn0 = (unit(item.id, 9) - 0.5) * rad(100) + (k === 1 ? Math.PI : 0);

  for (const extra of TURNS) {
    const turn = turn0 + rad(extra);
    const around = mix(side, Math.cos(turn), cross(axis, side), Math.sin(turn));
    const raised = mix(axis, Math.cos(rad(out)), around, Math.sin(rad(out)));
    const down = mix({ x: 0, y: -1, z: 0 }, 1, raised, dot({ x: 0, y: 1, z: 0 }, raised));
    const dir = unitOf(mix(raised, Math.cos(rad(droop)), unitOf(down), Math.sin(rad(droop))));
    const angle = (Math.acos(Math.min(1, Math.max(-1, dot(dir, axis)))) * 180) / Math.PI;
    if (angle < ANGLE_LIMITS[0] || angle > ANGLE_LIMITS[1]) continue;
    const at = (t: number): Vec3 => ({ x: base.x + dir.x * length * t, y: base.y + dir.y * length * t, z: base.z + dir.z * length * t });
    if (shape.surfaceFromPoint(at(1), radius).dist >= 1) continue;
    if (!items.every((other) => [0.5, 0.75, 1].every((t) => distance(at(t), other.pose.head) >= other.headDiameter / 2))) continue;
    return { stemId: item.id, base, dir, length, mirrored: unit(item.id, 10 + k) < 0.5 };
  }
  return null;
}
