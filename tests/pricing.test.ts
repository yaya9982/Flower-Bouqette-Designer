import { describe, expect, it } from 'vitest';
import { BouquetEditor, type Bouquet } from '../src/bouquet';
import { Catalog, FLOWERS } from '../src/catalog';
import { formatCents, priceBouquet } from '../src/pricing';

const catalog = new Catalog(FLOWERS);
const editor = new BouquetEditor(catalog);

function withStems(b: Bouquet, stems: [string, string][]): Bouquet {
  let next: Bouquet = { ...b, stems: b.stems.slice(0, 1) };
  for (const [flower, colour] of stems) next = editor.add(next, flower, colour);
  return { ...next, stems: next.stems.slice(1) };
}

describe('priceBouquet', () => {
  it('adds up to the sum of its lines and includes the arrangement fee', () => {
    const quote = priceBouquet(editor.createDefault(), catalog);
    const sum = quote.lines.reduce((s, l) => s + l.unitCents * l.quantity, 0);
    expect(quote.totalCents).toBe(sum);
    expect(quote.lines).toContainEqual({ name: 'Hand-tied arrangement', quantity: 1, unitCents: 800 });
  });

  it('groups stems by flower and colour', () => {
    const b = withStems(editor.createDefault(), [['rose', 'red'], ['rose', 'red'], ['rose', 'red'], ['rose', 'white'], ['rose', 'white']]);
    const roses = priceBouquet(b, catalog).lines.filter((l) => l.name.startsWith('Rose'));
    expect(roses).toEqual([
      { name: 'Rose (Red)', quantity: 3, unitCents: 450 },
      { name: 'Rose (White)', quantity: 2, unitCents: 450 },
    ]);
  });

  it('charges for paper and leaves it out when there is none', () => {
    const b = editor.createDefault();
    expect(priceBouquet(b, catalog).lines).toContainEqual({ name: 'Wrap: Kraft paper', quantity: 1, unitCents: 300 });
    const bare = priceBouquet({ ...b, wrap: { ...b.wrap, paper: 'none' } }, catalog);
    expect(bare.lines.some((l) => l.name.startsWith('Wrap'))).toBe(false);
  });

  it('prices a downloaded flower by its name', () => {
    const peony = FLOWERS.find((f) => f.name === 'Peony' && f.model?.startsWith('sf/'))!;
    const b = withStems(editor.createDefault(), [[peony.id, peony.colours[0].id]]);
    expect(priceBouquet(b, catalog).lines[0]).toMatchObject({ quantity: 1, unitCents: 900 });
  });

  it('uses the default price for a flower with no listed price', () => {
    const odd = FLOWERS.find((f) => f.name === 'Bluebell')!;
    const b = withStems(editor.createDefault(), [[odd.id, odd.colours[0].id]]);
    expect(priceBouquet(b, catalog).lines[0].unitCents).toBe(400);
  });
});

describe('formatCents', () => {
  it('writes two decimals', () => {
    expect(formatCents(4200)).toBe('42.00');
    expect(formatCents(5)).toBe('0.05');
  });
});
