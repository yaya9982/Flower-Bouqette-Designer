# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Shoppers first: someone buying a bouquet for a person or occasion, building it in 3D, then paying. Hackathon judges (PayPal AI Hackathon on Devpost) are a second audience who click through the live demo, so the first impression and the checkout path must read as finished. Desktop browsers; below 1024px the page shows a "needs a larger screen" message.

## Product Purpose

A browser bouquet designer for a flower shop. The customer picks flowers and colours (colour wheel), a bouquet shape, paper, ribbon, bow and leaves, drags single flowers, starts from presets, or asks the AI florist to build one from a budget and an occasion. They see a live price, choose a delivery date, write a card message and pay with PayPal (sandbox). Success is a customer who understands what they will receive and completes checkout.

## Positioning

The customer designs the exact arrangement in 3D, with layouts held to compact real-bouquet proportions, and an AI florist that edits the same bouquet through tools rather than only chatting.

## Operating Context

3D view (Babylon.js) on the left, side panel of options and a checkout block on the right, a floating "Ask the florist" chat. Total price updates with every edit. The order board for the shop is a separate page (`florist.html`).

## Capabilities and Constraints

- Everything must keep working: 3D view and dragging, presets and "Explore more", undo/redo, the AI florist chat, delivery date, card message, PayPal checkout.
- `data-key` attributes and existing class names are used by `tools/steps` and tests; keep them.
- The PayPal buttons are drawn by PayPal; the page only makes room for them.
- A Content-Security-Policy allows only the site's own files and PayPal hosts, so fonts and images are system or self-hosted.
- Copy stays as written (for example "Ask the florist", "Explore more") unless the owner says otherwise.

## Brand Commitments

None fixed beyond the above. Current look: warm off-white, stem-green accent, serif headings. The owner has asked for a redesign of the look and layout.
