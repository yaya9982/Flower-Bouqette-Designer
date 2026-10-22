# PayPal Checkout + AI Florist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A customer can price and pay for the bouquet they design (PayPal, Pay Later, Venmo, sandbox), ask an AI florist to build or re-budget the bouquet in 3D, and every paid order shows up on a florist board.

**Architecture:**
- **Server.** A small Node server (`server/`, plain `node:http`, run with `tsx`) holds the PayPal secret and the Anthropic key. It prices every order itself from shared `src/pricing.ts`, keeps orders in a JSON file, and holds each AI conversation in memory.
- **Browser.** The browser keeps all 3D state. The AI's tool calls run in the browser against the existing `BouquetEditor`/`Designer`, and the browser posts the results back to the server, which calls Claude again.
- **Dev setup.** Vite proxies `/api` to the server in dev. In production the server also serves `dist/`.

**Tech Stack:** TypeScript, Vite 8, Babylon.js 9 (existing); PayPal JS SDK v6 (`@paypal/paypal-js/sdk-v6` loader), PayPal Orders v2 REST via `fetch`; `@anthropic-ai/sdk`; `tsx`; vitest.

**Spec:** `../paypal-hackathon/IDEAS.md` § "Recommendation → Core" (Foundation + Petal concierge + budget fitter + florist board), plus the user's request of 2026-10-22: "add the paypal checkout for flowers and AI florist as well". The standout features are out of scope.

## Research basis (3 agents, same brief, cross-checked 2026-10-22)

Each agent checked these against a primary source; ✅ means I also re-checked it myself.

- v6 script: `https://www.sandbox.paypal.com/web-sdk/v6/core`. Load it with `loadCoreSdkScript({ environment: "sandbox" })` from `@paypal/paypal-js/sdk-v6`. `environment`, not the client id, picks sandbox or live.
- `createInstance({ clientId, components, pageType: "checkout" })`. The **client id** is browser-safe; a client token is only needed for Fastlane.
- Components: `"paypal-payments"` gives `<paypal-button>`, `<paypal-pay-later-button>` and `createPayPalOneTimePaymentSession` / `createPayLaterOneTimePaymentSession`; `"venmo-payments"` gives `<venmo-button>` and `createVenmoOneTimePaymentSession`; `"paypal-messages"` gives the `<paypal-message>` element ✅ (the component name and the element name differ).
- The Pay Later button only renders after `productCode` is set from `getDetails("paylater")` ✅.
- Eligibility check: `findEligibleMethods({ currencyCode })` then `.isEligible("paypal"|"paylater"|"venmo")`.
- `session.start({ presentationMode: "auto" }, orderPromise)`, where `orderPromise` resolves to `{ orderId }`. **Do not await** order creation before `start()`, or the browser blocks the popup.
- Orders v2:
  - token: `POST {base}/v1/oauth2/token` (Basic auth, `grant_type=client_credentials`)
  - create: `POST {base}/v2/checkout/orders`
  - capture: `POST {base}/v2/checkout/orders/{id}/capture`
  - `item_total` must equal the sum of `unit_amount × quantity`, and `amount.value` must equal `item_total` (no tax or shipping here)
  - amounts are 2-decimal strings; quantity is a string matching `^[1-9][0-9]{0,9}$`
  - `custom_id` is at most 255 characters (older docs say 127); item `name` is cut off after 127
- Webhooks only reach public HTTPS on port 443, so they need a tunnel and can't be tested on localhost. The synchronous capture response is enough for the core flow, so **webhooks are out of scope** (see "Skipped").
- CSP: there is no page for v6. The v5 list (`*.paypal.com *.paypalobjects.com *.venmo.com`) is the starting point; adjust it from the console in Task 4. COOP must be `same-origin-allow-popups`.
- Babylon: `Tools.CreateScreenshotAsync(engine, camera, size, "image/png")` returns a data URL and needs no `preserveDrawingBuffer` ✅.
- Claude:
  - On Claude Opus 5.5, forcing a tool with `tool_choice` `any`/`tool` returns a 400. Use `auto` with `strict: true` tools.
  - Keep the history append-only and send the assistant `content` back unchanged; thinking blocks are bound to it.
  - `@paypal/agent-toolkit` is **not used**: it has no Anthropic adapter, and its `create_order` lets the model set amounts.
