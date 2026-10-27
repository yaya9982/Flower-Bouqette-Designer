// The florist's order board: paid orders with the customer's design, the stems to gather and a Dispatched button.
import { formatCents, type QuoteLine } from './pricing';

interface Order {
  ref: string;
  status: 'CREATED' | 'PAID' | 'DISPATCHED';
  quote: { lines: QuoteLine[]; totalCents: number };
  cardMessage: string;
  deliveryDate: string;
  createdAt: string;
}

const REFRESH_MS = 5000;
const KEY_STORAGE = 'florist-board-key';

const list = document.getElementById('orders') as HTMLElement;
const status = document.getElementById('status') as HTMLElement;
const keyInput = document.getElementById('key') as HTMLInputElement;
const keyForm = document.getElementById('key-form') as HTMLFormElement;

let key = '';
try { key = sessionStorage.getItem(KEY_STORAGE) ?? ''; } catch { /* storage blocked: ask each visit */ }
/** Order pictures already fetched, by order ref; kept so the 5-second refresh does not download them again. */
const pictures = new Map<string, string>();
let shownJson = '';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  // Always textContent: card messages are written by customers.
  if (text) node.textContent = text;
  return node;
}

async function api(path: string, method = 'GET'): Promise<Response> {
  return fetch(path, { method, headers: { 'x-florist-key': key } });
}

async function picture(ref: string): Promise<string> {
  const known = pictures.get(ref);
  if (known) return known;
  const res = await api(`/snapshots/${ref}.png`);
  if (!res.ok) return '';
  const url = URL.createObjectURL(await res.blob());
  pictures.set(ref, url);
  return url;
}

function card(order: Order): HTMLElement {
  const box = el('article', `order ${order.status.toLowerCase()}`);
  const img = el('img');
  img.alt = 'The bouquet the customer designed';
  void picture(order.ref).then((url) => { if (url) img.src = url; });
  const info = el('div', 'info');
  info.append(
    el('h2', '', `Deliver ${order.deliveryDate}`),
    el('p', 'meta', `${order.status === 'PAID' ? 'Paid' : 'Dispatched'} · $${formatCents(order.quote.totalCents)} · ${order.ref.slice(0, 11)}`),
  );
  const stems = el('ul', 'stems');
  for (const line of order.quote.lines) stems.append(el('li', '', `${line.quantity} × ${line.name}`));
  info.append(stems);
  if (order.cardMessage) info.append(el('blockquote', '', order.cardMessage));
  if (order.status === 'PAID') {
    const button = el('button', '', 'Dispatched');
    button.type = 'button';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const res = await api(`/api/board/orders/${order.ref}/dispatch`, 'POST');
        if (!res.ok) status.textContent = (await res.json().catch(() => ({}))).error ?? 'Could not mark it dispatched.';
      } catch (error) {
        status.textContent = `Could not mark it dispatched: ${(error as Error).message}`;
      }
      // Drawn again even when nothing changed, so a button that failed is enabled again.
      shownJson = '';
      await refresh();
    });
    info.append(button);
  }
  box.append(img, info);
  return box;
}

async function refresh(): Promise<void> {
  if (!key) return;
  try {
    const res = await api('/api/board/orders');
    if (res.status === 401) {
      key = '';
      try { sessionStorage.removeItem(KEY_STORAGE); } catch { /* ignore */ }
      status.textContent = 'That key is not right.';
      keyForm.hidden = false;
      return;
    }
    if (!res.ok) throw new Error(`The shop answered ${res.status}.`);
    // Orders still waiting for payment are not the florist's business yet.
    const orders = (await res.json() as Order[]).filter((o) => o.status !== 'CREATED');
    keyForm.hidden = true;
    status.textContent = `${orders.filter((o) => o.status === 'PAID').length} to make · updated ${new Date().toLocaleTimeString()}`;
    const json = JSON.stringify(orders);
    if (json === shownJson) return;
    shownJson = json;
    list.replaceChildren(...(orders.length ? orders.map(card) : [el('p', 'empty', 'No paid orders yet.')]));
  } catch (error) {
    status.textContent = `Could not load orders: ${(error as Error).message}`;
  }
}

keyForm.addEventListener('submit', (event) => {
  event.preventDefault();
  key = keyInput.value;
  keyInput.value = '';
  try { sessionStorage.setItem(KEY_STORAGE, key); } catch { /* ignore */ }
  void refresh();
});

void refresh();
setInterval(() => void refresh(), REFRESH_MS);
