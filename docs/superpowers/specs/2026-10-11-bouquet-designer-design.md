# Bouquet Designer: Design Spec

Date: 2026-10-11
Status: awaiting review

## 1. Purpose

A website for a real flower shop where a customer builds a bouquet and sees it in 3D before buying. The customer chooses flowers, colours, a bouquet shape and wrapping, adjusts individual flowers, and views the result from any angle.

Success means a first-time customer with no 3D experience can build a bouquet that looks natural, change anything about it, and spin it around smoothly on an ordinary laptop.

## 2. Scope

### In the first version

- Desktop browsers only (mouse, large screen).
- A large 3D view: drag empty space to spin, scroll to zoom, a "reset view" button.
- One side panel on the right. No handles, gizmos or toolbars in the 3D view.
- Choose flower types and quantities; the program arranges them automatically.
- Click a flower to highlight it. The panel then shows its controls: colour, height, tilt, swap for another type, remove.
- Drag the highlighted flower to slide it around the bouquet.
- Four shape presets: round, cascading, loose hand-tied, one-sided.
- Wrapping paper (style and colour) and ribbon (colour), shown in 3D.
- Colours limited to those each flower really comes in, as listed in the catalogue.
- 6-8 flower types, defined in one catalogue file.
- Undo and redo, autosave in the browser, a "re-arrange" button.

### Not in the first version

- Ordering, quote requests, payment, prices on screen.
- Greenery and fillers.
- Phones and tablets.
- Accounts, a server, a database, an admin screen.
- Automatic nudging apart of flowers that the customer drags onto each other.

The catalogue has an optional price field and the bouquet is plain data, so an order or quote step can be added later without reworking the designer.

## 3. Stack

| Part | Choice |
|---|---|
| 3D engine | Babylon.js 9.30 (`@babylonjs/core`, `@babylonjs/loaders`) |
| Language | TypeScript |
| Build tool | Vite |
| Tests | Vitest |
| UI | Plain HTML and CSS, no UI framework |
| Hosting | Static files, any host |

Babylon API names must be checked against the installed version's type definitions while building, not written from memory.

## 4. Data model

The bouquet object is the single source of truth. The 3D scene and the side panel are both drawn from it and never hold their own copy of the design.

```ts
type ShapeId = 'round' | 'cascade' | 'loose' | 'onesided';

interface Stem {
  id: string;        // unique within the bouquet
  flower: string;    // catalogue id, e.g. 'rose'
  colour: string;    // colour id valid for that flower, e.g. 'red'
  angle: number;     // position around the bouquet, radians, 0 to 2π
  dist: number;      // distance from the centre, 0 (centre) to 1 (rim)
  height: number;    // offset along the stem, -1 to 1, default 0
  tilt: number;      // extra lean away from the centre, radians, -0.5 to 0.5, default 0
}

interface Wrap {
  paper: 'none' | 'kraft' | 'matte' | 'tissue';
  paperColour: string;   // id from the wrap colour list
  ribbonColour: string;  // id from the ribbon colour list
}

interface Bouquet {
  version: 1;
  shape: ShapeId;
  wrap: Wrap;
  stems: Stem[];
}
```

```ts
interface FlowerColour { id: string; name: string; hex: string; }

interface FlowerType {
  id: string;
  name: string;
  model: string | null;    // path under public/models, null means placeholder
  petalMaterial?: string;  // name of the material to tint; absent means not tintable
  modelScale?: number;     // scale so the model's head matches headDiameter, default 1
  modelHeadY?: number;     // height of the head centre in the model's own units, default 0
  headDiameter: number;    // metres
  stemLength: number;      // metres
  colours: FlowerColour[]; // real-world colours only; at least one
  price?: number;          // unused in the first version
  credit?: { author: string; licence: string; url: string };
}
```

Limits: 1 to 40 stems per bouquet.

## 5. Arrangement

All arrangement logic is pure functions in `arrange.ts` with no 3D engine dependency, so it can be tested directly.

- **Surface position to 3D.** Each shape preset is a function from `(angle, dist)` to a head position and a stem direction. All stems meet at one binding point, where the ribbon sits. `height` moves the head along its stem; `tilt` adds lean.
  - Round: an even dome.
  - Cascading: a dome whose front edge drops below the binding point.
  - Loose hand-tied: a flatter, wider dome with more height variation.
  - One-sided: heads fill the front half only, rising towards the back.
- **Bouquet size.** The dome radius grows with the total head area of the stems, so heads sit close without overlapping.
- **Auto-arrange.** Stems are placed on a golden-angle spiral, which spaces them evenly. Flower types are interleaved so each type is spread across the bouquet. A small variation in height and position, seeded from the stem id, makes it look natural and gives the same result every time for the same input.
- **Adding a flower** places it in the largest gap and leaves the others where they are.
- **Removing a flower** leaves the others where they are.
- **Re-arrange** runs auto-arrange over every stem and resets height and tilt.
- **Switching shape** keeps each stem's `angle`, `dist`, `height` and `tilt`, so hand adjustments survive.

## 6. 3D view