- ✅ **Every agent got this wrong for this repo:** Node's built-in type stripping cannot load `src/` (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX: parameter property`, e.g. `constructor(readonly catalog)`). The server runs with **`tsx`** instead of `node`.
- ✅ Vite 8 uses `build.rolldownOptions.input` for multi-page builds (`rollupOptions` is deprecated).

## Global Constraints

- Currency **USD**. Venmo and Pay Later are US-only and sandbox buyers are US accounts; every amount and quantity is a string, and money maths is in **integer cents**.
- The **server is the only price authority.** The browser sends the bouquet JSON; the server runs `BouquetEditor.validate()` and `priceBouquet()` and never reads a price from the client or from the model.
- The PayPal secret, Anthropic key and florist key live only in `.env`, which is git-ignored, with a committed `.env.example`. None of them appear in URLs or in the browser.
- New dependencies, and only these: `@paypal/paypal-js`, `@anthropic-ai/sdk` (runtime); `tsx`, `@types/node` (dev).
- Model `process.env.FLORIST_MODEL ?? "claude-haiku-5-5"`, `output_config: { effort: "high" }`, non-streaming (the user chose this on 2026-10-22). Use plain `client.messages.create`, with no fallbacks param: Haiku 5.5 has no server-side fallback, so a refusal ends the turn politely. `max_tokens: 8000` leaves room for thinking. `tool_choice` stays `auto`, and every tool is `strict: true` with `additionalProperties: false`.
- Keep the existing rule: an edit that changes nothing returns the same bouquet, so no undo step is recorded.
- One AI tool call = one undo step.
- Project rules (CLAUDE.md):
  - **No commits** unless the user asks; the commit steps of the skill template are left out.
  - Test in the user's Chrome (Claude in Chrome) at http://localhost:5173/, checking the 3D view front, side and back and reading the console.
  - `npm test` and `npx tsc --noEmit` must pass after every task.

## Review Focus

1. **Tampered checkout request** (prices, unknown flower ids, 41 stems, a huge snapshot): the server rejects it with 400 and never creates a PayPal order. Tests in Task 2.
2. **Double capture / refresh after paying:** a second capture of the same order returns the stored result and doesn't call PayPal again. Test in Task 2.
3. **The AI asks for things that don't exist** (unknown flower, colour the flower doesn't come in, count 500, removing below 1 stem): the tool returns `is_error` with a reason and the design is unchanged. Tests in Task 5.
4. **Forged or duplicate tool results / runaway loop** (wrong `tool_use_id`, results with nothing pending, more than 12 model calls for one message): the server refuses and stops. Tests in Task 6.
5. **The customer edits the design while the PayPal popup is open:** the order is for the design as it was when Pay was clicked, and the confirmation shows that snapshot. Covered by Task 4's manual check (the bouquet is captured when Pay is clicked, before `start()`).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/pricing.ts` (new) | `PRICES`, `priceBouquet(b, catalog) → Quote`, `formatCents`. Pure; shared by browser and server. |
| `src/designer.ts` (modify) | Add `applyEdit(change)` so an AI tool call is one undo step. |
| `src/florist-tools.ts` (new) | `FloristTools`: runs one tool call (name + input) against a `Bouquet` using `BouquetEditor` / `Presets`; returns `{ next, result }`. Pure; no DOM. |
| `src/checkout.ts` (new) | Loads the v6 SDK, renders the buttons and Pay Later message, creates and captures orders through `/api`, shows the confirmation. |
| `src/florist-chat.ts` (new) | Chat drawer UI plus the browser half of the agent loop (POST `/api/florist`, run tools, post results). |
| `src/panel.ts`, `src/main.ts`, `src/style.css` (modify) | Price row; mount points for checkout and chat; wiring. |
| `src/board.ts` + `florist.html` (new) | Florist board page: lists orders, shows the snapshot and stem list, Dispatched button. |
| `server/index.ts` (new) | `node:http` server: routes, JSON body limit, rate limit, static `dist/` in production, COOP header. |
| `server/paypal.ts` (new) | Token cache, `createOrder`, `captureOrder` (fetch). |
| `server/orders.ts` (new) | `OrderStore`: JSON file `server/data/orders.json` plus snapshot PNGs. |
| `server/florist.ts` (new) | Tool schemas, system prompt, `FloristSessions` (in-memory history), one call to Claude per turn. |
| `tests/pricing.test.ts`, `tests/florist-tools.test.ts`, `tests/server-orders.test.ts`, `tests/server-florist.test.ts` (new) | vitest. |
| `index.html`, `vite.config.ts`, `tsconfig.json`, `package.json`, `.gitignore`, `.env.example` (modify/new) | CSP, proxy, multi-page build, scripts, ignore rules. |

