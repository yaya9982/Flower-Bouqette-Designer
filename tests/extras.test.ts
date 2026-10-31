import { describe, expect, it } from 'vitest';
import { extrasFromSearch, parseExtrasRequest, searchExtras, type ExtrasRequest } from '../server/extras';
import { extrasHandler } from '../server/routes';
import { handle } from '../worker/index';

const offer = (patch: object = {}) => ({ url: 'https://buy.trychannel3.com/a', domain: 'kohls.com', price: { price: 32.99, currency: 'USD' }, availability: 'InStock', ...patch });
const product = (patch: object = {}) => ({
  id: 'p1', title: 'Glass Vase',
  images: [{ url: 'https://cdn.trychannel3.com/x', cleaned_url: 'https://cdn.trychannel3.com/clean', is_main_image: true, alt_text: 'A vase' }],
  offers: [offer()], ...patch,
});
const request: ExtrasRequest = { kind: 'vase', details: 'clear glass', maxDollars: 40 };

describe('parseExtrasRequest', () => {
  it('keeps a good request', () => {
    expect(parseExtrasRequest({ kind: 'vase', details: ' clear ', maxDollars: 0, extra: 1 })).toEqual({ kind: 'vase', details: 'clear', maxDollars: 0 });
  });

  it.each([
    [null], ['x'], [{}],
    [{ kind: 'laptop', details: '', maxDollars: 0 }],
    [{ kind: 'vase', details: 'x'.repeat(81), maxDollars: 0 }],
    [{ kind: 'vase', details: 3, maxDollars: 0 }],
    [{ kind: 'vase', details: '', maxDollars: -1 }],
    [{ kind: 'vase', details: '', maxDollars: 501 }],
    [{ kind: 'vase', details: '', maxDollars: 1.5 }],
  ])('refuses %j', (body) => {
    expect(typeof parseExtrasRequest(body)).toBe('string');
  });
});

describe('extrasFromSearch', () => {
  it('reads both price shapes and takes the cleaned main image', () => {
    const [a, b] = extrasFromSearch({ products: [product(), product({ id: 'p2', offers: [offer({ price: { amount: 110, currency: 'USD' } })] })] });
    expect(a).toEqual({ id: 'p1', title: 'Glass Vase', image: 'https://cdn.trychannel3.com/clean', imageAlt: 'A vase', priceCents: 3299, currency: 'USD', retailer: 'kohls.com', url: 'https://buy.trychannel3.com/a' });
    expect(b.priceCents).toBe(11000);
  });

  it('picks the cheapest offer that can be bought', () => {
    const offers = [offer({ price: { price: 5, currency: 'USD' }, availability: 'OutOfStock' }), offer({ price: { price: 9, currency: 'USD' }, domain: 'a.com' }), offer({ price: { price: 7, currency: 'USD' }, domain: 'b.com' })];
    expect(extrasFromSearch({ products: [product({ offers })] })[0]).toMatchObject({ priceCents: 700, retailer: 'b.com' });
  });

  it('drops products with no usable offer and keeps those with no picture', () => {
    const products = [
      product({ id: 'bad-link', offers: [offer({ url: 'javascript:alert(1)' })] }),
      product({ id: 'http', offers: [offer({ url: 'http://shop.example/a' })] }),
      product({ id: 'free', offers: [offer({ price: { price: 0, currency: 'USD' } })] }),
      product({ id: 'none', offers: [] }),
      product({ id: 'bare', images: [] }),
    ];
    const extras = extrasFromSearch({ products });
    expect(extras.map((e) => e.id)).toEqual(['bare']);
    expect(extras[0].image).toBe('');
  });

  it('only uses pictures from the host the page allows', () => {
    const shop = { url: 'https://shop.example/a.jpg', is_main_image: true };
    const cdn = { url: 'https://cdn.trychannel3.com/b' };
    expect(extrasFromSearch({ products: [product({ images: [shop, cdn] })] })[0].image).toBe('https://cdn.trychannel3.com/b');
    expect(extrasFromSearch({ products: [product({ images: [shop] })] })[0].image).toBe('');
  });

  it('shows three at most and survives nonsense', () => {
    expect(extrasFromSearch({ products: Array.from({ length: 8 }, () => product()) })).toHaveLength(3);
    for (const junk of [null, {}, { products: 'x' }, { products: [null, 3, {}] }]) expect(extrasFromSearch(junk)).toEqual([]);
  });
});

