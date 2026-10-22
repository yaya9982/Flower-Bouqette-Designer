import { loadCoreSdkScript } from '@paypal/paypal-js/sdk-v6';
import type { Bouquet } from './bouquet';
import type { Catalog } from './catalog';
import { formatCents, priceBouquet } from './pricing';

type OrderPromise = Promise<{ orderId: string }>;
interface PaymentSession { start(options: { presentationMode: 'auto' }, order: OrderPromise): Promise<void> }

const MAX_MESSAGE = 300;
const MAX_DAYS_AHEAD = 60;

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function postJson(url: string, body?: unknown): Promise<any> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `The shop answered ${res.status}.`);
  return json;
}

/**
 * The pay area under the panel: delivery date, card message and the PayPal, Pay Later and Venmo buttons.
 * It lives outside the panel because the panel is rebuilt on every change, which would remove PayPal's buttons.
 * The shop's server prices the order itself; this only sends the design.
 */
export class Checkout {
  private readonly total = document.createElement('p');
  private readonly date = document.createElement('input');
  private readonly message = document.createElement('textarea');
  private readonly buttons = document.createElement('div');
  private readonly status = document.createElement('p');
  private readonly payLaterMessage = document.createElement('paypal-message');

  constructor(
    private readonly root: HTMLElement,
    private readonly catalog: Catalog,
    /** The design right now. Read when Pay is clicked, so later edits do not change the order. */
    private readonly design: () => Bouquet,
    private readonly snapshot: () => Promise<string>,
  ) {}

  async mount(): Promise<void> {
    const today = new Date();
    this.date.type = 'date';
    this.date.id = 'delivery-date';
    this.date.min = isoDay(today);
    this.date.max = isoDay(new Date(today.getTime() + MAX_DAYS_AHEAD * 86_400_000));
    this.date.required = true;
    this.message.id = 'card-message';
    this.message.maxLength = MAX_MESSAGE;
    this.message.rows = 2;
    this.message.placeholder = 'Card message (optional)';
    this.total.className = 'pay-total';
    this.status.className = 'pay-status';
    this.status.setAttribute('role', 'status');
    this.buttons.className = 'pay-buttons';
    this.root.replaceChildren(
      this.total,
      field('delivery-date', 'Delivery date', this.date),
      field('card-message', 'Card message', this.message),
      this.buttons,
      this.status,
    );
    this.update(this.design());

    try {
      const config = await fetch('/api/config').then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Shop server answered ${r.status}`))));
      const paypal = await loadCoreSdkScript({ environment: 'sandbox' });
      if (!paypal) throw new Error('PayPal did not load');
      const sdk = await paypal.createInstance({
        clientId: config.paypalClientId,
        components: ['paypal-payments', 'venmo-payments', 'paypal-messages'],
        pageType: 'checkout',
      });
      const methods = await sdk.findEligibleMethods({ currencyCode: 'USD' });
      const callbacks = {
        onApprove: (data: { orderId: string }) => this.capture(data.orderId),
        onCancel: () => this.say('Payment cancelled. Your bouquet is still here.'),
        onError: (e: unknown) => this.say(`Payment did not go through: ${(e as Error)?.message ?? e}`),
      };
      if (methods.isEligible('paypal')) {
        this.addButton(document.createElement('paypal-button'), sdk.createPayPalOneTimePaymentSession(callbacks));
      }
      if (methods.isEligible('paylater')) {
        const details = methods.getDetails('paylater');
        const button = document.createElement('paypal-pay-later-button');
        button.productCode = details.productCode;
        button.countryCode = details.countryCode;
        this.addButton(button, sdk.createPayLaterOneTimePaymentSession(callbacks));
      }
      if (methods.isEligible('venmo')) {
        this.addButton(document.createElement('venmo-button'), sdk.createVenmoOneTimePaymentSession(callbacks));
      }
      sdk.createPayPalMessages();
      this.payLaterMessage.autoBootstrap = true;
      this.payLaterMessage.currencyCode = 'USD';
      this.buttons.append(this.payLaterMessage);
      this.update(this.design());
    } catch (error) {
      console.error(error);
      this.say('Checkout is unavailable right now. You can keep designing.');
    }
  }

  /** Called on every change to the design. */
  update(b: Bouquet): void {
    const total = formatCents(priceBouquet(b, this.catalog).totalCents);
    this.total.textContent = `Total $${total}`;
    this.payLaterMessage.amount = total;
  }

  /** Brings the pay buttons into view (the florist's "ready to pay" step). */
  show(): void {
    this.root.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    this.root.classList.remove('flash');
    void this.root.offsetWidth;
    this.root.classList.add('flash');
  }

  private addButton(button: HTMLElement, session: PaymentSession): void {
    button.addEventListener('click', () => {
      if (!this.date.reportValidity()) return;
      // Read the design now. The order request is started but not awaited before start(): awaiting first can lose
      // the click's permission to open PayPal's popup.
      const bouquet = this.design();
      const order = this.createOrder(bouquet);
      this.say('Opening PayPal…');
      session.start({ presentationMode: 'auto' }, order).catch((e: Error) => this.say(`Payment did not start: ${e.message}`));
    });
    this.buttons.append(button);
  }

  private async createOrder(bouquet: Bouquet): OrderPromise {
    try {
      const snapshot = await this.snapshot();
      const { orderId } = await postJson('/api/orders', { bouquet, snapshot, deliveryDate: this.date.value, cardMessage: this.message.value });
      return { orderId };
    } catch (error) {
      this.say((error as Error).message);
      throw error;
    }
  }

  private async capture(orderId: string): Promise<void> {
    this.say('Confirming your payment…');
    try {
      const paid = await postJson(`/api/orders/${encodeURIComponent(orderId)}/capture`);
      this.say(`Paid, thank you! Order ${paid.ref.slice(0, 11)} for $${formatCents(paid.totalCents)} is on its way to the florist.`);
    } catch (error) {
      this.say((error as Error).message);
    }
  }

  private say(text: string): void {
    this.status.textContent = text;
  }
}

function field(id: string, label: string, input: HTMLElement): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const l = document.createElement('label');
  l.htmlFor = id;
  l.textContent = label;
  wrap.append(l, input);
  return wrap;
}