---

### Task 1: Pricing shared by browser and server, plus the live price in the panel

**Files:**
- Create: `src/pricing.ts`, `tests/pricing.test.ts`
- Modify: `src/panel.ts` (a price row at the top of the panel), `src/style.css`

**Interfaces:**
- Produces:
  - `interface QuoteLine { name: string; quantity: number; unitCents: number }`
  - `interface Quote { lines: QuoteLine[]; totalCents: number }`
  - `function priceBouquet(b: Bouquet, catalog: Catalog): Quote`
  - `function formatCents(cents: number): string`, which returns `"42.00"`

**Rules:**
- **Stems.** Each stem's price comes from its flower's `name`, using `STEM_CENTS: Record<string, number>`. Default `400`. Fixed values: Rose 450, Peony 900, Orchid 800, Lily 600, Hydrangea 700, Sunflower 500, Tulip 350, Carnation 300, Daisy 250, Gypsophila 200.
- **Lines.** Stems are grouped by flower name and colour into one line each. Line name: `` `${flower.name} (${colour.name})` ``, cut to 127 characters.
- **Wrap.** Price by `wrap.paper`, from `PAPER_CENTS = { none: 0, kraft: 300, tissue: 400, matte: 500 }`. It is added as the line `"Wrap: Kraft paper"` and similar, and only when the price is above 0.
- **Arrangement.** A fixed line `"Hand-tied arrangement"` at 800.
- **Line order.** Stems first, in order of first appearance; then the wrap line; then the arrangement line.

- [ ] **Step 1: Write the failing tests** (`tests/pricing.test.ts`, using `editor.createDefault()` and `Catalog(FLOWERS)` as in `tests/designer.test.ts`):
  - `priceBouquet(default)` gives a total equal to the sum of `unitCents × quantity` across the lines, and contains a line named `"Hand-tied arrangement"` with `unitCents: 800`.
  - 3 red roses plus 2 white roses give two rose lines (quantities 3 and 2, `unitCents` 450).
  - Paper `'none'` produces no wrap line.
  - `formatCents(4200) === "42.00"`, `formatCents(5) === "0.05"`.
  - A generated flower named "Peony" is priced at 900.
- [ ] **Step 2:** `npx vitest run tests/pricing.test.ts` FAILS (module not found).
- [ ] **Step 3:** Implement `src/pricing.ts`. Integer cents throughout; `formatCents` uses `(cents / 100).toFixed(2)` on an integer.
- [ ] **Step 4:** The test passes.
- [ ] **Step 5:** In `panel.ts`, show `Total $X.XX` with `data-key="price-total"` at the top. The panel computes it from `state.bouquet` using `priceBouquet`, so the `Panel` constructor needs the `Catalog`, which it already receives. Then `npm test`, `npx tsc --noEmit`, and check in Chrome: add a rose and the total rises by $4.50.

### Task 2: The server, with PayPal orders priced by the server

