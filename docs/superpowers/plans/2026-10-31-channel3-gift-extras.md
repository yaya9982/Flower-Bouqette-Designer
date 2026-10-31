# Channel3 Gift Extras Plan

**Goal:** the AI florist can suggest a real vase, chocolates, a card or a plant, found with a live Channel3 search and shown as cards with a "buy at the retailer" link.

**Research (checked 2026-10-31):** `POST https://api.trychannel3.com/v1/search` with `x-api-key`, body `{ query, limit, filters: { price: { max_price }, availability: ["InStock"] } }`. Without a key it answers 403. Prices and buy links are on `offers`. A real sample from Channel3's keyless MCP search showed images only on `cdn.trychannel3.com`, buy links on `buy.trychannel3.com`, and offer prices as `{ price, currency }`, while the docs show `{ amount, currency }`: accept both. Docs: do not cache prices, offers or links.

## Rules

- Extras never join the PayPal order or the bouquet total; the server stays the only price authority.
- The key stays on the Worker or the server. Nothing from Channel3 is stored.
- A search only runs for four gift kinds, so the Worker is not an open shopping proxy. Same site allow-list and per-IP cap as the florist.
- A Channel3 failure never breaks the chat: the florist reads the error and carries on.
- Customer-facing text uses `textContent`; a buy link must be `https:`.

## Steps

1. `server/extras.ts` (no Node imports, so the Worker can use it): `EXTRA_KINDS`, `parseExtrasRequest(body)`, `extrasFromSearch(json)`, `searchExtras(request, key, fetchFn)`.
   Test: request limits, both price shapes, out-of-stock and non-https offers dropped, missing images tolerated, request body sent.
2. Routes: Worker `POST /extras`, server `POST /api/extras`, both 503 without a key, both rate limited.
   Test: wrong site refused, no key, oversized input, the florist's root path still works.
3. Tool `suggest_extras` (13th tool) in `TOOLS`, `TOOL_NAMES` and `SYSTEM`. The browser cannot run it inside the synchronous `FloristTools.run`, so `FloristChat` handles it directly and it makes no undo step.
4. `src/extras.ts`: `findExtras()` picks the Worker or the server, and `extrasCards()` draws the "Finish the gift" cards in the chat. Add `https://cdn.trychannel3.com` to `img-src` in `index.html`.
5. `.env.example`, `worker/wrangler.toml`, README.
6. Test: `npm test`, `npm run build`, then Chrome against a scratch backend that scripts the florist and serves real products from the keyless MCP search: cards render, images pass the CSP, the link is safe, the bouquet total does not change, Undo is unaffected, a failing search leaves the chat usable, long titles and an empty result look right.
7. Commit on its own.

## Needs the user

Create a Channel3 key (promo code `PAYPAL-HACKATHON-2026`), then `npx wrangler secret put CHANNEL3_API_KEY -c worker/wrangler.toml`, `npx wrangler deploy -c worker/wrangler.toml`, and add it to Render. Until then the florist says extras are unavailable.
