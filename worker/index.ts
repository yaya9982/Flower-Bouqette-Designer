import { SYSTEM, TOOLS } from '../server/florist';

/**
 * The AI florist on a free Cloudflare Worker: it adds the Gemini key, the florist's instructions and tools, and passes
 * one step of the chat to Gemini. The browser keeps the conversation and runs the tools (src/florist-gemini.ts).
 */

export interface Env { GEMINI_API_KEY: string }

/** Free models, tried in order; the next one is used when one is out of quota for the day. */
export const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
const ORIGINS = ['https://yaya9982.github.io', 'http://localhost:5173', 'http://localhost:5180'];
const MAX_BODY = 200_000;
const MAX_CONTENTS = 200;
const CALLS_PER_IP_PER_DAY = 150;

/** Gemini's schema types are upper case and it has no `additionalProperties`. */
function geminiSchema(schema: any): object {
  return {
    type: 'OBJECT',
    properties: Object.fromEntries(Object.entries(schema.properties as Record<string, any>).map(([k, p]) => [k, { ...p, type: String(p.type).toUpperCase() }])),
    required: schema.required,
  };
}

const DECLARATIONS = TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  ...(Object.keys(t.input_schema.properties ?? {}).length ? { parameters: geminiSchema(t.input_schema) } : {}),
}));

// ponytail: per-isolate memory, so the cap is per Cloudflare location and resets on redeploy; a KV or rate-limit binding if abuse shows up. The key has no billing, so the worst case is a day without the florist.
const calls = new Map<string, number>();
let day = -1;

function overCap(ip: string, now: number): boolean {
  const today = Math.floor(now / 86_400_000);
  if (today !== day) { day = today; calls.clear(); }
  const n = (calls.get(ip) ?? 0) + 1;
  calls.set(ip, n);
  return n > CALLS_PER_IP_PER_DAY;
}

/** Only what the chat drawer sends, so the Worker can't be used for images or long prompts of someone else's. */
const PART_KEYS = new Set(['text', 'thought', 'thoughtSignature', 'functionCall', 'functionResponse']);
const MAX_USER_TEXT = 2000;

function validPart(part: any, role: string): boolean {
  return part && typeof part === 'object' && Object.keys(part).every((k) => PART_KEYS.has(k))
    && (role !== 'user' || part.text === undefined || (typeof part.text === 'string' && part.text.length <= MAX_USER_TEXT));
}

function validContents(contents: unknown): contents is { role: string; parts: unknown[] }[] {
  return Array.isArray(contents) && contents.length > 0 && contents.length <= MAX_CONTENTS
    && contents.every((c) => c && (c.role === 'user' || c.role === 'model') && Array.isArray(c.parts)
      && c.parts.every((p: unknown) => validPart(p, c.role)));
}

export async function handle(request: Request, env: Env, fetchFn: typeof fetch = fetch, now = Date.now()): Promise<Response> {
  const origin = request.headers.get('origin') ?? '';
  const cors = ORIGINS.includes(origin) ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type', vary: 'origin' } : null;
  const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } });

  if (!cors) return reply(403, { error: 'Not allowed from this site.' });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'POST' } });
  if (request.method !== 'POST') return reply(405, { error: 'POST only.' });

  const text = await request.text();
  if (text.length > MAX_BODY) return reply(413, { error: 'This chat is too long. Start a new one.' });
  let contents: unknown;
  try { contents = JSON.parse(text).contents; } catch { return reply(400, { error: 'Malformed request.' }); }
  if (!validContents(contents)) return reply(400, { error: 'Malformed conversation.' });
  if (overCap(request.headers.get('cf-connecting-ip') ?? 'unknown', now)) {
    return reply(429, { error: "You've chatted a lot today. You can still design your bouquet by hand." });
  }

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents,
    tools: [{ functionDeclarations: DECLARATIONS }],
    generationConfig: { maxOutputTokens: 4096 },
  });
  for (const model of MODELS) {
    const res = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY }, body,
    });
    if (res.status === 429 || res.status === 503) continue;
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.log(`Gemini ${model} answered ${res.status}: ${json.error?.message ?? ''}`);
      return reply(502, { error: 'The florist is unavailable right now.' });
    }
    const candidate = json.candidates?.[0];
    if (!candidate?.content) return reply(200, { content: null, finishReason: candidate?.finishReason ?? json.promptFeedback?.blockReason ?? 'EMPTY' });
    return reply(200, { content: candidate.content, finishReason: candidate.finishReason ?? 'STOP' });
  }
  return reply(429, { error: 'The florist is very busy today. You can still design your bouquet by hand.' });
}

export default { fetch: (request: Request, env: Env) => handle(request, env) };
