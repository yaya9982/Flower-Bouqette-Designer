import type { Stem } from './bouquet';
import type { Catalog } from './catalog';
import { DEFAULT_HEIGHT, distance, SHAPE_OF, SHAPES, TAU, type SurfacePos } from './shapes';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** Spacing between heads. Tight enough that heads bunch and overlap a little, as in a real bouquet; the tests cap how far. */
const PACKING = 0.66;
const MIN_RADIUS = 0.05;
const GAP_RINGS = 10;
const GAP_SPOKES = 36;

/** Stable pseudo-random number in [0, 1) from a string, so variation never changes between runs. */
function hash01(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** Sizes the bouquet surface and places stems on it, using the catalogue's head sizes. */
export class Arranger {
  constructor(private readonly catalog: Catalog) {}

  /** Size of the bouquet surface, measured along it from centre to rim. Grows with the flowers. */
  surfaceRadius(stems: readonly { flower: string }[]): number {
    if (stems.length === 0) return MIN_RADIUS;
    // Each head needs room in proportion to its own area, so the surface grows with the total head area.
    const area = stems.reduce((sum, s) => sum + this.catalog.headDiameter(s.flower) ** 2, 0);
    return Math.max(MIN_RADIUS, PACKING * Math.sqrt(area));
  }

  /**
   * Places every stem on a spiral, alternating flower types so each type is spread out,
   * with slight natural variation. Each flower takes up room in proportion to its head
   * size, so small heads tuck in tightly between large ones. Resets height and tilt.
   */
  autoArrange(stems: readonly Stem[]): Stem[] {
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
    const areas = ordered.map((stem) => this.catalog.headDiameter(stem.flower) ** 2);
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

  /**
   * The emptiest spot on the surface for one more flower of the given type. A spot is judged by its
   * tightest fit across every shape, so the flower still has room after the customer switches shape.
   */
  largestGap(stems: readonly Stem[], flowerId: string): SurfacePos {
    const size = this.catalog.headDiameter(flowerId);
    const radius = this.surfaceRadius([...stems, { flower: flowerId }]);
    const sizes = stems.map((s) => this.catalog.headDiameter(s.flower));
    const shapes = SHAPES.map((id) => SHAPE_OF[id]);
    const headsByShape = shapes.map((shape) => stems.map((s) => shape.stemPose(s, radius).head));
    let best: SurfacePos = { angle: 0, dist: 0 };
    let bestRoom = -Infinity;
    for (let ring = 0; ring <= GAP_RINGS; ring++) {
      const spokes = ring === 0 ? 1 : GAP_SPOKES;
      for (let spoke = 0; spoke < spokes; spoke++) {
        const candidate = { angle: (spoke / spokes) * TAU, dist: ring / GAP_RINGS };
        let room = Infinity;
        shapes.forEach((shape, s) => {
          const at = shape.surfacePoint(candidate.angle, candidate.dist, radius).head;
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
}
