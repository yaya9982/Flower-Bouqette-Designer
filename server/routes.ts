import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { join, resolve, sep } from 'node:path';
import type { BouquetEditor } from '../src/bouquet';
import type { Catalog } from '../src/catalog';
import { formatCents, priceBouquet } from '../src/pricing';
import { parseCheckout, type OrderStore, type StoredOrder } from './orders';
import { buildOrderBody, type PayPalApi } from './paypal';

/** What a handler answers: a status and a JSON body. */
export interface Reply {
  status: number;
  body: unknown;
}

export interface ShopDeps {
  store: OrderStore;
  paypal: PayPalApi;
  editor: BouquetEditor;
  catalog: Catalog;
  now: () => Date;
}

const paidReply = (o: StoredOrder): Reply => ({ status: 200, body: { status: o.status, ref: o.ref, totalCents: o.quote.totalCents } });

/** POST /api/orders: price the design on the server, create the PayPal order, keep it. */
export async function createOrderHandler(deps: ShopDeps, body: unknown): Promise<Reply> {
  const request = parseCheckout(body, deps.editor, deps.now());
  if (typeof request === 'string') return { status: 400, body: { error: request } };
  const quote = priceBouquet(request.bouquet, deps.catalog);
  const ref = `bq_${randomUUID()}`;
  const { id } = await deps.paypal.createOrder(buildOrderBody(quote, ref));
  deps.store.saveSnapshot(ref, request.snapshot);
  deps.store.create({
    ref, paypalOrderId: id, status: 'CREATED', bouquet: request.bouquet, quote,
    cardMessage: request.cardMessage, deliveryDate: request.deliveryDate, createdAt: deps.now().toISOString(), captureId: null,
  });
  return { status: 200, body: { orderId: id } };
}

/** Captures already under way, by PayPal order id, so a double click calls PayPal once. */
const capturing = new Map<string, Promise<Reply>>();

/** POST /api/orders/:id/capture. Capturing an order that is already paid answers from the store and does not call PayPal again. */
export function captureHandler(store: OrderStore, paypal: PayPalApi, paypalOrderId: string): Promise<Reply> {
  const running = capturing.get(paypalOrderId);
  if (running) return running;
  const work = capture(store, paypal, paypalOrderId).finally(() => capturing.delete(paypalOrderId));
  capturing.set(paypalOrderId, work);
  return work;
}

async function capture(store: OrderStore, paypal: PayPalApi, paypalOrderId: string): Promise<Reply> {
  const order = store.byPayPalId(paypalOrderId);
  if (!order) return { status: 404, body: { error: 'No such order.' } };
  if (order.status !== 'CREATED') return paidReply(order);
  let result;
  try {
    result = await paypal.captureOrder(paypalOrderId, `capture-${order.ref}`);
  } catch (error) {
    // The money may already be taken (an earlier capture whose answer was lost): ask PayPal how the order stands.
    result = await paypal.getOrder(paypalOrderId);
    if (result.status !== 'COMPLETED') throw error;
  }
  if (result.status !== 'COMPLETED') return { status: 402, body: { error: `Payment not completed (${result.status}).` } };
  // The server made the order from its own quote, so anything else captured is not what was sold.
  if ((result.amount !== null && result.amount !== formatCents(order.quote.totalCents)) || (result.currency !== null && result.currency !== 'USD')) {
    return { status: 402, body: { error: 'The amount paid does not match the order. Contact the shop.' } };
  }
  return paidReply(store.update(order.ref, { status: 'PAID', captureId: result.captureId }));
}

/** The path of a request target, or null when it cannot be read (a bad request, not a crash). */
export function pathOf(url: string | undefined): string | null {
  try {
    return new URL(url ?? '/', 'http://localhost').pathname;
  } catch {
    return null;
  }
}

/** At most `limit` hits per key in each window. ponytail: fixed windows in memory; fine for one server process. */
export class RateLimiter {
  private hits = new Map<string, number>();
  private windowStart: number;

  constructor(private readonly limit: number, private readonly windowMs: number, private readonly now: () => number = Date.now) {
    this.windowStart = now();
  }

  allow(key: string): boolean {
    if (this.now() - this.windowStart > this.windowMs) {
      this.hits = new Map();
      this.windowStart = this.now();
    }
    const n = (this.hits.get(key) ?? 0) + 1;
    this.hits.set(key, n);
    return n <= this.limit;
  }
}

/** Whether the florist board key sent matches the shop's. A missing or empty shop key means the board is closed. */
function keyMatches(expected: string, given: string | undefined): boolean {
  if (expected.length < MIN_FLORIST_KEY || !given) return false;
  // Hashed first, so the comparison takes the same time and does not show the key's length.
  const hash = (text: string) => createHash('sha256').update(text).digest();
  return timingSafeEqual(hash(expected), hash(given));
}

/** A shorter key is too easy to guess, so the board stays closed until a longer one is set. */
export const MIN_FLORIST_KEY = 16;

/**
 * Who is calling, for the rate limits. Behind a proxy (TRUST_PROXY) every connection comes from the proxy, so the
 * address it appended to X-Forwarded-For is used: the last entry, because earlier ones were written by the caller.
 */
export function clientIp(remote: string | undefined, forwarded: string | string[] | undefined, trustProxy: boolean): string {
  if (trustProxy && forwarded) {
    const last = String(Array.isArray(forwarded) ? forwarded.at(-1) : forwarded).split(',').at(-1)?.trim();
    if (last) return last;
  }
  return remote ?? '?';
}

/** The florist board's routes under /api/board. Snapshots are served separately, as files. */
export function boardHandler(store: OrderStore, floristKey: string, givenKey: string | undefined, method: string, path: string): Reply {
  if (!keyMatches(floristKey, givenKey)) return { status: 401, body: { error: 'Wrong florist key.' } };
  if (method === 'GET' && path === '/api/board/orders') {
    return { status: 200, body: store.list().reverse() };
  }
  const dispatch = path.match(/^\/api\/board\/orders\/(bq_[A-Za-z0-9_-]{1,64})\/dispatch$/);
  if (method === 'POST' && dispatch) {
    const order = store.byRef(dispatch[1]);
    if (!order) return { status: 404, body: { error: 'No such order.' } };
    if (order.status !== 'PAID') return { status: 409, body: { error: `Only paid orders can be dispatched (this one is ${order.status}).` } };
    return { status: 200, body: store.update(order.ref, { status: 'DISPATCHED' }) };
  }
  return { status: 404, body: { error: 'Not found.' } };
}

/** The file under `root` that a URL path names, or null if it would be outside `root` or cannot be decoded. */
export function staticFile(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const base = resolve(root);
  const file = resolve(join(base, decoded === '/' ? 'index.html' : decoded));
  return file.startsWith(base + sep) ? file : null;
}