**Files:**
- Create: `server/index.ts`, `server/paypal.ts`, `server/orders.ts`, `tests/server-orders.test.ts`, `.env.example`
- Modify:
  - `package.json`: dependencies, scripts `"server": "tsx server/index.ts"` and `"dev": "vite"`. Run the server in a second terminal; Windows has no `&`.
  - `vite.config.ts`: `server.proxy['/api'] = 'http://localhost:8787'`, plus `server.headers` and `preview.headers` with `'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'`.
  - `tsconfig.json`: add `"server"` to `include` and `"node"` to `types`.
  - `.gitignore`: add `.env` and `server/data/`.

**Interfaces:**
- Consumes `priceBouquet`, `formatCents` (Task 1); `BouquetEditor.validate`.
- Produces:
  - `.env` keys: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV=sandbox`, `ANTHROPIC_API_KEY`, `FLORIST_KEY`, `PORT=8787`. `server/index.ts` calls `process.loadEnvFile()` when `.env` exists.
  - `class PayPalApi { constructor(env: { clientId; clientSecret; base }, fetchFn = fetch); createOrder(body: object): Promise<{ id: string }>; captureOrder(id: string): Promise<{ status: string; captureId: string | null }> }`. It caches the token until `expires_in − 60 s`.
  - `function buildOrderBody(quote: Quote, orderRef: string): object`, built exactly to the Orders v2 shape in "Research basis", with `custom_id: orderRef`.
  - `interface StoredOrder { ref: string; paypalOrderId: string; status: 'CREATED'|'PAID'|'DISPATCHED'; bouquet: Bouquet; quote: Quote; cardMessage: string; deliveryDate: string; createdAt: string; captureId: string | null }`
  - `class OrderStore { constructor(dir: string); create(o): StoredOrder; byPayPalId(id): StoredOrder | undefined; update(ref, patch): StoredOrder; list(): StoredOrder[]; saveSnapshot(ref, pngBase64): void; snapshotPath(ref): string }`. It writes `orders.json` and `snapshots/<ref>.png` with writeFileSync. ponytail: a single JSON file, rewritten on each change; move to SQLite if orders grow past a demo.
  - `function parseCheckout(body: unknown, editor: BouquetEditor): { bouquet; cardMessage; deliveryDate; snapshot } | string` (an error string on failure).
- **Routes:**
  - `GET /api/config` → `{ paypalClientId, currency: "USD" }`
  - `POST /api/orders` takes `{ bouquet, cardMessage, deliveryDate, snapshot }` and returns `{ orderId }`.
  - `POST /api/orders/:paypalId/capture` → `{ status, ref, totalCents }`
- **Limits:**
  - Request bodies over 3 MB are rejected with 413.
  - `cardMessage` is at most 300 characters.
  - `deliveryDate` matches `^\d{4}-\d{2}-\d{2}$`, is today or later, and is at most 60 days ahead.
  - `snapshot` starts with `data:image/png;base64,` and decodes to at most 2 MB.
  - The order ref is `"bq_" + randomUUID()`.

- [ ] **Step 1: Write the failing tests** (`tests/server-orders.test.ts`). The `PayPalApi` is given a fake `fetchFn` that records requests. Tests:
  - `buildOrderBody(priceBouquet(default))` gives `amount.value === breakdown.item_total.value === formatCents(total)`, every `quantity` matching `/^[1-9]\d*$/`, and `custom_id` starting with `bq_`.
  - `parseCheckout` returns an error string for each of: a bouquet with an unknown flower, 41 stems, a `price` field (ignored, so the result still validates and the price comes from the catalog), a 301-character message, a date in the past, and a snapshot without the PNG prefix.
  - `OrderStore` round-trips through a temp dir (`fs.mkdtempSync`).
  - **Capturing twice:** a second capture route call for a PAID order returns the stored status without a second `/capture` fetch. Write this as a test of the handler `captureHandler(store, api, paypalId)`, exported from `server/index.ts`.
- [ ] **Step 2:** The tests fail.
- [ ] **Step 3:** Implement `paypal.ts`, `orders.ts`, then `index.ts`:
  - a `switch` on method + path;
  - `readJson(req, limit)`;
  - per-IP limit of 60 requests a minute (ponytail: an in-memory map that resets every minute);
  - JSON errors `{ error }`.
  - PayPal base URL: `https://api-m.sandbox.paypal.com`, or `https://api-m.paypal.com` when `PAYPAL_ENV=live`.
