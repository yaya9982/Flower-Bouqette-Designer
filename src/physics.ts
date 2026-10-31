import type { Stem } from './bouquet';
import { BINDING, SHAPE_OF, TAU, distance, type Pose, type ShapeId, type Vec3 } from './shapes';

/**
 * Flowers that make way. Every stem pivots at the tie, so a flower has two free coordinates: where it sits on the
 * bouquet's disc (u, v = dist cos angle, dist sin angle). Contacts are measured in 3D, so a raised flower clears the
 * lower ones and changing a height counts. Free flowers have no momentum: they move only while something pushes them,
 * never far from home and never fast, then ease back. So the crowd warps around the held flower and cannot bounce.
 */

/** Simulation steps per second. Fixed, so the same input always does the same thing. */
const HZ = 120;
const STEP = 1 / HZ;
/** At most this many steps per frame; a slower frame runs in slow motion instead of falling further behind. */
const MAX_STEPS_PER_FRAME = 5;
/** Passes over the contacts per step. */
const CONTACT_PASSES = 3;
/** Share of an overlap corrected in one pass: soft, so a crowd gives way like fluid rather than snapping. */
const CONTACT_SOFTNESS = 0.6;
/** Heads may sink into each other this far before they push, as in a real bouquet: a share of their combined radii. */
const HEAD_CLEARANCE = 0.85;
/** The flower being moved takes up all of its room, so it is seen to shoulder others aside. */
const HELD_CLEARANCE = 1;
/** How much of a head's radius must stay clear of another flower's stem, and the stem's own half-width in metres. */
const STEM_CLEARANCE = 0.6;
const STEM_WIDTH = 0.006;
/** Seconds a free flower takes to cover about two thirds of the way home. */
const RETURN_TIME = 0.15;
const RETURN_SHARE = 1 - Math.exp(-STEP / RETURN_TIME);
/** Furthest a free flower strays from home, as a share of its head's width. */
const MAX_SHIFT = 0.22;
/** Fastest a free flower moves, in disc widths (dist units) per second. */
const MAX_SPEED = 0.35;
/** Share of a contact passed on from one free flower to the next, so a push fades within a few flowers. */
const RIPPLE = 0.2;
/** Share of a push on a flower ahead of the held one that is turned sideways, so it parts instead of being carried along. */
const SIDEWAYS = 0.8;
/** The held flower follows the pointer at no more than this speed, so a jump sweeps through the bouquet and cannot skip it. */
const HELD_SPEED = 6;
/** The same for height: units of the height setting per second. */
const HELD_HEIGHT_SPEED = 5;
/** Metres the held head must travel before its full size counts. It starts out resting in its neighbours' overlaps. */
const CONTACT_RAMP = 0.03;
/** Flowers within this many combined radii of the held head lean away before they touch it, like liquid around a straw. */
const CUSHION_REACH = 1.8;
/** How strongly, in metres per second at the held head. */
const CUSHION = 0.17;
/** Below these a flower counts as still, in dist units and dist units per second. */
const STILL_DISTANCE = 2e-4;
const STILL_SPEED = 2e-3;
/** A flower that ends up closer to home than this is left exactly where it was. */
const MOVED = 1e-3;
/** Longest a drop may settle for, in steps. */
const MAX_SETTLE_STEPS = 600;
/** ...and at least this long, because everything starts out still. */
const MIN_SETTLE_STEPS = 12;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

interface Body {
  id: string;
  stem: Stem;
  size: number;
  u: number;
  v: number;
  du: number;
  dv: number;
  homeU: number;
  homeV: number;
  height: number;
  /** Filled in by `measure`. */
  pose: Pose;
  length: number;
}

interface Held {
  index: number;
  targetU: number;
  targetV: number;
  targetHeight: number;
  tilt: number;
  /** Where the head was when it was picked up. */
  from: Vec3;
  /** 0 when just picked up, 1 once its full size counts. */
  ramp: number;
  /** True while working out where a drop ends: it no longer shoulders others, it only needs its place. */
  dropped: boolean;
  /** The way it is heading: a unit vector, or zero when it has stopped. */
  du: number;
  dv: number;
}

export interface PlacedStem { id: string; pose: Pose }

const discOf = (stem: Pick<Stem, 'angle' | 'dist'>) => ({ u: stem.dist * Math.cos(stem.angle), v: stem.dist * Math.sin(stem.angle) });

export class FlowerPhysics {
  private bodies: Body[] = [];
  private shape: ShapeId = 'round';
  private radius = 0;
  /** Overlap each pair has at rest, which it is allowed to keep. */
  private allowed = new Float64Array(0);
  private held: Held | null = null;
  private awake = false;
  private spare = 0;
  private carryNext = false;

