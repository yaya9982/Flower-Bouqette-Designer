import { describe, expect, it } from 'vitest';
import { handle, MODELS } from '../worker/index';
import { GeminiFlorist } from '../src/florist-gemini';

const SITE = 'https://yaya9982.github.io';
const env = { GEMINI_API_KEY: 'test-key' };

function req(body: unknown, origin = SITE, ip = '1.1.1.1'): Request {
  return new Request('https://w.example/', { method: 'POST', headers: { origin, 'cf-connecting-ip': ip }, body: JSON.stringify(body) });
}
const userSays = { contents: [{ role: 'user', parts: [{ text: 'roses please' }] }] };
const gemini = (status: number, body: object) => async () => new Response(JSON.stringify(body), { status });

describe('florist worker', () => {
  it('refuses other sites', async () => {
    const res = await handle(req(userSays, 'https://evil.example'), env, gemini(200, {}));
    expect(res.status).toBe(403);
  });

  it('adds the key, instructions and tools, and returns the model content', async () => {
    let sent: { url: string; init: RequestInit } | undefined;
    const content = { role: 'model', parts: [{ functionCall: { name: 'search_flowers', args: { query: 'rose', colour: '' } }, thoughtSignature: 'sig' }] };
    const res = await handle(req(userSays), env, async (url, init) => {
      sent = { url: String(url), init: init! };
      return new Response(JSON.stringify({ candidates: [{ content, finishReason: 'STOP' }] }));
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(SITE);
    expect(await res.json()).toEqual({ content, finishReason: 'STOP' });
    expect(sent!.url).toContain(`models/${MODELS[0]}:generateContent`);
    expect((sent!.init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(String(sent!.init.body));
    expect(body.systemInstruction.parts[0].text).toContain('florist');
    const decls = body.tools[0].functionDeclarations;
    expect(decls).toHaveLength(12);
    const add = decls.find((d: any) => d.name === 'add_flowers');
    expect(add.parameters.type).toBe('OBJECT');
    expect(add.parameters.properties.count.type).toBe('INTEGER');
    expect(add.parameters).not.toHaveProperty('additionalProperties');
    expect(decls.find((d: any) => d.name === 'get_design')).not.toHaveProperty('parameters');
  });

  it('tries the next model when one is out of quota', async () => {
    const urls: string[] = [];
    const res = await handle(req(userSays), env, async (url) => {
      urls.push(String(url));
      return urls.length === 1 ? new Response('{}', { status: 429 }) : new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'hi' }] } }] }));
    });
    expect(res.status).toBe(200);
    expect(urls[1]).toContain(MODELS[1]);
  });

  it('rejects malformed conversations', async () => {
    expect((await handle(req({ contents: [{ role: 'system', parts: [] }] }), env, gemini(200, {}))).status).toBe(400);
    expect((await handle(req({ contents: 'x' }), env, gemini(200, {}))).status).toBe(400);
  });

  it('only passes the parts the chat sends, with short customer messages', async () => {
    const ok = gemini(200, { candidates: [{ content: { role: 'model', parts: [{ text: 'hi' }] } }] });
    const image = { contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }] }] };
    const essay = { contents: [{ role: 'user', parts: [{ text: 'x'.repeat(2001) }] }] };
    expect((await handle(req(image), env, ok)).status).toBe(400);
    expect((await handle(req(essay), env, ok)).status).toBe(400);
  });

  it('caps calls per visitor per day', async () => {
    const ok = gemini(200, { candidates: [{ content: { role: 'model', parts: [{ text: 'hi' }] } }] });
    let last = 0;
    for (let i = 0; i < 151; i++) last = (await handle(req(userSays, SITE, '9.9.9.9'), env, ok, 5 * 86_400_000)).status;
    expect(last).toBe(429);
    expect((await handle(req(userSays, SITE, '8.8.8.8'), env, ok, 5 * 86_400_000)).status).toBe(200);
  });
});

describe('GeminiFlorist', () => {
  it('keeps the conversation, returns tool calls, and sends results back with the model parts unchanged', async () => {
    const bodies: any[] = [];
    const replies = [
      { content: { role: 'model', parts: [{ functionCall: { name: 'search_flowers', args: { query: 'rose' } }, thoughtSignature: 'sig' }] } },
      { content: { role: 'model', parts: [{ text: 'thinking', thought: true }, { text: 'Here you go!' }] } },
    ];
    const florist = new GeminiFlorist('https://w.example/', async (_u, init) => {
      bodies.push(JSON.parse(String(init!.body)));
      return new Response(JSON.stringify(replies[bodies.length - 1]));
    });
    const first = await florist.send({ text: 'roses' });
    expect(first.toolCalls).toEqual([{ id: expect.any(String), name: 'search_flowers', input: { query: 'rose' } }]);
    expect(first.done).toBe(false);
    const second = await florist.send({ sessionId: first.sessionId, toolResults: [{ toolUseId: first.toolCalls[0].id, content: '{"found":1}', isError: false }] });
    expect(second).toEqual({ sessionId: first.sessionId, text: 'Here you go!', toolCalls: [], done: true });
    expect(bodies[1].contents).toEqual([
      { role: 'user', parts: [{ text: 'roses' }] },
      replies[0].content,
      { role: 'user', parts: [{ functionResponse: { name: 'search_flowers', response: { found: 1 } } }] },
    ]);
  });

  it('drops a failed step so the conversation stays valid', async () => {
    let fail = true;
    const florist = new GeminiFlorist('https://w.example/', async (_u, init) => {
      if (fail) return new Response(JSON.stringify({ error: 'busy' }), { status: 429 });
      return new Response(JSON.stringify({ content: { role: 'model', parts: [{ text: JSON.parse(String(init!.body)).contents.length + ' turns' }] } }));
    });
    const first = await florist.send({ text: 'hi' }).catch((e) => e);
    expect(first.message).toBe('busy');
    fail = false;
    expect((await florist.send({ text: 'hi' })).text).toBe('1 turns');
  });
});