describe('searchExtras', () => {
  it('sends the key and only asks for what is in stock and in budget', async () => {
    let sent: { url: string; init: RequestInit } | undefined;
    const fetchFn = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return new Response(JSON.stringify({ products: [product()] }));
    }) as unknown as typeof fetch;
    expect(await searchExtras(request, ' key\n', fetchFn)).toHaveLength(1);
    expect(sent!.url).toBe('https://api.trychannel3.com/v1/search');
    expect((sent!.init.headers as Record<string, string>)['x-api-key']).toBe('key');
    expect(JSON.parse(String(sent!.init.body))).toEqual({ query: 'clear glass vase', limit: 8, filters: { availability: ['InStock', 'LimitedAvailability'], price: { max_price: 40 } } });
  });

  it('sends no price filter without a budget, and throws when Channel3 fails', async () => {
    let body: any;
    const ok = (async (_u: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return new Response('{}'); }) as unknown as typeof fetch;
    await searchExtras({ ...request, maxDollars: 0 }, 'k', ok);
    expect(body.filters.price).toBeUndefined();
    await expect(searchExtras(request, 'k', (async () => new Response('', { status: 403 })) as typeof fetch)).rejects.toThrow('403');
  });
});

describe('extrasHandler', () => {
  it('answers with extras, refuses bad input, and needs a key', async () => {
    expect((await extrasHandler(request, async () => [])).status).toBe(200);
    expect((await extrasHandler({ kind: 'laptop' }, async () => [])).status).toBe(400);
    expect((await extrasHandler(request, null)).status).toBe(503);
  });

  it('does not pass the details of a Channel3 failure to the customer', async () => {
    const r = await extrasHandler(request, async () => { throw new Error('secret detail'); });
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.body)).not.toContain('secret detail');
  });
});

describe('Worker /extras', () => {
  const SITE = 'https://yaya9982.github.io';
  const post = (body: unknown, origin = SITE, ip = '2.2.2.2') => new Request('https://w.example/extras', { method: 'POST', headers: { origin, 'cf-connecting-ip': ip }, body: JSON.stringify(body) });
  const env = { GEMINI_API_KEY: 'g', CHANNEL3_API_KEY: 'c' };

  it('searches with the secret key and never calls Gemini', async () => {
    const urls: string[] = [];
    const fetchFn = (async (url: string) => { urls.push(url); return new Response(JSON.stringify({ products: [product()] })); }) as unknown as typeof fetch;
    const res = await handle(post(request, SITE, '2.2.2.3'), env, fetchFn);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(SITE);
    expect((await res.json() as any).extras).toHaveLength(1);
    expect(urls).toEqual(['https://api.trychannel3.com/v1/search']);
  });

  it('refuses other sites, bad requests and a missing key', async () => {
    const never = (async () => { throw new Error('should not be called'); }) as typeof fetch;
    expect((await handle(post(request, 'https://evil.example'), env, never)).status).toBe(403);
    expect((await handle(post({ kind: 'laptop', details: '', maxDollars: 0 }), env, never)).status).toBe(400);
    expect((await handle(post(request), { GEMINI_API_KEY: 'g' }, never)).status).toBe(503);
  });

  it('answers 502 with the site headers when Channel3 is down', async () => {
    const res = await handle(post(request, SITE, '2.2.2.4'), env, (async () => new Response('', { status: 500 })) as typeof fetch);
    expect(res.status).toBe(502);
    expect(res.headers.get('access-control-allow-origin')).toBe(SITE);
  });
});
