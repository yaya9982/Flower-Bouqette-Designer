/**
 * Soaks the live AI florist with random customer requests and judges every answer. It does what the browser's chat
 * drawer does, without a browser: the Worker and Gemini are called over HTTP, each tool Gemini asks for is run on a real
 * design in memory (src/florist-tools.ts), and the finished bouquet is judged by tests/soak/judge.ts (budget, quoted
 * total, compact and natural layout, and whether it did what was asked).
 *
 *   npx tsx tests/soak/florist-soak.ts [--runs 100] [--interval 120] [--seed 1] [--url <worker url>]
 *
 * One run starts every `interval` seconds. Each run is written as a line of JSON to shots/florist-soak/. It stops early
 * when the Worker keeps saying it is out of quota, since more requests would only be refused.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BouquetEditor, type Bouquet } from '../../src/bouquet';
import { Catalog, FLOWERS } from '../../src/catalog';
import { GeminiFlorist } from '../../src/florist-gemini';
import { FloristTools } from '../../src/florist-tools';
import { Presets } from '../../src/presets';
import { judge } from './judge';
import { randomPrompt, seeded, type Prompt } from './prompts';

const arg = (name: string, fallback: string) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : fallback;
};
const RUNS = Number(arg('runs', '100'));
const INTERVAL_S = Number(arg('interval', '120'));
const BASE_SEED = Number(arg('seed', '1'));
const WORKER_URL = arg('url', 'https://bouquet-florist.bouquet-designer.workers.dev');
/** The Worker only answers the shop's own pages. */
const ORIGIN = 'https://yaya9982.github.io';
const MAX_LIMITED_IN_A_ROW = 3;

const catalog = new Catalog(FLOWERS);
const editor = new BouquetEditor(catalog);
const tools = new FloristTools(editor, new Presets(editor), catalog);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const askWorker: typeof fetch = (input, init) =>
  fetch(input, { ...init, headers: { ...(init?.headers as Record<string, string>), origin: ORIGIN }, signal: AbortSignal.timeout(60_000) });

type Status = 'pass' | 'fail' | 'limited' | 'error';
interface Outcome {
  status: Status;
  requests: number;
  calls: string[];
  reply: string;
  final: Bouquet;
  error?: string;
}

/** One customer chat, the way FloristChat plays it: send the text, run the tools asked for, send the results back. */
async function chat(prompt: Prompt): Promise<Outcome> {
  const florist = new GeminiFlorist(WORKER_URL, askWorker);
  let bouquet = editor.createDefault();
  const calls: string[] = [];
  let requests = 0;
  const texts: string[] = [];
  try {
    let reply = await florist.send({ text: prompt.text });
    requests++;
    for (;;) {
      if (reply.text) texts.push(reply.text);
      if (reply.done || reply.toolCalls.length === 0) break;
      const toolResults = reply.toolCalls.map((call) => {
        const result = tools.run(bouquet, call.name, call.input);
        bouquet = result.next;
        calls.push(`${call.name}${result.isError ? '!' : ''}`);
        return { toolUseId: call.id, content: JSON.stringify(result.result), isError: result.isError };
      });
      reply = await florist.send({ sessionId: reply.sessionId, toolResults });
      requests++;
    }
    return { status: 'pass', requests, calls, reply: texts.at(-1) ?? '', final: bouquet };
  } catch (error) {
    const message = (error as Error).message;
    const limited = /chatted a lot|very busy/i.test(message);
    return { status: limited ? 'limited' : 'error', requests, calls, reply: texts.at(-1) ?? '', final: bouquet, error: message };
  }
}