- [ ] **Step 4:** Tests pass; `npx tsc --noEmit`.
- [ ] **Step 5:** With real sandbox keys in `.env`, run `npm run server`, then `curl -X POST localhost:8787/api/orders` with the default bouquet JSON. It returns an `orderId`, and the order shows in the sandbox dashboard (**developer.paypal.com → Sandbox → Event logs → API calls**).

### Task 3: AI tool calls become single undo steps

**Files:**
- Modify: `src/designer.ts`, `tests/designer.test.ts`

**Interfaces:**
- Produces: `Designer.applyEdit(change: (b: Bouquet) => Bouquet): void`. It runs `change(present)`, then calls the existing `apply`, which records one undo step, or none when the same bouquet comes back. It also clears the selection if the selected stem is gone (`refresh` already handles this) and keeps the camera as it is. `get present` stays private. The florist chat reads `designer.shown`.

- [ ] **Step 1: Failing tests:**
  - `applyEdit(b => editor.add(b,'rose'))`, then `undo()`, brings back the original stem count.
  - `applyEdit(b => b)` does not change `history.past.length`.
- [ ] **Step 2:** Fail. **Step 3:** Implement it, as a one-line method next to `rearrange`. **Step 4:** Pass.

### Task 4: PayPal checkout in the panel

**Files:**
- Create: `src/checkout.ts`
- Modify:
  - `src/panel.ts`: a `#checkout` section with fields for delivery date (`<input type="date">`, `min` = today) and card message (`<textarea maxlength="300">`), plus button mount points.
  - `src/main.ts`, `src/scene.ts`: add `BouquetView.snapshot(): Promise<string>` using `Tools.CreateScreenshotAsync(this.engine, this.rig.camera, { width: 800, height: 800 }, "image/png")`.
  - `index.html`: CSP (below).
  - `src/style.css`

**Interfaces:**
- Consumes the `/api/config`, `/api/orders` and capture routes (Task 2); `designer.shown`; `view.snapshot()`.
- Produces: `class Checkout { constructor(root: HTMLElement, getOrder: () => Promise<CheckoutRequest>); mount(): Promise<void> }`, where `CheckoutRequest = { bouquet; cardMessage; deliveryDate; snapshot }`.
- **CSP**, replacing the meta tag's policy:
  - `script-src 'self' https://*.paypal.com https://*.paypalobjects.com`
  - `connect-src 'self' data: blob: https://*.paypal.com https://*.paypalobjects.com`
  - `frame-src https://*.paypal.com https://*.venmo.com`
  - `img-src 'self' data: blob: https://*.paypal.com https://*.paypalobjects.com`
  - Keep the other directives. If the console shows CSP errors, add the exact hosts it reports, nothing wider.

- [ ] **Step 1:** In `checkout.ts`:
  1. Load the SDK with `loadCoreSdkScript({ environment: "sandbox" })`.
  2. Call `createInstance({ clientId, components: ["paypal-payments","venmo-payments","paypal-messages"], pageType: "checkout" })`.
  3. Run `findEligibleMethods({ currencyCode: "USD" })` and render only the eligible buttons. Set the Pay Later button's `productCode` from `getDetails("paylater")`.
  4. Add `<paypal-message>`, with `amount` updated on each panel render.
  5. On click, create the order promise synchronously, **without awaiting it**, from `getOrder()` → `POST /api/orders`, then call `session.start({ presentationMode: "auto" }, promise)`.
  6. In `onApprove`, POST capture and show "Paid — order bq_… for $X". In `onCancel`, show "Payment cancelled". In `onError`, show the message and keep the design.
