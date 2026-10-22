import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BouquetEditor } from '../src/bouquet';
import { Catalog, FLOWERS } from '../src/catalog';
import { formatCents, priceBouquet } from '../src/pricing';
import { OrderStore, parseCheckout } from '../server/orders';
import { buildOrderBody, PayPalApi } from '../server/paypal';
import { boardHandler, captureHandler, createOrderHandler, pathOf, RateLimiter, staticFile } from '../server/routes';

const catalog = new Catalog(FLOWERS);
const editor = new BouquetEditor(catalog);
const NOW = new Date('2026-10-22T03:00:00Z');
const PNG = 'data:image/png;base64,' + Buffer.from('fake png').toString('base64');

const dirs: string[] = [];
function tempStore() {
  const dir = mkdtempSync(join(tmpdir(), 'orders-'));
  dirs.push(dir);
  return new OrderStore(dir);
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function checkout(patch: Record<string, unknown> = {}) {
  return { bouquet: editor.createDefault(), cardMessage: 'Happy birthday!', deliveryDate: '2026-10-25', snapshot: PNG, ...patch };
}

/** A stand-in for PayPal that answers token, create and capture, and records every call. */
function fakePayPal() {
  const calls: { url: string; body: unknown }[] = [];
  const fetchFn = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: typeof init?.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : init?.body });
    const json = url.endsWith('/v1/oauth2/token') ? { access_token: 'tok', expires_in: 32400 }
      : url.endsWith('/capture') ? { id: 'PP1', status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ id: 'CAP1', status: 'COMPLETED' }] } }] }
      : { id: 'PP1', status: 'CREATED' };
    return new Response(JSON.stringify(json), { status: 201, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const api = new PayPalApi({ clientId: 'id', clientSecret: 'secret', base: 'https://api-m.sandbox.paypal.com' }, fetchFn);
  return { api, calls };
}

describe('buildOrderBody', () => {
  it('matches the Orders v2 rules: totals agree, quantities are whole-number strings', () => {
    const quote = priceBouquet(editor.createDefault(), catalog);
    const body = buildOrderBody(quote, 'bq_test') as any;
    const unit = body.purchase_units[0];
    expect(body.intent).toBe('CAPTURE');
    expect(unit.custom_id).toBe('bq_test');
    expect(unit.amount.value).toBe(formatCents(quote.totalCents));
    expect(unit.amount.breakdown.item_total.value).toBe(unit.amount.value);
    expect(unit.amount.currency_code).toBe('USD');
    for (const item of unit.items) {
      expect(item.quantity).toMatch(/^[1-9]\d*$/);
      expect(item.unit_amount.value).toMatch(/^\d+\.\d{2}$/);
    }
  });
});

describe('parseCheckout', () => {
  const parse = (patch: Record<string, unknown>) => parseCheckout(checkout(patch), editor, NOW);

  it('accepts a good request and drops anything that is not part of a bouquet', () => {
    const result = parse({ bouquet: { ...editor.createDefault(), price: 1 }, totalCents: 1 });
    expect(typeof result).toBe('object');
    expect((result as any).bouquet.price).toBeUndefined();
  });

  it.each([
    ['an unknown flower', { bouquet: { ...editor.createDefault(), stems: [{ ...editor.createDefault().stems[0], flower: 'plastic-rose' }] } }],
    ['41 stems', { bouquet: { ...editor.createDefault(), stems: Array.from({ length: 41 }, (_, i) => ({ ...editor.createDefault().stems[0], id: `s${i + 1}` })) } }],
    ['a 301-character message', { cardMessage: 'x'.repeat(301) }],
    ['a date in the past', { deliveryDate: '2026-10-01' }],
    ['a date more than 60 days ahead', { deliveryDate: '2027-01-30' }],
    ['a badly written date', { deliveryDate: '25/10/2026' }],
    ['a snapshot that is not a PNG', { snapshot: 'data:image/jpeg;base64,AAAA' }],
    ['a snapshot over 2 MB', { snapshot: 'data:image/png;base64,' + 'A'.repeat(2_900_000) }],
  ])('refuses %s', (_, patch) => {
    expect(typeof parse(patch)).toBe('string');
  });
});

describe('OrderStore', () => {
  it('keeps orders between instances', () => {
    const store = tempStore();
    const b = editor.createDefault();
    store.create({ ref: 'bq_1', paypalOrderId: 'PP1', status: 'CREATED', bouquet: b, quote: priceBouquet(b, catalog), cardMessage: '', deliveryDate: '2026-10-25', createdAt: NOW.toISOString(), captureId: null });
    store.update('bq_1', { status: 'PAID' });
    const again = new OrderStore((store as any).dir);
    expect(again.byPayPalId('PP1')?.status).toBe('PAID');
    expect(again.list()).toHaveLength(1);
  });
});

describe('order routes', () => {
  it('prices the order on the server and saves it', async () => {
    const store = tempStore();
    const { api, calls } = fakePayPal();
    const reply = await createOrderHandler({ store, paypal: api, editor, catalog, now: () => NOW }, checkout({ totalCents: 1 }));
    expect(reply).toEqual({ status: 200, body: { orderId: 'PP1' } });
    const created = calls.find((c) => c.url.endsWith('/v2/checkout/orders'))!.body as any;
    expect(created.purchase_units[0].amount.value).toBe(formatCents(priceBouquet(editor.createDefault(), catalog).totalCents));
    expect(store.byPayPalId('PP1')?.status).toBe('CREATED');
  });

  it('refuses a bad request without calling PayPal', async () => {
    const { api, calls } = fakePayPal();
    const reply = await createOrderHandler({ store: tempStore(), paypal: api, editor, catalog, now: () => NOW }, checkout({ cardMessage: 'x'.repeat(301) }));
    expect(reply.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('captures once; a second capture returns the stored result without calling PayPal', async () => {
    const store = tempStore();
    const { api, calls } = fakePayPal();
    await createOrderHandler({ store, paypal: api, editor, catalog, now: () => NOW }, checkout());
    const first = await captureHandler(store, api, 'PP1');
    const second = await captureHandler(store, api, 'PP1');
    expect(first.body).toMatchObject({ status: 'PAID' });
    expect(second).toEqual(first);
    expect(calls.filter((c) => c.url.endsWith('/capture'))).toHaveLength(1);
    expect(store.byPayPalId('PP1')?.captureId).toBe('CAP1');
  });

  it('answers 404 for an order it never made', async () => {
    const { api } = fakePayPal();
    expect((await captureHandler(tempStore(), api, 'NOPE')).status).toBe(404);
  });
});

describe('florist board', () => {
  const KEY = 'board-key-123';
  async function paidStore() {
    const store = tempStore();
    const { api } = fakePayPal();
    await createOrderHandler({ store, paypal: api, editor, catalog, now: () => NOW }, checkout());
    return { store, api, ref: store.list()[0].ref };
  }

  it('refuses a wrong or missing key', async () => {
    const { store } = await paidStore();
    expect(boardHandler(store, KEY, undefined, 'GET', '/api/board/orders').status).toBe(401);
    expect(boardHandler(store, KEY, 'wrong', 'GET', '/api/board/orders').status).toBe(401);
    expect(boardHandler(store, '', '', 'GET', '/api/board/orders').status).toBe(401);
  });

  it('lists orders newest first, without the design snapshot path', async () => {
    const { store } = await paidStore();
    const reply = boardHandler(store, KEY, KEY, 'GET', '/api/board/orders');
    expect(reply.status).toBe(200);
    expect((reply.body as any[])[0]).toMatchObject({ status: 'CREATED', cardMessage: 'Happy birthday!' });
  });

  it('dispatch works only on a paid order', async () => {
    const { store, api, ref } = await paidStore();
    expect(boardHandler(store, KEY, KEY, 'POST', `/api/board/orders/${ref}/dispatch`).status).toBe(409);
    await captureHandler(store, api, 'PP1');
    const reply = boardHandler(store, KEY, KEY, 'POST', `/api/board/orders/${ref}/dispatch`);
    expect(reply.status).toBe(200);
    expect(store.byRef(ref)?.status).toBe('DISPATCHED');
    expect(boardHandler(store, KEY, KEY, 'POST', '/api/board/orders/bq_nope/dispatch').status).toBe(404);
  });
});

describe('staticFile', () => {
  it('serves files inside dist only', () => {
    const root = join(tmpdir(), 'dist-root');
    expect(staticFile(root, '/')).toBe(join(root, 'index.html'));
    expect(staticFile(root, '/florist.html')).toBe(join(root, 'florist.html'));
    expect(staticFile(root, '/../.env')).toBeNull();
    expect(staticFile(root, '/%2e%2e/.env')).toBeNull();
    expect(staticFile(root, '/assets/%2e%2e%2f%2e%2e%2f.env')).toBeNull();
    expect(staticFile(root, '/%E0%A4%A')).toBeNull();
  });
});

describe('review fixes', () => {
  it('pathOf turns a bad request target into null instead of throwing', () => {
    expect(pathOf('//')).toBeNull();
    expect(pathOf(undefined)).toBe('/');
    expect(pathOf('/api/config?x=1')).toBe('/api/config');
  });

  it('RateLimiter allows `limit` hits per window per key, then refuses until the window passes', () => {
    let now = 0;
    const limiter = new RateLimiter(2, 60_000, () => now);
    expect([limiter.allow('a'), limiter.allow('a'), limiter.allow('a'), limiter.allow('b')]).toEqual([true, true, false, true]);
    now = 60_001;
    expect(limiter.allow('a')).toBe(true);
  });

  /** PayPal that already captured the order: capture answers 422, the order itself says COMPLETED. */
  function alreadyCaptured() {
    const calls: string[] = [];
    const fetchFn = (async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/v1/oauth2/token')) return Response.json({ access_token: 't', expires_in: 32400 });
      if (url.endsWith('/capture')) return Response.json({ name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] }, { status: 422 });
      if (init?.method === 'GET') return Response.json({ id: 'PP1', status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ id: 'CAP9', status: 'COMPLETED' }] } }] });
      return Response.json({ id: 'PP1', status: 'CREATED' }, { status: 201 });
    }) as typeof fetch;
    return { api: new PayPalApi({ clientId: 'i', clientSecret: 's', base: 'https://x' }, fetchFn), calls };
  }

  it('an order PayPal already captured is recorded as paid, not lost', async () => {
    const store = tempStore();
    const { api } = alreadyCaptured();
    await createOrderHandler({ store, paypal: api, editor, catalog, now: () => NOW }, checkout());
    const reply = await captureHandler(store, api, 'PP1');
    expect(reply.body).toMatchObject({ status: 'PAID' });
    expect(store.byPayPalId('PP1')?.captureId).toBe('CAP9');
  });

  it('two captures at once call PayPal once and both succeed', async () => {
    const store = tempStore();
    const { api, calls } = fakePayPal();
    await createOrderHandler({ store, paypal: api, editor, catalog, now: () => NOW }, checkout());
    const [a, b] = await Promise.all([captureHandler(store, api, 'PP1'), captureHandler(store, api, 'PP1')]);
    expect(a.body).toMatchObject({ status: 'PAID' });
    expect(b.body).toMatchObject({ status: 'PAID' });
    expect(calls.filter((c) => c.url.endsWith('/capture'))).toHaveLength(1);
  });
});
