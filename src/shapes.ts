import type { Stem } from './bouquet';

export type ShapeId = 'round' | 'cascade' | 'loose' | 'onesided';
export interface Vec3 { x: number; y: number; z: number }
/** head: centre of the flower head. dir: unit vector along the stem. face: unit vector the head points along. */
export interface Pose { head: Vec3; dir: Vec3; face: Vec3 }
export interface SurfacePos { angle: number; dist: number }

/** Where every stem crosses and the ribbon is tied. */
export const BINDING: Vec3 = { x: 0, y: 0.25, z: 0 };
export const TAU = Math.PI * 2;
/** How far below the head's centre a stem model ends, as a share of the head's diameter, so its sepals sit under the head. */
export const SEPALS_BELOW_HEAD = 0.3;
/** Height setting a flower starts at: heads sit low, close to the paper's edge. */
export const DEFAULT_HEIGHT = -0.6;

const rad = (degrees: number) => (degrees * Math.PI) / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Metres a head moves along its stem when height is 1, and the rate it moves for small changes either way. */
const HEIGHT_STEP = 0.05;
/** Metres above the tie that a head sits at the lowest height setting: just above the bow. */
const LOWEST_HEAD = 0.06;
/** Shortest a stem may be above the binding point, so a lowered head never passes through it. */
const MIN_LENGTH = 0.02;
/** Narrowest a bouquet may close, so a few flowers still form a small dome rather than a single stalk. */
const MIN_POLAR = rad(28);