- **Camera:** Babylon's orbit camera, aimed at the bouquet centre, with zoom limits and a floor limit so it cannot go underneath.
- **Lighting:** a studio lighting environment, self-hosted and free to use, plus a soft ground shadow.
- **Models:** each model file is loaded once and instanced per stem. Tinted petal materials are created once per flower-and-colour pair and reused.
- **Placeholders:** a flower with `model: null`, or whose model fails to load, is drawn as a simple stand-in built from basic shapes (stem, head, petals) in the right size and colour.
- **Selection:** clicking a flower selects it and outlines it with Babylon's highlight layer. Clicking empty space clears the selection.
- **Dragging:** pressing on the selected flower and moving starts a drag. The mouse position is projected onto an invisible mesh matching the current bouquet surface, converted back to `(angle, dist)`, and written to the stem. The camera does not move during a drag. A press that moves less than a few pixels counts as a click.
- **Wrapping:** paper is a generated open cone that flares around the stems and scales with the bouquet radius; `tissue` is semi-transparent. The ribbon is a generated band and bow at the binding point. With `paper: 'none'` the stems and ribbon show.

## 7. Side panel

From top to bottom:

1. **Your bouquet:** one row per flower type in the catalogue with its quantity (0 if not in the bouquet) and plus and minus buttons, and a count of flowers out of 40.
2. **Shape:** the four presets.
3. **Wrapping:** paper style, paper colour swatches, ribbon colour swatches.
4. **Selected flower** (only when one is selected): colour swatches for that flower, height slider, tilt slider, swap picker, remove button.
5. **Actions:** undo, redo, re-arrange, reset view.

Swapping a flower's type keeps its position; its colour becomes the first colour of the new type.

Below a minimum window width the page shows a notice asking the customer to open it on a computer.

## 8. State, undo and saving

- Every change produces a new bouquet object through functions in `bouquet.ts` (add, remove, swap, recolour, move, set shape, set wrap, re-arrange).
- Undo and redo keep a stack of bouquet snapshots, capped at 100. A drag or a slider movement counts as one step, recorded when the mouse is released. Ctrl+Z and Ctrl+Y work as shortcuts.
- The bouquet is saved to the browser's local storage after each change and restored on load.
- Saved data is validated before use: correct version, known flower and colour ids, numbers within range, stem count within limits. Invalid data is discarded and the default bouquet is loaded.

## 9. Files

```
bouquet-designer/
  index.html
  src/
    main.ts       wires state, scene and panel together
    catalog.ts    flower types, wrap and ribbon colours (the data file)
    bouquet.ts    types, change functions, validation, undo history, saving
    arrange.ts    shape formulas, auto-arrange, surface/3D conversion
    scene.ts      camera, lighting, models, placeholders, selection, dragging
    wrap.ts       paper and ribbon meshes
    panel.ts      side panel
    style.css
  tests/
    arrange.test.ts
    bouquet.test.ts
  public/
    models/       flower model files
    env/          lighting environment
  docs/
    model-research.md
    superpowers/specs/2026-10-11-bouquet-designer-design.md
```

## 10. Flower models

- **Format:** glTF binary (`.glb`).
- **Budget:** at most about 20,000 triangles per flower, so 40 stems stay smooth. Heavier models are reduced with the glTF-Transform command-line tool.
- **Tinting:** a model needs a separate petal material to offer several colours. A model without one offers only its own colour.
- **Licence:** commercial use allowed. Models that require credit are listed on a credits page linked from the designer.
- **Sourcing:** free models first. A first check found few usable fully free (CC0) flowers: most are raw scans of 200,000 to 2.4 million faces, and Poly Haven has only wildflowers. The free set will mostly be credit-required models, and some types may stay as placeholders.
- **Downloads:** the shop owner approves the shortlist and downloads the files; Sketchfab needs a free account.
- **Research file:** `docs/model-research.md` holds the free shortlist and, separately, paid packs and individual models with price, licence, format and links, for use in a later stage.

## 11. Build phases

| # | Phase | Done when |
|---|---|---|
| 0 | Project setup | An empty 3D scene opens in the browser and spins |
| 1 | Bouquet data and arrangement maths, tests first | Tests pass |
| 2 | 3D view with placeholder flowers, camera, lighting | A default bouquet shows, spins and zooms |
| 3 | Side panel: flowers, quantities, shapes, re-arrange | Every panel change shows in 3D |
| 4 | Select, drag, per-flower controls | Each control works on the highlighted flower |
| 5 | Wrapping and ribbon | Styles and colours change and resize with the bouquet |
| 6 | Undo and redo, autosave, reset view, safety nets | A refresh restores the design; undo reverses each action |
| 7 | Real models and credits page | 6-8 flowers load and stay smooth at 40 stems |
| 8 | Final review and walkthrough | Every feature checked in a browser, tests pass |

## 12. Testing

- **Automated (Vitest), written before the code they test:**
  - Auto-arrange: no two heads overlap, for 1, 12 and 40 stems in every shape.
  - Auto-arrange: the same input gives the same output.
  - Every shape: all head positions stay within the bouquet bounds, and surface-to-3D-to-surface conversion returns the starting position.
  - Adding a flower does not move existing stems.
  - Switching shape preserves each stem's surface position.
  - Change functions: add, remove, swap and recolour respect the stem limits and only allow colours valid for the flower.
  - Validation rejects malformed saved data.
  - Undo then redo returns to the same bouquet.
- **In the browser, at the end of every phase:** each feature exercised with screenshots, and frame rate checked at 40 stems in phase 7.

## 13. How the work is done

- The code is built in the main session, not by subagents. It is about eight files sharing one data object, and visual tuning depends on continuity between screenshots.
- A research subagent (Sonnet 5.5, medium effort) writes `docs/model-research.md` in the background during phases 1-6.
- A review subagent (Opus 5.5, high effort) reviews the code after phase 4 and after phase 8.
