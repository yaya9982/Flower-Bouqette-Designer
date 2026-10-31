import type { Extra } from '../server/extras';
import { formatCents } from './pricing';

/** Set at build time for the static site: the same Worker that runs the florist on Gemini. */
const WORKER_URL: string | undefined = import.meta.env.VITE_FLORIST_URL;

/** Asks the Worker or the shop's server for gift extras. The key stays there. */
export async function findExtras(input: unknown): Promise<Extra[]> {
  const url = WORKER_URL ? `${WORKER_URL.replace(/\/$/, '')}/extras` : '/api/extras';
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `The shop answered ${res.status}.`);
  return json.extras as Extra[];
}

function text<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, content: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = content;
  return node;
}

/** The "Finish the gift" cards in the chat. Bought at the retailer: they are not part of the bouquet or its total. */
export function extrasCards(extras: readonly Extra[]): HTMLElement {
  const shelf = document.createElement('section');
  shelf.className = 'extras';
  shelf.setAttribute('aria-label', 'Finish the gift');
  shelf.append(text('h3', 'extras-title', 'Finish the gift'));
  const row = document.createElement('div');
  row.className = 'extras-row';
  for (const extra of extras) {
    const card = document.createElement('article');
    card.className = 'extra';
    if (extra.image) {
      const img = document.createElement('img');
      img.src = extra.image;
      img.alt = extra.imageAlt;
      img.loading = 'lazy';
      // A picture that cannot load must not leave its long description in the card.
      img.addEventListener('error', () => img.remove());
      card.append(img);
    }
    const price = extra.currency === 'USD' ? `$${formatCents(extra.priceCents)}` : `${formatCents(extra.priceCents)} ${extra.currency}`;
    const link = text('a', 'extra-buy', `Buy at ${extra.retailer}`);
    link.href = extra.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    card.append(text('p', 'extra-name', extra.title), text('p', 'extra-price', price), link);
    row.append(card);
  }
  shelf.append(row, text('p', 'extras-note', 'Sold by the retailer, separately from your bouquet.'));
  return shelf;
}
