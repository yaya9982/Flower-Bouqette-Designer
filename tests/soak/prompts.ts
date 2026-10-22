import type { BowId, GreeneryId, PaperId, ShapeId } from '../../src/bouquet';

export type Rng = () => number;

/** A small deterministic random number generator (mulberry32), so a failing prompt can be replayed from its seed. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What the customer asked for, and the parts of it the judge can check. */
export interface Prompt {
  text: string;
  /** normal: build it. vague: no detail, so the florist chooses. impossible: cannot be met as asked, so the florist must say so. */
  kind: 'normal' | 'vague' | 'impossible';
  budgetCents?: number;
  /** A colour id the customer named. */
  colour?: string;
  /** The word the customer used and the shop's flower name it stands for. */
  flower?: { say: string; name: string };
  shape?: ShapeId;
  paper?: PaperId;
  bow?: BowId;
  greenery?: GreeneryId;
}

const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];
const chance = (rng: Rng, p: number) => rng() < p;

const WHO = ['my mum', 'my wife', 'my grandmother', 'a coworker', 'my best friend', 'my teacher', 'my girlfriend', 'my sister', 'a neighbour', 'my boss'];
const OCCASIONS = ['birthday', 'anniversary', 'graduation', 'new baby', 'thank-you', 'housewarming', 'wedding', 'get-well'];
const COLOURS = ['red', 'pink', 'white', 'yellow', 'orange', 'purple', 'blue', 'cream'];
const FLOWER_WORDS = [
  { say: 'peonies', name: 'peony' }, { say: 'roses', name: 'rose' }, { say: 'tulips', name: 'tulip' }, { say: 'sunflowers', name: 'sunflower' },
  { say: 'lilies', name: 'lily' }, { say: 'daisies', name: 'daisy' }, { say: 'orchids', name: 'orchid' }, { say: 'hydrangeas', name: 'hydrangea' },
  { say: 'carnations', name: 'carnation' },
];
const BUDGETS = [25, 35, 50, 60, 75, 80, 100, 120, 150, 200];
const STYLES: [string, ShapeId][] = [
  ['a classic round shape', 'round'], ['a cascading look', 'cascade'], ['a loose hand-tied style', 'loose'], ['a one-sided front-facing arrangement', 'onesided'],
];
const PAPERS: [string, PaperId][] = [['kraft paper', 'kraft'], ['tissue paper', 'tissue'], ['no wrapping paper', 'none'], ['matte paper', 'matte']];
const EXTRAS: [string, { bow?: BowId; greenery?: GreeneryId }][] = [
  ['a star bow', { bow: 'star' }], ['ferns', { greenery: 'fern' }], ['eucalyptus leaves', { greenery: 'eucalyptus' }], ['some leafy greenery', { greenery: 'leafy' }],
];
const VAGUE = [
  'Surprise me', 'Something pretty for my desk', 'I need flowers but I have no idea what', 'Make it look expensive', 'Whatever is in season',
  'Something cheerful', 'I want to say sorry',
];

export function randomPrompt(rng: Rng): Prompt {
  const roll = rng();
  if (roll < 0.08) return { text: pick(rng, VAGUE), kind: 'vague' };
  if (roll < 0.16) {
    const flower = pick(rng, FLOWER_WORDS);
    return pick(rng, [
      (): Prompt => ({ text: 'A big bouquet for $5', kind: 'impossible', budgetCents: 500 }),
      (): Prompt => ({ text: `100 ${flower.say} please`, kind: 'impossible', flower }),
      (): Prompt => ({ text: 'A bouquet of cactus flowers', kind: 'impossible' }),
    ])();
  }

  const who = pick(rng, WHO);
  const prompt: Prompt = { text: '', kind: 'normal' };
  const parts = [pick(rng, [
    `A bouquet for ${who}'s ${pick(rng, OCCASIONS)}`,
    `I need flowers for ${who}, it's a ${pick(rng, OCCASIONS)}`,
    `Flowers for ${who} for a ${pick(rng, OCCASIONS)}`,
  ])];
  if (chance(rng, 0.6)) {
    prompt.colour = pick(rng, COLOURS);
    parts.push(pick(rng, [`mostly ${prompt.colour}`, `in ${prompt.colour} tones`, `${prompt.colour} please`]));
  }
  if (chance(rng, 0.45)) {
    prompt.flower = pick(rng, FLOWER_WORDS);
    parts.push(pick(rng, [`with ${prompt.flower.say}`, `she loves ${prompt.flower.say}`, `lots of ${prompt.flower.say}`]));
  }
  if (chance(rng, 0.7)) {
    const dollars = pick(rng, BUDGETS);
    prompt.budgetCents = dollars * 100;
    parts.push(pick(rng, [`about $${dollars}`, `under $${dollars}`, `my budget is $${dollars}`, `max $${dollars}`]));
  }
  if (chance(rng, 0.25)) {
    const [say, shape] = pick(rng, STYLES);
    prompt.shape = shape;
    parts.push(`I'd like ${say}`);
  }
  if (chance(rng, 0.2)) {
    const [say, paper] = pick(rng, PAPERS);
    prompt.paper = paper;
    parts.push(`wrapped in ${say}`);
  }
  if (chance(rng, 0.15)) {
    const [say, extra] = pick(rng, EXTRAS);
    Object.assign(prompt, extra);
    parts.push(`with ${say}`);
  }
  prompt.text = `${parts[0]}${parts.length > 1 ? ', ' : ''}${parts.slice(1).join(', ')}`;
  return prompt;
}