  /** `headSize` is a flower's head diameter in metres. */
  constructor(private readonly headSize: (flower: string) => number) {}

  get isAwake(): boolean {
    return this.awake;
  }

  /** Fastest any free flower is moving, in dist units per second. */
  get topSpeed(): number {
    return this.bodies.reduce((top, b) => Math.max(top, Math.hypot(b.du, b.dv)), 0);
  }

  /**
   * Makes this the bouquet at rest. A flower keeps its motion only after `settle`; any other change of layout
   * (undo, a preset, a new shape) is shown at once, as it always was.
   */
  load(stems: readonly Stem[], shape: ShapeId, radius: number): void {
    const carry = this.carryNext;
    this.carryNext = false;
    this.held = null;
    if (!carry && this.matches(stems, shape, radius)) {
      this.bodies.forEach((b, i) => { b.stem = stems[i]; });
      return;
    }
    const keep = carry && shape === this.shape && radius === this.radius ? new Map(this.bodies.map((b) => [b.id, b])) : null;
    this.shape = shape;
    this.radius = radius;
    this.bodies = stems.map((stem) => {
      const home = discOf(stem);
      const was = keep?.get(stem.id);
      return {
        id: stem.id, stem, size: this.headSize(stem.flower),
        u: was?.u ?? home.u, v: was?.v ?? home.v, du: 0, dv: 0,
        homeU: home.u, homeV: home.v, height: stem.height, pose: null as unknown as Pose, length: 0,
      };
    });
    this.remember();
    this.awake = keep !== null;
    this.spare = 0;
  }

  /** The customer is moving this flower: it goes where `stem` says, as fast as it may. */
  hold(stem: Stem): void {
    const index = this.bodies.findIndex((b) => b.id === stem.id);
    if (index < 0) return;
    const target = discOf(stem);
    if (this.held?.index !== index) {
      this.measure();
      this.held = { index, targetU: 0, targetV: 0, targetHeight: 0, tilt: 0, from: this.bodies[index].pose.head, ramp: 0, dropped: false, du: 0, dv: 0 };
    }
    Object.assign(this.held, { targetU: target.u, targetV: target.v, targetHeight: stem.height, tilt: stem.tilt });
    this.awake = true;
  }

  /** Runs the simulation for `seconds` of real time. True if anything moved, so the view must redraw. */
  step(seconds: number): boolean {
    if (!this.awake) return false;
    this.spare = Math.min(this.spare + Math.max(0, seconds), MAX_STEPS_PER_FRAME * STEP);
    for (; this.spare >= STEP; this.spare -= STEP) this.advance();
    this.measure();
    if (!this.held && this.isStill()) {
      for (const b of this.bodies) Object.assign(b, { u: b.homeU, v: b.homeV, du: 0, dv: 0 });
      this.measure();
      this.awake = false;
    }
    return true;
  }

  /** Where each flower is now. */
  poses(): PlacedStem[] {
    return this.bodies.map((b) => ({ id: b.id, pose: b.pose }));
  }

  /**
   * The flower has been let go at `stems`: answers the same stems with its neighbours moved as far as they must stay,
   * or the same array when none had to. This starts from the bouquet at rest, not from the flowers in mid-air, so the
   * result depends only on where it was dropped: shaking a flower about and putting it back changes nothing.
   * The live flowers then settle into that result.
   */
  settle(stems: readonly Stem[], heldId: string | null): readonly Stem[] {
    const stem = stems.find((s) => s.id === heldId);
    if (stem) this.hold(stem);
    this.carryNext = true;
    if (!this.held) return stems;
    const sim = new FlowerPhysics(this.headSize);
    const held = { ...this.held, ramp: 0, dropped: true };
    const bodies = this.bodies.map((b, i) => (i === held.index
      ? { ...b, u: held.targetU, v: held.targetV, height: held.targetHeight, du: 0, dv: 0 }
      : { ...b, u: b.homeU, v: b.homeV, du: 0, dv: 0 }));
    Object.assign(sim, { shape: this.shape, radius: this.radius, allowed: this.allowed, held, bodies });
    for (let i = 0; i < MAX_SETTLE_STEPS; i++) {
      sim.advance();
      if (i >= MIN_SETTLE_STEPS && sim.isStill()) break;
    }
    let changed = false;
    const settled = stems.map((s) => {
      const body = sim.bodies.find((b) => b.id === s.id);
      if (!body || s.id === heldId || Math.hypot(body.u - body.homeU, body.v - body.homeV) < MOVED) return s;
      changed = true;
      return { ...s, angle: (Math.atan2(body.v, body.u) + TAU) % TAU, dist: Math.min(1, Math.hypot(body.u, body.v)) };
    });
    return changed ? settled : stems;
  }

