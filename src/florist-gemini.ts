/**
 * The florist through the free Cloudflare Worker (worker/index.ts) and Gemini. A Worker keeps no memory, so the
 * conversation lives here and goes with every step. It answers the same way the shop's server does, so the chat drawer
 * works with either.
 */

interface ToolCall { id: string; name: string; input: unknown }
export interface Reply { sessionId: string; text: string; toolCalls: ToolCall[]; done: boolean }
export interface Request { sessionId?: string; text?: string; toolResults?: { toolUseId: string; content: string; isError: boolean }[] }

interface Part { text?: string; thought?: boolean; functionCall?: { id?: string; name: string; args?: unknown }; [key: string]: unknown }
interface Content { role: 'user' | 'model'; parts: Part[] }

const MAX_CALLS_PER_TEXT = 12;

export class GeminiFlorist {
  private contents: Content[] = [];
  private sessionId = '';
  private pending: { id: string; name: string; callId?: string }[] = [];
  private callsThisText = 0;

  constructor(private readonly url: string, private readonly fetchFn: typeof fetch = (...a) => fetch(...a)) {}

  async send(req: Request): Promise<Reply> {
    if (req.sessionId === undefined || req.sessionId !== this.sessionId) this.reset();
    const before = this.contents.length;
    if (typeof req.text === 'string') {
      this.callsThisText = 0;
      this.contents.push({ role: 'user', parts: [{ text: req.text }] });
    } else {
      const results = req.toolResults ?? [];
      this.contents.push({
        role: 'user',
        parts: this.pending.map((p) => {
          const r = results.find((x) => x.toolUseId === p.id);
          const response = r ? (r.isError ? { error: JSON.parse(r.content) } : JSON.parse(r.content)) : { error: 'Not run.' };
          return { functionResponse: { name: p.name, response, ...(p.callId ? { id: p.callId } : {}) } };
        }),
      });
    }
    this.pending = [];
    if (++this.callsThisText > MAX_CALLS_PER_TEXT) {
      return { sessionId: this.sessionId, text: "Let's pause here. Tell me what you'd like to change.", toolCalls: [], done: true };
    }

    let json: any;
    try {
      const res = await this.fetchFn(this.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contents: this.contents }) });
      json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `The florist answered ${res.status}.`);
    } catch (error) {
      this.contents.length = before;
      throw error;
    }
    if (!json.content) {
      this.contents.length = before;
      return { sessionId: this.sessionId, text: json.finishReason === 'MAX_TOKENS' ? 'Sorry, I lost my thread. Could you say that again?' : "Sorry, I can't help with that one.", toolCalls: [], done: true };
    }

    // Sent back exactly as it came, thought signatures included: Gemini checks them on the next step.
    const content = json.content as Content;
    this.contents.push({ role: 'model', parts: content.parts ?? [] });
    const toolCalls: ToolCall[] = [];
    for (const part of content.parts ?? []) {
      if (!part.functionCall) continue;
      const id = `call_${this.contents.length}_${toolCalls.length}`;
      this.pending.push({ id, name: part.functionCall.name, callId: part.functionCall.id });
      toolCalls.push({ id, name: part.functionCall.name, input: part.functionCall.args ?? {} });
    }
    const text = (content.parts ?? []).filter((p) => p.text && !p.thought).map((p) => p.text).join('\n').trim();
    return { sessionId: this.sessionId, text, toolCalls, done: toolCalls.length === 0 };
  }

  private reset(): void {
    this.contents = [];
    this.pending = [];
    this.sessionId = crypto.randomUUID();
  }
}
