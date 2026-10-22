// The shop's server: prices and takes payment for bouquets. Run with `npm run server` (tsx), next to `npm run dev`.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { BouquetEditor } from '../src/bouquet';
import { Catalog, FLOWERS } from '../src/catalog';
import { FloristSessions, SYSTEM, TOOLS, type FloristRequest } from './florist';
import { OrderStore } from './orders';
import { PayPalApi } from './paypal';
import { boardHandler, captureHandler, createOrderHandler, pathOf, RateLimiter, staticFile, type Reply } from './routes';

if (existsSync('.env')) process.loadEnvFile('.env');

const env = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} in .env (see .env.example).`);
  return value;
};

const PORT = Number(process.env.PORT ?? 8787);
// The built site is served once `npm run build` has made it; in development Vite serves the pages instead.
const SERVE_SITE = existsSync(join('dist', 'index.html'));
const FLORIST_KEY = process.env.FLORIST_KEY ?? '';
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream',
  '.wasm': 'application/wasm', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};
const MAX_BODY = 3 * 1024 * 1024;

const catalog = new Catalog(FLOWERS);
const editor = new BouquetEditor(catalog);
const store = new OrderStore(join('server', 'data'));
const paypal = new PayPalApi({
  clientId: env('PAYPAL_CLIENT_ID'),
  clientSecret: env('PAYPAL_CLIENT_SECRET'),
  base: process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com',
});
const shop = { store, paypal, editor, catalog, now: () => new Date() };

// Created on first use, so the shop still runs (without the florist) when ANTHROPIC_API_KEY is not set.
let anthropic: Anthropic | null = null;
const florist = new FloristSessions((messages) => {
  anthropic ??= new Anthropic();
  return anthropic.messages.create({
    model: process.env.FLORIST_MODEL ?? 'claude-haiku-5-5',
    max_tokens: 8000,
    system: SYSTEM,
    tools: TOOLS,
    messages,
    output_config: { effort: 'high' },
  });
}, Date.now, Number(process.env.FLORIST_DAILY_CALLS ?? 2000));

// Per-IP limits. ponytail: behind a proxy every customer shares the proxy's address; read X-Forwarded-For then.
const apiLimit = new RateLimiter(60, 60_000);
const orderLimit = new RateLimiter(10, 60_000);
const newChatLimit = new RateLimiter(10, 60_000);

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, 'Request too large.');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
  } catch {
    throw new HttpError(400, 'Expected JSON.');
  }
}

async function route(req: IncomingMessage, path: string, ip: string): Promise<Reply> {
  const method = req.method ?? 'GET';
  if (method === 'GET' && path === '/api/config') {
    return { status: 200, body: { paypalClientId: env('PAYPAL_CLIENT_ID'), currency: 'USD' } };
  }
  if (method === 'POST' && path === '/api/orders') {
    if (!orderLimit.allow(ip)) return { status: 429, body: { error: 'Too many orders started; wait a minute.' } };
    return createOrderHandler(shop, await readJson(req));
  }
  if (method === 'POST' && path === '/api/florist') {
    const body = await readJson(req);
    if (typeof body !== 'object' || body === null) return { status: 400, body: { error: 'Expected JSON.' } };
    if (!('sessionId' in body) && !newChatLimit.allow(ip)) return { status: 429, body: { error: 'Too many new chats; wait a minute.' } };
    const reply = await florist.turn(body as FloristRequest).catch((error) => {
      console.error(error);
      return { error: 'The florist is unavailable right now. Please try again.', status: 502 };
    });
    return 'error' in reply ? { status: 'status' in reply ? reply.status : 400, body: { error: reply.error } } : { status: 200, body: reply };
  }
  if (path.startsWith('/api/board/')) {
    const key = req.headers['x-florist-key'];
    return boardHandler(store, FLORIST_KEY, typeof key === 'string' ? key : undefined, method, path);
  }
  const capture = path.match(/^\/api\/orders\/([A-Z0-9]{5,40})\/capture$/);
  if (method === 'POST' && capture) return captureHandler(store, paypal, capture[1]);
  return { status: 404, body: { error: 'Not found.' } };
}

function send(res: ServerResponse, reply: Reply): void {
  res.writeHead(reply.status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(reply.body));
}

/** GET /snapshots/<ref>.png for the florist board (key required), and the built site in production. */
function sendFile(req: IncomingMessage, res: ServerResponse, path: string): boolean {
  const snap = path.match(/^\/snapshots\/(bq_[A-Za-z0-9_-]{1,64})\.png$/);
  if (snap) {
    const key = req.headers['x-florist-key'];
    if (boardHandler(store, FLORIST_KEY, typeof key === 'string' ? key : undefined, 'GET', '/api/board/orders').status !== 200) {
      send(res, { status: 401, body: { error: 'Wrong florist key.' } });
      return true;
    }
    const file = store.snapshotPath(snap[1]);
    if (!existsSync(file)) return false;
    res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'private, max-age=3600' });
    res.end(readFileSync(file));
    return true;
  }
  if (!SERVE_SITE) return false;
  const file = staticFile('dist', path.endsWith('/') ? `${path}index.html` : path);
  if (!file || !existsSync(file) || !statSync(file).isFile()) return false;
  const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, { 'content-type': type, ...(type.startsWith('text/html') ? { 'cross-origin-opener-policy': 'same-origin-allow-popups' } : {}) });
  res.end(readFileSync(file));
  return true;
}

// A bug in one request must not take the shop down for everyone.
process.on('unhandledRejection', (error) => console.error(error));

createServer(async (req, res) => {
  try {
    const path = pathOf(req.url);
    if (path === null) return send(res, { status: 400, body: { error: 'Bad request.' } });
    const ip = req.socket.remoteAddress ?? '?';
    // Counted before any file is served, so florist-key guesses on pictures are limited too. The site's own
    // files (hundreds of flower models per page load) are not counted.
    if ((path.startsWith('/api/') || path.startsWith('/snapshots/')) && !apiLimit.allow(ip)) {
      return send(res, { status: 429, body: { error: 'Too many requests; wait a minute.' } });
    }
    if (req.method === 'GET' && !path.startsWith('/api/') && sendFile(req, res, path)) return;
    send(res, await route(req, path, ip));
  } catch (error) {
    if (error instanceof HttpError) return send(res, { status: error.status, body: { error: error.message } });
    console.error(error);
    send(res, { status: 502, body: { error: 'Something went wrong talking to the payment service. Please try again.' } });
  }
}).listen(PORT, () => console.log(`Shop server on http://localhost:${PORT}`));