- [ ] **Step 2:** `getOrder` takes `designer.shown` and `await view.snapshot()` at click time. That is Review Focus 5: the order is for the design as it was at the click.
- [ ] **Step 3:** If SDK load fails or `/api/config` fails, show "Checkout unavailable" and keep the designer working.
- [ ] **Step 4: Manual check in Chrome:**
  - Pay with a sandbox personal account. The confirmation appears, and the capture status is `COMPLETED` in the server log.
  - Cancel the popup and see the cancelled message.
  - Pay Later shows up, if eligible for the buyer country.
  - The console shows no CSP errors.
  - The 3D view still works from front, side and back.

### Task 5: The AI florist's tools (pure, in the browser)

**Files:**
- Create: `src/florist-tools.ts`, `tests/florist-tools.test.ts`

**Interfaces:**
- Consumes `BouquetEditor`, `Presets`, `Catalog`, `priceBouquet`.
- Produces:
  - `type ToolResult = { next: Bouquet; result: Record<string, unknown>; isError: boolean }`
  - `class FloristTools { constructor(editor, presets, catalog); run(b: Bouquet, name: string, input: unknown): ToolResult }`
  - `export const TOOL_NAMES` (the list below), which the server also imports.
  - **Every successful result includes `summary`** (the stems grouped as `{flower, colour, count}`, the shape, the wrap) and `totalCents`, so the model can work towards a budget.
- **Tools:**

  | Tool | Input | Behaviour |
  |---|---|---|
  | `get_design` | `{}` | Read only. |
  | `search_flowers` | `{ query: string, colour: string }` (empty string = any) | Up to 15 matches: `{flowerId, name, title, colours[], unitCents}`. Matches name or title case-insensitively, or a colour id. |
  | `list_presets` | `{}` | `{presetId, name, occasion}[]`. |
  | `load_preset` | `{ presetId }` | |
  | `add_flowers` | `{ flowerId, colourId, count }` | count 1–12. Calls `editor.add` repeatedly. |
  | `remove_flowers` | `{ flowerId, count }` | Calls `removeOneOfType` repeatedly. |
  | `recolour_flowers` | `{ flowerId, toColourId, count }` | Applies to the first `count` stems of that flower. |
  | `swap_flowers` | `{ fromFlowerId, toFlowerId, count }` | |
  | `set_wrap` | `{ paper, paperColour, ribbonColour }` | Empty string = keep. |
  | `set_shape` | `{ shape }` | |
  | `rearrange` | `{}` | |
  | `show_checkout` | `{}` | Returns `{ ok: true }`; the UI scrolls to the pay buttons. **No tool can pay.** |

- **Error rule:**
  - These return `isError: true` with `result: { error: "<reason>" }` and `next === b`: an unknown tool, an unknown id, a colour the flower doesn't come in, a count outside its range, or an edit the editor refused (it returned the same bouquet when a change was asked for, e.g. `add` at 40 stems).
  - If only some of the stems were added before hitting 40, `isError` stays false and the result includes `added: n`.

- [ ] **Step 1: Failing tests:**
  - `add_flowers rose red 3` adds 3 stems and raises `totalCents` by 1350.
  - `add_flowers` with `count: 500` gives `isError` and the same bouquet.
  - `recolour_flowers` to a colour the flower doesn't have gives `isError`.
  - `remove_flowers` that would go below 1 stem leaves at least 1 stem.
  - `load_preset` with an unknown id gives `isError`.
  - `search_flowers` with `{query:"peony", colour:""}` returns only peonies, at most 15.
  - An unknown tool name gives `isError`.
  - Every result has `summary` and `totalCents`.
- [ ] **Step 2:** Fail. **Step 3:** Implement it as a `switch` over the names. **Step 4:** Pass.

### Task 6: The florist endpoint on the server (Claude)

**Files:**
- Create: `server/florist.ts`, `tests/server-florist.test.ts`
- Modify: `server/index.ts` (route), `package.json` (`@anthropic-ai/sdk`)

