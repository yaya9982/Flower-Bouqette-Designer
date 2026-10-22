import { BOWS, GREENERIES, PAPERS, SHAPES, type Bouquet, type BouquetEditor, type BowId, type GreeneryId, type PaperId, type ShapeId, type Wrap } from './bouquet';
import { PAPER_COLOURS, RIBBON_COLOURS, type Catalog, type FlowerType } from './catalog';
import { measure, MIN_FOR_OUTLINE } from './compact';
import type { Presets } from './presets';
import { priceBouquet, stemCents } from './pricing';

/**
 * What the AI florist can do to the design. The server tells Claude about these tools (server/florist.ts);
 * the browser runs them here, on the real design. None of them can take payment.
 */
export const TOOL_NAMES = [
  'get_design', 'search_flowers', 'list_presets', 'load_preset', 'add_flowers', 'remove_flowers',
  'recolour_flowers', 'swap_flowers', 'set_wrap', 'set_shape', 'rearrange', 'show_checkout',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolResult {
  /** The design after the tool ran; the same object when it changed nothing. */
  next: Bouquet;
  result: Record<string, unknown>;
  isError: boolean;
}

const MAX_ADD = 12;
/** Tools that change which flowers sit where, after which a gap-ridden design is arranged again. */
const RELAYOUT = new Set(['add_flowers', 'remove_flowers', 'swap_flowers', 'set_shape']);
/** A design whose heads cover less of its face than this is tidied. Above the 75% the tests demand, so a tidy always lands clear of it. */
const TIDY_BELOW = 0.8;
/** ...or whose closest two heads are nearer than this share of their combined size (the tests allow 50%). */
const TIDY_CLOSEST = 0.55;
const MAX_FOUND = 15;

/** A tool input that is not what the schema promised. */
class BadInput extends Error {}

function str(input: Record<string, unknown>, key: string): string {
  const v = input[key];
  if (typeof v !== 'string') throw new BadInput(`"${key}" must be a string.`);
  return v;
}

function int(input: Record<string, unknown>, key: string, min: number, max: number): number {
  const v = input[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new BadInput(`"${key}" must be a whole number from ${min} to ${max}.`);
  return v;
}

/** Applies `edit` up to `n` times, stopping when the editor refuses (returns the same bouquet). */
function repeat(b: Bouquet, n: number, edit: (b: Bouquet) => Bouquet): { next: Bouquet; done: number } {
  let next = b;
  let done = 0;
  for (; done < n; done++) {
    const after = edit(next);
    if (after === next) break;
    next = after;
  }
  return { next, done };
}

export class FloristTools {
  constructor(private readonly editor: BouquetEditor, private readonly presets: Presets, private readonly catalog: Catalog) {}

  run(b: Bouquet, name: string, input: unknown): ToolResult {
    try {
      if (typeof input !== 'object' || input === null) throw new BadInput('The input must be an object.');
      const called = this.call(b, name, input as Record<string, unknown>);
      const next = RELAYOUT.has(name) ? this.tidy(called.next) : called.next;
      return { next, result: { ...called.result, ...this.describe(next) }, isError: false };
    } catch (error) {
      if (!(error instanceof BadInput)) throw error;
      return { next: b, result: { error: error.message, ...this.describe(b) }, isError: true };
    }
  }

  /** The design as the model sees it: flowers by kind and colour, the shape, the wrap and the price. */
  private describe(b: Bouquet): Record<string, unknown> {
    const groups = new Map<string, { flowerId: string; name: string; colour: string; count: number }>();
    for (const s of b.stems) {
      const key = `${s.flower}|${s.colour}`;
      const g = groups.get(key);
      if (g) g.count++;
      else groups.set(key, { flowerId: s.flower, name: this.catalog.find(s.flower)?.name ?? s.flower, colour: s.colour, count: 1 });
    }
    return {
      summary: { flowers: [...groups.values()], stems: b.stems.length, shape: b.shape, wrap: b.wrap },
      totalCents: priceBouquet(b, this.catalog).totalCents,
    };
  }

  /**
   * Flowers added one at a time into the emptiest spot, or taken out, leave a design loose, like a ball of spikes.
   * When that happens the florist arranges it again, as it would by hand; a compact design, including one the customer
   * arranged themselves, is left exactly as it is.
   */
  private tidy(b: Bouquet): Bouquet {
    if (b.stems.length < MIN_FOR_OUTLINE) return b;
    const m = measure(b.stems, b.shape, this.catalog, this.editor.arranger);
    return m.covered >= TIDY_BELOW && m.isolated === 0 && m.closest >= TIDY_CLOSEST ? b : this.editor.rearrange(b);
  }

  private flower(id: string) {
    const type = this.catalog.find(id);
    if (!type) throw new BadInput(`There is no flower "${id}". Use search_flowers to find ids.`);
    return type;
  }

  private inBouquet(b: Bouquet, flowerId: string): void {
    if (!b.stems.some((s) => s.flower === flowerId)) throw new BadInput(`The bouquet has no "${flowerId}".`);
  }

  private call(b: Bouquet, name: string, input: Record<string, unknown>): { next: Bouquet; result: Record<string, unknown> } {
    const { editor } = this;
    switch (name as ToolName) {
      case 'get_design':
      case 'show_checkout':
        return { next: b, result: { ok: true } };

      case 'search_flowers': {
        const query = str(input, 'query').trim().toLowerCase();
        const colour = str(input, 'colour').trim().toLowerCase();
        const named = (f: FlowerType) => !query || f.name.toLowerCase().includes(query) || (f.title ?? '').toLowerCase().includes(query);
        const matches = this.catalog.flowers.filter((f) => (!colour || f.colours.some((c) => c.id === colour)) && named(f));
        const flowers = matches
          .slice(0, MAX_FOUND)
          .map((f) => ({ flowerId: f.id, name: f.name, title: f.title ?? '', colours: f.colours.map((c) => c.id), unitCents: stemCents(f.name) }));
        const result: Record<string, unknown> = { flowers, total: matches.length };
        // A search that finds nothing says what exists instead, so the model does not guess at more words.
        if (!matches.length) {
          const colours = [...new Set(this.catalog.flowers.filter(named).flatMap((f) => f.colours.map((c) => c.id)))];
          result.note = colours.length
            ? `No "${query}" in ${colour || 'any colour'}. "${query}" comes in: ${colours.join(', ')}.`
            : `No flower matches "${query}". Search with an empty query and a colour to browse.`;
        }
        return { next: b, result };
      }

      case 'list_presets':
        return { next: b, result: { presets: this.presets.all.map((p) => ({ presetId: p.id, name: p.name, occasion: p.occasion })) } };

      case 'load_preset': {
        const id = str(input, 'presetId');
        const preset = this.presets.find(id);
        const next = preset && this.presets.build(preset);
        if (!next) throw new BadInput(`There is no preset "${id}". Use list_presets.`);
        return { next, result: { loaded: preset.name } };
      }

      case 'add_flowers': {
        const type = this.flower(str(input, 'flowerId'));
        const colourId = str(input, 'colourId');
        const n = int(input, 'count', 1, MAX_ADD);
        if (colourId && !type.colours.some((c) => c.id === colourId)) {
          throw new BadInput(`${type.name} does not come in "${colourId}". It comes in: ${type.colours.map((c) => c.id).join(', ')}.`);
        }
        const { next, done } = repeat(b, n, (x) => editor.add(x, type.id, colourId || undefined));
        if (done === 0) throw new BadInput('The bouquet is full (40 flowers). Remove some first.');
        return { next, result: { added: done } };
      }

      case 'remove_flowers': {
        const flowerId = str(input, 'flowerId');
        const n = int(input, 'count', 1, 40);
        this.inBouquet(b, flowerId);
        const { next, done } = repeat(b, n, (x) => editor.removeOneOfType(x, flowerId));
        if (done === 0) throw new BadInput('A bouquet needs at least one flower.');
        return { next, result: { removed: done } };
      }

      case 'recolour_flowers': {
        const type = this.flower(str(input, 'flowerId'));
        const toColourId = str(input, 'toColourId');
        const n = int(input, 'count', 1, 40);
        this.inBouquet(b, type.id);
        if (!type.colours.some((c) => c.id === toColourId)) {
          throw new BadInput(`${type.name} does not come in "${toColourId}". It comes in: ${type.colours.map((c) => c.id).join(', ')}.`);
        }
        const targets = b.stems.filter((s) => s.flower === type.id && s.colour !== toColourId).slice(0, n);
        const next = targets.reduce((x, s) => editor.recolour(x, s.id, toColourId), b);
        return { next, result: { recoloured: targets.length } };
      }

      case 'swap_flowers': {
        const fromId = str(input, 'fromFlowerId');
        const to = this.flower(str(input, 'toFlowerId'));
        const n = int(input, 'count', 1, 40);
        this.inBouquet(b, fromId);
        const targets = b.stems.filter((s) => s.flower === fromId).slice(0, n);
        const next = targets.reduce((x, s) => editor.swap(x, s.id, to.id), b);
        return { next, result: { swapped: targets.length } };
      }

      case 'set_wrap': {
        const paper = str(input, 'paper');
        const paperColour = str(input, 'paperColour');
        const ribbonColour = str(input, 'ribbonColour');
        if (paper && !PAPERS.includes(paper as PaperId)) throw new BadInput(`Paper must be one of: ${PAPERS.join(', ')}.`);
        if (paperColour && !PAPER_COLOURS.some((c) => c.id === paperColour)) throw new BadInput(`Paper colour must be one of: ${PAPER_COLOURS.map((c) => c.id).join(', ')}.`);
        if (ribbonColour && !RIBBON_COLOURS.some((c) => c.id === ribbonColour)) throw new BadInput(`Ribbon colour must be one of: ${RIBBON_COLOURS.map((c) => c.id).join(', ')}.`);
        // Optional, so a florist still running with the older tool list (without them) keeps working.
        const bow = input.bow === undefined ? '' : str(input, 'bow');
        const greenery = input.greenery === undefined ? '' : str(input, 'greenery');
        if (bow && !BOWS.includes(bow as BowId)) throw new BadInput(`Bow must be one of: ${BOWS.join(', ')}.`);
        if (greenery && !GREENERIES.includes(greenery as GreeneryId)) throw new BadInput(`Greenery must be one of: ${GREENERIES.join(', ')}.`);
        const patch: Partial<Wrap> = {};
        if (paper) patch.paper = paper as PaperId;
        if (paperColour) patch.paperColour = paperColour;
        if (ribbonColour) patch.ribbonColour = ribbonColour;
        if (bow) patch.bow = bow as BowId;
        if (greenery) patch.greenery = greenery as GreeneryId;
        return { next: editor.setWrap(b, patch), result: { ok: true } };
      }

      case 'set_shape': {
        const shape = str(input, 'shape');
        if (!SHAPES.includes(shape as ShapeId)) throw new BadInput(`Shape must be one of: ${SHAPES.join(', ')}.`);
        return { next: editor.setShape(b, shape as ShapeId), result: { ok: true } };
      }

      case 'rearrange':
        return { next: editor.rearrange(b), result: { ok: true } };

      default:
        throw new BadInput(`There is no tool "${name}".`);
    }
  }
}
