import { autoArrange, DEFAULT_HEIGHT, largestGap, TAU } from './arrange';
import { PAPER_COLOURS, RIBBON_COLOURS, type FlowerType } from './catalog';

export type ShapeId = 'round' | 'cascade' | 'loose' | 'onesided';
export const SHAPES: readonly ShapeId[] = ['round', 'cascade', 'loose', 'onesided'];

export type PaperId = 'none' | 'kraft' | 'matte' | 'tissue';
export const PAPERS: readonly PaperId[] = ['none', 'kraft', 'matte', 'tissue'];

export interface Stem {
  id: string;
  flower: string;
  colour: string;
  /** Position around the bouquet, radians, 0 to 2π. */
  angle: number;
  /** Distance from the centre, 0 to 1. */
  dist: number;
  /** Offset along the stem, -1 to 1. */
  height: number;
  /** Extra lean of the head away from the centre, radians, -0.5 to 0.5. */
  tilt: number;
}

export interface Wrap {
  paper: PaperId;
  paperColour: string;
  ribbonColour: string;
}

export interface Bouquet {
  version: 1;
  shape: ShapeId;
  wrap: Wrap;
  stems: Stem[];
}

export const MIN_STEMS = 1;
export const MAX_STEMS = 40;
export const HISTORY_LIMIT = 100;
export const STORAGE_KEY = 'bouquet-designer:v1';
export const MAX_SAVED_LENGTH = 64 * 1024;

const HEIGHT_RANGE = 1;
const TILT_RANGE = 0.5;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const findFlower = (catalog: FlowerType[], id: string) => catalog.find((f) => f.id === id);

/** Ids are "s" plus a number; a new one is always higher than any in use. */
function nextStemId(stems: Stem[]): string {
  const highest = stems.reduce((max, s) => Math.max(max, Number(s.id.slice(1)) || 0), 0);
  return `s${highest + 1}`;
}

/** Returns the same bouquet when the stem is missing or the patch changes nothing, so no undo step is recorded. */
function patchStem(b: Bouquet, stemId: string, patch: Partial<Stem>): Bouquet {
  const stem = b.stems.find((s) => s.id === stemId);
  if (!stem || (Object.keys(patch) as (keyof Stem)[]).every((key) => stem[key] === patch[key])) return b;
  return { ...b, stems: b.stems.map((s) => (s.id === stemId ? { ...s, ...patch } : s)) };
}

export function createDefaultBouquet(catalog: FlowerType[]): Bouquet {
  const counts = [5, 4, 3];
  const stems: Stem[] = [];
  catalog.slice(0, counts.length).forEach((type, t) => {
    for (let i = 0; i < counts[t]; i++) {
      stems.push({ id: `s${stems.length + 1}`, flower: type.id, colour: type.colours[0].id, angle: 0, dist: 0, height: DEFAULT_HEIGHT, tilt: 0 });
    }
  });
  return {
    version: 1,
    shape: 'round',
    wrap: { paper: 'kraft', paperColour: PAPER_COLOURS[0].id, ribbonColour: RIBBON_COLOURS[0].id },
    stems: autoArrange(stems, catalog),
  };
}

/** `colourId` is used when the flower comes in that colour; otherwise it gets its first colour. */
export function addStem(b: Bouquet, flowerId: string, catalog: FlowerType[], colourId?: string): Bouquet {
  const type = findFlower(catalog, flowerId);
  if (!type || b.stems.length >= MAX_STEMS) return b;
  const gap = largestGap(b.stems, catalog, flowerId);
  const colour = (type.colours.find((c) => c.id === colourId) ?? type.colours[0]).id;
  const stem: Stem = { id: nextStemId(b.stems), flower: flowerId, colour, angle: gap.angle, dist: gap.dist, height: DEFAULT_HEIGHT, tilt: 0 };
  return { ...b, stems: [...b.stems, stem] };
}

export function removeStem(b: Bouquet, stemId: string): Bouquet {
  if (b.stems.length <= MIN_STEMS || !b.stems.some((s) => s.id === stemId)) return b;
  return { ...b, stems: b.stems.filter((s) => s.id !== stemId) };
}

/** Removes the most recently added stem of a type (the panel's minus button). */
export function removeOneOfType(b: Bouquet, flowerId: string): Bouquet {
  const last = b.stems.filter((s) => s.flower === flowerId).at(-1);
  return last ? removeStem(b, last.id) : b;
}

export function swapStem(b: Bouquet, stemId: string, flowerId: string, catalog: FlowerType[]): Bouquet {
  const type = findFlower(catalog, flowerId);
  return type ? patchStem(b, stemId, { flower: flowerId, colour: type.colours[0].id }) : b;
}

export function recolourStem(b: Bouquet, stemId: string, colourId: string, catalog: FlowerType[]): Bouquet {
  const stem = b.stems.find((s) => s.id === stemId);
  const type = stem && findFlower(catalog, stem.flower);
  return type?.colours.some((c) => c.id === colourId) ? patchStem(b, stemId, { colour: colourId }) : b;
}