**Interfaces:**
- Consumes `TOOL_NAMES` (Task 5).
- Produces:
  - `TOOLS: Anthropic.Tool[]`: the Task 5 table as JSON schemas, all `strict: true`, `additionalProperties: false`, every property required.
  - `SYSTEM`: the system prompt string (below).
  - `class FloristSessions { constructor(callModel: (messages: Anthropic.MessageParam[]) => Promise<Anthropic.Message>, now = Date.now); turn(req: FloristRequest): Promise<FloristReply | { error: string }> }`
  - `FloristRequest = { sessionId?: string; text?: string; toolResults?: { toolUseId: string; content: string; isError: boolean }[] }`
  - `FloristReply = { sessionId: string; text: string; toolCalls: { id: string; name: string; input: unknown }[]; done: boolean }`
- **Route:** `POST /api/florist`. In production, the real `callModel` calls `client.messages.create({ model, max_tokens: 8000, system: SYSTEM, tools: TOOLS, messages, output_config: { effort: "high" } })`.
- **Session rules** (sessions live in memory; ponytail: they are lost on restart, which is fine for a chat):
  - The server stores `response.content` exactly as returned and sends the browser only the text and `tool_use` blocks.
  - `toolResults` must exactly match the ids of the pending `tool_use` blocks. All are sent in one user message (`is_error` set on failures), and `content` is at most 8 KB each.
  - `text` is 1–1000 characters and is only allowed when nothing is pending.
  - At most 12 model calls per user `text`; then the server returns `done: true` with "Let's pause here — tell me what to change."
  - At most 30 user texts per session. Sessions expire after 60 minutes idle; at most 200 sessions, and the oldest is dropped.
  - `stop_reason === "refusal"`: reply "Sorry, I can't help with that one." and set `done: true`.
- **System prompt** (exact intent; the wording may be tightened):
  - You are the shop's florist. You build the bouquet in the customer's 3D designer with the tools.
  - Before choosing flowers, use `search_flowers`; never invent ids.
  - Prices come only from tool results (`totalCents`). When given a budget, keep the total at or under it, and say the final total.
  - Prefer starting from a preset when the occasion matches.
  - Keep replies to 1–3 short sentences.
  - When the customer is happy, call `show_checkout`. You cannot take payment; the customer pays with the PayPal button.

- [ ] **Step 1: Failing tests** (fake `callModel` returning scripted messages):
  - First `text` → a reply with one `toolCall`.
  - Correct `toolResults` → the next model call receives history `[user, assistant(content unchanged, including a thinking block), user(tool_result)]`. Use deep-equal on what the fake received.
  - Results with the wrong id → `{ error }`, and the model is not called.
  - `text` while results are pending → `{ error }`.
  - A 13th model call for one text → `done: true`, no call.
  - A refusal → `done: true`.
  - All `TOOLS` names equal `TOOL_NAMES`.
- [ ] **Step 2:** Fail. **Step 3:** Implement it. **Step 4:** Pass.
- [ ] **Step 5:** Live smoke test with a real key: `curl` `{ "text": "something cheerful under $40" }` returns `toolCalls`.

### Task 7: The florist chat drawer in the designer

**Files:**
- Create: `src/florist-chat.ts`
- Modify: `src/main.ts`, `src/panel.ts` (an "Ask the florist" button, `data-key="florist-open"`), `src/style.css`, `index.html` (`<aside id="florist">`)

**Interfaces:**
- Consumes `FloristTools` (Task 5), `Designer.applyEdit` (Task 3), `designer.shown`, the `/api/florist` contract (Task 6), and `Checkout` (Task 4, to scroll to it on `show_checkout`).
- Produces: `class FloristChat { constructor(root: HTMLElement, tools: FloristTools, designer: Designer, onShowCheckout: () => void); open(): void }`

