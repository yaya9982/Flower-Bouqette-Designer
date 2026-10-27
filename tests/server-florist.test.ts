import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { TOOL_NAMES } from '../src/florist-tools';
import { FloristSessions, TOOLS, type FloristReply } from '../server/florist';

type Block = Record<string, unknown>;
const message = (content: Block[], stop_reason: string): Anthropic.Message =>
  ({ id: 'msg', type: 'message', role: 'assistant', model: 'test', content, stop_reason, stop_sequence: null, usage: {} } as unknown as Anthropic.Message);
const THINKING = { type: 'thinking', thinking: '', signature: 'sig' };
const useTool = (id: string) => message([THINKING, { type: 'tool_use', id, name: 'get_design', input: {} }], 'tool_use');
const say = (text: string) => message([{ type: 'text', text }], 'end_turn');

/** A stand-in for Claude that answers from a script and keeps a copy of every conversation it was sent. */
function scripted(...replies: Anthropic.Message[]) {
  const seen: Anthropic.MessageParam[][] = [];
  const callModel = async (messages: Anthropic.MessageParam[]) => {
    seen.push(structuredClone(messages));
    const next = replies.shift();
    if (!next) throw new Error('script ran out');
    return next;
  };
  return { sessions: new FloristSessions(callModel), seen };
}

const ok = (r: FloristReply | { error: string }) => {
  if ('error' in r) throw new Error(r.error);
  return r;
};

describe('FloristSessions', () => {
  it('a first message returns the tool calls Claude asked for', async () => {
    const { sessions } = scripted(useTool('t1'));
    const r = ok(await sessions.turn({ text: 'Something cheerful under $40' }));
    expect(r.toolCalls).toEqual([{ id: 't1', name: 'get_design', input: {} }]);
    expect(r.done).toBe(false);
    expect(r.sessionId).toMatch(/.+/);
  });

  it('tool results go back in one user message, after the assistant turn exactly as Claude sent it', async () => {
    const first = useTool('t1');
    const { sessions, seen } = scripted(first, say('Done!'));
    const { sessionId } = ok(await sessions.turn({ text: 'hi' }));
    const r = ok(await sessions.turn({ sessionId, toolResults: [{ toolUseId: 't1', content: '{"ok":true}', isError: false }] }));
    expect(r).toMatchObject({ text: 'Done!', toolCalls: [], done: true });
    expect(seen[1]).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: first.content },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{"ok":true}', is_error: false }] },
    ]);
  });

  it('refuses results whose ids do not match what Claude asked for, without calling Claude', async () => {
    const { sessions, seen } = scripted(useTool('t1'));
    const { sessionId } = ok(await sessions.turn({ text: 'hi' }));
    expect(await sessions.turn({ sessionId, toolResults: [{ toolUseId: 'forged', content: '{}', isError: false }] })).toHaveProperty('error');
    expect(await sessions.turn({ sessionId, toolResults: [] })).toHaveProperty('error');
    expect(await sessions.turn({ sessionId, toolResults: [null] as never })).toHaveProperty('error');
    expect(seen).toHaveLength(1);
  });

  it('refuses a new message while tool results are still owed, and results when none are owed', async () => {
    const { sessions } = scripted(useTool('t1'));
    const { sessionId } = ok(await sessions.turn({ text: 'hi' }));
    expect(await sessions.turn({ sessionId, text: 'again' })).toHaveProperty('error');
    const fresh = scripted(say('Hello'));
    const s2 = ok(await fresh.sessions.turn({ text: 'hi' }));
    expect(await fresh.sessions.turn({ sessionId: s2.sessionId, toolResults: [{ toolUseId: 'x', content: '', isError: false }] })).toHaveProperty('error');
  });

  it('refuses an empty or very long message and an oversized tool result', async () => {
    const { sessions } = scripted(useTool('t1'));
    expect(await sessions.turn({ text: '' })).toHaveProperty('error');
    expect(await sessions.turn({ text: 'x'.repeat(1001) })).toHaveProperty('error');
    const { sessionId } = ok(await sessions.turn({ text: 'hi' }));
    expect(await sessions.turn({ sessionId, toolResults: [{ toolUseId: 't1', content: 'x'.repeat(8193), isError: false }] })).toHaveProperty('error');
  });

  it('stops after 12 calls to Claude for one message', async () => {
    const { sessions, seen } = scripted(...Array.from({ length: 20 }, (_, i) => useTool(`t${i}`)));
    let r = ok(await sessions.turn({ text: 'keep going' }));
    for (let i = 0; i < 15 && !r.done; i++) {
      r = ok(await sessions.turn({ sessionId: r.sessionId, toolResults: r.toolCalls.map((c) => ({ toolUseId: c.id, content: '{}', isError: false })) }));
    }
    expect(r.done).toBe(true);
    expect(seen).toHaveLength(12);
  });

  it('a refusal ends the turn politely and is not kept in the conversation', async () => {
    const { sessions, seen } = scripted(message([], 'refusal'), say('Hi again'));
    const r = ok(await sessions.turn({ text: 'hi' }));
    expect(r.done).toBe(true);
    expect(r.text).toMatch(/can't help/);
    ok(await sessions.turn({ sessionId: r.sessionId, text: 'roses please' }));
    expect(seen[1].filter((m) => m.role === 'assistant')).toHaveLength(0);
  });

  it('an unknown or expired session is an error', async () => {
    let now = 0;
    const sessions = new FloristSessions(async () => say('hello'), () => now);
    const { sessionId } = ok(await sessions.turn({ text: 'hi' }));
    expect(await sessions.turn({ sessionId: 'nope', text: 'hi' })).toHaveProperty('error');
    now = 61 * 60_000;
    expect(await sessions.turn({ sessionId, text: 'hi' })).toHaveProperty('error');
  });

  it('describes exactly the tools the browser can run, all strict', () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
    for (const t of TOOLS) {
      expect(t.strict).toBe(true);
      expect(t.input_schema.additionalProperties).toBe(false);
      expect([...(t.input_schema.required ?? [])].sort()).toEqual(Object.keys(t.input_schema.properties ?? {}).sort());
    }
  });
});

