# Flower Bouquet Designer

Design a bouquet in 3D, let an AI florist build it with you, and pay for it with PayPal. The florist who makes it sees the order on their own board.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/) (2026).

**Live demo (3D designer only):** https://yaya9982.github.io/Flower-Bouqette-Designer/

The live site is static, so checkout and the AI florist show an "unavailable" message there. Run the server (below) to use them.

## What it does

- **3D bouquet designer:** pick flowers and colours, a shape, paper and ribbon, and drag single flowers into place. You can start from 30 ready-made bouquets. Undo and redo work, and the design is saved in the browser.
- **Live price:** the price is worked out per stem plus wrapping and arranging, and updates as you design.
- **PayPal checkout:** PayPal, Pay Later and Venmo buttons (PayPal JS SDK v6), plus Pay Later messaging. Before paying, the customer picks a delivery date and writes a card message.
- **AI florist:** a chat over the 3D view, run by Claude with tool calls. Say "a $60 birthday bouquet in pinks" and it searches flowers, loads presets, and adds, swaps and recolours stems while you watch. Every change is one undo step. When you're happy, it shows you the pay buttons. The customer always pays; the AI never does.
- **Florist order board** (`/florist.html`): paid orders with a snapshot of the design, the stems to gather and the card message, plus a Dispatched button. It's protected by a key.

## How PayPal is used

- **Orders v2 REST API:** the server creates and captures orders. `PayPal-Request-Id` makes a retried capture safe, and if a capture's answer is lost the server checks the order again.
- **JS SDK v6:** `findEligibleMethods` decides which buttons show. Payment sessions use `presentationMode: 'auto'`.
- **The server is the only price authority.** It re-checks the bouquet and prices it itself, so neither the browser nor the AI can change what is charged.

## Run it locally

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
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | developer.paypal.com → Apps & Credentials → Sandbox |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API keys |
| `FLORIST_KEY` | any long random string; the order board asks for it |

To pay, log in to the PayPal popup with a sandbox **personal** account (developer.paypal.com → Testing Tools → Sandbox Accounts). Then open http://localhost:5173/florist.html and enter your `FLORIST_KEY` to see the order.

To run the built site from one process: `npm run build`, then `npm start` (serves `dist/` and the API on port 8787).

## Tests

```bash
npm test          # vitest
npm run build     # type-check and production build
```

## Tech

TypeScript, Vite, Babylon.js, Node (`node:http`, run with `tsx`), PayPal JS SDK v6 and Orders v2, and the Anthropic SDK (`claude-haiku-5-5`).

## Credits and license

Code: [MIT](LICENSE). The 3D flower models are by their Sketchfab authors under CC BY 4.0 (one under CC0). See [credits](public/credits.html).