- [ ] **Step 1: The loop.**
  1. Send `{ sessionId, text }`.
  2. For each returned `toolCall`, in order, run `designer.applyEdit(b => { const r = tools.run(b, name, input); last = r; return r.next; })` and collect `{ toolUseId, content: JSON.stringify(r.result), isError }`.
  3. Post them all together.
  4. Repeat until `done` or until no tool calls come back.
  5. Show the replies and a short line per tool ("Added 3 red roses"). Edits happen one at a time, so the 3D view updates as the florist works.
- [ ] **Step 2:** Disable the input while a turn is running. Show network or server errors in the drawer. Pressing Stop ends the loop on the client side by not posting the next results.
- [ ] **Step 3: Manual check in Chrome:**
  - "Anniversary, she loves peonies, about $80": the bouquet changes in 3D, the final total is ≤ $80 and matches the panel total, and the pay buttons come into view.
  - Then "make it $50": the total is ≤ $50.
  - Ctrl+Z undoes one florist step at a time.
  - No console errors.
  - Check the 3D view from front, side and back.

### Task 8: Florist board and production serving

**Files:**
- Create: `florist.html` (with the same CSP as `index.html` minus the PayPal hosts), `src/board.ts`
- Modify:
  - `server/index.ts`: routes below, plus static `dist/` serving when `NODE_ENV=production`.
  - `vite.config.ts`: `build.rolldownOptions.input = { main: 'index.html', florist: 'florist.html' }`.
  - `package.json`: `"start": "tsx server/index.ts"`. `NODE_ENV=production` is set in Render's environment settings, not in the script, because Windows shells don't accept `VAR=x cmd`.

**Interfaces:**
- **Routes**, all requiring header `X-Florist-Key` equal to `FLORIST_KEY` (compared with `crypto.timingSafeEqual`; returns 401 otherwise):
  - `GET /api/board/orders` → the `StoredOrder[]`, newest first, without snapshots.
  - `GET /api/board/orders/:ref/snapshot` → `image/png`.
  - `POST /api/board/orders/:ref/dispatch` → moves `PAID` to `DISPATCHED`. Any other status gives 409.
- **Board UI.**
  - A key input. The key is kept in `sessionStorage` (try/catch) and never put in a URL.
  - Every 5 s, the board fetches a list of cards for PAID and DISPATCHED orders. Each card shows:
    - the snapshot (fetched as a blob, shown via `URL.createObjectURL`)
    - the stem list (`quote.lines`)
    - the total, the delivery date and the card message
    - a Dispatched button
  - All text is set with `textContent`, never `innerHTML`, because the card message is customer input.
- **Static serving.** Only files under `dist/`; the resolved path must start with the `dist` directory, or the server returns 404. `Content-Type` comes from the file extension. HTML responses include the COOP header.

- [ ] **Step 1: Failing tests** (handlers exported from `server/index.ts`):
  - A wrong or missing key gives 401.
  - `dispatch` on a CREATED order gives 409; on PAID it gives DISPATCHED.
  - The static resolver returns `null` for `../.env` and `%2e%2e/.env`.
- [ ] **Step 2:** Fail. **Step 3:** Implement it. **Step 4:** Pass.
- [ ] **Step 5: Manual end-to-end check in Chrome.** Pay for a bouquet in tab 1. Within 5 s the order appears on `/florist.html` in tab 2 with the right snapshot and stems. Click Dispatched and the status changes. `npm run build`, then the production server (`$env:NODE_ENV="production"; npm start`) serves both pages, and checkout works there.

---

## Skipped (add when needed)

- **Webhooks** (`PAYMENT.CAPTURE.COMPLETED` with signature verification). They need a public HTTPS URL, so add them when the app is deployed on Render; the capture response already confirms payment.
- **Shipment tracking API, Bryntum schedule, AI-written build sheet.** Add if time is left in week 3.
- **Shipping address and delivery fee callbacks.** It's unverified whether v6 supports the callback.
- **Streaming the florist's replies.** The replies are short; add streaming if waiting for them feels slow.
- **Real accounts or auth for the florist board.** It uses a single shared key, which is enough for a demo.
