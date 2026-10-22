import type { GreeneryId } from './bouquet';
import { BINDING, DEFAULT_HEIGHT, TAU, type BouquetShape, type Vec3 } from './shapes';

/**
 * Sprig models for each kind of greenery, in public/models/parts/ (made by tools/prepare_parts.py), with their real
 * length in metres. Each starts at its origin and runs one unit up +Y; it is drawn that long, ending at the sprig's tip.
 */
export interface SprigModel { file: string; length: number }
export const GREENERY_MODELS: Readonly<Record<GreeneryId, readonly SprigModel[]>> = {
  none: [],
  fern: [{ file: 'fern-low-poly.glb', length: 0.22 }, { file: 'fern-polypody.glb', length: 0.2 }, { file: 'fern-pack.glb', length: 0.14 }, { file: 'fern-leaf.glb', length: 0.16 }],
  eucalyptus: [{ file: 'eucalyptus-leaf.glb', length: 0.08 }, { file: 'leaves.glb', length: 0.07 }],
  leafy: [{ file: 'twig.glb', length: 0.16 }, { file: 'trailing-leaves.glb', length: 0.18 }, { file: 'rose-leaves.glb', length: 0.17 }],
};

export interface SprigPose {
  base: Vec3;
  /** Unit vector from the tie out through the gap the sprig fills. */
  dir: Vec3;
  /** Metres from the tie to the sprig's tip. */
  length: number;
  /** True for every other sprig, which is drawn mirrored so neighbours don't show the same side. */
  mirrored: boolean;
}

/** How far out the sprigs lean, as a share of the rim: just inside it, between the outer flowers, so they come out
 * from among the flowers instead of past the paper. */
const LEAN_OUT = 0.92;
/** How far past the outer flowers' heads the tips reach. */
const REACH = 1.15;

/** Where the greenery goes: a ring of sprigs between and just beyond the outer flowers, more for a bigger bouquet. */
export function sprigPoses(shape: BouquetShape, radius: number, stemCount: number): SprigPose[] {
  const count = Math.min(12, Math.max(4, Math.round(4 + stemCount * 0.2)));
  return Array.from({ length: count }, (_, i) => {
    // Half a step round, so a sprig sits between flowers rather than behind the one at the front.
    const angle = ((i + 0.5) / count) * TAU;
    const rim = shape.surfacePoint(angle, 1, radius, DEFAULT_HEIGHT).head;
    const out = shape.surfacePoint(angle, LEAN_OUT, radius, DEFAULT_HEIGHT).dir;
    return { base: { ...BINDING }, dir: out, length: Math.hypot(rim.x - BINDING.x, rim.y - BINDING.y, rim.z - BINDING.z) * REACH, mirrored: i % 2 === 1 };
  });
}