// Run from the project folder: results go in shots/florist-soak/ (git-ignored).
const outDir = join(process.cwd(), 'shots', 'florist-soak');
mkdirSync(outDir, { recursive: true });
const file = join(outDir, `results-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);

const tally = { pass: 0, fail: 0, limited: 0, error: 0 };
const failureReasons = new Map<string, number>();
const warningReasons = new Map<string, number>();
const covered: number[] = [];
let totalRequests = 0;
let limitedInARow = 0;
const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);

console.log(`Florist soak: ${RUNS} runs, one every ${INTERVAL_S}s, against ${WORKER_URL}\nResults: ${file}`);
for (let i = 1; i <= RUNS; i++) {
  const began = Date.now();
  const seed = BASE_SEED + i;
  const prompt = randomPrompt(seeded(seed));
  const start = editor.createDefault();
  let outcome = await chat(prompt);
  if (outcome.status === 'error' && /unavailable|abort|timeout|fetch failed/i.test(outcome.error ?? '')) {
    await sleep(20_000); // a hiccup on Google's side: try the same request once more
    const retry = await chat(prompt);
    outcome = { ...retry, requests: outcome.requests + retry.requests };
  }
  totalRequests += outcome.requests;

  let failures: string[] = [];
  let warnings: string[] = [];
  let metrics: object | null = null;
  let status: Status = outcome.status;
  if (outcome.status === 'pass') {
    const verdict = judge({ prompt, start, final: outcome.final, reply: outcome.reply, catalog });
    ({ failures, warnings } = verdict);
    metrics = verdict.metrics;
    covered.push(verdict.metrics.covered);
    status = failures.length ? 'fail' : 'pass';
    for (const f of failures) bump(failureReasons, f.replace(/[$\d.]+/g, '#'));
    for (const w of warnings) bump(warningReasons, w.replace(/[$\d.]+/g, '#'));
  } else if (outcome.status === 'error') {
    failures = [`error: ${outcome.error}`];
    bump(failureReasons, `error: ${outcome.error}`);
  }
  tally[status]++;
  limitedInARow = status === 'limited' ? limitedInARow + 1 : 0;

  appendFileSync(file, JSON.stringify({ i, seed, at: new Date().toISOString(), status, prompt, requests: outcome.requests, calls: outcome.calls, reply: outcome.reply, failures, warnings, metrics, error: outcome.error }) + '\n');
  const m = metrics as { totalCents: number; stems: number; shape: string; covered: number } | null;
  console.log(
    `#${String(i).padStart(3)} ${status.toUpperCase().padEnd(7)} req ${outcome.requests}` +
      (m ? ` | $${(m.totalCents / 100).toFixed(2)} ${m.stems} stems ${m.shape} covered ${Math.round(m.covered * 100)}%` : '') +
      ` | "${prompt.text.slice(0, 70)}"` + (failures.length ? ` | FAIL: ${failures.join('; ')}` : '') + (warnings.length ? ` | warn: ${warnings.join('; ')}` : '') +
      (status === 'limited' ? ` | ${outcome.error}` : ''),
  );

  if (limitedInARow >= MAX_LIMITED_IN_A_ROW) {
    console.log(`Stopping: the Worker has refused ${MAX_LIMITED_IN_A_ROW} runs in a row (${outcome.error}).`);
    break;
  }
  if (i < RUNS) await sleep(Math.max(0, INTERVAL_S * 1000 - (Date.now() - began)));
}

const judged = tally.pass + tally.fail;
console.log(`\nDone. pass ${tally.pass}, fail ${tally.fail}, error ${tally.error}, refused by quota ${tally.limited}; ${totalRequests} Gemini requests.`);
if (judged) console.log(`Pass rate of judged runs: ${Math.round((100 * tally.pass) / judged)}%. Coverage of the bouquet's face: min ${Math.round(Math.min(...covered) * 100)}%, median ${Math.round([...covered].sort((a, b) => a - b)[covered.length >> 1] * 100)}%.`);
for (const [label, map] of [['Failures', failureReasons], ['Warnings', warningReasons]] as const) {
  if (map.size) console.log(`${label}:\n${[...map].sort((a, b) => b[1] - a[1]).map(([k, n]) => `  ${n}x ${k}`).join('\n')}`);
}
