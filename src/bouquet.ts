import { Arranger } from './arrange';
import { PAPER_COLOURS, RIBBON_COLOURS, type Catalog } from './catalog';
import { DEFAULT_HEIGHT, SHAPES, TAU, type ShapeId } from './shapes';

export { SHAPES, type ShapeId } from './shapes';

export type PaperId = 'none' | 'kraft' | 'matte' | 'tissue';
export const PAPERS: readonly PaperId[] = ['none', 'kraft', 'matte', 'tissue'];
export type BowId = 'ribbon' | 'star';
export const BOWS: readonly BowId[] = ['ribbon', 'star'];
/** How many leaves are left on the stems (src/greenery.ts). */
export type GreeneryId = 'none' | 'few' | 'more';
export const GREENERIES: readonly GreeneryId[] = ['none', 'few', 'more'];
/** Greenery saved or asked for before it became leaves on the stems: sprigs tucked in around the rim. */
const OLD_GREENERY: Readonly<Record<string, GreeneryId>> = { fern: 'few', eucalyptus: 'few', leafy: 'more' };
/** The greenery a saved design or a florist's request means, or undefined if there is no such greenery. */
export const greeneryOf = (value: unknown): GreeneryId | undefined =>
  GREENERIES.find((g) => g === value) ?? (typeof value === 'string' && Object.hasOwn(OLD_GREENERY, value) ? OLD_GREENERY[value] : undefined);

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
  bow: BowId;
  greenery: GreeneryId;
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
const inRange = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

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

function isValidWrap(value: unknown): value is Wrap {
  if (typeof value !== 'object' || value === null) return false;
  const w = value as Record<string, unknown>;
  return PAPERS.includes(w.paper as PaperId)
    && PAPER_COLOURS.some((c) => c.id === w.paperColour)
    && RIBBON_COLOURS.some((c) => c.id === w.ribbonColour)
    && BOWS.includes(w.bow as BowId)
    && GREENERIES.includes(w.greenery as GreeneryId);
}

/**
 * Every change a customer can make to a bouquet. Bouquets are plain data and never changed in place: each method
 * returns a new bouquet, or the same one when nothing changed, which is how "no undo step" works.
 */
export class BouquetEditor {
  readonly arranger: Arranger;

  constructor(readonly catalog: Catalog) {
    this.arranger = new Arranger(catalog);
  }

  createDefault(): Bouquet {
    const counts = [5, 4, 3];
    const stems: Stem[] = [];
    this.catalog.flowers.slice(0, counts.length).forEach((type, t) => {
      for (let i = 0; i < counts[t]; i++) {
        stems.push({ id: `s${stems.length + 1}`, flower: type.id, colour: type.colours[0].id, angle: 0, dist: 0, height: DEFAULT_HEIGHT, tilt: 0 });
      }
    });
    return {
      version: 1,
      shape: 'round',
      wrap: { paper: 'kraft', paperColour: PAPER_COLOURS[0].id, ribbonColour: RIBBON_COLOURS[0].id, bow: 'ribbon', greenery: 'few' },
      stems: this.arranger.autoArrange(stems),
    };
  }

  /** `colourId` is used when the flower comes in that colour; otherwise it gets its first colour. */
  add(b: Bouquet, flowerId: string, colourId?: string): Bouquet {
    const type = this.catalog.find(flowerId);
    if (!type || b.stems.length >= MAX_STEMS) return b;
    const gap = this.arranger.largestGap(b.stems, flowerId);
    const colour = (type.colours.find((c) => c.id === colourId) ?? type.colours[0]).id;
    const stem: Stem = { id: nextStemId(b.stems), flower: flowerId, colour, angle: gap.angle, dist: gap.dist, height: DEFAULT_HEIGHT, tilt: 0 };
    return { ...b, stems: [...b.stems, stem] };
  }

  remove(b: Bouquet, stemId: string): Bouquet {
    if (b.stems.length <= MIN_STEMS || !b.stems.some((s) => s.id === stemId)) return b;
    return { ...b, stems: b.stems.filter((s) => s.id !== stemId) };
  }

  /** Removes the most recently added stem of a type (the panel's minus button). */
  removeOneOfType(b: Bouquet, flowerId: string): Bouquet {
    const last = b.stems.filter((s) => s.flower === flowerId).at(-1);
    return last ? this.remove(b, last.id) : b;
  }

  swap(b: Bouquet, stemId: string, flowerId: string): Bouquet {
    const type = this.catalog.find(flowerId);
    return type ? patchStem(b, stemId, { flower: flowerId, colour: type.colours[0].id }) : b;
  }

  recolour(b: Bouquet, stemId: string, colourId: string): Bouquet {
    const stem = b.stems.find((s) => s.id === stemId);
    const type = stem && this.catalog.find(stem.flower);
    return type?.colours.some((c) => c.id === colourId) ? patchStem(b, stemId, { colour: colourId }) : b;
  }

  move(b: Bouquet, stemId: string, angle: number, dist: number): Bouquet {
    if (!Number.isFinite(angle) || !Number.isFinite(dist)) return b;
    // An angle already in range is kept exactly; wrapping it would change its last digits.
    const wrapped = angle >= 0 && angle < TAU ? angle : ((angle % TAU) + TAU) % TAU;
    return patchStem(b, stemId, { angle: wrapped, dist: clamp(dist, 0, 1) });
  }

