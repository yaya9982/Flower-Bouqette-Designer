import { parseExtrasRequest, searchExtras } from '../server/extras';
import { SYSTEM, TOOLS } from '../server/florist';

/**
 * The AI florist on a free Cloudflare Worker: it adds the Gemini key, the florist's instructions and tools, and passes
 * one step of the chat to Gemini. The browser keeps the conversation and runs the tools (src/florist-gemini.ts).
 */

export interface Env { GEMINI_API_KEY: string; CHANNEL3_API_KEY?: string }

/** Free models, tried in order; the next one is used when one is out of quota for the day. */
export const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
const ORIGINS = ['https://yaya9982.github.io', 'https://flower-bouqette-designer.onrender.com', 'http://localhost:5173', 'http://localhost:5180'];
const MAX_BODY = 200_000;
const MAX_CONTENTS = 200;
const CALLS_PER_IP_PER_DAY = 150;
const GEMINI_TIMEOUT_MS = 25_000;

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
/** The florist's own replies are longer than a customer's message, but not essays. */
const MAX_MODEL_TEXT = 4000;
const MAX_TOOL_JSON = 30_000;
const TOOL_NAMES = new Set(TOOLS.map((t) => t.name));

const isToolPart = (call: any): boolean => call && typeof call === 'object' && TOOL_NAMES.has(call.name)
  && JSON.stringify(call).length <= MAX_TOOL_JSON;

function validPart(part: any, role: string): boolean {
  if (!part || typeof part !== 'object' || !Object.keys(part).every((k) => PART_KEYS.has(k))) return false;
  if (part.text !== undefined && (typeof part.text !== 'string' || part.text.length > (role === 'user' ? MAX_USER_TEXT : MAX_MODEL_TEXT))) return false;
  // Calls and results must name one of the florist's tools, so a forged history cannot invent others.
  if (part.functionCall !== undefined && !isToolPart(part.functionCall)) return false;
  if (part.functionResponse !== undefined && !isToolPart(part.functionResponse)) return false;
  return true;
}

function validContents(contents: unknown): contents is { role: string; parts: unknown[] }[] {
  return Array.isArray(contents) && contents.length > 0 && contents.length <= MAX_CONTENTS
    && contents.every((c) => c && (c.role === 'user' || c.role === 'model') && Array.isArray(c.parts) && c.parts.length > 0
      && c.parts.every((p: unknown) => validPart(p, c.role)));
}

/** One Channel3 search for the chat, counted against the same daily cap as the florist. */
async function extras(body: unknown, request: Request, env: Env, fetchFn: typeof fetch, now: number, reply: (status: number, body: object) => Response): Promise<Response> {
  const search = parseExtrasRequest(body);
  if (typeof search === 'string') return reply(400, { error: search });
  if (!env.CHANNEL3_API_KEY) return reply(503, { error: 'Gift extras are not set up.' });
  if (overCap(request.headers.get('cf-connecting-ip') ?? 'unknown', now)) return reply(429, { error: "You've searched a lot today." });
  try {
    return reply(200, { extras: await searchExtras(search, env.CHANNEL3_API_KEY, fetchFn) });
  } catch (error) {
    console.log(`Channel3 search failed: ${(error as Error).message}`);
    return reply(502, { error: 'Gift extras are unavailable right now.' });
  }
}

export async function handle(request: Request, env: Env, fetchFn: typeof fetch = fetch, now = Date.now()): Promise<Response> {
  const origin = request.headers.get('origin') ?? '';
  const cors = ORIGINS.includes(origin) ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type', vary: 'origin' } : null;
  const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } });

  if (!cors) return reply(403, { error: 'Not allowed from this site.' });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'POST' } });
  if (request.method !== 'POST') return reply(405, { error: 'POST only.' });

  // The declared size is checked first, so an oversized body is never read.
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return reply(413, { error: 'This chat is too long. Start a new one.' });
  const text = await request.text();
  if (text.length > MAX_BODY) return reply(413, { error: 'This chat is too long. Start a new one.' });
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { return reply(400, { error: 'Malformed request.' }); }
  if (new URL(request.url).pathname === '/extras') return extras(parsed, request, env, fetchFn, now, reply);
  const contents: unknown = parsed?.contents;
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
    let res: Response;
    try {
      res = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY.trim() }, body,
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      });
    } catch (error) {
      // Unreachable or too slow: answer with the site's CORS headers so the chat can say so instead of failing opaquely.
      console.log(`Gemini ${model} did not answer: ${(error as Error).name}`);
      return reply(502, { error: 'The florist is unavailable right now.' });
    }
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
