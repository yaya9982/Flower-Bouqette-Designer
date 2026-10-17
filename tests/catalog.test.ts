import { describe, expect, it } from 'vitest';
import { COLOUR_FAMILIES, FLOWERS } from '../src/catalog';
import { GENERATED_FLOWERS } from '../src/catalog.generated';

// The files on disk. Only their names are used; nothing is loaded.
const MODEL_FILES = new Set(Object.keys(import.meta.glob('../public/models/**/*.glb')).map((path) => path.replace('../public/models/', '')));

describe('catalogue', () => {
  it('gives every flower its own id and at least one colour', () => {
    expect(new Set(FLOWERS.map((f) => f.id)).size).toBe(FLOWERS.length);
    for (const flower of FLOWERS) expect(flower.colours.length, flower.id).toBeGreaterThan(0);
  });

  it('has a model file for every flower that names one', () => {
    expect(MODEL_FILES.size).toBeGreaterThan(0);
    for (const flower of FLOWERS) {
      if (flower.model) expect(MODEL_FILES.has(flower.model), flower.model).toBe(true);
    }
  });

  it('puts every downloaded flower in a colour of the wheel, with a credit', () => {
    const families = new Set(COLOUR_FAMILIES.map((c) => c.id));
    for (const row of GENERATED_FLOWERS) {
      expect(families.has(row.colour), `${row.id} is ${row.colour}`).toBe(true);
      expect(row.author && row.licence && row.url, row.id).toBeTruthy();
    }
  });
});