  adjust(b: Bouquet, stemId: string, patch: { height?: number; tilt?: number }): Bouquet {
    const next: Partial<Stem> = {};
    if (Number.isFinite(patch.height)) next.height = clamp(patch.height!, -HEIGHT_RANGE, HEIGHT_RANGE);
    if (Number.isFinite(patch.tilt)) next.tilt = clamp(patch.tilt!, -TILT_RANGE, TILT_RANGE);
    return patchStem(b, stemId, next);
  }

  setShape(b: Bouquet, shape: ShapeId): Bouquet {
    return SHAPES.includes(shape) && shape !== b.shape ? { ...b, shape } : b;
  }

  setWrap(b: Bouquet, patch: Partial<Wrap>): Bouquet {
    const wrap = { ...b.wrap, ...patch };
    const changed = (Object.keys(wrap) as (keyof Wrap)[]).some((key) => wrap[key] !== b.wrap[key]);
    return changed && isValidWrap(wrap) ? { ...b, wrap } : b;
  }

  rearrange(b: Bouquet): Bouquet {
    const stems = this.arranger.autoArrange(b.stems);
    return JSON.stringify(stems) === JSON.stringify(b.stems) ? b : { ...b, stems };
  }

  /** The selection, or null if that stem no longer exists. */
  static resolveSelection(b: Bouquet, stemId: string | null): string | null {
    return stemId !== null && b.stems.some((s) => s.id === stemId) ? stemId : null;
  }

  /** Checks data read from storage. Returns a clean bouquet, or null if anything is wrong. */
  validate(data: unknown): Bouquet | null {
    if (typeof data !== 'object' || data === null) return null;
    const d = data as Record<string, unknown>;
    const shape = d.shape as ShapeId;
    // Saved before bows and greenery existed: the bow it had then, and no greenery.
    const wrap = typeof d.wrap === 'object' && d.wrap !== null ? { bow: 'ribbon', greenery: 'none', ...d.wrap } : d.wrap;
    if (typeof wrap === 'object' && wrap !== null) (wrap as Record<string, unknown>).greenery = greeneryOf((wrap as Record<string, unknown>).greenery) ?? (wrap as Record<string, unknown>).greenery;
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
      const type = typeof flower === 'string' ? this.catalog.find(flower) : undefined;
      if (!type || typeof colour !== 'string' || !type.colours.some((c) => c.id === colour)) return null;
      if (!inRange(angle, 0, TAU) || !inRange(dist, 0, 1)) return null;
      if (!inRange(height, -HEIGHT_RANGE, HEIGHT_RANGE) || !inRange(tilt, -TILT_RANGE, TILT_RANGE)) return null;
      ids.add(id);
      stems.push({ id, flower: type.id, colour, angle, dist, height, tilt });
    }
    return {
      version: 1,
      shape,
      wrap: { paper: wrap.paper, paperColour: wrap.paperColour, ribbonColour: wrap.ribbonColour, bow: wrap.bow, greenery: wrap.greenery },
      stems,
    };
  }
}

/** Undo and redo. The lists are replaced on every change, never changed in place. */
export class History {
  private pastSteps: Bouquet[] = [];
  private futureSteps: Bouquet[] = [];

  constructor(private current: Bouquet) {}

  get present(): Bouquet {
    return this.current;
  }

  get past(): readonly Bouquet[] {
    return this.pastSteps;
  }

  get future(): readonly Bouquet[] {
    return this.futureSteps;
  }

  get canUndo(): boolean {
    return this.pastSteps.length > 0;
  }

  get canRedo(): boolean {
    return this.futureSteps.length > 0;
  }

  /** Records a change. Returns false, recording nothing, when `next` is the bouquet already shown. */
  commit(next: Bouquet): boolean {
    if (next === this.current) return false;
    this.pastSteps = [...this.pastSteps, this.current].slice(-HISTORY_LIMIT);
    this.current = next;
    this.futureSteps = [];
    return true;
  }

  undo(): boolean {
    if (this.pastSteps.length === 0) return false;
    this.futureSteps = [this.current, ...this.futureSteps];
    this.current = this.pastSteps[this.pastSteps.length - 1];
    this.pastSteps = this.pastSteps.slice(0, -1);
    return true;
  }

  redo(): boolean {
    if (this.futureSteps.length === 0) return false;
    this.pastSteps = [...this.pastSteps, this.current];
    this.current = this.futureSteps[0];
    this.futureSteps = this.futureSteps.slice(1);
    return true;
  }
}

export type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** Keeps the design in browser storage between visits. */
export class BouquetStore {
  constructor(private readonly editor: BouquetEditor, private readonly store: Store) {}

  /** Browser storage, or a stand-in that keeps nothing when the browser blocks it. */
  static browser(editor: BouquetEditor): BouquetStore {
    let store: Store;
    try {
      store = window.localStorage;
    } catch {
      store = { getItem: () => null, setItem: () => {} };
    }
    return new BouquetStore(editor, store);
  }

  save(b: Bouquet): void {
    try {
      this.store.setItem(STORAGE_KEY, JSON.stringify(b));
    } catch {
      // Storage is full or blocked. The designer still works; the design just isn't kept.
    }
  }

  load(): Bouquet | null {
    try {
      const raw = this.store.getItem(STORAGE_KEY);
      // A full bouquet saves to about 6 KB; anything far bigger was not written by the designer.
      return raw === null || raw.length > MAX_SAVED_LENGTH ? null : this.editor.validate(JSON.parse(raw));
    } catch {
      return null;
    }
  }
}
