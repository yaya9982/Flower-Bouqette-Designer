import { randomUUID } from 'node:crypto';
import type Anthropic from '@anthropic-ai/sdk';
import type { ToolName } from '../src/florist-tools';

/**
 * The AI florist. Claude decides what to do; the browser does it (src/florist-tools.ts) and sends back what happened.
 * The server keeps each conversation, so the browser can only answer the tool calls Claude really made.
 */

type Props = Record<string, { type: string; description: string; enum?: readonly string[] }>;

const text = (description: string) => ({ type: 'string', description });
const whole = (description: string) => ({ type: 'integer', description });

function tool(name: ToolName, description: string, properties: Props = {}): Anthropic.Tool {
  return {
    name, description, strict: true,
    input_schema: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false },
  };
}

export const TOOLS: Anthropic.Tool[] = [
  tool('get_design', 'The current bouquet: flowers by kind and colour, shape, wrap and total price in cents.'),
  tool('search_flowers', 'Find flowers in the shop. Returns up to 15 with their ids, colours and price per stem in cents.', {
    query: text('Part of a flower name, e.g. "peony". Empty string for any.'),
    colour: text('A colour id such as red, pink, white, yellow, orange, purple, blue, cream, green. Empty string for any.'),
  }),
  tool('list_presets', 'The ready-made bouquets, with the occasion each suits.'),
  tool('load_preset', 'Replace the whole design with a ready-made bouquet.', { presetId: text('An id from list_presets.') }),
  tool('add_flowers', 'Add stems of one flower.', {
    flowerId: text('An id from search_flowers.'),
    colourId: text("One of that flower's colours, or empty string for its first colour."),
    count: whole('How many stems, 1 to 12.'),
  }),
  tool('remove_flowers', 'Remove stems of one flower that is in the bouquet.', { flowerId: text('A flower id in the bouquet.'), count: whole('How many stems, 1 to 40.') }),
  tool('recolour_flowers', 'Change the colour of some stems of one flower.', {
    flowerId: text('A flower id in the bouquet.'), toColourId: text("One of that flower's colours."), count: whole('How many stems, 1 to 40.'),
  }),
  tool('swap_flowers', 'Turn some stems of one flower into another flower.', {
    fromFlowerId: text('A flower id in the bouquet.'), toFlowerId: text('An id from search_flowers.'), count: whole('How many stems, 1 to 40.'),
  }),
  tool('set_wrap', 'Change the wrapping. Empty string keeps a part as it is.', {
    paper: text('none, kraft, tissue or matte.'),
    paperColour: text('kraft, white, blush, sage, black or red.'),
    ribbonColour: text('ivory, red, blush, gold, navy, sage, lilac or orange.'),
    bow: text('ribbon (a classic bow with tails) or star (a gift-box star bow).'),
    greenery: text('none, fern, eucalyptus or leafy: foliage tucked in around the flowers, free of charge.'),
  }),
  tool('set_shape', 'Change the bouquet shape.', { shape: { type: 'string', description: 'The shape.', enum: ['round', 'cascade', 'loose', 'onesided'] } }),
  tool('rearrange', 'Space the flowers out neatly again.'),
  tool('show_checkout', "Show the customer the pay buttons when they are happy. This does not take payment; the customer pays with PayPal themselves."),
];

export const SYSTEM = `You are the florist at an online flower shop. The customer is looking at their bouquet in a 3D designer, and you build it for them with the tools; every change appears in front of them.

- Find flowers with search_flowers before adding them, and use only ids that tools returned.
- Work quickly: you have about ten steps. Plan first, then make every call that does not depend on another in the same step (for example, several add_flowers together). Search once per kind of flower and never repeat a search; if a search finds nothing, read its note and choose from what it names instead of trying more words.
- If a flower does not come in the colour the customer wants, use the closest flower or colour and say so in a few words.
- When the occasion matches one, start from a ready-made bouquet (list_presets, load_preset), then adjust it.
- Prices come only from tool results: totalCents is the full price in US cents. When the customer gives a budget, keep totalCents at or under it. If no bouquet can fit the budget, build the smallest one and say so.
- Always finish by telling the customer the final total in dollars.
- A bouquet holds 1 to 40 flowers.
- Reply in one to three short, warm sentences. Don't list every stem; the customer can see the bouquet.
- When the customer is happy, call show_checkout. You cannot take payment; the customer pays with the PayPal button.`;

export interface FloristRequest {
  sessionId?: string;
  text?: string;
  toolResults?: { toolUseId: string; content: string; isError: boolean }[];
}

export interface FloristReply {
  sessionId: string;
  text: string;
  toolCalls: { id: string; name: string; input: unknown }[];
  /** True when Claude has finished and is waiting for the customer. */
  done: boolean;
}

export type CallModel = (messages: Anthropic.MessageParam[]) => Promise<Anthropic.Message>;

interface Session {
  messages: Anthropic.MessageParam[];
  /** Tool calls Claude made that the browser has not answered yet. */
  pending: string[];
  texts: number;
  callsThisText: number;
  lastUsed: number;
  busy: boolean;
}

