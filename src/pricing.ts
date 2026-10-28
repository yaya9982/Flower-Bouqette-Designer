import type { Bouquet, PaperId } from './bouquet';
import type { Catalog } from './catalog';

/** One row of an order: PayPal wants a name, a whole quantity and a unit price. */
export interface QuoteLine {
  name: string;
  quantity: number;
  unitCents: number;
}

export interface Quote {
  lines: QuoteLine[];
  totalCents: number;
}

/** Price of one stem by flower name, in US cents. Flowers not listed cost DEFAULT_STEM_CENTS. */
const STEM_CENTS: Record<string, number> = {
  Rose: 450, Peony: 900, Orchid: 800, Lily: 600, Hydrangea: 700,
  Sunflower: 500, Tulip: 350, Carnation: 300, Daisy: 250, Gypsophila: 200,
};
const DEFAULT_STEM_CENTS = 400;

/** Price of one stem of a flower, by its name. A specific name such as "Stargazer lily" or "Red rose" is priced as the kind it ends or starts with. */
export const stemCents = (flowerName: string): number => {
  if (Object.hasOwn(STEM_CENTS, flowerName)) return STEM_CENTS[flowerName];
  const words = flowerName.toLowerCase().split(/[\s-]+/);
  const kind = Object.keys(STEM_CENTS).find((k) => words.includes(k.toLowerCase()));
  return kind ? STEM_CENTS[kind] : DEFAULT_STEM_CENTS;
};

const PAPER_CENTS: Record<PaperId, number> = { none: 0, kraft: 300, tissue: 400, matte: 500 };
const PAPER_LABELS: Record<PaperId, string> = { none: 'No paper', kraft: 'Kraft paper', tissue: 'Tissue paper', matte: 'Matte paper' };
const ARRANGEMENT_CENTS = 800;

/** PayPal cuts item names after 127 characters. */
const MAX_NAME = 127;

/**
 * What a bouquet costs. The server runs this on the bouquet it was sent, so the price never comes from the
 * browser or the AI. Integer cents throughout, so the lines always add up to the total exactly.
 */
export function priceBouquet(b: Bouquet, catalog: Catalog): Quote {
  const byKey = new Map<string, QuoteLine>();
  for (const stem of b.stems) {
    const type = catalog.find(stem.flower);
    const name = type?.name ?? stem.flower;
    const colour = type?.colours.find((c) => c.id === stem.colour)?.name ?? stem.colour;
    const key = `${stem.flower}|${stem.colour}`;
    const line = byKey.get(key);
    if (line) line.quantity++;
    else byKey.set(key, { name: `${name} (${colour})`.slice(0, MAX_NAME), quantity: 1, unitCents: stemCents(name) });
  }
  const lines = [...byKey.values()];
  if (PAPER_CENTS[b.wrap.paper] > 0) lines.push({ name: `Wrap: ${PAPER_LABELS[b.wrap.paper]}`, quantity: 1, unitCents: PAPER_CENTS[b.wrap.paper] });
  lines.push({ name: 'Hand-tied arrangement', quantity: 1, unitCents: ARRANGEMENT_CENTS });
  return { lines, totalCents: lines.reduce((sum, l) => sum + l.unitCents * l.quantity, 0) };
}

/** "42.00" from 4200. */
export function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}