  private matches(stems: readonly Stem[], shape: ShapeId, radius: number): boolean {
    return shape === this.shape && radius === this.radius && stems.length === this.bodies.length && stems.every((s, i) => {
      const b = this.bodies[i];
      const home = discOf(s);
      return b.id === s.id && b.height === s.height && b.stem.tilt === s.tilt && b.size === this.headSize(s.flower) && b.homeU === home.u && b.homeV === home.v;
    });
  }

  /** Notes the overlaps of the bouquet at rest, so it stays at rest until something touches it. */
  private remember(): void {
    const n = this.bodies.length;
    const at = this.bodies.map((b) => ({ u: b.u, v: b.v }));
    this.bodies.forEach((b) => { b.u = b.homeU; b.v = b.homeV; });
    this.measure();
    this.allowed = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) this.allowed[i * n + j] = Math.max(0, this.overlap(i, j));
    }
    this.bodies.forEach((b, i) => { b.u = at[i].u; b.v = at[i].v; });
    this.measure();
  }

  private measure(): void {
    const shape = SHAPE_OF[this.shape];
    this.bodies.forEach((b, i) => {
      const tilt = this.held?.index === i ? this.held.tilt : b.stem.tilt;
      const dist = Math.hypot(b.u, b.v);
      b.pose = shape.surfacePoint((Math.atan2(b.v, b.u) + TAU) % TAU, dist, this.radius, b.height, tilt);
      b.length = distance(b.pose.head, BINDING);
    });
  }

  /** How far flowers i and j are inside each other in metres; negative when clear. A shorter head meets a longer flower's stem. */
  private overlap(i: number, j: number): number {
    const a = this.bodies[i];
    const b = this.bodies[j];
    const [low, high] = a.length <= b.length ? [a, b] : [b, a];
    if (high.length > low.length + high.size / 2) {
      const d = high.pose.dir;
      const onStem = { x: BINDING.x + d.x * low.length, y: BINDING.y + d.y * low.length, z: BINDING.z + d.z * low.length };
      // Stems crowd together towards the tie, where a head nestles among them; pushing there would burst the whole bouquet.
      const spread = (low.length / high.length) ** 2;
      return ((low.size / 2) * STEM_CLEARANCE + STEM_WIDTH) * spread - distance(low.pose.head, onStem);
    }
    const held = this.held;
    const shouldering = held && !held.dropped && (held.index === i || held.index === j);
    const clearance = shouldering ? HEAD_CLEARANCE + (HELD_CLEARANCE - HEAD_CLEARANCE) * held.ramp : HEAD_CLEARANCE;
    return ((a.size + b.size) / 2) * clearance - distance(a.pose.head, b.pose.head);
  }

  private advance(): void {
    this.moveHeld();
    const heldIndex = this.held?.index ?? -1;
    const before = this.bodies.map((b) => ({ u: b.u, v: b.v }));
    this.bodies.forEach((b, i) => {
      if (i === heldIndex) return;
      b.u += (b.homeU - b.u) * RETURN_SHARE;
      b.v += (b.homeV - b.v) * RETURN_SHARE;
    });
    this.measure();
    // With nothing held every flower has a home that is known to work: contacts would only jam them on the way back.
    if (this.held) {
      this.cushion();
      for (let pass = 0; pass < CONTACT_PASSES; pass++) {
        this.separate();
        this.measure();
      }
    }
    this.bodies.forEach((b, i) => {
      if (i !== heldIndex) this.restrain(b, before[i]);
    });
  }

  /** Keeps a free flower near home and slow, however hard it was pushed this step. */
  private restrain(b: Body, was: { u: number; v: number }): void {
    const reach = this.reach(b);
    const off = Math.hypot(b.u - b.homeU, b.v - b.homeV);
    if (off > reach) {
      b.u = b.homeU + ((b.u - b.homeU) * reach) / off;
      b.v = b.homeV + ((b.v - b.homeV) * reach) / off;
    }
    b.du = (b.u - was.u) / STEP;
    b.dv = (b.v - was.v) / STEP;
    const speed = Math.hypot(b.du, b.dv);
    if (speed > MAX_SPEED) {
      b.du *= MAX_SPEED / speed;
      b.dv *= MAX_SPEED / speed;
      b.u = was.u + b.du * STEP;
      b.v = was.v + b.dv * STEP;
    }
  }

  /** Furthest this flower may stray, in dist units. */
  private reach(b: Body): number {
    return (b.size * MAX_SHIFT) / this.radius;
  }

  /** How much of a push this flower still takes: all of it at home, none at the end of its reach. */
  private give(b: Body): number {
    return Math.max(0, 1 - (Math.hypot(b.u - b.homeU, b.v - b.homeV) / this.reach(b)) ** 2);
  }

  private moveHeld(): void {
    const held = this.held;
    if (!held) return;
    const b = this.bodies[held.index];
    const dx = held.targetU - b.u;
    const dy = held.targetV - b.v;
    const gap = Math.hypot(dx, dy);
    const reach = Math.min(1, gap > 0 ? (HELD_SPEED * STEP) / gap : 0);
    b.u += dx * reach;
    b.v += dy * reach;
    held.du = gap > 0 ? dx / gap : 0;
    held.dv = gap > 0 ? dy / gap : 0;
    b.du = 0;
    b.dv = 0;
    const climb = held.targetHeight - b.height;
    b.height += Math.sign(climb) * Math.min(Math.abs(climb), HELD_HEIGHT_SPEED * STEP);
    this.measure();
    held.ramp = Math.max(held.ramp, Math.min(1, distance(b.pose.head, held.from) / CONTACT_RAMP));
  }

  /** Flowers near the held one lean away from it. It only ever pushes outwards, so shaking cannot whip them about. */
  private cushion(): void {
    const held = this.held!;
    if (held.dropped) return;
    const source = this.bodies[held.index];
    this.bodies.forEach((b, i) => {
      if (i === held.index) return;
      const reach = (CUSHION_REACH * (b.size + source.size)) / 2;
      const near = 1 - distance(b.pose.head, source.pose.head) / reach;
      const du = b.u - source.u;
      const dv = b.v - source.v;
      const apart = Math.hypot(du, dv);
      if (near <= 0 || apart < 1e-5) return;
      const push = (held.ramp * near * near * CUSHION * STEP * this.give(b)) / this.radius / apart;
      b.u += du * push;
      b.v += dv * push;
    });
  }

  private separate(): void {
    const n = this.bodies.length;
    const heldIndex = this.held?.index ?? -1;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const involvesHeld = i === heldIndex || j === heldIndex;
        // A flower being moved gives up its resting overlaps as it goes.
        const allowed = this.allowed[i * n + j] * (involvesHeld ? 1 - this.held!.ramp : 1);
        const depth = this.overlap(i, j) - allowed;
        if (depth <= 0) continue;
        const a = this.bodies[i];
        const b = this.bodies[j];
        let du = a.u - b.u;
        let dv = a.v - b.v;
        let gap = Math.hypot(du, dv);
        if (gap < 1e-5) {
          // One exactly over the other: part them in a direction that differs from pair to pair.
          du = Math.cos(i * GOLDEN_ANGLE + j);
          dv = Math.sin(i * GOLDEN_ANGLE + j);
          gap = 1;
        }
        if (involvesHeld) {
          const { du: headingU, dv: headingV } = this.held!;
          const along = du * headingU + dv * headingV;
          // Ahead of the held flower when the line from it to the other runs the way it is heading.
          if (along * (i === heldIndex ? -1 : 1) > 0) {
            const turnedU = du - SIDEWAYS * along * headingU;
            const turnedV = dv - SIDEWAYS * along * headingV;
            const turned = Math.hypot(turnedU, turnedV);
            du = (turnedU * gap) / turned;
            dv = (turnedV * gap) / turned;
          }
        }
        const push = ((involvesHeld ? 1 : RIPPLE) * CONTACT_SOFTNESS * depth) / this.radius / gap;
        const shareA = j === heldIndex ? this.give(a) : i === heldIndex ? 0 : 0.5 * this.give(a);
        const shareB = i === heldIndex ? this.give(b) : j === heldIndex ? 0 : 0.5 * this.give(b);
        a.u += du * push * shareA;
        a.v += dv * push * shareA;
        b.u -= du * push * shareB;
        b.v -= dv * push * shareB;
      }
    }
    // The bouquet's rim: no flower is pushed out of the bunch.
    this.bodies.forEach((b, i) => {
      const dist = Math.hypot(b.u, b.v);
      if (i !== heldIndex && dist > 1) {
        b.u /= dist;
        b.v /= dist;
      }
    });
  }

  private isStill(): boolean {
    const held = this.held;
    if (held) {
      const b = this.bodies[held.index];
      if (Math.hypot(held.targetU - b.u, held.targetV - b.v) > STILL_DISTANCE || Math.abs(held.targetHeight - b.height) > 1e-6) return false;
      return this.bodies.every((other, i) => i === held.index || Math.hypot(other.du, other.dv) < STILL_SPEED);
    }
    return this.bodies.every((b) => Math.hypot(b.du, b.dv) < STILL_SPEED && Math.hypot(b.u - b.homeU, b.v - b.homeV) < STILL_DISTANCE);
  }
}
