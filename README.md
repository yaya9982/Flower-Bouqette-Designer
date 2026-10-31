# Flower Bouquet Designer

Design a bouquet in 3D, let an AI florist build it with you, and pay for it with PayPal. The florist who makes it sees the order on their own board.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/) (2026). Open source under the [MIT licence](LICENSE).

**Live demo:** https://yaya9982.github.io/Flower-Bouqette-Designer/ (the 3D designer and the AI florist; PayPal checkout needs the server, see [Run it locally](#run-it-locally-full-demo-with-paypal-checkout)).

## What it does

- **3D bouquet designer:** pick from 206 flowers with a colour wheel (hover a flower to see a picture of it), choose a shape (round, cascading, loose, one-sided), paper (kraft, matte, tissue, with real paper textures), ribbon colour, bow and a few leaves left on the stems, and drag single flowers into place. Start from 30 researched ready-made bouquets. Undo and redo work, and the design is saved in the browser. Every layout is kept compact like a real bouquet: tests hold all presets and random AI sessions to it. Flowers have physics: drag one through the bouquet, or change its height, and the others shift out of its way and spring back.
- **Live price:** worked out per stem plus wrapping and arranging, and updated as you design.
- **AI florist:** a chat over the 3D view, run by an AI with tool calls. Say "a $60 birthday bouquet in pinks" and it searches flowers, loads presets, and adds, swaps and recolours stems while you watch. Every change is one undo step. When you're happy, it shows you the pay buttons. **The customer always pays; the AI never does.**
- **PayPal checkout:** PayPal, Pay Later and Venmo buttons (PayPal JS SDK v6), plus Pay Later messaging. Before paying, the customer picks a delivery date and writes a card message.
- **Florist order board** (`/florist.html`): paid orders with a snapshot of the design, the stems to gather and the card message, plus a Dispatched button. It is protected by a key.

## AI tools used, and how

| Tool | Used for |
|---|---|
| **Claude** (`claude-haiku-5-5`, Anthropic SDK, high effort) | The AI florist when the Node shop server is running: a tool-using agent with 13 tools. |
| **Gemini** (`gemini-3.5-flash-lite`, falling back to `gemini-3.1-flash-lite`) through a free **Cloudflare Worker** (`worker/`) | The same florist on the static GitHub Pages site. The Worker holds the Gemini key, so it never reaches the browser; it only answers requests from the site's own pages (and localhost, for development). |
| **Channel3** (`server/extras.ts`) | Live product search for the florist's 13th tool, `suggest_extras`: a real vase, chocolates, a card or a plant shown as cards with retailer links. They are bought at the retailer and never join the PayPal order. |
| **Claude Code** | Used to build and test this project. |

How the florist works: the model never touches the 3D scene or the price. It can only ask for one of 13 tools (search flowers, add, remove, recolour, swap, set wrap, set shape, load a preset, rearrange, show the checkout, suggest gift extras). The browser runs each tool on the real design with the same editor the panel uses, so every AI edit is a normal edit: visible as it happens, one undo step, and always a valid bouquet. If a design ends up loose, the tool layer arranges it again. The model's instructions and the tool list live in `server/florist.ts` (shared by both backends).

## How PayPal is used

- **Orders v2 REST API:** the server creates and captures orders. `PayPal-Request-Id` makes a retried capture safe, and if a capture's answer is lost the server checks the order again.
- **JS SDK v6:** `findEligibleMethods` decides which buttons show (PayPal, Pay Later, Venmo). Payment sessions use `presentationMode: 'auto'`.
- **The server is the only price authority.** It re-checks the bouquet and prices it itself, so neither the browser nor the AI can change what is charged.
- Sandbox only (`PAYPAL_ENV=sandbox`).

## Built during the hackathon

This is a new project, started on **11 October 2026**, inside the submission period (1 October to 12 November 2026). Everything here, the 3D designer, the AI florist, the PayPal checkout, the order board and the Cloudflare Worker, was built during it.

## Run it locally (full demo with PayPal checkout)

Needs Node 24.

```bash
npm install
cp .env.example .env    # then fill it in, see below
npm run server          # API on http://localhost:8787
npm run dev             # site on http://localhost:5173
```

`.env`:

| Key | Where to get it |
|---|---|
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | developer.paypal.com > Apps & Credentials > **Sandbox** |
| `FLORIST_KEY` | any long random string; the order board asks for it |
| `CHANNEL3_API_KEY` | optional, for gift extras: trychannel3.com/developers. The Worker has its own copy: `npx wrangler secret put CHANNEL3_API_KEY -c worker/wrangler.toml` |
| `ANTHROPIC_API_KEY` | console.anthropic.com > API keys (only for the Claude florist) |
| `VITE_FLORIST_URL` | **no Anthropic key?** Set this to `https://bouquet-florist.bouquet-designer.workers.dev` and the florist uses the free Gemini Worker instead |

To pay, log in to the PayPal popup with a sandbox **personal** (buyer) account: create one free at developer.paypal.com > Testing Tools > Sandbox Accounts. Sandbox accounts hold fake money. Then open http://localhost:5173/florist.html, enter your `FLORIST_KEY`, and the order appears on the board.

To run the built site from one process: `npm run build`, then `npm start` (serves `dist/` and the API on port 8787).

Without the server you still get the 3D designer and (with the Worker) the AI florist; the pay area says checkout is unavailable.

## Tests

```bash
npm test          # unit tests (vitest)
npm run build     # type-check and production build
```

The tests cover editing, undo and validation; placement maths; compact layouts for every preset and for random AI sessions; pricing; the AI tools; the server's order, capture and florist routes with PayPal and the models faked; the Worker; and the 3D view on a headless engine. `tests/soak/florist-soak.ts` drives the live florist with random customer requests and judges each answer (budget, quoted total, compact layout, did it do what was asked): `npx tsx tests/soak/florist-soak.ts --runs 10 --interval 60`.

## Tech

TypeScript (strict), Vite, Babylon.js, Node (`node:http`, run with `tsx`), PayPal JS SDK v6 and Orders v2, the Anthropic SDK, Gemini through a Cloudflare Worker, Channel3 product search, and Python tools (`tools/`) that prepare the 3D models.

## Credits and license

Code: [MIT](LICENSE). The 3D flower, bow, stem, leaf and paper-texture models are by their Sketchfab authors under CC BY 4.0 (one under CC0). See [credits](public/credits.html).
