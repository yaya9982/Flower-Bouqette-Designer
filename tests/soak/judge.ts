import { Arranger } from '../../src/arrange';
import { BouquetEditor, type Bouquet } from '../../src/bouquet';
import type { Catalog } from '../../src/catalog';
import { priceBouquet } from '../../src/pricing';
import { measure, MIN_COVERED, MIN_FOR_OUTLINE } from '../../src/compact';
import type { Prompt } from './prompts';

export interface Judgement {
  /** Things a customer would call wrong: the run fails. */
  failures: string[];
  /** Things worth a look but a matter of taste or the model's wording: the run still passes. */
  warnings: string[];
  metrics: { totalCents: number; stems: number; shape: string; covered: number; closest: number; isolated: number };
}

export interface Run {
  prompt: Prompt;
  /** The design the customer started from. */
  start: Bouquet;
  /** The design when the florist finished. */
  final: Bouquet;
  /** The florist's last message. */
  reply: string;
  catalog: Catalog;
}

const GAVE_UP = /let's pause here|lost my thread|can't help with that one/i;
/** Words a reply uses when it tells the customer the request cannot be met as asked. */
const ADMITS = /sorry|unfortunately|minimum|can't|cannot|not possible|least|lowest|cheapest|too (low|small)|stretch|over/i;

export function judge({ prompt, start, final, reply, catalog }: Run): Judgement {
  const failures: string[] = [];
  const warnings: string[] = [];
  const editor = new BouquetEditor(catalog);
  const totalCents = priceBouquet(final, catalog).totalCents;
  const message = reply.trim();

  if (!message) failures.push('empty reply');
  // What the chat says when the model used up its steps (src/florist-gemini.ts, server/florist.ts) without finishing.
  if (GAVE_UP.test(message)) failures.push('the florist gave up before finishing (ran out of steps)');
  if (!editor.validate(JSON.parse(JSON.stringify(final)))) failures.push('invalid bouquet');
  if (prompt.kind !== 'impossible' && JSON.stringify(final) === JSON.stringify(start)) failures.push('the florist did not change the design');

  if (prompt.budgetCents !== undefined) {
    const cheapest = priceBouquet({ ...start, wrap: { ...start.wrap, paper: 'none' }, stems: [{ ...start.stems[0], flower: 'daisy' }] }, catalog).totalCents;
    if (totalCents > prompt.budgetCents) {
      if (prompt.budgetCents >= cheapest) failures.push(`over budget: $${(totalCents / 100).toFixed(2)} for a $${prompt.budgetCents / 100} budget`);
      else if (!ADMITS.test(message)) warnings.push('budget is below the cheapest possible bouquet and the reply does not say so');
    } else if (prompt.budgetCents >= 3000 && totalCents < prompt.budgetCents * 0.35) {
      warnings.push(`uses only ${Math.round((100 * totalCents) / prompt.budgetCents)}% of the budget`);
    }
  }

  const quoted = message.match(/total[^$\d]{0,30}\$\s?(\d[\d,]*(?:\.\d{1,2})?)/i);
  if (quoted) {
    if (Math.abs(Number(quoted[1].replace(/,/g, '')) - totalCents / 100) > 0.011) failures.push(`wrong total quoted: $${quoted[1]} but the bouquet costs $${(totalCents / 100).toFixed(2)}`);
  } else if (prompt.budgetCents !== undefined && message) {
    warnings.push('the reply does not state the total');
  }

  let m = { covered: 1, closest: Infinity, isolated: 0 };
  if (final.stems.length >= MIN_FOR_OUTLINE) {
    m = measure(final.stems, final.shape, catalog, new Arranger(catalog));
    if (m.covered < MIN_COVERED) failures.push(`not compact: heads cover ${Math.round(m.covered * 100)}% of the bouquet's face (need ${MIN_COVERED * 100}%)`);
    if (m.isolated > 0) failures.push(`not compact: ${m.isolated} flower${m.isolated > 1 ? 's' : ''} float alone`);
    if (m.closest < 0.5) failures.push(`flowers sunk into each other (closest pair ${m.closest.toFixed(2)} of their combined size)`);
  }

  if (prompt.colour) {
    const share = final.stems.filter((s) => s.colour === prompt.colour).length / final.stems.length;
    if (share < 0.4) warnings.push(`only ${Math.round(share * 100)}% of the flowers are ${prompt.colour}`);
  }
  if (prompt.flower && !final.stems.some((s) => catalog.find(s.flower)?.name.toLowerCase().includes(prompt.flower!.name))) {
    warnings.push(`no ${prompt.flower.name} in the bouquet`);
  }
  if (prompt.shape && final.shape !== prompt.shape) warnings.push(`asked for a ${prompt.shape} shape, got ${final.shape}`);
  if (prompt.paper && final.wrap.paper !== prompt.paper) warnings.push(`asked for ${prompt.paper} paper, got ${final.wrap.paper}`);
  if (prompt.bow && final.wrap.bow !== prompt.bow) warnings.push(`asked for a ${prompt.bow} bow, got ${final.wrap.bow}`);
  if (prompt.greenery && final.wrap.greenery !== prompt.greenery) warnings.push(`asked for ${prompt.greenery} greenery, got ${final.wrap.greenery}`);

  const sentences = message.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim()).length;
  if (sentences > 3) warnings.push(`the reply is ${sentences} sentences (one to three were asked for)`);

  return { failures, warnings, metrics: { totalCents, stems: final.stems.length, shape: final.shape, covered: m.covered, closest: m.closest, isolated: m.isolated } };
}
