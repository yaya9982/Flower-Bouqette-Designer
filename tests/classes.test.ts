import { describe, expect, it } from 'vitest';
import { BouquetEditor, type ShapeId } from '../src/bouquet';
import { Catalog, COLOUR_FAMILIES, FLOWERS } from '../src/catalog';
import { Presets, PRESETS } from '../src/presets';
import { SHAPE_OF, SHAPES } from '../src/shapes';

const catalog = new Catalog(FLOWERS);
const editor = new BouquetEditor(catalog);

describe('shape classes', () => {
  it('has one class per shape id, in the original order', () => {
    expect(SHAPES).toEqual(['round', 'cascade', 'loose', 'onesided']);
    for (const id of SHAPES) expect(SHAPE_OF[id].id).toBe(id);
  });

  it('only the cascade leans, and its paper is sized as a round dome', () => {
    expect(SHAPES.filter((id) => SHAPE_OF[id].lean !== 0)).toEqual(['cascade']);
    expect(SHAPE_OF.cascade.paperRimShape).toBe(SHAPE_OF.round);
    expect(SHAPES.filter((id) => SHAPE_OF[id].paperOpening)).toEqual(['cascade', 'onesided']);
  });

  it('an unknown shape id changes nothing', () => {
    const b = editor.createDefault();
    expect(editor.setShape(b, 'oval' as ShapeId)).toBe(b);
  });
});

describe('catalog', () => {
  it('finds flowers by id and falls back to a default head size', () => {
    expect(catalog.find('rose')?.name).toBe('Rose');
    expect(catalog.find('nope')).toBeUndefined();
    expect(catalog.headDiameter('nope')).toBe(0.07);
  });

  it('lists only colour families some flower comes in, in wheel order', () => {
    const families = catalog.families();
    expect(families.every((f) => f.count > 0)).toBe(true);
    const order = COLOUR_FAMILIES.map((c) => c.id);
    expect(families.map((f) => order.indexOf(f.colour.id))).toEqual([...families.map((f) => order.indexOf(f.colour.id))].sort((a, b) => a - b));
  });
});

describe('presets', () => {
  it('featured and the rest together are every preset, in order', () => {
    const presets = new Presets(editor);
    expect([...presets.featured, ...presets.others]).toEqual(PRESETS);
    expect(presets.find(PRESETS[4].id)).toBe(PRESETS[4]);
    expect(presets.find('nope')).toBeUndefined();
  });
});
