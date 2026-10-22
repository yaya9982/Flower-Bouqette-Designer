import type { Bouquet } from '../../src/bouquet';
import type { Catalog } from '../../src/catalog';
import { FloristTools } from '../../src/florist-tools';
import { PRESETS, type Presets } from '../../src/presets';
import type { BouquetEditor } from '../../src/bouquet';
import { SHAPES } from '../../src/shapes';
import type { Rng } from './prompts';

const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];
const between = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

export interface Session {
  bouquet: Bouquet;
  /** The tool calls made, in order, as "name(args)". */
  trace: string[];
}

/**
 * A random run of the florist's tools on the real design: what a model might do, in an order it might do it.
 * Calls the model could not make (a flower not in the bouquet, a count outside its limits) are skipped.
 */
export function randomSession(rng: Rng, editor: BouquetEditor, presets: Presets, catalog: Catalog): Session {
  const tools = new FloristTools(editor, presets, catalog);
  let bouquet = editor.createDefault();
  const trace: string[] = [];
  const call = (name: string, input: object) => {
    const r = tools.run(bouquet, name, input);
    trace.push(`${name}(${JSON.stringify(input)})${r.isError ? ' !' : ''}`);
    bouquet = r.next;
  };

  if (rng() < 0.3) call('load_preset', { presetId: pick(rng, PRESETS).id });
  const steps = between(rng, 2, 9);
  for (let i = 0; i < steps; i++) {
    const inBouquet = [...new Set(bouquet.stems.map((s) => s.flower))];
    const roll = rng();
    if (roll < 0.4) {
      const type = pick(rng, catalog.flowers);
      call('add_flowers', { flowerId: type.id, colourId: pick(rng, type.colours).id, count: between(rng, 1, 12) });
    } else if (roll < 0.55) {
      call('remove_flowers', { flowerId: pick(rng, inBouquet), count: between(rng, 1, 8) });
    } else if (roll < 0.67) {
      call('swap_flowers', { fromFlowerId: pick(rng, inBouquet), toFlowerId: pick(rng, catalog.flowers).id, count: between(rng, 1, 8) });
    } else if (roll < 0.74) {
      const id = pick(rng, inBouquet);
      call('recolour_flowers', { flowerId: id, toColourId: pick(rng, catalog.find(id)!.colours).id, count: between(rng, 1, 8) });
    } else if (roll < 0.84) {
      call('set_shape', { shape: pick(rng, SHAPES) });
    } else if (roll < 0.9) {
      call('rearrange', {});
    } else if (roll < 0.94) {
      call('load_preset', { presetId: pick(rng, PRESETS).id });
    } else {
      call('set_wrap', { paper: pick(rng, ['none', 'kraft', 'tissue', 'matte']), paperColour: '', ribbonColour: '', bow: pick(rng, ['ribbon', 'star']), greenery: pick(rng, ['none', 'fern', 'eucalyptus', 'leafy']) });
    }
  }
  return { bouquet, trace };
}
