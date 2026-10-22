import type { Designer } from './designer';
import type { FloristTools, ToolResult } from './florist-tools';

interface ToolCall { id: string; name: string; input: unknown }
interface Reply { sessionId: string; text: string; toolCalls: ToolCall[]; done: boolean }

/** How long to wait between the florist's edits, so the customer sees each one land in 3D. */
const STEP_PAUSE_MS = 250;

const STEP_LABELS: Record<string, string> = {
  get_design: 'Looked at your bouquet', search_flowers: 'Searched the flowers', list_presets: 'Looked at the ready-made bouquets',
  load_preset: 'Started from a ready-made bouquet', add_flowers: 'Added flowers', remove_flowers: 'Removed flowers',
  recolour_flowers: 'Changed colours', swap_flowers: 'Swapped flowers', set_wrap: 'Changed the wrapping',
  set_shape: 'Changed the shape', rearrange: 'Tidied the arrangement', show_checkout: 'Ready to pay',
};

async function post(body: unknown): Promise<Reply> {
  const res = await fetch('/api/florist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `The shop answered ${res.status}.`);
  return json as Reply;
}

/**
 * The "Ask the florist" drawer over the 3D view. Claude (via the shop's server) decides what to do; each tool call it
 * makes runs here on the real design, one undo step each, and the result goes back to the server.
 */
export class FloristChat {
  private readonly toggle = document.createElement('button');
  private readonly drawer = document.createElement('div');
  private readonly log = document.createElement('div');
  private readonly input = document.createElement('input');
  private readonly sendButton = document.createElement('button');
  private readonly stopButton = document.createElement('button');
  private sessionId: string | undefined;
  private running = false;
  private stopped = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly tools: FloristTools,
    private readonly designer: Pick<Designer, 'applyEdit'>,
    private readonly onShowCheckout: () => void,
  ) {}

  mount(): void {
    this.toggle.type = 'button';
    this.toggle.className = 'florist-toggle';
    this.toggle.dataset.key = 'florist-open';
    this.toggle.textContent = 'Ask the florist';
    this.toggle.setAttribute('aria-expanded', 'false');
    this.toggle.addEventListener('click', () => this.setOpen(this.drawer.hidden === true));

    this.log.className = 'florist-log';
    this.log.setAttribute('role', 'log');
    this.log.setAttribute('aria-live', 'polite');
    this.say('florist', 'Hi! Tell me the occasion, the colours or flowers they love, and your budget, and I\'ll build the bouquet for you.');

    const form = document.createElement('form');
    form.className = 'florist-form';
    this.input.type = 'text';
    this.input.maxLength = 1000;
    this.input.placeholder = 'e.g. Anniversary, she loves peonies, about $80';
    this.input.setAttribute('aria-label', 'Message to the florist');
    this.input.dataset.key = 'florist-input';
    this.sendButton.type = 'submit';
    this.sendButton.textContent = 'Send';
    this.stopButton.type = 'button';
    this.stopButton.textContent = 'Stop';
    this.stopButton.hidden = true;
    this.stopButton.addEventListener('click', () => { this.stopped = true; });
    form.append(this.input, this.sendButton, this.stopButton);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = this.input.value.trim();
      if (text && !this.running) void this.send(text);
    });

    this.drawer.className = 'florist-drawer';
    this.drawer.hidden = true;
    this.drawer.append(this.log, form);
    this.root.replaceChildren(this.drawer, this.toggle);
  }

  private setOpen(open: boolean): void {
    this.drawer.hidden = !open;
    this.toggle.setAttribute('aria-expanded', String(open));
    this.toggle.textContent = open ? 'Close florist' : 'Ask the florist';
    if (open) this.input.focus();
  }

  private async send(text: string): Promise<void> {
    this.input.value = '';
    this.say('you', text);
    this.setRunning(true);
    try {
      let reply = await post({ sessionId: this.sessionId, text });
      this.sessionId = reply.sessionId;
      while (true) {
        if (reply.text) this.say('florist', reply.text);
        if (reply.done || reply.toolCalls.length === 0) break;
        const toolResults = [];
        for (const call of reply.toolCalls) {
          const result = this.runTool(call);
          toolResults.push({ toolUseId: call.id, content: JSON.stringify(result.result), isError: result.isError });
          await new Promise((r) => setTimeout(r, STEP_PAUSE_MS));
        }
        if (this.stopped) {
          // The server is still waiting for these results; a new chat is simpler than catching it up.
          this.sessionId = undefined;
          this.say('florist', 'Stopped. Undo takes back anything you don\'t want.');
          break;
        }
        reply = await post({ sessionId: this.sessionId, toolResults });
      }
    } catch (error) {
      this.sessionId = undefined;
      this.say('error', (error as Error).message);
    } finally {
      this.setRunning(false);
    }
  }

  /** Runs one tool on the design as one undo step (none if it changed nothing). */
  private runTool(call: ToolCall): ToolResult {
    let result!: ToolResult;
    this.designer.applyEdit((b) => {
      result = this.tools.run(b, call.name, call.input);
      return result.next;
    });
    const label = STEP_LABELS[call.name] ?? call.name;
    this.say('step', result.isError ? `${label}: ${String(result.result.error)}` : label);
    if (call.name === 'show_checkout' && !result.isError) this.onShowCheckout();
    return result;
  }

  private setRunning(running: boolean): void {
    this.running = running;
    this.stopped = false;
    this.input.disabled = running;
    this.sendButton.disabled = running;
    this.stopButton.hidden = !running;
    if (!running) this.input.focus();
  }

  private say(who: 'you' | 'florist' | 'step' | 'error', text: string): void {
    const line = document.createElement('p');
    line.className = `florist-${who}`;
    line.textContent = text;
    this.log.append(line);
    this.log.scrollTop = this.log.scrollHeight;
  }
}
