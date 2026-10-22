import { formatCents, type Quote } from '../src/pricing';

export interface PayPalEnv {
  clientId: string;
  clientSecret: string;
  /** https://api-m.sandbox.paypal.com or https://api-m.paypal.com */
  base: string;
}

export interface CaptureResult {
  status: string;
  captureId: string | null;
}

function captureOf(json: any): CaptureResult {
  const capture = json.purchase_units?.[0]?.payments?.captures?.[0];
  return { status: String(json.status), captureId: capture?.id ?? null };
}

const money = (cents: number) => ({ currency_code: 'USD', value: formatCents(cents) });

/** The Orders v2 create body. Every amount comes from the server's own quote. */
export function buildOrderBody(quote: Quote, orderRef: string): object {
  return {
    intent: 'CAPTURE',
    purchase_units: [{
      custom_id: orderRef,
      description: 'Hand-tied bouquet',
      amount: { ...money(quote.totalCents), breakdown: { item_total: money(quote.totalCents) } },
      items: quote.lines.map((l) => ({ name: l.name, quantity: String(l.quantity), unit_amount: money(l.unitCents), category: 'PHYSICAL_GOODS' })),
    }],
  };
}

/** The three PayPal calls this shop needs: a token, create an order, capture it. */
export class PayPalApi {
  private token: { value: string; until: number } | null = null;

  constructor(private readonly env: PayPalEnv, private readonly fetchFn: typeof fetch = fetch) {}

  async createOrder(body: object): Promise<{ id: string }> {
    const json = await this.call('/v2/checkout/orders', body);
    return { id: String(json.id) };
  }

  /** `requestId` makes a retried capture safe: PayPal answers it once. */
  async captureOrder(id: string, requestId: string): Promise<CaptureResult> {
    return captureOf(await this.call(`/v2/checkout/orders/${encodeURIComponent(id)}/capture`, {}, requestId));
  }

  /** The order as PayPal has it now, to recover from a capture whose answer was lost. */
  async getOrder(id: string): Promise<CaptureResult> {
    return captureOf(await this.call(`/v2/checkout/orders/${encodeURIComponent(id)}`));
  }

  private async call(path: string, body?: object, requestId?: string): Promise<any> {
    const res = await this.fetchFn(`${this.env.base}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        authorization: `Bearer ${await this.accessToken()}`, 'content-type': 'application/json',
        ...(requestId ? { 'paypal-request-id': requestId } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`PayPal ${path} answered ${res.status}: ${json.name ?? ''} ${json.message ?? ''}`.trim());
    return json;
  }

  /** Cached until a minute before it expires. */
  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.until) return this.token.value;
    const basic = Buffer.from(`${this.env.clientId}:${this.env.clientSecret}`).toString('base64');
    const res = await this.fetchFn(`${this.env.base}/v1/oauth2/token`, {
      method: 'POST',
      headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) throw new Error(`PayPal token request answered ${res.status}`);
    const json = await res.json() as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, until: Date.now() + (json.expires_in - 60) * 1000 };
    return this.token.value;
  }
}
