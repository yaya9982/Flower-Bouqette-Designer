import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Bouquet, BouquetEditor } from '../src/bouquet';
import type { Quote } from '../src/pricing';

export type OrderStatus = 'CREATED' | 'PAID' | 'DISPATCHED';

export interface StoredOrder {
  ref: string;
  paypalOrderId: string;
  status: OrderStatus;
  bouquet: Bouquet;
  quote: Quote;
  cardMessage: string;
  deliveryDate: string;
  createdAt: string;
  captureId: string | null;
}

export interface CheckoutRequest {
  bouquet: Bouquet;
  cardMessage: string;
  deliveryDate: string;
  /** PNG bytes, base64, without the data: prefix. */
  snapshot: string;
}

const MAX_MESSAGE = 300;
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const MAX_DAYS_AHEAD = 60;
const PNG_PREFIX = 'data:image/png;base64,';
const DAY = 24 * 60 * 60 * 1000;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Checks what the browser sent at checkout. Returns the clean request, or a reason it was refused. */
export function parseCheckout(body: unknown, editor: BouquetEditor, now: Date): CheckoutRequest | string {
  if (typeof body !== 'object' || body === null) return 'Expected a JSON object.';
  const b = body as Record<string, unknown>;
  const bouquet = editor.validate(b.bouquet);
  if (!bouquet) return 'That bouquet is not one the designer can make.';
  const cardMessage = typeof b.cardMessage === 'string' ? b.cardMessage.trim() : '';
  if (cardMessage.length > MAX_MESSAGE) return `The card message can be at most ${MAX_MESSAGE} characters.`;
  const date = typeof b.deliveryDate === 'string' ? b.deliveryDate : '';
  // Dates are compared as UTC days. A day of slack before today covers customers west of UTC.
  const earliest = new Date(now.getTime() - DAY).toISOString().slice(0, 10);
  const latest = new Date(now.getTime() + MAX_DAYS_AHEAD * DAY).toISOString().slice(0, 10);
  // The round trip refuses days that do not exist (2026-02-31 would otherwise roll over to 3 March).
  const real = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  if (!real || date < earliest || date > latest) {
    return `Pick a delivery date between today and ${MAX_DAYS_AHEAD} days from now.`;
  }
  const raw = typeof b.snapshot === 'string' ? b.snapshot : '';
  if (!raw.startsWith(PNG_PREFIX)) return 'The bouquet picture is missing.';
  const snapshot = raw.slice(PNG_PREFIX.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(snapshot) || (snapshot.length * 3) / 4 > MAX_SNAPSHOT_BYTES) return 'The bouquet picture is too large.';
  if (!Buffer.from(snapshot.slice(0, 16), 'base64').subarray(0, 8).equals(PNG_MAGIC)) return 'The bouquet picture is not a PNG.';
  return { bouquet, cardMessage, deliveryDate: date, snapshot };
}

/**
 * Orders, kept in one JSON file with a PNG per order beside it.
 * ponytail: the whole file is rewritten on each change; move to SQLite if orders grow past a demo.
 */
export class OrderStore {
  private orders: StoredOrder[];

  constructor(private readonly dir: string) {
    mkdirSync(join(dir, 'snapshots'), { recursive: true });
    const file = join(dir, 'orders.json');
    this.orders = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as StoredOrder[] : [];
  }

  create(order: StoredOrder): StoredOrder {
    this.orders.push(order);
    this.save();
    return order;
  }

  byPayPalId(id: string): StoredOrder | undefined {
    return this.orders.find((o) => o.paypalOrderId === id);
  }

  byRef(ref: string): StoredOrder | undefined {
    return this.orders.find((o) => o.ref === ref);
  }

  update(ref: string, patch: Partial<StoredOrder>): StoredOrder {
    const i = this.orders.findIndex((o) => o.ref === ref);
    if (i < 0) throw new Error(`No order ${ref}`);
    this.orders[i] = { ...this.orders[i], ...patch };
    this.save();
    return this.orders[i];
  }

  list(): StoredOrder[] {
    return [...this.orders];
  }

  saveSnapshot(ref: string, pngBase64: string): void {
    writeFileSync(this.snapshotPath(ref), Buffer.from(pngBase64, 'base64'));
  }

  snapshotPath(ref: string): string {
    // The ref becomes part of a file path, so only refs this store could have made are accepted.
    if (!/^bq_[A-Za-z0-9_-]{1,64}$/.test(ref)) throw new Error('Bad order ref');
    return join(this.dir, 'snapshots', `${ref}.png`);
  }

  private save(): void {
    // Written beside and renamed over, so a crash mid-write cannot leave a half-written orders.json.
    const file = join(this.dir, 'orders.json');
    writeFileSync(`${file}.tmp`, JSON.stringify(this.orders, null, 1));
    renameSync(`${file}.tmp`, file);
  }
}
