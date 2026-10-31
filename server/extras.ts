/**
 * Gift extras from Channel3: real products a customer buys at the retailer. Used by the shop's server and the Cloudflare
 * Worker, so nothing here needs Node. Extras never join the PayPal order, and nothing from Channel3 is stored.
 */

/** A search must be for one of these, so the key cannot be used as a general shopping search. */
export const EXTRA_KINDS = ['vase', 'chocolates', 'greeting card', 'potted plant'] as const;
export type ExtraKind = (typeof EXTRA_KINDS)[number];

export interface ExtrasRequest { kind: ExtraKind; details: string; maxDollars: number }

export interface Extra {
  id: string;
  title: string;
  /** Empty when Channel3 has no picture for it. */
  image: string;
  imageAlt: string;
  priceCents: number;
  currency: string;
  retailer: string;
  url: string;
}

const SEARCH_URL = 'https://api.trychannel3.com/v1/search';
const IMAGE_HOST = 'cdn.trychannel3.com';
const MAX_DETAILS = 80;
const MAX_DOLLARS = 500;
const MAX_TITLE = 120;
const MAX_RESULTS = 3;
/** More than is shown, because some come back without an offer that can be used. */
const SEARCH_LIMIT = 8;
const TIMEOUT_MS = 10_000;

/** Checks a request from the browser. Returns the clean request, or a reason it was refused. */
export function parseExtrasRequest(body: unknown): ExtrasRequest | string {
  if (typeof body !== 'object' || body === null) return 'Expected a JSON object.';
  const { kind, details, maxDollars } = body as Record<string, unknown>;
  if (!EXTRA_KINDS.includes(kind as ExtraKind)) return `Kind must be one of: ${EXTRA_KINDS.join(', ')}.`;
  if (typeof details !== 'string' || details.length > MAX_DETAILS) return `Details can be at most ${MAX_DETAILS} characters.`;
  if (typeof maxDollars !== 'number' || !Number.isInteger(maxDollars) || maxDollars < 0 || maxDollars > MAX_DOLLARS) {
    return `maxDollars must be a whole number from 0 to ${MAX_DOLLARS}.`;
  }
  return { kind: kind as ExtraKind, details: details.trim(), maxDollars };
}

function isHttps(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Merchants' own image hosts are blocked by the page's Content-Security-Policy, so only Channel3's CDN is used. */
function isHosted(url: unknown): url is string {
  return isHttps(url) && new URL(url).hostname === IMAGE_HOST;
}

/** The docs write an offer's price as { amount, currency }; live results also use { price, currency }. */
function priceOf(offer: any): { cents: number; currency: string } | null {
  const value = offer?.price?.amount ?? offer?.price?.price;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return { cents: Math.round(value * 100), currency: String(offer.price.currency ?? 'USD') };
}

/** The cheapest offer that can really be bought, or null. */
function bestOffer(offers: unknown): { url: string; retailer: string; cents: number; currency: string } | null {
  let best: { url: string; retailer: string; cents: number; currency: string } | null = null;
  for (const offer of Array.isArray(offers) ? offers as any[] : []) {
    const price = priceOf(offer);
    if (!price || !isHttps(offer?.url) || (offer.availability !== 'InStock' && offer.availability !== 'LimitedAvailability')) continue;
    if (!best || price.cents < best.cents) best = { url: offer.url, retailer: String(offer.domain ?? 'the retailer'), ...price };
  }
  return best;
}

/** The products in a Channel3 search result that can be shown and bought. */
export function extrasFromSearch(json: any): Extra[] {
  const extras: Extra[] = [];
  for (const product of Array.isArray(json?.products) ? json.products as any[] : []) {
    const offer = bestOffer(product?.offers);
    if (!offer || typeof product?.title !== 'string' || typeof product?.id !== 'string') continue;
    const images = (Array.isArray(product.images) ? product.images as any[] : []).filter((i) => isHosted(i?.cleaned_url ?? i?.url));
    const image = images.find((i) => i.is_main_image) ?? images[0];
    extras.push({
      id: product.id, title: product.title.slice(0, MAX_TITLE), image: image?.cleaned_url ?? image?.url ?? '', imageAlt: typeof image?.alt_text === 'string' ? image.alt_text : product.title,
      priceCents: offer.cents, currency: offer.currency, retailer: offer.retailer, url: offer.url,
    });
    if (extras.length === MAX_RESULTS) break;
  }
  return extras;
}

/** One live search. Throws when Channel3 cannot answer. */
export async function searchExtras(request: ExtrasRequest, apiKey: string, fetchFn: typeof fetch = fetch): Promise<Extra[]> {
  const body = {
    query: `${request.details} ${request.kind}`.trim(),
    limit: SEARCH_LIMIT,
    filters: { availability: ['InStock', 'LimitedAvailability'], ...(request.maxDollars ? { price: { max_price: request.maxDollars } } : {}) },
  };
  const res = await fetchFn(SEARCH_URL, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey.trim() }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Channel3 answered ${res.status}`);
  return extrasFromSearch(await res.json());
}
