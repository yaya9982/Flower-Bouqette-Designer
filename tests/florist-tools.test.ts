import { describe, expect, it } from 'vitest';
import { BouquetEditor, MAX_STEMS, type Bouquet } from '../src/bouquet';
import { Catalog, FLOWERS } from '../src/catalog';
import { FloristTools, TOOL_NAMES } from '../src/florist-tools';
import { Presets } from '../src/presets';
import { priceBouquet } from '../src/pricing';

const catalog = new Catalog(FLOWERS);
const editor = new BouquetEditor(catalog);
const tools = new FloristTools(editor, new Presets(editor), catalog);
const start = () => editor.createDefault();
const count = (b: Bouquet, flower: string, colour?: string) => b.stems.filter((s) => s.flower === flower && (!colour || s.colour === colour)).length;

describe('FloristTools', () => {
  it('add_flowers adds stems and the price goes up by their cost', () => {
    const b = start();
    const r = tools.run(b, 'add_flowers', { flowerId: 'rose', colourId: 'red', count: 3 });
    expect(r.isError).toBe(false);
    expect(count(r.next, 'rose', 'red')).toBe(count(b, 'rose', 'red') + 3);
    expect(r.result.totalCents).toBe(priceBouquet(b, catalog).totalCents + 1350);
  });

  it('add_flowers refuses a count outside 1 to 12 and leaves the design alone', () => {
    const b = start();
    for (const n of [0, 13, 500, 2.5]) {
      const r = tools.run(b, 'add_flowers', { flowerId: 'rose', colourId: 'red', count: n });
      expect(r.isError).toBe(true);
      expect(r.next).toBe(b);
    }
  });

  it('add_flowers refuses an unknown flower and a colour the flower does not come in', () => {
    const b = start();
    expect(tools.run(b, 'add_flowers', { flowerId: 'plastic-rose', colourId: '', count: 1 }).isError).toBe(true);
    const r = tools.run(b, 'add_flowers', { flowerId: 'sunflower', colourId: 'blue', count: 1 });
    expect(r.isError).toBe(true);
    expect(r.next).toBe(b);
  });

  it('add_flowers stops at the stem limit and says how many it added', () => {
    let b = start();
    while (b.stems.length < MAX_STEMS - 2) b = editor.add(b, 'daisy');
    const r = tools.run(b, 'add_flowers', { flowerId: 'rose', colourId: '', count: 5 });
    expect(r.isError).toBe(false);
    expect(r.result.added).toBe(2);
    expect(r.next.stems).toHaveLength(MAX_STEMS);
    expect(tools.run(r.next, 'add_flowers', { flowerId: 'rose', colourId: '', count: 1 }).isError).toBe(true);
  });

  it('remove_flowers never leaves the bouquet empty', () => {
    const b = start();
    const r = tools.run(b, 'remove_flowers', { flowerId: 'rose', count: 40 });
    expect(count(r.next, 'rose')).toBe(0);
    let only = r.next;
    for (const id of ['tulip', 'daisy']) only = tools.run(only, 'remove_flowers', { flowerId: id, count: 40 }).next;
    expect(only.stems.length).toBeGreaterThanOrEqual(1);
  });

  it('remove_flowers of a flower not in the bouquet is an error', () => {
    expect(tools.run(start(), 'remove_flowers', { flowerId: 'lily', count: 1 }).isError).toBe(true);
  });

  it('recolour_flowers changes only that many stems, and refuses a colour the flower lacks', () => {
    const b = start();
    const r = tools.run(b, 'recolour_flowers', { flowerId: 'rose', toColourId: 'white', count: 2 });
    expect(r.isError).toBe(false);
    expect(count(r.next, 'rose', 'white')).toBe(count(b, 'rose', 'white') + 2);
    const bad = tools.run(b, 'recolour_flowers', { flowerId: 'rose', toColourId: 'blue', count: 1 });
    expect(bad.isError).toBe(true);
    expect(bad.next).toBe(b);
  });

  it('swap_flowers turns stems of one flower into another', () => {
    const b = start();
    const r = tools.run(b, 'swap_flowers', { fromFlowerId: 'rose', toFlowerId: 'lily', count: 2 });
    expect(count(r.next, 'lily')).toBe(2);
    expect(count(r.next, 'rose')).toBe(count(b, 'rose') - 2);
  });

  it('set_wrap and set_shape change the wrap and shape; unknown values are errors', () => {
    const b = start();
    const r = tools.run(b, 'set_wrap', { paper: 'matte', paperColour: 'blush', ribbonColour: '' });
    expect(r.next.wrap).toMatchObject({ paper: 'matte', paperColour: 'blush', ribbonColour: b.wrap.ribbonColour });
    expect(tools.run(b, 'set_wrap', { paper: 'gold-foil', paperColour: '', ribbonColour: '' }).isError).toBe(true);
    expect(tools.run(b, 'set_shape', { shape: 'cascade' }).next.shape).toBe('cascade');
    expect(tools.run(b, 'set_shape', { shape: 'pyramid' }).isError).toBe(true);
  });

  it('load_preset builds a preset; an unknown one is an error', () => {
    const b = start();
    const r = tools.run(b, 'load_preset', { presetId: 'sunflower-daisy' });
    expect(r.isError).toBe(false);
    expect(count(r.next, 'sunflower')).toBeGreaterThan(0);
    expect(tools.run(b, 'load_preset', { presetId: 'nope' }).isError).toBe(true);
  });

  it('search_flowers finds flowers by name and colour, at most 15', () => {
    const r = tools.run(start(), 'search_flowers', { query: 'peony', colour: '' });
    const found = r.result.flowers as { name: string }[];
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((f) => f.name === 'Peony')).toBe(true);
    const red = tools.run(start(), 'search_flowers', { query: '', colour: 'red' }).result.flowers as { colours: string[] }[];
    expect(red.length).toBeLessThanOrEqual(15);
    expect(red.every((f) => f.colours.includes('red'))).toBe(true);
  });

  it('an unknown tool or a malformed input is an error, not a crash', () => {
    const b = start();
    expect(tools.run(b, 'pay_now', {}).isError).toBe(true);
    expect(tools.run(b, 'add_flowers', null).isError).toBe(true);
    expect(tools.run(b, 'add_flowers', { flowerId: 3, colourId: '', count: 1 }).isError).toBe(true);
  });

  it('every result carries the design summary and total', () => {
    const b = start();
    for (const name of TOOL_NAMES) {
      const r = tools.run(b, name, {});
      expect(r.result).toHaveProperty('summary');
      expect(r.result).toHaveProperty('totalCents');
    }
  });

  it('show_checkout changes nothing (no tool can pay)', () => {
    const b = start();
    expect(tools.run(b, 'show_checkout', {}).next).toBe(b);
  });
});