export function moveStem(b: Bouquet, stemId: string, angle: number, dist: number): Bouquet {
  if (!Number.isFinite(angle) || !Number.isFinite(dist)) return b;
  // An angle already in range is kept exactly; wrapping it would change its last digits.
  const wrapped = angle >= 0 && angle < TAU ? angle : ((angle % TAU) + TAU) % TAU;
  return patchStem(b, stemId, { angle: wrapped, dist: clamp(dist, 0, 1) });
}

export function adjustStem(b: Bouquet, stemId: string, patch: { height?: number; tilt?: number }): Bouquet {
  const next: Partial<Stem> = {};
  if (Number.isFinite(patch.height)) next.height = clamp(patch.height!, -HEIGHT_RANGE, HEIGHT_RANGE);
  if (Number.isFinite(patch.tilt)) next.tilt = clamp(patch.tilt!, -TILT_RANGE, TILT_RANGE);
  return patchStem(b, stemId, next);
}

export function setShape(b: Bouquet, shape: ShapeId): Bouquet {
  return SHAPES.includes(shape) && shape !== b.shape ? { ...b, shape } : b;
}

function isValidWrap(value: unknown): value is Wrap {
  if (typeof value !== 'object' || value === null) return false;
  const w = value as Record<string, unknown>;
  return PAPERS.includes(w.paper as PaperId)
    && PAPER_COLOURS.some((c) => c.id === w.paperColour)
    && RIBBON_COLOURS.some((c) => c.id === w.ribbonColour);
}

export function setWrap(b: Bouquet, patch: Partial<Wrap>): Bouquet {
  const wrap = { ...b.wrap, ...patch };
  const changed = wrap.paper !== b.wrap.paper || wrap.paperColour !== b.wrap.paperColour || wrap.ribbonColour !== b.wrap.ribbonColour;
  return changed && isValidWrap(wrap) ? { ...b, wrap } : b;
}

export function rearrange(b: Bouquet, catalog: FlowerType[]): Bouquet {
  const stems = autoArrange(b.stems, catalog);
  return JSON.stringify(stems) === JSON.stringify(b.stems) ? b : { ...b, stems };
}

/** The selection, or null if that stem no longer exists. */
export function resolveSelection(b: Bouquet, stemId: string | null): string | null {
  return stemId !== null && b.stems.some((s) => s.id === stemId) ? stemId : null;
}

const inRange = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/** Checks data read from storage. Returns a clean bouquet, or null if anything is wrong. */
export function validateBouquet(data: unknown, catalog: FlowerType[]): Bouquet | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  const shape = d.shape as ShapeId;
  const wrap = d.wrap;
  const rawStems = d.stems;
  if (d.version !== 1 || !SHAPES.includes(shape) || !isValidWrap(wrap) || !Array.isArray(rawStems)) return null;
  if (rawStems.length < MIN_STEMS || rawStems.length > MAX_STEMS) return null;

  const ids = new Set<string>();
  const stems: Stem[] = [];
  for (const raw of rawStems) {
    if (typeof raw !== 'object' || raw === null) return null;
    const s = raw as Record<string, unknown>;
    const { id, flower, colour, angle, dist, height, tilt } = s;
    if (typeof id !== 'string' || !/^s\d{1,9}$/.test(id) || ids.has(id)) return null;
    const type = typeof flower === 'string' ? findFlower(catalog, flower) : undefined;
    if (!type || typeof colour !== 'string' || !type.colours.some((c) => c.id === colour)) return null;
    if (!inRange(angle, 0, TAU) || !inRange(dist, 0, 1)) return null;
    if (!inRange(height, -HEIGHT_RANGE, HEIGHT_RANGE) || !inRange(tilt, -TILT_RANGE, TILT_RANGE)) return null;
    ids.add(id);
    stems.push({ id, flower: type.id, colour, angle, dist, height, tilt });
  }
  return {
    version: 1,
    shape,
    wrap: { paper: wrap.paper, paperColour: wrap.paperColour, ribbonColour: wrap.ribbonColour },
    stems,
  };
}

export interface History {
  past: Bouquet[];
  present: Bouquet;
  future: Bouquet[];
}

export function createHistory(present: Bouquet): History {
  return { past: [], present, future: [] };
}

export function commit(h: History, next: Bouquet): History {
  if (next === h.present) return h;
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [] };
}

export function undo(h: History): History {
  if (h.past.length === 0) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function redo(h: History): History {
  if (h.future.length === 0) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}

export type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function saveBouquet(b: Bouquet, store: Store): void {
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(b));
  } catch {
    // Storage is full or blocked. The designer still works; the design just isn't kept.
  }
}

export function loadBouquet(catalog: FlowerType[], store: Store): Bouquet | null {
  try {
    const raw = store.getItem(STORAGE_KEY);
    // A full bouquet saves to about 6 KB; anything far bigger was not written by the designer.
    return raw === null || raw.length > MAX_SAVED_LENGTH ? null : validateBouquet(JSON.parse(raw), catalog);
  } catch {
    return null;
  }
}
