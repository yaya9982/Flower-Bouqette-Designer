# Bouquet Designer

A browser app where a flower-shop customer builds a bouquet in 3D: picks flowers and colours (colour wheel), a shape,
paper and ribbon, moves single flowers, and starts from presets. TypeScript + Vite + Babylon.js; Python tools prepare
the 3D models.

## Working rules (important)

- **Plans first when asked.** If the user asks for a plan, write it and wait for an explicit go-ahead before doing
  anything. Do not start executing in the same reply.
- **Testing: always assume Claude in Chrome is open.** Test changes in the user's Chrome with the Claude in Chrome
  tools against the dev server at http://localhost:5173/ (start it with `npm run dev` if it is not running). Check the
  3D view from the front, side and back by dragging the canvas, and read the console for errors. If the extension does
  not answer, say so and ask the user to reconnect it; only fall back to `npm run shot` if the user agrees.
  Coordinate clicks right after a page load are sometimes lost by the extension; click by element reference, or click
  again, before concluding the app is broken.
- **Research: always run 3 subagents on the same research question**, in parallel, with the same brief. Then compare
  their findings yourself: merge what they agree on, and for every disagreement, confusion or claim only one agent
  makes, check it yourself (search, open the source) before using it. Report which findings are verified and which
  are not. Never present an agent's guess as a fact.
- Do not commit unless the user asks.

## Commands

- `npm run dev`: dev server on http://localhost:5173/
- `npm test`: vitest (unit tests in `tests/`)
- `npx tsc --noEmit`: type-check
- `npm run build`: type-check and production build into `dist/`
- `npm run shot -- shots/<name>.png tools/steps/<step>.mjs`: headless Chrome check (playwright-core) against the dev
  server; prints `ok` or the console/page errors. Steps use `window.__debug`, which exists only in dev builds.
- `python tools/test_safety.py` (run from `tools/`): checks the tools refuse hostile zips, GLBs and links.
- `python tools/prepare_parts.py [part ...]`: prepares the bows, stem and rose leaf from `flowers_sources/sketchfab/parts/` into
  `public/models/parts/`. Their credits are listed by hand in `public/credits.html`; keep them in step with `PARTS`.
- `python tools/prepare_paper.py`: the paper textures (`public/textures/paper/`) cut from the models in
  `flowers_sources/sketchfab/paper/`. Their credits are listed by hand in `public/credits.html`; keep them in step with `PAPERS`.
- `node tools/record-demos.mjs [bouquet|actions|shape|selected]` (dev server running, ffmpeg on the PATH): films the demo clips the panel's "?" buttons play
  (`public/demos/*.mp4`, three scenes each on different bouquets; blue arrow cursor moving at Fitts'-law pace; texts in `src/help.ts`). Re-film them after changing the panel's look.
- `python tools/thumbnails.py` (run from `tools/`): the flower pictures shown when hovering a row of "Add flowers"
  (`public/thumbs/<id>.webp`). Run it after `prepare_models.py`.

## Layout

- `src/bouquet.ts`: the bouquet data, edits, undo history, validation of saved data, save/load (localStorage).
  Edits return the same object when nothing changed, which is how "no undo step" works; keep that.
- `src/arrange.ts`: placement maths (stem angle, distance, height, tilt to 3D pose; auto-arrange, with a `variant` for the Re-arrange button; gaps).
- `src/catalog.ts`: the six recolourable flowers, colour families, paper and ribbon colours.
  `src/catalog.generated.ts` is written by `tools/prepare_models.py`; do not edit it by hand.
- `src/presets.ts`: the 30 preset bouquets (3 featured buttons + the rest behind "Explore more"). Each lists its sources and
  evidence. Groups place flowers by view angle (0 = front, 90 = right), distance 0-1, height and tilt.
  `RANDOM_OPENS_LIST` in `src/panel.ts` makes "Explore more" open a list for testing; set it to false for a real random pick.
- `src/scene.ts`, `src/wrap.ts`: Babylon scene, model loading, picking and dragging, paper, ribbon and bow.
- `src/greenery.ts`: which flower stems keep a leaf ("Leaves on the stems": none, few, more) and where it grows: a pure function of the stem ids and poses, so the same bouquet always gets the same leaves. The leaf is drawn by `FlowerFactory` in `src/flowers.ts` as part of the stem, so it is rebuilt and disposed with its flower. The numbers come from `flowers_sources/leaf_references/NOTES.md`.
- `src/panel.ts`, `src/main.ts`: the side panel (data-key attributes are used by `tools/steps`) and the wiring.
  `src/preview-hit.ts`: `rowAt`, which row of the "Add flowers" list the pointer belongs to (the whole list is the hover area, so gaps and edges still show a picture).
- `tests/`: unit tests, including a check that preset flower heads do not sit inside each other.
- `flowers_sources/`: original downloads (not loaded by the app, about 1.2 GB, untracked).
  - `sketchfab/<colour>/` + `manifest.json`: downloaded models.
  - `preset_references/<preset-id>/`: reference photos for each preset with a `sources.txt`. The photos belong to
    their florists and photographers: reference only, git-ignored, never commit or publish them.
  - `leaf_references/<flower>/`: photos of how leaves sit on cut stems, with a `sources.txt` each, and `NOTES.md` (what they
    show and the compare-and-fix log). Same rules: reference only, git-ignored.
- `public/models/`: the prepared head-only models the app loads. `public/credits.html`: model credits
  (generated part between the `generated models` markers).

## Adding flower models

1. Download from Sketchfab (only the list in `docs/flower-models-by-colour.json`; never log in or create accounts).
   Sketchfab rate-limits downloads after about 45 in 20 minutes; go slowly (a minute or more apart).
2. `python tools/organise_downloads.py` moves them into `flowers_sources/sketchfab/<colour>/` and updates the manifest.
3. `python tools/prepare_models.py auto` prepares them and rewrites the catalogue and credits.
4. `python tools/contact_sheet.py` (from `tools/`) draws every model to check the cuts; fix bad ones in
   `AUTO_OVERRIDES` in `prepare_models.py`.

Pruned and renamed 2026-10-28: 31 less realistic duplicates are `skip` in `AUTO_OVERRIDES`; names and titles were then set by hand in
`src/catalog.generated.ts` (and the name in `public/credits.html`), so re-running `prepare_models.py auto` would bring the old
names back. `stemCents` prices a specific name ("Red rose") as the kind in it ("Rose").

## Security notes

- `index.html` and `public/credits.html` carry a Content-Security-Policy; Babylon needs `blob:`/`data:` images.
- Credit links must be Sketchfab model pages and are escaped when `credits.html` is generated.
- Downloaded zips and GLBs are untrusted: the tools cap sizes and nesting; keep it that way.