describe('FloristSessions after a failure', () => {
  it('a failed model call on tool results can be retried with the same results', async () => {
    const first = useTool('t1');
    const replies: (Anthropic.Message | Error)[] = [first, new Error('overloaded'), say('Done')];
    const seen: Anthropic.MessageParam[][] = [];
    const sessions = new FloristSessions(async (m) => { seen.push(structuredClone(m)); const r = replies.shift()!; if (r instanceof Error) throw r; return r; });
    const { sessionId } = ok(await sessions.turn({ text: 'hi' }));
    const results = { sessionId, toolResults: [{ toolUseId: 't1', content: '{}', isError: false }] };
    await expect(sessions.turn(results)).rejects.toThrow('overloaded');
    expect(ok(await sessions.turn(results)).text).toBe('Done');
    expect(seen[2]).toEqual(seen[1]);
  });

  it('a failed or refused message is not kept, so the next one does not follow another user message', async () => {
    const replies: (Anthropic.Message | Error)[] = [new Error('down'), message([], 'refusal'), say('Hello')];
    const seen: Anthropic.MessageParam[][] = [];
    const sessions = new FloristSessions(async (m) => { seen.push(structuredClone(m)); const r = replies.shift()!; if (r instanceof Error) throw r; return r; });
    const r1 = ok(await sessions.turn({ text: 'hi' }).catch(() => sessions.turn({ text: 'hi' })));
    ok(await sessions.turn({ sessionId: r1.sessionId, text: 'roses' }));
    expect(seen.at(-1)).toEqual([{ role: 'user', content: 'roses' }]);
  });

  it('stops calling Claude once the daily limit is reached', async () => {
    let calls = 0;
    const sessions = new FloristSessions(async () => { calls++; return say('ok'); }, Date.now, 2);
    ok(await sessions.turn({ text: 'a' }));
    ok(await sessions.turn({ text: 'b' }));
    const third = ok(await sessions.turn({ text: 'c' }));
    expect(calls).toBe(2);
    expect(third.done).toBe(true);
    expect(third.text).toMatch(/busy/);
  });

  it('a refused first request does not leave an empty chat behind', async () => {
    const { sessions } = scripted();
    for (const bad of [{}, { text: '' }, { text: 'x'.repeat(1001) }, { toolResults: [] }]) {
      expect('error' in (await sessions.turn(bad as never))).toBe(true);
    }
    expect((sessions as any).sessions.size).toBe(0);
  });
});