const MAX_TEXT = 1000;
const MAX_RESULT = 8 * 1024;
const MAX_CALLS_PER_TEXT = 12;
const MAX_TEXTS = 30;
const MAX_SESSIONS = 200;
const IDLE_MS = 60 * 60_000;

/** The conversations, in memory. ponytail: lost on restart, which only means the customer starts a new chat. */
export class FloristSessions {
  private readonly sessions = new Map<string, Session>();

  private day = -1;
  private callsToday = 0;

  /** `maxCallsPerDay` caps what the florist can spend in a day across all customers. */
  constructor(private readonly callModel: CallModel, private readonly now: () => number = Date.now, private readonly maxCallsPerDay = Infinity) {}

  async turn(req: FloristRequest): Promise<FloristReply | { error: string }> {
    const found = this.open(req.sessionId);
    if ('error' in found) return found;
    const { id, session } = found;
    if (session.busy) return { error: 'The florist is still working on your last message.' };
    // Kept so a failed, refused or cut-off call can be undone: the conversation goes back to how it was before.
    const before = { length: session.messages.length, pending: session.pending, texts: session.texts, calls: session.callsThisText };
    const rollBack = () => {
      session.messages.length = before.length;
      session.pending = before.pending;
      session.texts = before.texts;
      session.callsThisText = before.calls;
    };

    if (typeof req.text === 'string') {
      const text = req.text.trim();
      if (!text || text.length > MAX_TEXT) return { error: `Messages can be 1 to ${MAX_TEXT} characters.` };
      if (session.pending.length) return { error: 'The florist is still working; wait for it to finish.' };
      if (session.texts >= MAX_TEXTS) return { error: 'This chat is full. Reload the page to start a new one.' };
      session.texts++;
      session.callsThisText = 0;
      session.messages.push({ role: 'user', content: text });
    } else if (Array.isArray(req.toolResults)) {
      const results = req.toolResults;
      if (!results.every((r) => typeof r === 'object' && r !== null && typeof r.toolUseId === 'string')) return { error: 'Malformed tool results.' };
      const ids = results.map((r) => r.toolUseId);
      if (!session.pending.length || ids.length !== session.pending.length || !session.pending.every((p) => ids.includes(p))) {
        return { error: 'Those tool results do not match what the florist asked for.' };
      }
      if (results.some((r) => typeof r.content !== 'string' || r.content.length > MAX_RESULT)) return { error: 'A tool result is too large.' };
      session.messages.push({
        role: 'user',
        content: session.pending.map((p) => {
          const r = results.find((x) => x.toolUseId === p)!;
          return { type: 'tool_result', tool_use_id: p, content: r.content, is_error: r.isError === true };
        }),
      });
      session.pending = [];
    } else {
      return { error: 'Send a message or tool results.' };
    }

    if (session.callsThisText >= MAX_CALLS_PER_TEXT) {
      return { sessionId: id, text: "Let's pause here. Tell me what you'd like to change.", toolCalls: [], done: true };
    }
    const today = Math.floor(this.now() / 86_400_000);
    if (today !== this.day) {
      this.day = today;
      this.callsToday = 0;
    }
    if (this.callsToday >= this.maxCallsPerDay) {
      rollBack();
      return { sessionId: id, text: "The florist is very busy today. You can still design your bouquet by hand.", toolCalls: [], done: true };
    }

    session.busy = true;
    try {
      session.callsThisText++;
      this.callsToday++;
      const response = await this.callModel(session.messages);
      if (response.stop_reason === 'refusal') {
        rollBack();
        return { sessionId: id, text: "Sorry, I can't help with that one.", toolCalls: [], done: true };
      }
      if (response.stop_reason === 'max_tokens') {
        rollBack();
        return { sessionId: id, text: 'Sorry, I lost my thread. Could you say that again?', toolCalls: [], done: true };
      }
      // Kept exactly as sent, thinking blocks included: Claude checks them on the next call.
      session.messages.push({ role: 'assistant', content: response.content });
      const toolCalls = response.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
        .map((b) => ({ id: b.id, name: b.name, input: b.input }));
      session.pending = toolCalls.map((c) => c.id);
      const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n').trim();
      return { sessionId: id, text, toolCalls, done: toolCalls.length === 0 };
    } catch (error) {
      rollBack();
      throw error;
    } finally {
      session.busy = false;
      session.lastUsed = this.now();
    }
  }

  /** The session named, or a new one when none is named. Expired sessions are dropped. */
  private open(sessionId: string | undefined): { id: string; session: Session } | { error: string } {
    const now = this.now();
    for (const [key, s] of this.sessions) if (now - s.lastUsed > IDLE_MS) this.sessions.delete(key);
    if (sessionId !== undefined) {
      const session = this.sessions.get(sessionId);
      if (!session) return { error: 'This chat has expired. Start a new one.' };
      // Most recently used last, so the oldest is first in line to be dropped.
      this.sessions.delete(sessionId);
      this.sessions.set(sessionId, session);
      return { id: sessionId, session };
    }
    if (this.sessions.size >= MAX_SESSIONS) this.sessions.delete(this.sessions.keys().next().value!);
    const id = randomUUID();
    const session: Session = { messages: [], pending: [], texts: 0, callsThisText: 0, lastUsed: now, busy: false };
    this.sessions.set(id, session);
    return { id, session };
  }
}