/** 1 at the front (angle 0), falling to 0 at the sides and back. */
function frontness(angle: number): number {
  const c = Math.cos(angle);
  return c > 0 ? c * c : 0;
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

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * A bouquet shape: how a stem's angle, distance, height and tilt become a 3D pose. The base class is the round
 * dome; each other shape overrides only what it does differently.
 * Expressions are copied exactly from the original functions: tests/golden.test.ts checks every bit.
 */
export abstract class BouquetShape {
  abstract readonly id: ShapeId;
  abstract readonly label: string;
  /** Widest the bouquet may open: angle from straight up at the rim (dist = 1), before any per-angle change. */
  protected abstract readonly maxRimPolar: number;
  /** Metres from the tie to the heads that a bouquet keeps while it can; it opens wider instead of growing taller. */
  protected abstract readonly reach: number;
  /** Largest value lengthFactor can return. */
  protected abstract readonly maxLengthFactor: number;
  /** How far the shape leans forward as a whole, in radians. The wrap leans with it. */
  readonly lean: number = 0;
  /** True for shapes that face or spill out of the front, so the paper leaves an opening there. */
  readonly paperOpening: boolean = false;
  /** Multiplies the height step: how far a head moves along its stem per unit of height. */
  protected readonly heightStepFactor: number = 1;

  /** The shape the paper is sized from. */
  get paperRimShape(): BouquetShape {
    return this;
  }

  /**
   * Angle from straight up at the rim for a bouquet of this size. A small bouquet is a tight bundle;
   * a full one opens into a wide dome, as a hand-tied bouquet does.
   */
  protected basePolar(radius: number): number {
    return clamp(radius / this.reach, MIN_POLAR, this.maxRimPolar);
  }

  /** Direction around the vertical axis. */
  azimuth(angle: number): number {
    return angle;
  }

  maxPolar(_angle: number, radius: number): number {
    return this.basePolar(radius);
  }

  protected lengthFactor(_angle: number, _dist: number): number {
    return 1;
  }

  /** The numerator of the base stem length. */
  protected rimSpan(radius: number): number {
    return radius;
  }

  protected baseLength(radius: number): number {
    return this.rimSpan(radius) / this.basePolar(radius);
  }

  /**
   * Stem length for a height setting. Small changes move the head HEIGHT_STEP per unit either way;
   * towards -1 it sinks faster, ending just above the bow.
   */
  protected stemLength(level: number, height: number): number {
    const step = HEIGHT_STEP * this.heightStepFactor;
    if (height >= 0) return level + height * step;
    const room = Math.max(0, level - LOWEST_HEAD);
    const gentle = Math.min(step, room);
    return Math.max(MIN_LENGTH, level + height * gentle - height ** 4 * (room - gentle));
  }

  /** Furthest a head can be from the binding point for this size. Uses the loose step for every shape, as before. */
  maxReach(radius: number): number {
    return this.baseLength(radius) * this.maxLengthFactor + HEIGHT_STEP * 1.6;
  }

  surfacePoint(angle: number, dist: number, radius: number, height = 0, tilt = 0): Pose {
    const around = this.azimuth(angle);
    const polar = dist * this.maxPolar(angle, radius);
    const length = this.stemLength(this.baseLength(radius) * this.lengthFactor(angle, dist), height);
    const lean = this.lean;
    const dir = leanForward(direction(polar, around), lean);
    return {
      head: { x: BINDING.x + dir.x * length, y: BINDING.y + dir.y * length, z: BINDING.z + dir.z * length },
      dir,
      face: leanForward(direction(polar + tilt, around), lean),
    };
  }

  stemPose(stem: Pick<Stem, 'angle' | 'dist' | 'height' | 'tilt'>, radius: number): Pose {
    return this.surfacePoint(stem.angle, stem.dist, radius, stem.height, stem.tilt);
  }

  /** Where a stem ends below the tie: the handle, which leans with the bouquet. */
  stemFoot(pose: Pose): Vec3 {
    const lean = this.lean;
    const upright = leanForward(pose.dir, -lean);
    const foot = leanForward({ x: -upright.x * 0.04, y: 0.01 - BINDING.y, z: -upright.z * 0.04 }, lean);
    return { x: BINDING.x + foot.x, y: BINDING.y + foot.y, z: BINDING.z + foot.z };
  }

  /** The stored angle for a direction `around` the vertical axis. */
  protected angleFromAround(around: number): number {
    return (around + TAU) % TAU;
  }

  /** The surface position whose stem points at `point`, for a bouquet of this size. Only the direction from the binding point matters. */
  surfaceFromPoint(point: Vec3, radius: number): SurfacePos {
    const raw = { x: point.x - BINDING.x, y: point.y - BINDING.y, z: point.z - BINDING.z };
    const v = leanForward(raw, -this.lean);
    const length = Math.hypot(v.x, v.y, v.z);
    if (length < 1e-9) return { angle: 0, dist: 0 };
    const polar = Math.acos(clamp(v.y / length, -1, 1));
    const around = Math.atan2(v.x, -v.z);
    const angle = this.angleFromAround(around);
    return { angle, dist: clamp(polar / this.maxPolar(angle, radius), 0, 1) };
  }

  /** The stored angle for a preset's view angle in degrees, already in -180 to 180. */
  storedAngle(v: number): number {
    return ((rad(v) % TAU) + TAU) % TAU;
  }
}

class RoundShape extends BouquetShape {
  readonly id = 'round';
  readonly label = 'Round';
  protected readonly maxRimPolar = rad(55);
  protected readonly reach = 0.42;
  protected readonly maxLengthFactor = 1;
}

class CascadeShape extends BouquetShape {
  readonly id = 'cascade';
  readonly label = 'Cascading';
  protected readonly maxRimPolar = rad(55);
  protected readonly reach = 0.42;
  protected readonly maxLengthFactor = 1;
  /** How far the cascading bouquet leans forward: far enough that its front flowers hang below the tie. */
  override readonly lean = rad(55);
  override readonly paperOpening = true;

  /** Measured as an even dome, because its front flowers are meant to hang out through the opening. */
  override get paperRimShape(): BouquetShape {
    return SHAPE_OF.round;
  }

  /**
   * The lean does the dropping; the front opens only a little further and keeps its stem length, because opening or
   * lengthening the front pulls its flowers apart into a fan (tests/arrange.test.ts checks the face stays closed).
   */
  override maxPolar(angle: number, radius: number): number {
    const base = this.basePolar(radius);
    return base + rad(8) * frontness(angle);
  }
}

class LooseShape extends BouquetShape {
  readonly id = 'loose';
  readonly label = 'Loose hand-tied';
  protected readonly maxRimPolar = rad(68);
  protected readonly reach = 0.36;
  protected readonly maxLengthFactor = 1.15;
  protected override readonly heightStepFactor = 1.6;

  protected override lengthFactor(_angle: number, dist: number): number {
    return 1 + 0.08 * dist * dist;
  }
}

/**
 * A round dome tipped towards the front, as a florist angles a bouquet made to be seen from one side: the back rows
 * stand upright, the front rows face out. The dome is never wider than the tip, so no head falls behind the stems.
 */
class OneSidedShape extends BouquetShape {
  readonly id = 'onesided';
  readonly label = 'One-sided';
  protected readonly maxRimPolar = rad(45);
  protected readonly reach = 0.42;
  protected readonly maxLengthFactor = 1;
  override readonly lean = rad(45);
  override readonly paperOpening = true;

  /** Measured upright, because the wrap is tipped with the flowers; the round dome leaves a little paper behind them. */
  override get paperRimShape(): BouquetShape {
    return SHAPE_OF.round;
  }
}

export const SHAPES: readonly ShapeId[] = ['round', 'cascade', 'loose', 'onesided'];
export const SHAPE_OF: Readonly<Record<ShapeId, BouquetShape>> = {
  round: new RoundShape(),
  cascade: new CascadeShape(),
  loose: new LooseShape(),
  onesided: new OneSidedShape(),
};
