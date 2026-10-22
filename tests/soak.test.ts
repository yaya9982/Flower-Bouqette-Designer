import { describe, expect, it } from 'vitest';
import { BouquetEditor, type Bouquet, type Stem } from '../src/bouquet';
import { Catalog, FLOWERS } from '../src/catalog';
import { measure, MIN_COVERED } from '../src/compact';
import { Presets } from '../src/presets';
import { priceBouquet } from '../src/pricing';
import { randomSession } from './soak/fuzz';
import { judge } from './soak/judge';
import { randomPrompt, seeded } from './soak/prompts';

const catalog = new Catalog(FLOWERS);
const editor = new BouquetEditor(catalog);
const start = () => editor.createDefault();
const total = (b: Bouquet) => priceBouquet(b, catalog).totalCents;
const dollars = (cents: number) => (cents / 100).toFixed(2);
const prompt = (extra: object = {}) => ({ text: 'Roses for my mum, $80', kind: 'normal' as const, budgetCents: 8000, ...extra });

/** A bouquet built the way the florist builds one: add stems, then tidy. */
function built(...spec: [string, number][]): Bouquet {
  let b = start();
  const first = b.stems[0].id;
  for (const s of b.stems.slice(1)) b = editor.remove(b, s.id);
  for (const [flower, n] of spec) for (let i = 0; i < n; i++) b = editor.add(b, flower);
  return editor.rearrange(editor.remove(b, first));
}

/** Every stem out on the rim and lifted: the "spike ball". */
function spiky(): Bouquet {
  const b = built(['rose', 12]);
  const stems: Stem[] = b.stems.map((s, i) => ({ ...s, angle: (i / b.stems.length) * Math.PI * 2, dist: 1, height: 1, tilt: 0.4 }));
  return { ...b, stems };
}

describe('randomPrompt', () => {
  it('is the same for the same seed and different across seeds', () => {
    expect(randomPrompt(seeded(7))).toEqual(randomPrompt(seeded(7)));
    const texts = new Set(Array.from({ length: 50 }, (_, i) => randomPrompt(seeded(i)).text));
    expect(texts.size).toBeGreaterThan(40);
  });

  it('says its budget in the text and names the flower and colour it will check', () => {
    for (let i = 0; i < 300; i++) {
      const p = randomPrompt(seeded(i));
      expect(p.text.length).toBeGreaterThan(5);
      if (p.budgetCents) expect(p.text).toContain(`$${p.budgetCents / 100}`);
      if (p.flower) expect(p.text.toLowerCase()).toContain(p.flower.say);
      if (p.colour) expect(p.text.toLowerCase()).toContain(p.colour);
    }
  });

  it('covers ordinary, vague and impossible requests', () => {
    const kinds = new Set(Array.from({ length: 300 }, (_, i) => randomPrompt(seeded(i)).kind));
    expect([...kinds].sort()).toEqual(['impossible', 'normal', 'vague']);
  });

  it('only asks for colours and flowers the shop has', () => {
    for (let i = 0; i < 300; i++) {
      const p = randomPrompt(seeded(i));
      if (p.colour) expect(catalog.families().some((f) => f.colour.id === p.colour)).toBe(true);
      if (p.flower) expect(FLOWERS.some((f) => f.name.toLowerCase().includes(p.flower!.name))).toBe(true);
    }
  });
});

describe('judge', () => {
  const ok = (b: Bouquet) => `Here's a lovely bouquet. The total is $${dollars(total(b))}.`;

  it('passes a compact bouquet within budget whose reply quotes the right total', () => {
    const b = built(['rose', 6], ['carnation', 4]);
    const r = judge({ prompt: prompt(), start: start(), final: b, reply: ok(b), catalog });
    expect(r.failures).toEqual([]);
    expect(r.metrics.totalCents).toBe(total(b));
  });

  it('fails a bouquet over budget', () => {
    const b = built(['rose', 20]);
    expect(total(b)).toBeGreaterThan(8000);
    expect(judge({ prompt: prompt(), start: start(), final: b, reply: ok(b), catalog }).failures.join()).toMatch(/over budget/);
  });

  it('does not fail a budget no bouquet could meet, but warns when the reply ignores it', () => {
    const b = built(['daisy', 1]);
    const r = judge({ prompt: prompt({ budgetCents: 500, kind: 'impossible' }), start: start(), final: b, reply: 'Here you go!', catalog });
    expect(r.failures).toEqual([]);
    expect(r.warnings.join()).toMatch(/budget/);
  });

  it('fails a reply that quotes a wrong total', () => {
    const b = built(['rose', 6]);
    const r = judge({ prompt: prompt(), start: start(), final: b, reply: 'Lovely! The total is $12.34.', catalog });
    expect(r.failures.join()).toMatch(/wrong total/);
  });

  it('fails a spread-out bouquet', () => {
    const b = spiky();
    const r = judge({ prompt: prompt({ budgetCents: undefined }), start: start(), final: b, reply: ok(b), catalog });
    expect(r.failures.join()).toMatch(/not compact/);
  });

  it('fails a florist that ran out of steps and gave up', () => {
    const b = built(['rose', 6]);
    const r = judge({ prompt: prompt({ budgetCents: undefined }), start: start(), final: b, reply: "Let's pause here. Tell me what you'd like to change.", catalog });
    expect(r.failures.join()).toMatch(/gave up/);
  });

  it('fails an empty reply and a design that was never changed', () => {
    const s = start();
    expect(judge({ prompt: prompt({ budgetCents: undefined }), start: s, final: s, reply: '  ', catalog }).failures.join()).toMatch(/empty reply/);
    expect(judge({ prompt: prompt({ budgetCents: undefined }), start: s, final: s, reply: ok(s), catalog }).failures.join()).toMatch(/did not change/);
  });

  it('only warns when the colour or flower asked for is barely there', () => {
    const b = built(['rose', 6]);
    const r = judge({ prompt: prompt({ colour: 'blue', flower: { say: 'peonies', name: 'peony' } }), start: start(), final: b, reply: ok(b), catalog });
    expect(r.failures).toEqual([]);
    expect(r.warnings.join()).toMatch(/blue/);
    expect(r.warnings.join()).toMatch(/peony/);
  });

  it('warns when the reply is longer than three sentences', () => {
    const b = built(['rose', 6]);
    const r = judge({ prompt: prompt(), start: start(), final: b, reply: `${ok(b)} One. Two. Three. Four.`, catalog });
    expect(r.warnings.join()).toMatch(/sentences/);
  });
});

describe('random florist sessions', () => {
  it('always end compact: a closed face of heads, nothing floating alone, nothing sunk into its neighbour', () => {
    const presets = new Presets(editor);
    const loose: string[] = [];
    for (let seed = 0; seed < 150; seed++) {
      const { bouquet, trace } = randomSession(seeded(seed), editor, presets, catalog);
      if (bouquet.stems.length < 4) continue;
      const m = measure(bouquet.stems, bouquet.shape, catalog, editor.arranger);
      if (m.covered < MIN_COVERED || m.isolated > 0 || m.closest < 0.5) {
        loose.push(`seed ${seed} ${bouquet.shape} x${bouquet.stems.length}: covered ${m.covered.toFixed(2)}, ${m.isolated} alone, closest ${m.closest.toFixed(2)} after ${trace.map((t) => t.split('(')[0]).join(' > ')}`);
      }
    }
    expect(loose).toEqual([]);
  }, 60_000);
});
