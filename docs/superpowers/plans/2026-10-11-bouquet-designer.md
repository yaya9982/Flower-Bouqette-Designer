# Bouquet Designer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the main session (the execution method is already chosen; do not use subagent-driven-development). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A desktop website where a flower-shop customer builds a bouquet, adjusts individual flowers, and views it in 3D from any angle.

**Architecture:** One plain `Bouquet` object is the single source of truth. Pure functions in `bouquet.ts` produce new bouquets, pure maths in `arrange.ts` turns each stem's surface position into a 3D pose, and `scene.ts` (Babylon.js) and `panel.ts` (plain DOM) are both redrawn from that object. `main.ts` owns the undo history and wires the three together.

**Tech Stack:** Babylon.js 9.30 (`@babylonjs/core`, `@babylonjs/loaders`), TypeScript, Vite, Vitest. No UI framework, no server.

**Spec:** `docs/superpowers/specs/2026-10-11-bouquet-designer-design.md`

## Global Constraints

- Desktop browsers only. Below 1024 px window width the page shows "This designer needs a larger screen. Please open it on a computer." and hides the app.
- 1 to 40 stems per bouquet (`MIN_STEMS = 1`, `MAX_STEMS = 40`).
- Colours offered for a flower are only those in its catalogue entry.
- Undo history is capped at 100 snapshots. A drag or slider movement is one step.
- Flower models: `.glb`, at most about 20,000 triangles each, commercial-use licence, credit recorded in the catalogue.
- No server, accounts, prices on screen, ordering, greenery, or phone support.
- Runtime dependencies are `@babylonjs/core` and `@babylonjs/loaders` only. Do not add others.
- Babylon API names in this plan were written from memory of earlier versions. Before using each one, confirm it exists in `node_modules/@babylonjs/core` type definitions for 9.30; if a name differs, use the installed one and keep the behaviour described.
- `arrange.ts`, `bouquet.ts` and `catalog.ts` must never import Babylon or touch the DOM, so they run under Vitest in Node.
- All commands run from `C:\Users\USER\Desktop\coding\claude_code_project\bouquet-designer`.
- End every commit message with the `Co-Authored-By` line the session specifies.

## Review Focus

Failure modes the spec implies but does not list as tests. Each has a test in Task 2.

1. Saved design refers to a flower or colour no longer in the catalogue: it is discarded and the default bouquet loads (`validateBouquet` returns `null`).
2. Browser storage is blocked, full, or holds corrupt text: the designer still opens and works; nothing throws (`loadBouquet` returns `null`, `saveBouquet` swallows the error).
3. A drag reports a position outside the bouquet or a non-number: the flower stays on the surface or does not move (`moveStem` clamps, ignores `NaN`).
4. The selected flower disappears (removed, or undone out of existence): the selection clears instead of pointing at a missing stem (`resolveSelection`).
5. Saved design has two stems with the same id, or more than 40 stems: it is discarded (`validateBouquet` returns `null`).

## How this plan is executed

- **No stops:** work through every task to the end of Task 9 without pausing for the user. Nothing in this plan waits on the user, including the flower models (see Task 8 Step 1).
- **Where:** the main session builds everything. Start a fresh conversation (`/clear`) before Task 0 and tell it to read the spec and this plan.
- **Model and effort:** Opus 5.5. Use high effort for Tasks 1, 2 and 5; medium for the rest.
- **Subagents:** model research is already running in the background and writes `docs/model-research.md`. Dispatch one code-review subagent (Opus 5.5, high effort) after Task 5 and one after Task 9.
- **Browser checks (from Task 3 on):** done in the user's connected Chrome with the Claude in Chrome tools, on a tab opened at `http://localhost:5173/`. Wherever a step says `npm run shot -- <png> [steps file]`, do the same thing in that tab instead: perform the steps file's actions with real clicks, drags, scrolls and key presses, check each of its assertions by reading `window.__debug` (JavaScript tool), take a screenshot and read it, and read the console for errors. A check passes only if every assertion holds and the console has no errors. Still write each `tools/steps/*.mjs` file as the plan gives it: it is the exact list of actions and assertions, and `npm run shot` may be run as well as a quick repeatable check, but the Chrome run is the one that counts. Reload the tab before each check so it starts from a known state.
- **Task to spec-phase mapping:** Task 0 = phase 0, Tasks 1-2 = phase 1, Task 3 = phase 2, Task 4 = phase 3, Task 5 = phase 4, Task 6 = phase 5, Task 7 = phase 6, Task 8 = phase 7, Task 9 = phase 8.

## File map

| File | Responsibility |
|---|---|
| `index.html` | Page shell: small-screen notice, canvas, panel container |
| `src/style.css` | Layout and panel styling |
| `src/catalog.ts` | Flower types, paper colours, ribbon colours (the data file) |
| `src/bouquet.ts` | Types, limits, change functions, validation, undo history, saving |
| `src/arrange.ts` | Shape formulas, surface/3D conversion, auto-arrange, largest gap |
| `src/scene.ts` | Babylon scene: camera, lights, flowers, selection, dragging |
| `src/wrap.ts` | Paper and ribbon meshes |
| `src/panel.ts` | Side panel DOM |
| `src/main.ts` | State, history, wiring |
| `tests/arrange.test.ts`, `tests/bouquet.test.ts` | Automated tests |
| `tools/shot.mjs`, `tools/steps/*.mjs` | Browser screenshot and interaction checks |

---

### Task 0: Project setup

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `index.html`, `src/style.css`, `src/main.ts`, `tools/shot.mjs`

**Interfaces:**
- Produces: `npm run dev` (Vite on `http://localhost:5173/`), `npm test`, `npm run build`, `npm run shot -- <out.png> [stepsFile]`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "bouquet-designer",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "shot": "node tools/shot.mjs"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install @babylonjs/core@9.30.0 @babylonjs/loaders@9.30.0
npm install -D vite vitest typescript playwright-core
```

Expected: both finish without errors and `package.json` gains `dependencies` and `devDependencies`.

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "strict": true,
    "noUnusedLocals": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 4: Write `.gitignore`**

```
node_modules
dist
shots
```

- [ ] **Step 5: Write `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Bouquet Designer</title>
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <p id="small-screen">This designer needs a larger screen. Please open it on a computer.</p>
    <main id="app">
      <canvas id="view" aria-label="3D view of your bouquet. Drag to spin, scroll to zoom."></canvas>
      <aside id="panel" aria-label="Bouquet options"></aside>
    </main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 6: Write `src/style.css`**

```css
:root {
  --bg: #f5f3ef;
  --panel: #ffffff;
  --ink: #26221d;
  --muted: #6f675c;
  --line: #e3ded5;
  --accent: #2f6fed;
  font-family: system-ui, sans-serif;
  color: var(--ink);
}
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; background: var(--bg); }
#app { display: grid; grid-template-columns: 1fr 340px; height: 100vh; }
#view { width: 100%; height: 100%; display: block; outline: none; touch-action: none; }
#panel { background: var(--panel); border-left: 1px solid var(--line); overflow-y: auto; padding: 16px; }
#small-screen { display: none; padding: 32px; text-align: center; }
@media (max-width: 1023px) {
  #app { display: none; }
  #small-screen { display: block; }
}
#panel section { padding: 12px 0; border-bottom: 1px solid var(--line); }
#panel section:last-child { border-bottom: 0; }
#panel h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 0 0 8px; }
#panel fieldset { border: 0; padding: 0; margin: 8px 0; }
#panel legend, #panel label { font-size: 13px; color: var(--muted); padding: 0; }
.row { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
.row .name { flex: 1; }
.row .count { width: 24px; text-align: center; font-variant-numeric: tabular-nums; }
button, select { font: inherit; color: inherit; background: #fff; border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px; cursor: pointer; }
button:disabled { opacity: 0.4; cursor: default; }
button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.step { width: 30px; padding: 4px 0; }
.swatches { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
.swatch { width: 28px; height: 28px; border-radius: 50%; padding: 0; border: 1px solid rgba(0, 0, 0, 0.25); }
.swatch[aria-pressed="true"] { box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--accent); }
.field { display: grid; gap: 4px; margin: 8px 0; }
.field input[type="range"], .field select { width: 100%; }
.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.danger { color: #a3261f; }
```

- [ ] **Step 7: Write a temporary `src/main.ts` that proves Babylon runs**

```ts
import { ArcRotateCamera, Engine, HemisphericLight, MeshBuilder, Scene, Vector3 } from '@babylonjs/core';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);
const camera = new ArcRotateCamera('camera', -Math.PI / 2, 1.15, 1.5, new Vector3(0, 0.4, 0), scene);
camera.attachControl(canvas, true);
new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
MeshBuilder.CreateSphere('probe', { diameter: 0.3 }, scene).position.y = 0.4;
engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());
```

- [ ] **Step 8: Write `tools/shot.mjs`**

```js
// Usage: npm run shot -- shots/name.png [tools/steps/file.mjs]
// Opens the dev server in the installed Chrome, optionally runs a steps module
// (default export: async (page) => {}), saves a screenshot, and exits 1 on any
// console error, page error, or error thrown by the steps.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const [out = 'shots/shot.png', stepsFile] = process.argv.slice(2);
const url = process.env.URL ?? 'http://localhost:5173/';
mkdirSync(dirname(resolve(out)), { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

try {
  await page.goto(url);
  await page.waitForTimeout(2000);
  if (stepsFile) {
    const { default: steps } = await import(pathToFileURL(resolve(stepsFile)).href);
    await steps(page);
    await page.waitForTimeout(500);
  }
} catch (e) {
  errors.push(String(e));
}
await page.screenshot({ path: out });
await browser.close();
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : `ok: ${out}`);
process.exit(errors.length ? 1 : 0);
```

- [ ] **Step 9: Verify**

Run `npm run dev` in the background, then `npm run shot -- shots/task0.png`.
Expected: `ok: shots/task0.png`. Read the screenshot: a lit sphere on the left, an empty white panel on the right. If the canvas is blank and the error mentions WebGL, change `chromium.launch` to add `headless: false` and rerun.

Run `npm run build`.
Expected: type check and build succeed.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Set up Vite, TypeScript, Babylon and the screenshot tool"
```

---

### Task 1: Catalogue, types and arrangement maths

**Files:**
- Create: `src/catalog.ts`, `src/bouquet.ts` (types and constants only), `src/arrange.ts`
- Test: `tests/arrange.test.ts`

**Interfaces:**
- Produces from `catalog.ts`: `FlowerColour`, `FlowerType`, `NamedColour`, `FLOWERS`, `PAPER_COLOURS`, `RIBBON_COLOURS`.
- Produces from `bouquet.ts`: `ShapeId`, `SHAPES`, `PaperId`, `PAPERS`, `Stem`, `Wrap`, `Bouquet`, `MIN_STEMS`, `MAX_STEMS`.
- Produces from `arrange.ts`:
  - `BINDING: Vec3`, `TAU: number`
  - `headDiameter(flowerId: string, catalog: FlowerType[]): number`
  - `surfaceRadius(stems: { flower: string }[], catalog: FlowerType[]): number`
  - `surfacePoint(shape, angle, dist, radius, height?, tilt?): Pose` where `Pose = { head: Vec3; dir: Vec3; face: Vec3 }`
  - `stemPose(shape: ShapeId, stem: Stem, radius: number): Pose`
  - `surfaceFromPoint(shape: ShapeId, point: Vec3): SurfacePos` where `SurfacePos = { angle: number; dist: number }`
  - `maxReach(shape: ShapeId, radius: number): number`
  - `distance(a: Vec3, b: Vec3): number`
  - `autoArrange(stems: Stem[]): Stem[]`
  - `largestGap(shape: ShapeId, stems: Stem[], catalog: FlowerType[], flowerId: string): SurfacePos`

Background for the implementer: every stem passes through one point, `BINDING`. A stem's place on the bouquet is two numbers: `angle` (around) and `dist` (0 at the centre, 1 at the rim). A shape is a rule that turns those into a direction from `BINDING` and a stem length. "Front" is the -z direction, which faces the default camera. The constants below were checked with a prototype: with `PACKING = 0.8` no heads overlap for 1 to 40 stems in every shape, including mixes of large and small flowers.

- [ ] **Step 1: Write `src/catalog.ts`**

<!-- file: src/catalog.ts -->
```ts
export interface NamedColour {
  id: string;
  name: string;
  hex: string;
}

export type FlowerColour = NamedColour;

export interface FlowerType {
  id: string;
  name: string;
  /** File name under public/models, or null to draw the built-in stand-in flower. */
  model: string | null;
  /** Substring of the material name to tint. Absent means the model cannot be recoloured. */
  petalMaterial?: string;
  /** Scale applied to the model so its head matches headDiameter. Default 1. */
  modelScale?: number;
  /** Height of the head centre in the model's own units, before scaling. Default 0. */
  modelHeadY?: number;
  /** Metres. */
  headDiameter: number;
  /** Metres. */
  stemLength: number;
  /** Real-world colours only. At least one. */
  colours: FlowerColour[];
  /** Not shown in the first version. */
  price?: number;
  credit?: { author: string; licence: string; url: string };
}

export const FLOWERS: FlowerType[] = [
  {
    id: 'rose', name: 'Rose', model: null, headDiameter: 0.07, stemLength: 0.45,
    colours: [
      { id: 'red', name: 'Red', hex: '#b3202a' },
      { id: 'white', name: 'White', hex: '#f6f1e7' },
      { id: 'pink', name: 'Pink', hex: '#e8a0b4' },
      { id: 'yellow', name: 'Yellow', hex: '#f2cf4a' },
    ],
  },
  {
    id: 'tulip', name: 'Tulip', model: null, headDiameter: 0.05, stemLength: 0.4,
    colours: [
      { id: 'red', name: 'Red', hex: '#c8242b' },
      { id: 'yellow', name: 'Yellow', hex: '#f4d03f' },
      { id: 'pink', name: 'Pink', hex: '#ef9ab2' },
      { id: 'white', name: 'White', hex: '#f7f3ea' },
      { id: 'purple', name: 'Purple', hex: '#6c3f8f' },
    ],
  },
  {
    id: 'daisy', name: 'Daisy', model: null, headDiameter: 0.1, stemLength: 0.45,
    colours: [
      { id: 'white', name: 'White', hex: '#f8f4ea' },
      { id: 'yellow', name: 'Yellow', hex: '#f2c230' },
      { id: 'pink', name: 'Pink', hex: '#f0a3bc' },
    ],
  },
  {
    id: 'lily', name: 'Lily', model: null, headDiameter: 0.12, stemLength: 0.55,
    colours: [
      { id: 'white', name: 'White', hex: '#f7f4ec' },
      { id: 'pink', name: 'Pink', hex: '#e79ab0' },
      { id: 'orange', name: 'Orange', hex: '#f08a2e' },
    ],
  },
  {
    id: 'sunflower', name: 'Sunflower', model: null, headDiameter: 0.14, stemLength: 0.6,
    colours: [{ id: 'yellow', name: 'Yellow', hex: '#f4b81f' }],
  },
  {
    id: 'carnation', name: 'Carnation', model: null, headDiameter: 0.06, stemLength: 0.45,
    colours: [
      { id: 'red', name: 'Red', hex: '#c0222f' },
      { id: 'pink', name: 'Pink', hex: '#f2a3bd' },
      { id: 'white', name: 'White', hex: '#f7f2ea' },
    ],
  },
];

export const PAPER_COLOURS: NamedColour[] = [
  { id: 'kraft', name: 'Kraft brown', hex: '#b88a5a' },
  { id: 'white', name: 'White', hex: '#f4f1ea' },
  { id: 'blush', name: 'Blush', hex: '#f1c9cf' },
  { id: 'sage', name: 'Sage', hex: '#a9b89b' },
  { id: 'black', name: 'Black', hex: '#2b2b2b' },
];

export const RIBBON_COLOURS: NamedColour[] = [
  { id: 'ivory', name: 'Ivory', hex: '#f3ead8' },
  { id: 'red', name: 'Red', hex: '#b3202a' },
  { id: 'blush', name: 'Blush', hex: '#e7a6b5' },
  { id: 'gold', name: 'Gold', hex: '#c9a34a' },
  { id: 'navy', name: 'Navy', hex: '#23355c' },
];
```

- [ ] **Step 2: Write `src/bouquet.ts` with types and constants only**

```ts
export type ShapeId = 'round' | 'cascade' | 'loose' | 'onesided';
export const SHAPES: readonly ShapeId[] = ['round', 'cascade', 'loose', 'onesided'];

export type PaperId = 'none' | 'kraft' | 'matte' | 'tissue';
export const PAPERS: readonly PaperId[] = ['none', 'kraft', 'matte', 'tissue'];

export interface Stem {
  id: string;
  flower: string;
  colour: string;
  /** Position around the bouquet, radians, 0 to 2π. */
  angle: number;
  /** Distance from the centre, 0 to 1. */
  dist: number;
  /** Offset along the stem, -1 to 1. */
  height: number;
  /** Extra lean of the head away from the centre, radians, -0.5 to 0.5. */
  tilt: number;
}

export interface Wrap {
  paper: PaperId;
  paperColour: string;
  ribbonColour: string;
}

export interface Bouquet {
  version: 1;
  shape: ShapeId;
  wrap: Wrap;
  stems: Stem[];
}

export const MIN_STEMS = 1;
export const MAX_STEMS = 40;
```

- [ ] **Step 3: Write the failing tests in `tests/arrange.test.ts`**

<!-- file: tests/arrange.test.ts -->
```ts
import { describe, expect, it } from 'vitest';
import {
  autoArrange, BINDING, distance, headDiameter, largestGap, maxReach,
  stemPose, surfaceFromPoint, surfacePoint, surfaceRadius, TAU,
} from '../src/arrange';
import { SHAPES, type Stem } from '../src/bouquet';
import { FLOWERS } from '../src/catalog';

type Spec = [flower: string, count: number][];

const make = (spec: Spec): Stem[] =>
  spec.flatMap(([flower, count]) =>
    Array.from({ length: count }, (_, i) => ({
      id: `${flower}${i}`, flower, colour: 'any', angle: 0, dist: 0, height: 0, tilt: 0,
    })),
  );

const SETS: Record<string, Spec> = {
  one: [['rose', 1]],
  two: [['rose', 2]],
  twelveMixed: [['rose', 5], ['tulip', 4], ['daisy', 3]],
  fortyRoses: [['rose', 40]],
  fortyMixed: [['rose', 10], ['tulip', 10], ['daisy', 8], ['lily', 6], ['sunflower', 6]],
  bigAndSmall: [['sunflower', 20], ['tulip', 20]],
  oneBigAmongSmall: [['tulip', 39], ['sunflower', 1]],
};

describe('autoArrange', () => {
  for (const [name, spec] of Object.entries(SETS)) {
    for (const shape of SHAPES) {
      it(`${name} in ${shape}: no two heads overlap`, () => {
        const stems = autoArrange(make(spec));
        const radius = surfaceRadius(stems, FLOWERS);
        const heads = stems.map((s) => stemPose(shape, s, radius).head);
        for (let i = 0; i < stems.length; i++) {
          for (let j = i + 1; j < stems.length; j++) {
            const needed = (headDiameter(stems[i].flower, FLOWERS) + headDiameter(stems[j].flower, FLOWERS)) / 2;
            expect(distance(heads[i], heads[j])).toBeGreaterThanOrEqual(needed);
          }
        }
      });

      it(`${name} in ${shape}: every head is within reach of the binding point`, () => {
        const stems = autoArrange(make(spec));
        const radius = surfaceRadius(stems, FLOWERS);
        for (const s of stems) {
          const { head } = stemPose(shape, s, radius);
          expect(Number.isFinite(head.x + head.y + head.z)).toBe(true);
          expect(distance(head, BINDING)).toBeLessThanOrEqual(maxReach(shape, radius) + 1e-9);
        }
      });
    }
  }

  it('gives the same result for the same input', () => {
    expect(autoArrange(make(SETS.fortyMixed))).toEqual(autoArrange(make(SETS.fortyMixed)));
  });

  it('keeps every stem, with valid positions and no tilt', () => {
    const input = make(SETS.fortyMixed);
    const out = autoArrange(input);
    expect(out.map((s) => s.id).sort()).toEqual(input.map((s) => s.id).sort());
    for (const s of out) {
      expect(s.angle).toBeGreaterThanOrEqual(0);
      expect(s.angle).toBeLessThan(TAU);
      expect(s.dist).toBeGreaterThanOrEqual(0);
      expect(s.dist).toBeLessThanOrEqual(1);
      expect(Math.abs(s.height)).toBeLessThanOrEqual(1);
      expect(s.tilt).toBe(0);
    }
  });

  it('puts a single flower at the centre', () => {
    expect(autoArrange(make(SETS.one))[0]).toMatchObject({ angle: 0, dist: 0 });
  });

  it('spreads each flower type across the bouquet', () => {
    const out = autoArrange(make([['rose', 6], ['tulip', 6]]));
    expect(out.slice(0, 4).map((s) => s.flower)).toEqual(['rose', 'tulip', 'rose', 'tulip']);
  });
});

describe('surface conversion', () => {
  for (const shape of SHAPES) {
    it(`${shape}: surface to 3D and back returns the starting position`, () => {
      for (let angle = 0.05; angle < TAU; angle += 0.37) {
        for (let dist = 0.1; dist <= 1; dist += 0.15) {
          const back = surfaceFromPoint(shape, surfacePoint(shape, angle, dist, 0.2).head);
          expect(back.angle).toBeCloseTo(angle, 6);
          expect(back.dist).toBeCloseTo(dist, 6);
        }
      }
    });
  }

  it('returns the centre for the binding point itself', () => {
    expect(surfaceFromPoint('round', BINDING)).toEqual({ angle: 0, dist: 0 });
  });

  it('clamps a point below the rim to the rim', () => {
    expect(surfaceFromPoint('round', { x: 1, y: BINDING.y - 1, z: 0 }).dist).toBe(1);
  });

  it('height moves the head along its stem and tilt turns only the face', () => {
    const flat = surfacePoint('round', 1, 0.5, 0.2);
    const raised = surfacePoint('round', 1, 0.5, 0.2, 1);
    const tilted = surfacePoint('round', 1, 0.5, 0.2, 0, 0.3);
    expect(distance(raised.head, BINDING)).toBeGreaterThan(distance(flat.head, BINDING));
    expect(tilted.head).toEqual(flat.head);
    expect(tilted.face).not.toEqual(flat.face);
    expect(flat.face).toEqual(flat.dir);
  });

  it('cascade drops below the binding point at the front only', () => {
    expect(surfacePoint('cascade', 0, 1, 0.2).head.y).toBeLessThan(BINDING.y);
    expect(surfacePoint('cascade', Math.PI, 1, 0.2).head.y).toBeGreaterThan(BINDING.y);
  });

  it('one-sided keeps every head in the front half', () => {
    for (let angle = 0; angle < TAU; angle += 0.2) {
      expect(surfacePoint('onesided', angle, 1, 0.2).head.z).toBeLessThanOrEqual(1e-9);
    }
  });
});

describe('surfaceRadius', () => {
  it('grows with the number and size of flowers', () => {
    const few = surfaceRadius(make([['rose', 5]]), FLOWERS);
    const many = surfaceRadius(make([['rose', 20]]), FLOWERS);
    const bigger = surfaceRadius(make([['sunflower', 20]]), FLOWERS);
    expect(many).toBeGreaterThan(few);
    expect(bigger).toBeGreaterThan(many);
  });

  it('uses a default size for a flower missing from the catalogue', () => {
    expect(headDiameter('not-a-flower', FLOWERS)).toBe(0.07);
  });
});

describe('largestGap', () => {
  it('finds a free spot in a full-looking bouquet', () => {
    for (const shape of SHAPES) {
      const stems = autoArrange(make(SETS.twelveMixed));
      const gap = largestGap(shape, stems, FLOWERS, 'rose');
      const radius = surfaceRadius([...stems, { flower: 'rose' }], FLOWERS);
      const spot = surfacePoint(shape, gap.angle, gap.dist, radius).head;
      for (const s of stems) {
        const needed = (headDiameter(s.flower, FLOWERS) + headDiameter('rose', FLOWERS)) / 2;
        expect(distance(spot, stemPose(shape, s, radius).head)).toBeGreaterThanOrEqual(needed);
      }
    }
  });

  it('returns the centre when there are no stems', () => {
    expect(largestGap('round', [], FLOWERS, 'rose')).toEqual({ angle: 0, dist: 0 });
  });
});
```

- [ ] **Step 4: Run the tests to confirm they fail**

Run: `npm test`
Expected: FAIL, cannot resolve `../src/arrange`.

- [ ] **Step 5: Write `src/arrange.ts`**

<!-- file: src/arrange.ts -->
```ts
import type { ShapeId, Stem } from './bouquet';
import type { FlowerType } from './catalog';

export interface Vec3 { x: number; y: number; z: number }
/** head: centre of the flower head. dir: unit vector along the stem. face: unit vector the head points along. */
export interface Pose { head: Vec3; dir: Vec3; face: Vec3 }
export interface SurfacePos { angle: number; dist: number }

/** Where every stem crosses and the ribbon is tied. */
export const BINDING: Vec3 = { x: 0, y: 0.25, z: 0 };
export const TAU = Math.PI * 2;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** Spacing between heads. 0.8 keeps every tested mix of 1-40 stems from overlapping in all shapes. */
const PACKING = 0.8;
/** Metres a head moves along its stem when height is 1. */
const HEIGHT_STEP = 0.05;
const DEFAULT_DIAMETER = 0.07;
const MIN_RADIUS = 0.05;
const GAP_RINGS = 10;
const GAP_SPOKES = 36;

const rad = (degrees: number) => (degrees * Math.PI) / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Angle from straight up at the rim (dist = 1), before any per-angle change. */
const BASE_POLAR: Record<ShapeId, number> = { round: rad(55), loose: rad(68), cascade: rad(55), onesided: rad(60) };
/** Largest value lengthFactor can return for each shape. */
const MAX_LENGTH_FACTOR: Record<ShapeId, number> = { round: 1, loose: 1.15, cascade: 1.5, onesided: 1.3 };

/** 1 at the front (angle 0), falling to 0 at the sides and back. */
function frontness(angle: number): number {
  const c = Math.cos(angle);
  return c > 0 ? c * c : 0;
}

/** Direction around the vertical axis. One-sided squeezes the full circle into the front half. */
function azimuth(shape: ShapeId, angle: number): number {
  return shape === 'onesided' ? (angle - Math.PI) / 2 : angle;
}

function maxPolar(shape: ShapeId, angle: number): number {
  return shape === 'cascade' ? rad(55 + 65 * frontness(angle)) : BASE_POLAR[shape];
}

function lengthFactor(shape: ShapeId, angle: number, dist: number): number {
  if (shape === 'loose') return 1 + 0.15 * dist * dist;
  if (shape === 'cascade') return 1 + 0.5 * frontness(angle) * dist * dist;
  if (shape === 'onesided') return 1 + 0.3 * dist * Math.abs(Math.sin(azimuth(shape, angle)));
  return 1;
}

function baseLength(shape: ShapeId, radius: number): number {
  return (shape === 'onesided' ? radius * Math.SQRT2 : radius) / BASE_POLAR[shape];
}

/** Unit vector at `polar` radians from straight up, turned `around` radians from the front (-z). */
function direction(polar: number, around: number): Vec3 {
  return { x: Math.sin(polar) * Math.sin(around), y: Math.cos(polar), z: -Math.sin(polar) * Math.cos(around) };
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function headDiameter(flowerId: string, catalog: FlowerType[]): number {
  return catalog.find((f) => f.id === flowerId)?.headDiameter ?? DEFAULT_DIAMETER;
}

/** Size of the bouquet surface, measured along it from centre to rim. Grows with the flowers. */
export function surfaceRadius(stems: { flower: string }[], catalog: FlowerType[]): number {
  if (stems.length === 0) return MIN_RADIUS;
  const sizes = stems.map((s) => headDiameter(s.flower, catalog));
  const rms = Math.sqrt(sizes.reduce((sum, d) => sum + d * d, 0) / sizes.length);
  const largest = Math.max(...sizes);
  return Math.max(MIN_RADIUS, PACKING * Math.sqrt(sizes.length) * (rms + largest) / 2);
}

/** Furthest a head can be from the binding point for this shape and size. */
export function maxReach(shape: ShapeId, radius: number): number {
  return baseLength(shape, radius) * MAX_LENGTH_FACTOR[shape] + HEIGHT_STEP * 1.6;
}

export function surfacePoint(shape: ShapeId, angle: number, dist: number, radius: number, height = 0, tilt = 0): Pose {
  const around = azimuth(shape, angle);
  const polar = dist * maxPolar(shape, angle);
  const length = baseLength(shape, radius) * lengthFactor(shape, angle, dist)
    + height * HEIGHT_STEP * (shape === 'loose' ? 1.6 : 1);
  const dir = direction(polar, around);
  return {
    head: { x: BINDING.x + dir.x * length, y: BINDING.y + dir.y * length, z: BINDING.z + dir.z * length },
    dir,
    face: direction(polar + tilt, around),
  };
}

export function stemPose(shape: ShapeId, stem: Stem, radius: number): Pose {
  return surfacePoint(shape, stem.angle, stem.dist, radius, stem.height, stem.tilt);
}

/** The surface position whose stem points at `point`. Only the direction from the binding point matters. */
export function surfaceFromPoint(shape: ShapeId, point: Vec3): SurfacePos {
  const v = { x: point.x - BINDING.x, y: point.y - BINDING.y, z: point.z - BINDING.z };
  const length = Math.hypot(v.x, v.y, v.z);
  if (length < 1e-9) return { angle: 0, dist: 0 };
  const polar = Math.acos(clamp(v.y / length, -1, 1));
  const around = Math.atan2(v.x, -v.z);
  const angle = shape === 'onesided'
    ? clamp(2 * clamp(around, -Math.PI / 2, Math.PI / 2) + Math.PI, 0, TAU - 1e-6)
    : (around + TAU) % TAU;
  return { angle, dist: clamp(polar / maxPolar(shape, angle), 0, 1) };
}

/** Stable pseudo-random number in [0, 1) from a string, so variation never changes between runs. */
function hash01(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * Places every stem on an even spiral, alternating flower types so each type is
 * spread out, with slight natural variation. Resets height and tilt.
 */
export function autoArrange(stems: Stem[]): Stem[] {
  const byType = new Map<string, Stem[]>();
  for (const stem of stems) {
    const list = byType.get(stem.flower);
    if (list) list.push(stem);
    else byType.set(stem.flower, [stem]);
  }
  const lists = [...byType.values()];
  const ordered: Stem[] = [];
  for (let round = 0; ordered.length < stems.length; round++) {
    for (const list of lists) if (list[round]) ordered.push(list[round]);
  }
  const n = ordered.length;
  return ordered.map((stem, i) => ({
    ...stem,
    angle: n === 1 ? 0 : (i * GOLDEN_ANGLE + (hash01(`${stem.id}a`) - 0.5) * 0.06 + TAU) % TAU,
    dist: n === 1 ? 0 : Math.sqrt((i + 0.5) / n),
    height: (hash01(stem.id) - 0.5) * 0.8,
    tilt: 0,
  }));
}

/** The emptiest spot on the surface for one more flower of the given type. */
export function largestGap(shape: ShapeId, stems: Stem[], catalog: FlowerType[], flowerId: string): SurfacePos {
  const size = headDiameter(flowerId, catalog);
  const radius = surfaceRadius([...stems, { flower: flowerId }], catalog);
  const heads = stems.map((s) => ({ at: stemPose(shape, s, radius).head, size: headDiameter(s.flower, catalog) }));
  let best: SurfacePos = { angle: 0, dist: 0 };
  let bestRoom = -Infinity;
  for (let ring = 0; ring <= GAP_RINGS; ring++) {
    const spokes = ring === 0 ? 1 : GAP_SPOKES;
    for (let spoke = 0; spoke < spokes; spoke++) {
      const candidate = { angle: (spoke / spokes) * TAU, dist: ring / GAP_RINGS };
      const at = surfacePoint(shape, candidate.angle, candidate.dist, radius).head;
      let room = Infinity;
      for (const head of heads) room = Math.min(room, distance(at, head.at) - (head.size + size) / 2);
      if (room > bestRoom) {
        bestRoom = room;
        best = candidate;
      }
    }
  }
  return best;
}
```

- [ ] **Step 6: Run the tests to confirm they pass**

Run: `npm test`
Expected: PASS, all tests in `tests/arrange.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/catalog.ts src/bouquet.ts src/arrange.ts tests/arrange.test.ts
git commit -m "Add catalogue, bouquet types and arrangement maths"
```

---

### Task 2: Bouquet change functions, validation, history and saving

**Files:**
- Modify: `src/bouquet.ts` (replace the whole file)
- Test: `tests/bouquet.test.ts`

**Interfaces:**
- Consumes: `autoArrange`, `largestGap`, `TAU` from `arrange.ts`; `FlowerType`, `PAPER_COLOURS`, `RIBBON_COLOURS` from `catalog.ts`.
- Produces (all return a new `Bouquet`, or the same object when the change is not allowed):
  - `createDefaultBouquet(catalog: FlowerType[]): Bouquet`
  - `addStem(b, flowerId: string, catalog): Bouquet`
  - `removeStem(b, stemId: string): Bouquet`
  - `removeOneOfType(b, flowerId: string): Bouquet`
  - `swapStem(b, stemId, flowerId, catalog): Bouquet`
  - `recolourStem(b, stemId, colourId, catalog): Bouquet`
  - `moveStem(b, stemId, angle: number, dist: number): Bouquet`
  - `adjustStem(b, stemId, patch: { height?: number; tilt?: number }): Bouquet`
  - `setShape(b, shape: ShapeId): Bouquet`
  - `setWrap(b, patch: Partial<Wrap>): Bouquet`
  - `rearrange(b): Bouquet`
  - `resolveSelection(b, stemId: string | null): string | null`
  - `validateBouquet(data: unknown, catalog): Bouquet | null`
  - `History = { past: Bouquet[]; present: Bouquet; future: Bouquet[] }`, `createHistory(b)`, `commit(h, next)`, `undo(h)`, `redo(h)`
  - `Store = Pick<Storage, 'getItem' | 'setItem'>`, `saveBouquet(b, store: Store): void`, `loadBouquet(catalog, store: Store): Bouquet | null`
  - `HISTORY_LIMIT = 100`, `STORAGE_KEY = 'bouquet-designer:v1'`

- [ ] **Step 1: Write the failing tests in `tests/bouquet.test.ts`**

<!-- file: tests/bouquet.test.ts -->
```ts
import { describe, expect, it } from 'vitest';
import { TAU } from '../src/arrange';
import {
  addStem, adjustStem, commit, createDefaultBouquet, createHistory, HISTORY_LIMIT, loadBouquet,
  MAX_STEMS, moveStem, rearrange, recolourStem, redo, removeOneOfType, removeStem, resolveSelection,
  saveBouquet, setShape, setWrap, STORAGE_KEY, swapStem, undo, validateBouquet, type Bouquet, type Store,
} from '../src/bouquet';
import { FLOWERS } from '../src/catalog';

const base = () => createDefaultBouquet(FLOWERS);
const full = () => {
  let b = base();
  while (b.stems.length < MAX_STEMS) b = addStem(b, 'rose', FLOWERS);
  return b;
};
const single = () => {
  let b = base();
  while (b.stems.length > 1) b = removeStem(b, b.stems[0].id);
  return b;
};
const memoryStore = (initial: Record<string, string> = {}): Store & { data: Record<string, string> } => {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
};

describe('createDefaultBouquet', () => {
  it('makes a valid 12-stem bouquet with unique ids', () => {
    const b = base();
    expect(b.stems).toHaveLength(12);
    expect(new Set(b.stems.map((s) => s.id)).size).toBe(12);
    expect(validateBouquet(JSON.parse(JSON.stringify(b)), FLOWERS)).toEqual(b);
  });
});

describe('addStem', () => {
  it('adds one stem in the first colour of its type, with a new id', () => {
    const b = base();
    const next = addStem(b, 'lily', FLOWERS);
    const added = next.stems[next.stems.length - 1];
    expect(next.stems).toHaveLength(13);
    expect(added).toMatchObject({ flower: 'lily', colour: 'white', height: 0, tilt: 0 });
    expect(b.stems.some((s) => s.id === added.id)).toBe(false);
  });

  it('does not move the existing stems', () => {
    const b = base();
    expect(addStem(b, 'lily', FLOWERS).stems.slice(0, 12)).toEqual(b.stems);
  });

  it('never reuses the id of a removed stem that is still the highest', () => {
    const b = base();
    const removed = removeStem(b, 's3');
    const added = addStem(removed, 'rose', FLOWERS).stems.at(-1)!;
    expect(removed.stems.some((s) => s.id === added.id)).toBe(false);
  });

  it('does nothing at the 40-stem limit', () => {
    const b = full();
    expect(b.stems).toHaveLength(MAX_STEMS);
    expect(addStem(b, 'rose', FLOWERS)).toBe(b);
  });

  it('does nothing for a flower not in the catalogue', () => {
    const b = base();
    expect(addStem(b, 'cactus', FLOWERS)).toBe(b);
  });
});

describe('removing', () => {
  it('removes the named stem and leaves the others unchanged', () => {
    const b = base();
    const next = removeStem(b, b.stems[2].id);
    expect(next.stems).toEqual(b.stems.filter((_, i) => i !== 2));
  });

  it('does nothing for an unknown id', () => {
    const b = base();
    expect(removeStem(b, 'nope')).toBe(b);
  });

  it('never removes the last stem', () => {
    const b = single();
    expect(removeStem(b, b.stems[0].id)).toBe(b);
  });

  it('removeOneOfType removes exactly one stem of that type', () => {
    const b = base();
    const roses = b.stems.filter((s) => s.flower === 'rose').length;
    const next = removeOneOfType(b, 'rose');
    expect(next.stems.filter((s) => s.flower === 'rose')).toHaveLength(roses - 1);
    expect(next.stems).toHaveLength(b.stems.length - 1);
  });

  it('removeOneOfType does nothing when there is none of that type', () => {
    const b = base();
    expect(removeOneOfType(b, 'sunflower')).toBe(b);
  });
});

describe('swapStem and recolourStem', () => {
  it('swap keeps the position and takes the first colour of the new type', () => {
    const b = base();
    const before = b.stems[0];
    const after = swapStem(b, before.id, 'sunflower', FLOWERS).stems[0];
    expect(after).toEqual({ ...before, flower: 'sunflower', colour: 'yellow' });
  });

  it('swap does nothing for an unknown flower or stem', () => {
    const b = base();
    expect(swapStem(b, b.stems[0].id, 'cactus', FLOWERS)).toBe(b);
    expect(swapStem(b, 'nope', 'rose', FLOWERS)).toBe(b);
  });

  it('recolour accepts a colour the flower comes in', () => {
    const b = base();
    const rose = b.stems.find((s) => s.flower === 'rose')!;
    expect(recolourStem(b, rose.id, 'white', FLOWERS).stems.find((s) => s.id === rose.id)!.colour).toBe('white');
  });

  it('recolour refuses a colour the flower does not come in', () => {
    const b = base();
    const rose = b.stems.find((s) => s.flower === 'rose')!;
    expect(recolourStem(b, rose.id, 'purple', FLOWERS)).toBe(b);
  });
});

describe('moveStem and adjustStem', () => {
  it('moves one stem and leaves the rest', () => {
    const b = base();
    const next = moveStem(b, b.stems[1].id, 1, 0.5);
    expect(next.stems[1]).toMatchObject({ angle: 1, dist: 0.5 });
    expect(next.stems[0]).toBe(b.stems[0]);
  });

  it('wraps the angle into 0..2π and clamps the distance', () => {
    const b = base();
    const id = b.stems[0].id;
    expect(moveStem(b, id, -1, 5).stems[0]).toMatchObject({ dist: 1 });
    expect(moveStem(b, id, -1, 5).stems[0].angle).toBeCloseTo(TAU - 1);
    expect(moveStem(b, id, TAU + 1, -3).stems[0].angle).toBeCloseTo(1);
    expect(moveStem(b, id, 0, -3).stems[0].dist).toBe(0);
  });

  it('ignores a position that is not a number', () => {
    const b = base();
    expect(moveStem(b, b.stems[0].id, NaN, 0.5)).toBe(b);
    expect(moveStem(b, b.stems[0].id, 1, Infinity)).toBe(b);
  });

  it('clamps height and tilt, and ignores values that are not numbers', () => {
    const b = base();
    const id = b.stems[0].id;
    expect(adjustStem(b, id, { height: 9, tilt: -9 }).stems[0]).toMatchObject({ height: 1, tilt: -0.5 });
    expect(adjustStem(b, id, { height: NaN }).stems[0].height).toBe(b.stems[0].height);
    expect(adjustStem(b, 'nope', { height: 0.2 })).toBe(b);
  });
});

describe('shape, wrap and rearrange', () => {
  it('switching shape keeps every stem exactly as it was', () => {
    const b = moveStem(base(), 's1', 2, 0.3);
    const next = setShape(b, 'cascade');
    expect(next.shape).toBe('cascade');
    expect(next.stems).toBe(b.stems);
  });

  it('refuses an unknown shape', () => {
    const b = base();
    expect(setShape(b, 'pyramid' as never)).toBe(b);
  });

  it('sets wrap fields and refuses unknown values', () => {
    const b = base();
    expect(setWrap(b, { paper: 'tissue', ribbonColour: 'navy' }).wrap).toEqual({ ...b.wrap, paper: 'tissue', ribbonColour: 'navy' });
    expect(setWrap(b, { paperColour: 'neon' })).toBe(b);
    expect(setWrap(b, { paper: 'foil' as never })).toBe(b);
  });

  it('rearrange resets hand adjustments', () => {
    const b = adjustStem(moveStem(base(), 's1', 2, 0.3), 's1', { tilt: 0.4 });
    expect(rearrange(b).stems).toEqual(base().stems);
  });
});

describe('resolveSelection', () => {
  it('keeps a selection that still exists and clears one that does not', () => {
    const b = base();
    expect(resolveSelection(b, 's1')).toBe('s1');
    expect(resolveSelection(removeStem(b, 's1'), 's1')).toBeNull();
    expect(resolveSelection(b, null)).toBeNull();
  });
});

describe('validateBouquet', () => {
  const good = () => JSON.parse(JSON.stringify(base())) as Record<string, any>;

  it('accepts a saved default bouquet', () => {
    expect(validateBouquet(good(), FLOWERS)).toEqual(base());
  });

  it('drops unknown extra fields', () => {
    const data = good();
    data.extra = 1;
    data.stems[0].extra = 1;
    expect(validateBouquet(data, FLOWERS)).toEqual(base());
  });

  const bad: [string, (d: Record<string, any>) => unknown][] = [
    ['not an object', () => 'hello'],
    ['null', () => null],
    ['wrong version', (d) => ({ ...d, version: 2 })],
    ['unknown shape', (d) => ({ ...d, shape: 'pyramid' })],
    ['missing wrap', (d) => ({ ...d, wrap: undefined })],
    ['unknown paper', (d) => ({ ...d, wrap: { ...d.wrap, paper: 'foil' } })],
    ['unknown ribbon colour', (d) => ({ ...d, wrap: { ...d.wrap, ribbonColour: 'neon' } })],
    ['stems not a list', (d) => ({ ...d, stems: {} })],
    ['no stems', (d) => ({ ...d, stems: [] })],
    ['too many stems', (d) => ({ ...d, stems: Array.from({ length: 41 }, (_, i) => ({ ...d.stems[0], id: `s${i + 1}` })) })],
    ['duplicate ids', (d) => ({ ...d, stems: [d.stems[0], d.stems[0]] })],
    ['flower not in the catalogue', (d) => ({ ...d, stems: [{ ...d.stems[0], flower: 'cactus' }] })],
    ['colour the flower does not come in', (d) => ({ ...d, stems: [{ ...d.stems[0], flower: 'rose', colour: 'purple' }] })],
    ['id in the wrong form', (d) => ({ ...d, stems: [{ ...d.stems[0], id: 'first' }] })],
    ['distance out of range', (d) => ({ ...d, stems: [{ ...d.stems[0], dist: 1.5 }] })],
    ['angle not a number', (d) => ({ ...d, stems: [{ ...d.stems[0], angle: 'north' }] })],
    ['height missing', (d) => ({ ...d, stems: [{ ...d.stems[0], height: undefined }] })],
    ['tilt out of range', (d) => ({ ...d, stems: [{ ...d.stems[0], tilt: 2 }] })],
    ['stem is null', (d) => ({ ...d, stems: [null] })],
  ];
  for (const [name, breakIt] of bad) {
    it(`rejects: ${name}`, () => {
      expect(validateBouquet(breakIt(good()), FLOWERS)).toBeNull();
    });
  }
});

describe('history', () => {
  const step = (b: Bouquet, i: number) => moveStem(b, 's1', i / 1000, 0.5);

  it('undo then redo returns to the same bouquet', () => {
    const a = base();
    const b = setShape(a, 'loose');
    const h = commit(createHistory(a), b);
    expect(undo(h).present).toBe(a);
    expect(redo(undo(h)).present).toBe(b);
  });

  it('undo and redo do nothing when there is nothing to undo or redo', () => {
    const h = createHistory(base());
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it('a change that returned the same bouquet is not recorded', () => {
    const h = createHistory(base());
    expect(commit(h, h.present)).toBe(h);
  });

  it('a new change after undo clears redo', () => {
    const a = base();
    const h = undo(commit(createHistory(a), setShape(a, 'loose')));
    expect(commit(h, setShape(a, 'cascade')).future).toEqual([]);
  });

  it('keeps at most 100 steps', () => {
    let h = createHistory(base());
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = commit(h, step(h.present, i));
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });
});

describe('saving', () => {
  it('saves and loads the same bouquet', () => {
    const store = memoryStore();
    const b = setShape(base(), 'cascade');
    saveBouquet(b, store);
    expect(loadBouquet(FLOWERS, store)).toEqual(b);
  });

  it('returns null when nothing is saved', () => {
    expect(loadBouquet(FLOWERS, memoryStore())).toBeNull();
  });

  it('returns null for corrupt text', () => {
    expect(loadBouquet(FLOWERS, memoryStore({ [STORAGE_KEY]: '{not json' }))).toBeNull();
  });

  it('returns null for a saved flower that is no longer in the catalogue', () => {
    const store = memoryStore();
    saveBouquet(base(), store);
    expect(loadBouquet(FLOWERS.filter((f) => f.id !== 'rose'), store)).toBeNull();
  });

  it('does not throw when storage is blocked', () => {
    const blocked: Store = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('full'); },
    };
    expect(() => saveBouquet(base(), blocked)).not.toThrow();
    expect(loadBouquet(FLOWERS, blocked)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm test`
Expected: FAIL, `tests/bouquet.test.ts` reports missing exports such as `createDefaultBouquet`; `tests/arrange.test.ts` still passes.

- [ ] **Step 3: Replace `src/bouquet.ts` with the full implementation**

<!-- file: src/bouquet.ts -->
```ts
import { autoArrange, largestGap, TAU } from './arrange';
import { PAPER_COLOURS, RIBBON_COLOURS, type FlowerType } from './catalog';

export type ShapeId = 'round' | 'cascade' | 'loose' | 'onesided';
export const SHAPES: readonly ShapeId[] = ['round', 'cascade', 'loose', 'onesided'];

export type PaperId = 'none' | 'kraft' | 'matte' | 'tissue';
export const PAPERS: readonly PaperId[] = ['none', 'kraft', 'matte', 'tissue'];

export interface Stem {
  id: string;
  flower: string;
  colour: string;
  /** Position around the bouquet, radians, 0 to 2π. */
  angle: number;
  /** Distance from the centre, 0 to 1. */
  dist: number;
  /** Offset along the stem, -1 to 1. */
  height: number;
  /** Extra lean of the head away from the centre, radians, -0.5 to 0.5. */
  tilt: number;
}

export interface Wrap {
  paper: PaperId;
  paperColour: string;
  ribbonColour: string;
}

export interface Bouquet {
  version: 1;
  shape: ShapeId;
  wrap: Wrap;
  stems: Stem[];
}

export const MIN_STEMS = 1;
export const MAX_STEMS = 40;
export const HISTORY_LIMIT = 100;
export const STORAGE_KEY = 'bouquet-designer:v1';

const HEIGHT_RANGE = 1;
const TILT_RANGE = 0.5;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const findFlower = (catalog: FlowerType[], id: string) => catalog.find((f) => f.id === id);

/** Ids are "s" plus a number; a new one is always higher than any in use. */
function nextStemId(stems: Stem[]): string {
  const highest = stems.reduce((max, s) => Math.max(max, Number(s.id.slice(1)) || 0), 0);
  return `s${highest + 1}`;
}

function patchStem(b: Bouquet, stemId: string, patch: Partial<Stem>): Bouquet {
  if (!b.stems.some((s) => s.id === stemId)) return b;
  return { ...b, stems: b.stems.map((s) => (s.id === stemId ? { ...s, ...patch } : s)) };
}

export function createDefaultBouquet(catalog: FlowerType[]): Bouquet {
  const counts = [5, 4, 3];
  const stems: Stem[] = [];
  catalog.slice(0, counts.length).forEach((type, t) => {
    for (let i = 0; i < counts[t]; i++) {
      stems.push({ id: `s${stems.length + 1}`, flower: type.id, colour: type.colours[0].id, angle: 0, dist: 0, height: 0, tilt: 0 });
    }
  });
  return {
    version: 1,
    shape: 'round',
    wrap: { paper: 'kraft', paperColour: PAPER_COLOURS[0].id, ribbonColour: RIBBON_COLOURS[0].id },
    stems: autoArrange(stems),
  };
}

export function addStem(b: Bouquet, flowerId: string, catalog: FlowerType[]): Bouquet {
  const type = findFlower(catalog, flowerId);
  if (!type || b.stems.length >= MAX_STEMS) return b;
  const gap = largestGap(b.shape, b.stems, catalog, flowerId);
  const stem: Stem = { id: nextStemId(b.stems), flower: flowerId, colour: type.colours[0].id, angle: gap.angle, dist: gap.dist, height: 0, tilt: 0 };
  return { ...b, stems: [...b.stems, stem] };
}

export function removeStem(b: Bouquet, stemId: string): Bouquet {
  if (b.stems.length <= MIN_STEMS || !b.stems.some((s) => s.id === stemId)) return b;
  return { ...b, stems: b.stems.filter((s) => s.id !== stemId) };
}

/** Removes the most recently added stem of a type (the panel's minus button). */
export function removeOneOfType(b: Bouquet, flowerId: string): Bouquet {
  const last = b.stems.filter((s) => s.flower === flowerId).at(-1);
  return last ? removeStem(b, last.id) : b;
}

export function swapStem(b: Bouquet, stemId: string, flowerId: string, catalog: FlowerType[]): Bouquet {
  const type = findFlower(catalog, flowerId);
  return type ? patchStem(b, stemId, { flower: flowerId, colour: type.colours[0].id }) : b;
}

export function recolourStem(b: Bouquet, stemId: string, colourId: string, catalog: FlowerType[]): Bouquet {
  const stem = b.stems.find((s) => s.id === stemId);
  const type = stem && findFlower(catalog, stem.flower);
  return type?.colours.some((c) => c.id === colourId) ? patchStem(b, stemId, { colour: colourId }) : b;
}

export function moveStem(b: Bouquet, stemId: string, angle: number, dist: number): Bouquet {
  if (!Number.isFinite(angle) || !Number.isFinite(dist)) return b;
  return patchStem(b, stemId, { angle: ((angle % TAU) + TAU) % TAU, dist: clamp(dist, 0, 1) });
}

export function adjustStem(b: Bouquet, stemId: string, patch: { height?: number; tilt?: number }): Bouquet {
  const next: Partial<Stem> = {};
  if (Number.isFinite(patch.height)) next.height = clamp(patch.height!, -HEIGHT_RANGE, HEIGHT_RANGE);
  if (Number.isFinite(patch.tilt)) next.tilt = clamp(patch.tilt!, -TILT_RANGE, TILT_RANGE);
  return patchStem(b, stemId, next);
}

export function setShape(b: Bouquet, shape: ShapeId): Bouquet {
  return SHAPES.includes(shape) ? { ...b, shape } : b;
}

function isValidWrap(value: unknown): value is Wrap {
  if (typeof value !== 'object' || value === null) return false;
  const w = value as Record<string, unknown>;
  return PAPERS.includes(w.paper as PaperId)
    && PAPER_COLOURS.some((c) => c.id === w.paperColour)
    && RIBBON_COLOURS.some((c) => c.id === w.ribbonColour);
}

export function setWrap(b: Bouquet, patch: Partial<Wrap>): Bouquet {
  const wrap = { ...b.wrap, ...patch };
  return isValidWrap(wrap) ? { ...b, wrap } : b;
}

export function rearrange(b: Bouquet): Bouquet {
  return { ...b, stems: autoArrange(b.stems) };
}

/** The selection, or null if that stem no longer exists. */
export function resolveSelection(b: Bouquet, stemId: string | null): string | null {
  return stemId !== null && b.stems.some((s) => s.id === stemId) ? stemId : null;
}

const inRange = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/** Checks data read from storage. Returns a clean bouquet, or null if anything is wrong. */
export function validateBouquet(data: unknown, catalog: FlowerType[]): Bouquet | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  const shape = d.shape as ShapeId;
  const wrap = d.wrap;
  const rawStems = d.stems;
  if (d.version !== 1 || !SHAPES.includes(shape) || !isValidWrap(wrap) || !Array.isArray(rawStems)) return null;
  if (rawStems.length < MIN_STEMS || rawStems.length > MAX_STEMS) return null;

  const ids = new Set<string>();
  const stems: Stem[] = [];
  for (const raw of rawStems) {
    if (typeof raw !== 'object' || raw === null) return null;
    const s = raw as Record<string, unknown>;
    const { id, flower, colour, angle, dist, height, tilt } = s;
    if (typeof id !== 'string' || !/^s\d+$/.test(id) || ids.has(id)) return null;
    const type = typeof flower === 'string' ? findFlower(catalog, flower) : undefined;
    if (!type || typeof colour !== 'string' || !type.colours.some((c) => c.id === colour)) return null;
    if (!inRange(angle, 0, TAU) || !inRange(dist, 0, 1)) return null;
    if (!inRange(height, -HEIGHT_RANGE, HEIGHT_RANGE) || !inRange(tilt, -TILT_RANGE, TILT_RANGE)) return null;
    ids.add(id);
    stems.push({ id, flower: type.id, colour, angle, dist, height, tilt });
  }
  return {
    version: 1,
    shape,
    wrap: { paper: wrap.paper, paperColour: wrap.paperColour, ribbonColour: wrap.ribbonColour },
    stems,
  };
}

export interface History {
  past: Bouquet[];
  present: Bouquet;
  future: Bouquet[];
}

export function createHistory(present: Bouquet): History {
  return { past: [], present, future: [] };
}

export function commit(h: History, next: Bouquet): History {
  if (next === h.present) return h;
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [] };
}

export function undo(h: History): History {
  if (h.past.length === 0) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function redo(h: History): History {
  if (h.future.length === 0) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}

export type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function saveBouquet(b: Bouquet, store: Store): void {
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(b));
  } catch {
    // Storage is full or blocked. The designer still works; the design just isn't kept.
  }
}

export function loadBouquet(catalog: FlowerType[], store: Store): Bouquet | null {
  try {
    const raw = store.getItem(STORAGE_KEY);
    return raw === null ? null : validateBouquet(JSON.parse(raw), catalog);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npm test`
Expected: PASS, both test files.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/bouquet.ts tests/bouquet.test.ts
git commit -m "Add bouquet change functions, validation, history and saving"
```

---

### Task 3: 3D view with placeholder flowers

**Files:**
- Create: `src/scene.ts`, `public/env/studio.hdr`
- Modify: `src/main.ts` (replace the whole file)

**Interfaces:**
- Consumes: `BINDING`, `maxReach`, `stemPose`, `surfaceRadius`, `TAU`, `Vec3`, `Pose` from `arrange.ts`; `Bouquet` from `bouquet.ts`; `FlowerType` from `catalog.ts`.
- Produces: `createScene(canvas: HTMLCanvasElement, catalog: FlowerType[]): SceneApi` with
  - `render(bouquet: Bouquet, selectedId: string | null): void`
  - `resetView(): void`
  - `screenPosition(stemId: string): { x: number; y: number } | null` (canvas pixels)
  - `fps(): number`
  - `onSelect: (stemId: string | null) => void`, `onDragMove: (stemId: string, angle: number, dist: number) => void`, `onDragEnd: () => void` (assignable callbacks; unused until Task 5)

- [ ] **Step 1: Download the lighting environment**

```bash
mkdir -p public/env
curl -L -o public/env/studio.hdr "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_03_1k.hdr"
ls -l public/env/studio.hdr
```

Expected: a file between about 1 MB and 2 MB. It is a CC0 studio lighting image from Poly Haven. If the download fails or the file is tiny, delete it, skip the two environment lines in Step 2, and note in the task summary that the scene is lit by lamps only.

- [ ] **Step 2: Write `src/scene.ts`**

```ts
// ponytail: imports the whole Babylon barrel; switch to deep imports if the download size matters.
import {
  ArcRotateCamera, BackgroundMaterial, Color3, Color4, DirectionalLight, Engine, HDRCubeTexture,
  HemisphericLight, Matrix, Mesh, MeshBuilder, PBRMaterial, Quaternion, Scene, ShadowGenerator,
  TransformNode, Vector3,
} from '@babylonjs/core';
import { BINDING, maxReach, stemPose, surfaceRadius, TAU, type Pose, type Vec3 } from './arrange';
import type { Bouquet } from './bouquet';
import type { FlowerType } from './catalog';

export interface SceneApi {
  render(bouquet: Bouquet, selectedId: string | null): void;
  resetView(): void;
  /** Where a flower's head is on the canvas, in pixels from its top-left corner. */
  screenPosition(stemId: string): { x: number; y: number } | null;
  fps(): number;
  onSelect: (stemId: string | null) => void;
  onDragMove: (stemId: string, angle: number, dist: number) => void;
  onDragEnd: () => void;
}

interface FlowerNode {
  root: TransformNode;
  stem: Mesh | null;
  /** Flower type and colour this node was built for. */
  look: string;
  /** Head position and facing this node was last placed at. */
  placed: string;
}

const BACKGROUND = '#f5f3ef';
const CAMERA_ALPHA = -Math.PI / 2;
const CAMERA_BETA = 1.15;
const STEM_COLOUR = '#4f7a3a';
const CENTRE_COLOUR = '#5a4326';
const PETALS = 8;

const v3 = (p: Vec3) => new Vector3(p.x, p.y, p.z);

export function createScene(canvas: HTMLCanvasElement, catalog: FlowerType[]): SceneApi {
  const engine = new Engine(canvas, true, { stencil: true });
  const scene = new Scene(engine);
  scene.clearColor = Color4.FromHexString(`${BACKGROUND}ff`);

  const camera = new ArcRotateCamera('camera', CAMERA_ALPHA, CAMERA_BETA, 1.5, new Vector3(0, 0.4, 0), scene);
  camera.attachControl(canvas, true);
  camera.minZ = 0.01;
  camera.wheelDeltaPercentage = 0.01;
  camera.panningSensibility = 0;
  camera.upperBetaLimit = Math.PI / 2;
  camera.lowerRadiusLimit = 0.4;
  camera.upperRadiusLimit = 6;

  scene.environmentTexture = new HDRCubeTexture(`${import.meta.env.BASE_URL}env/studio.hdr`, scene, 256);
  scene.environmentIntensity = 0.8;
  const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.4;
  const sun = new DirectionalLight('sun', new Vector3(-0.4, -1, 0.5), scene);
  sun.position = new Vector3(1, 3, -1.5);
  sun.intensity = 1.5;
  const shadows = new ShadowGenerator(1024, sun);
  shadows.useBlurExponentialShadowMap = true;

  const ground = MeshBuilder.CreateGround('ground', { width: 12, height: 12 }, scene);
  const groundMaterial = new BackgroundMaterial('groundMaterial', scene);
  groundMaterial.primaryColor = Color3.FromHexString(BACKGROUND);
  groundMaterial.shadowLevel = 0.6;
  ground.material = groundMaterial;
  ground.receiveShadows = true;
  ground.isPickable = false;

  const materials = new Map<string, PBRMaterial>();
  function material(hex: string): PBRMaterial {
    let m = materials.get(hex);
    if (!m) {
      m = new PBRMaterial(`colour-${hex}`, scene);
      m.albedoColor = Color3.FromHexString(hex);
      m.metallic = 0;
      m.roughness = 0.6;
      materials.set(hex, m);
    }
    return m;
  }

  /** A stand-in flower head built from basic shapes. Origin is the head centre; local +Y is where it faces. */
  function buildPlaceholder(type: FlowerType, hex: string, stemId: string): TransformNode {
    const root = new TransformNode(`flower-${stemId}`, scene);
    const r = type.headDiameter / 2;
    const centre = MeshBuilder.CreateSphere('centre', { diameter: r * 0.9, segments: 12 }, scene);
    centre.scaling.y = 0.5;
    centre.material = material(CENTRE_COLOUR);
    centre.parent = root;
    for (let i = 0; i < PETALS; i++) {
      const around = (i / PETALS) * TAU;
      const petal = MeshBuilder.CreateSphere('petal', { diameter: r, segments: 10 }, scene);
      petal.scaling = new Vector3(1, 0.3, 0.6);
      petal.position = new Vector3(Math.cos(around) * r * 0.5, 0, Math.sin(around) * r * 0.5);
      petal.rotation.y = -around;
      petal.material = material(hex);
      petal.parent = root;
    }
    for (const mesh of root.getChildMeshes()) {
      mesh.metadata = { stemId };
      shadows.addShadowCaster(mesh);
    }
    return root;
  }

  function buildStem(pose: Pose, stemId: string): Mesh {
    const foot = new Vector3(BINDING.x - pose.dir.x * 0.04, 0.01, BINDING.z - pose.dir.z * 0.04);
    const tube = MeshBuilder.CreateTube(`stem-${stemId}`, { path: [foot, v3(BINDING), v3(pose.head)], radius: 0.004, tessellation: 6 }, scene);
    tube.material = material(STEM_COLOUR);
    tube.isPickable = false;
    shadows.addShadowCaster(tube);
    return tube;
  }

  const nodes = new Map<string, FlowerNode>();
  function disposeNode(node: FlowerNode): void {
    node.root.dispose();
    node.stem?.dispose();
  }

  let reach = 0.3;
  let viewWasSet = false;

  function resetView(): void {
    camera.alpha = CAMERA_ALPHA;
    camera.beta = CAMERA_BETA;
    camera.radius = reach * 3.2 + 0.3;
    camera.target = new Vector3(0, BINDING.y + reach * 0.5, 0);
  }

  function render(bouquet: Bouquet, _selectedId: string | null): void {
    const radius = surfaceRadius(bouquet.stems, catalog);
    const seen = new Set<string>();
    let lowest = 0;

    for (const stem of bouquet.stems) {
      const type = catalog.find((f) => f.id === stem.flower);
      if (!type) continue;
      seen.add(stem.id);
      const hex = type.colours.find((c) => c.id === stem.colour)?.hex ?? type.colours[0].hex;
      const look = `${stem.flower}|${stem.colour}`;

      let node = nodes.get(stem.id);
      if (node && node.look !== look) {
        disposeNode(node);
        node = undefined;
      }
      if (!node) {
        node = { root: buildPlaceholder(type, hex, stem.id), stem: null, look, placed: '' };
        nodes.set(stem.id, node);
      }

      const pose = stemPose(bouquet.shape, stem, radius);
      lowest = Math.min(lowest, pose.head.y - type.headDiameter / 2);
      const placed = [pose.head.x, pose.head.y, pose.head.z, pose.face.x, pose.face.y, pose.face.z].map((n) => n.toFixed(5)).join(',');
      if (node.placed !== placed) {
        node.root.position = v3(pose.head);
        node.root.rotationQuaternion = Quaternion.FromUnitVectorsToRef(Vector3.Up(), v3(pose.face), new Quaternion());
        node.stem?.dispose();
        node.stem = buildStem(pose, stem.id);
        node.placed = placed;
      }
    }

    for (const [id, node] of nodes) {
      if (!seen.has(id)) {
        disposeNode(node);
        nodes.delete(id);
      }
    }

    // A cascading bouquet hangs below its stems; lower the floor so nothing sinks into it.
    ground.position.y = lowest - 0.01;
    reach = maxReach(bouquet.shape, radius);
    if (!viewWasSet) {
      resetView();
      viewWasSet = true;
    }
  }

  function screenPosition(stemId: string): { x: number; y: number } | null {
    const node = nodes.get(stemId);
    if (!node) return null;
    const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
    const p = Vector3.Project(node.root.position, Matrix.Identity(), scene.getTransformMatrix(), viewport);
    return { x: p.x, y: p.y };
  }

  engine.runRenderLoop(() => scene.render());
  window.addEventListener('resize', () => engine.resize());

  return {
    render,
    resetView,
    screenPosition,
    fps: () => engine.getFps(),
    onSelect: () => {},
    onDragMove: () => {},
    onDragEnd: () => {},
  };
}
```

- [ ] **Step 3: Replace `src/main.ts`**

```ts
import { createDefaultBouquet } from './bouquet';
import { FLOWERS } from './catalog';
import { createScene } from './scene';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const scene = createScene(canvas, FLOWERS);
scene.render(createDefaultBouquet(FLOWERS), null);
```

- [ ] **Step 4: Type check, then look at it**

Run: `npx tsc --noEmit`
Expected: no errors. If a Babylon name is reported missing, find the 9.30 equivalent in `node_modules/@babylonjs/core` and use it (see Global Constraints).

Run: `npm run shot -- shots/task3-front.png`
Expected: `ok`. Read the screenshot and confirm all of these:
- 12 flower heads in three colours form a dome, with none sunk into another.
- Green stems run from the heads down through one crossing point to the floor.
- Heads face outward from the centre, not all straight up.
- There is a soft shadow on the floor and the floor blends into the background with no visible edge.

- [ ] **Step 5: Check spinning and zooming**

Create `tools/steps/orbit.mjs`:

```js
export default async (page) => {
  const box = await page.locator('#view').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 300, cy - 120, { steps: 12 });
  await page.mouse.up();
  await page.mouse.wheel(0, -400);
};
```

Run: `npm run shot -- shots/task3-orbit.png tools/steps/orbit.mjs`
Expected: `ok`, and the screenshot shows the bouquet from a different side, higher up, and closer than `task3-front.png`.

- [ ] **Step 6: Tune the look**

Compare both screenshots against these targets and adjust only the constants named, then re-run Step 4:
- Flowers too dark or washed out: `scene.environmentIntensity`, `hemi.intensity`, `sun.intensity`.
- Shadow too hard or invisible: `groundMaterial.shadowLevel`.
- Bouquet too small or cut off at the default view: the `reach * 3.2 + 0.3` radius and `reach * 0.5` target height in `resetView`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add 3D view with placeholder flowers, camera and lighting"
```

---

### Task 4: Side panel

**Files:**
- Create: `src/panel.ts`
- Modify: `src/main.ts` (replace the whole file)

**Interfaces:**
- Consumes: everything Task 2 produces; `SceneApi` from Task 3.
- Produces from `panel.ts`:
  - `PanelState = { bouquet: Bouquet; selectedId: string | null; canUndo: boolean; canRedo: boolean }`
  - `PanelActions` with `add(flowerId)`, `removeOne(flowerId)`, `setShape(shape)`, `setWrap(patch)`, `recolour(colourId)`, `previewAdjust(patch)`, `adjust(patch)`, `swap(flowerId)`, `remove()`, `undo()`, `redo()`, `rearrange()`, `resetView()`
  - `renderPanel(root: HTMLElement, state: PanelState, catalog: FlowerType[], actions: PanelActions): void`
- Produces from `main.ts` (development builds only): `window.__debug` with `bouquet(): Bouquet`, `selected(): string | null`, `screenOf(stemId): { x, y } | null`, `fps(): number`.

The panel is rebuilt from scratch on every committed change. Sliders call `previewAdjust` while moving (which redraws only the 3D view, so the slider is not destroyed mid-drag) and `adjust` on release.

- [ ] **Step 1: Write `src/panel.ts`**

```ts
import { MAX_STEMS, MIN_STEMS, type Bouquet, type PaperId, type ShapeId, type Wrap } from './bouquet';
import { PAPER_COLOURS, RIBBON_COLOURS, type FlowerType, type NamedColour } from './catalog';

export interface PanelState {
  bouquet: Bouquet;
  selectedId: string | null;
  canUndo: boolean;
  canRedo: boolean;
}

export interface PanelActions {
  add(flowerId: string): void;
  removeOne(flowerId: string): void;
  setShape(shape: ShapeId): void;
  setWrap(patch: Partial<Wrap>): void;
  recolour(colourId: string): void;
  /** Slider is moving: show the change without recording it. */
  previewAdjust(patch: { height?: number; tilt?: number }): void;
  /** Slider released: record the change. */
  adjust(patch: { height?: number; tilt?: number }): void;
  swap(flowerId: string): void;
  remove(): void;
  undo(): void;
  redo(): void;
  rearrange(): void;
  resetView(): void;
}

const SHAPE_NAMES: Record<ShapeId, string> = { round: 'Round', cascade: 'Cascading', loose: 'Loose hand-tied', onesided: 'One-sided' };
const PAPER_NAMES: Record<PaperId, string> = { none: 'No paper', kraft: 'Kraft', matte: 'Matte', tissue: 'Tissue' };

type Child = Node | string;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

/** `key` lets keyboard focus return to the same control after the panel is rebuilt. */
function button(key: string, label: string, onClick: () => void, attrs: Record<string, string> = {}, disabled = false): HTMLButtonElement {
  const b = el('button', { type: 'button', 'data-key': key, ...attrs }, label);
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

function swatches(key: string, legend: string, colours: NamedColour[], current: string, onPick: (id: string) => void): HTMLElement {
  const row = el('div', { class: 'swatches' });
  for (const c of colours) {
    row.append(button(`${key}-${c.id}`, '', () => onPick(c.id), {
      class: 'swatch', style: `background:${c.hex}`, title: c.name, 'aria-label': c.name, 'aria-pressed': String(c.id === current),
    }));
  }
  return el('fieldset', {}, el('legend', {}, legend), row);
}

function select(key: string, label: string, options: { id: string; name: string }[], current: string, onChange: (id: string) => void): HTMLElement {
  const input = el('select', { id: key, 'data-key': key });
  for (const o of options) {
    const option = el('option', { value: o.id }, o.name);
    option.selected = o.id === current;
    input.append(option);
  }
  input.addEventListener('change', () => onChange(input.value));
  return el('div', { class: 'field' }, el('label', { for: key }, label), input);
}

function slider(key: string, label: string, min: number, max: number, value: number, onInput: (v: number) => void, onChange: (v: number) => void): HTMLElement {
  const input = el('input', { id: key, 'data-key': key, type: 'range', min: String(min), max: String(max), step: '0.01', value: String(value) });
  input.addEventListener('input', () => onInput(Number(input.value)));
  input.addEventListener('change', () => onChange(Number(input.value)));
  return el('div', { class: 'field' }, el('label', { for: key }, label), input);
}

function section(title: string, ...children: Child[]): HTMLElement {
  return el('section', {}, el('h2', {}, title), ...children);
}

export function renderPanel(root: HTMLElement, state: PanelState, catalog: FlowerType[], actions: PanelActions): void {
  const { bouquet, selectedId } = state;
  const focusedKey = (document.activeElement as HTMLElement | null)?.dataset?.key;
  const total = bouquet.stems.length;

  const flowerRows = catalog.map((type) => {
    const count = bouquet.stems.filter((s) => s.flower === type.id).length;
    return el('div', { class: 'row' },
      el('span', { class: 'name' }, type.name),
      button(`minus-${type.id}`, '−', () => actions.removeOne(type.id), { class: 'step', 'aria-label': `Remove one ${type.name}` }, count === 0 || total <= MIN_STEMS),
      el('span', { class: 'count', 'aria-label': `${count} ${type.name}` }, String(count)),
      button(`plus-${type.id}`, '+', () => actions.add(type.id), { class: 'step', 'aria-label': `Add one ${type.name}` }, total >= MAX_STEMS),
    );
  });

  const sections: HTMLElement[] = [
    section('Your bouquet', ...flowerRows, el('p', { class: 'row' }, `${total} of ${MAX_STEMS} flowers`)),
    section('Shape',
      select('shape', 'Bouquet shape', (Object.keys(SHAPE_NAMES) as ShapeId[]).map((id) => ({ id, name: SHAPE_NAMES[id] })), bouquet.shape, (id) => actions.setShape(id as ShapeId)),
    ),
    section('Wrapping',
      select('paper', 'Paper', (Object.keys(PAPER_NAMES) as PaperId[]).map((id) => ({ id, name: PAPER_NAMES[id] })), bouquet.wrap.paper, (id) => actions.setWrap({ paper: id as PaperId })),
      swatches('paper-colour', 'Paper colour', PAPER_COLOURS, bouquet.wrap.paperColour, (id) => actions.setWrap({ paperColour: id })),
      swatches('ribbon-colour', 'Ribbon colour', RIBBON_COLOURS, bouquet.wrap.ribbonColour, (id) => actions.setWrap({ ribbonColour: id })),
    ),
  ];

  const stem = bouquet.stems.find((s) => s.id === selectedId);
  const type = stem && catalog.find((f) => f.id === stem.flower);
  if (stem && type) {
    sections.push(section(`Selected: ${type.name}`,
      swatches('flower-colour', 'Colour', type.colours, stem.colour, (id) => actions.recolour(id)),
      slider('height', 'Height', -1, 1, stem.height, (v) => actions.previewAdjust({ height: v }), (v) => actions.adjust({ height: v })),
      slider('tilt', 'Tilt', -0.5, 0.5, stem.tilt, (v) => actions.previewAdjust({ tilt: v }), (v) => actions.adjust({ tilt: v })),
      select('swap', 'Swap for', catalog.map((f) => ({ id: f.id, name: f.name })), stem.flower, (id) => actions.swap(id)),
      button('remove', 'Remove this flower', () => actions.remove(), { class: 'danger' }, total <= MIN_STEMS),
    ));
  } else {
    sections.push(section('Selected flower', el('p', {}, 'Click a flower in the 3D view to change it.')));
  }

  sections.push(section('Actions', el('div', { class: 'actions' },
    button('undo', 'Undo', () => actions.undo(), {}, !state.canUndo),
    button('redo', 'Redo', () => actions.redo(), {}, !state.canRedo),
    button('rearrange', 'Re-arrange', () => actions.rearrange()),
    button('reset-view', 'Reset view', () => actions.resetView()),
  )));

  root.replaceChildren(...sections);
  if (focusedKey) root.querySelector<HTMLElement>(`[data-key="${focusedKey}"]`)?.focus();
}
```

- [ ] **Step 2: Replace `src/main.ts`**

```ts
import {
  addStem, adjustStem, commit, createDefaultBouquet, createHistory, rearrange, recolourStem, redo,
  removeOneOfType, removeStem, resolveSelection, setShape, setWrap, swapStem, undo, type Bouquet,
} from './bouquet';
import { FLOWERS } from './catalog';
import { renderPanel, type PanelActions } from './panel';
import { createScene } from './scene';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const panelRoot = document.getElementById('panel') as HTMLElement;
const scene = createScene(canvas, FLOWERS);

let history = createHistory(createDefaultBouquet(FLOWERS));
let selectedId: string | null = null;
/** A change being shown but not yet recorded (a slider or a flower mid-drag). */
let draft: Bouquet | null = null;

function refresh(): void {
  draft = null;
  selectedId = resolveSelection(history.present, selectedId);
  scene.render(history.present, selectedId);
  renderPanel(panelRoot, {
    bouquet: history.present,
    selectedId,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  }, FLOWERS, actions);
}

/** Record a change. Does nothing extra if the change was refused and returned the same bouquet. */
function apply(next: Bouquet): void {
  history = commit(history, next);
  refresh();
}

/** Show a change in the 3D view only. */
function preview(next: Bouquet): void {
  draft = next;
  scene.render(next, selectedId);
}

const onSelected = (change: (b: Bouquet, stemId: string) => Bouquet) => (selectedId ? change(history.present, selectedId) : history.present);

const actions: PanelActions = {
  add: (flowerId) => apply(addStem(history.present, flowerId, FLOWERS)),
  removeOne: (flowerId) => apply(removeOneOfType(history.present, flowerId)),
  setShape: (shape) => apply(setShape(history.present, shape)),
  setWrap: (patch) => apply(setWrap(history.present, patch)),
  recolour: (colourId) => apply(onSelected((b, id) => recolourStem(b, id, colourId, FLOWERS))),
  previewAdjust: (patch) => preview(onSelected((b, id) => adjustStem(b, id, patch))),
  adjust: (patch) => apply(onSelected((b, id) => adjustStem(b, id, patch))),
  swap: (flowerId) => apply(onSelected((b, id) => swapStem(b, id, flowerId, FLOWERS))),
  remove: () => apply(onSelected((b, id) => removeStem(b, id))),
  undo: () => { history = undo(history); refresh(); },
  redo: () => { history = redo(history); refresh(); },
  rearrange: () => apply(rearrange(history.present)),
  resetView: () => scene.resetView(),
};

if (import.meta.env.DEV) {
  Object.assign(window, {
    __debug: {
      bouquet: () => draft ?? history.present,
      selected: () => selectedId,
      screenOf: (stemId: string) => scene.screenPosition(stemId),
      fps: () => scene.fps(),
    },
  });
}

refresh();
```

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Check every panel control in the browser**

Create `tools/steps/panel.mjs`:

```js
const state = (page) => page.evaluate(() => window.__debug.bouquet());
const expect = (ok, message) => { if (!ok) throw new Error(message); };

export default async (page) => {
  const start = await state(page);
  expect(start.stems.length === 12, 'starts with 12 stems');

  await page.click('[data-key="plus-lily"]');
  await page.click('[data-key="plus-lily"]');
  let b = await state(page);
  expect(b.stems.filter((s) => s.flower === 'lily').length === 2, 'plus adds lilies');
  expect(JSON.stringify(b.stems.slice(0, 12)) === JSON.stringify(start.stems), 'adding leaves the others in place');

  await page.click('[data-key="minus-lily"]');
  b = await state(page);
  expect(b.stems.length === 13, 'minus removes one');

  await page.selectOption('[data-key="shape"]', 'cascade');
  expect((await state(page)).shape === 'cascade', 'shape changes');

  await page.click('[data-key="undo"]');
  expect((await state(page)).shape === 'round', 'undo restores the shape');
  await page.click('[data-key="redo"]');
  expect((await state(page)).shape === 'cascade', 'redo re-applies the shape');

  await page.click('[data-key="rearrange"]');
  expect((await state(page)).stems.length === 13, 're-arrange keeps every stem');

  expect(await page.isDisabled('[data-key="minus-sunflower"]'), 'minus is disabled at zero');
};
```

Run: `npm run shot -- shots/task4-panel.png tools/steps/panel.mjs`
Expected: `ok`. Read the screenshot: the panel shows six flower rows with counts, Shape, Wrapping, "Selected flower" hint and Actions; the 3D view shows a cascading bouquet with 13 flowers whose front drops lower than its back.

- [ ] **Step 5: Look at all four shapes**

Create `tools/steps/shape.mjs`:

```js
export default async (page) => {
  await page.selectOption('[data-key="shape"]', process.env.SHAPE);
};
```

Run each of these and read the four screenshots (PowerShell: set `$env:SHAPE` first; Bash: prefix `SHAPE=round`):

```bash
SHAPE=round npm run shot -- shots/task4-round.png tools/steps/shape.mjs
SHAPE=cascade npm run shot -- shots/task4-cascade.png tools/steps/shape.mjs
SHAPE=loose npm run shot -- shots/task4-loose.png tools/steps/shape.mjs
SHAPE=onesided npm run shot -- shots/task4-onesided.png tools/steps/shape.mjs
```

Expected: round is an even dome; cascade trails down at the front; loose is wider and less regular; one-sided has all heads on the camera side. If a shape does not read as described, tune its numbers in `BASE_POLAR`, `maxPolar`, `lengthFactor` and `MAX_LENGTH_FACTOR` in `src/arrange.ts`, keeping `MAX_LENGTH_FACTOR` at or above the largest value `lengthFactor` can return, then run `npm test` (must still pass) and repeat this step.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add side panel for flowers, shape, wrapping choices and actions"
```

---

### Task 5: Select, drag and per-flower controls

**Files:**
- Modify: `src/scene.ts`, `src/main.ts`

**Interfaces:**
- Consumes: `surfaceFromPoint`, `surfacePoint` from `arrange.ts`; `moveStem` from `bouquet.ts`; `ShapeId`.
- Produces: `scene.onSelect`, `scene.onDragMove`, `scene.onDragEnd` are now called; `render` highlights `selectedId`.

Behaviour: pressing on a flower and releasing without moving more than 4 px selects it. Pressing on empty space the same way clears the selection. Pressing on the already-selected flower and moving drags it: the camera is detached for the duration, the mouse is projected onto an invisible mesh of the bouquet surface, and that point becomes the flower's new `(angle, dist)`. Any other press-and-move spins the camera as before.

- [ ] **Step 1: Extend the imports in `src/scene.ts`**

Add `HighlightLayer` and `PointerEventTypes` to the `@babylonjs/core` import. Change the `arrange` import to:

```ts
import { BINDING, maxReach, stemPose, surfaceFromPoint, surfacePoint, surfaceRadius, TAU, type Pose, type Vec3 } from './arrange';
```

Change the `bouquet` import to:

```ts
import type { Bouquet, ShapeId } from './bouquet';
```

Add these constants beside the others at the top of the file:

```ts
const HIGHLIGHT_COLOUR = '#2f6fed';
/** Pixels the mouse may move and still count as a click. */
const CLICK_SLOP = 4;
const SURFACE_RINGS = 12;
const SURFACE_SPOKES = 48;
```

- [ ] **Step 2: Add the highlight and drag surface inside `createScene`, after the `nodes` map and `disposeNode`**

```ts
  const highlight = new HighlightLayer('highlight', scene);

  function applyHighlight(selectedId: string | null): void {
    const node = selectedId ? nodes.get(selectedId) : undefined;
    if (!node) return;
    for (const mesh of node.root.getChildMeshes()) highlight.addMesh(mesh as Mesh, Color3.FromHexString(HIGHLIGHT_COLOUR));
  }

  let currentShape: ShapeId = 'round';
  let currentSelected: string | null = null;
  let dragSurface: Mesh | null = null;
  let dragSurfaceFor = '';

  /** An invisible copy of the bouquet surface, used only to find where the mouse points during a drag. */
  function updateDragSurface(shape: ShapeId, radius: number): void {
    const builtFor = `${shape}|${radius.toFixed(4)}`;
    if (builtFor === dragSurfaceFor) return;
    dragSurface?.dispose();
    const rings: Vector3[][] = [];
    for (let ring = 0; ring <= SURFACE_RINGS; ring++) {
      const points: Vector3[] = [];
      for (let spoke = 0; spoke <= SURFACE_SPOKES; spoke++) {
        const angle = Math.min((spoke / SURFACE_SPOKES) * TAU, TAU - 1e-6);
        points.push(v3(surfacePoint(shape, angle, ring / SURFACE_RINGS, radius).head));
      }
      rings.push(points);
    }
    dragSurface = MeshBuilder.CreateRibbon('dragSurface', { pathArray: rings, sideOrientation: Mesh.DOUBLESIDE }, scene);
    dragSurface.isVisible = false;
    dragSurfaceFor = builtFor;
  }
```

- [ ] **Step 3: Update `render` in `src/scene.ts`**

Rename its second parameter from `_selectedId` to `selectedId`. Make this the first line of the function body, before any node is disposed:

```ts
    highlight.removeAllMeshes();
```

Add these lines at the end of the function body, after `reach` is set:

```ts
    currentShape = bouquet.shape;
    currentSelected = selectedId;
    updateDragSurface(bouquet.shape, radius);
    applyHighlight(selectedId);
```

- [ ] **Step 4: Build the returned object first, then add pointer handling**

Replace the final `return { ... };` of `createScene` with:

```ts
  const api: SceneApi = {
    render,
    resetView,
    screenPosition,
    fps: () => engine.getFps(),
    onSelect: () => {},
    onDragMove: () => {},
    onDragEnd: () => {},
  };

  let press: { x: number; y: number; stemId: string | null; canDrag: boolean; dragging: boolean } | null = null;

  function stemUnderPointer(): string | null {
    const hit = scene.pick(scene.pointerX, scene.pointerY, (mesh) => Boolean(mesh.metadata?.stemId));
    return hit?.hit && hit.pickedMesh ? (hit.pickedMesh.metadata.stemId as string) : null;
  }

  scene.onPointerObservable.add((info) => {
    if (info.type === PointerEventTypes.POINTERDOWN) {
      const stemId = stemUnderPointer();
      const canDrag = stemId !== null && stemId === currentSelected;
      press = { x: scene.pointerX, y: scene.pointerY, stemId, canDrag, dragging: false };
      if (canDrag) camera.detachControl();
    } else if (info.type === PointerEventTypes.POINTERMOVE && press?.canDrag && press.stemId) {
      const moved = Math.hypot(scene.pointerX - press.x, scene.pointerY - press.y);
      if (!press.dragging && moved < CLICK_SLOP) return;
      press.dragging = true;
      const hit = scene.pick(scene.pointerX, scene.pointerY, (mesh) => mesh === dragSurface);
      if (hit?.hit && hit.pickedPoint) {
        const at = surfaceFromPoint(currentShape, hit.pickedPoint);
        api.onDragMove(press.stemId, at.angle, at.dist);
      }
    } else if (info.type === PointerEventTypes.POINTERUP && press) {
      const moved = Math.hypot(scene.pointerX - press.x, scene.pointerY - press.y);
      if (press.canDrag) camera.attachControl(canvas, true);
      if (press.dragging) api.onDragEnd();
      else if (moved < CLICK_SLOP) api.onSelect(press.stemId);
      press = null;
    }
  });

  return api;
```

- [ ] **Step 5: Wire selection and dragging in `src/main.ts`**

Add `moveStem` to the import from `./bouquet`. Insert this block immediately before the `if (import.meta.env.DEV)` block:

```ts
scene.onSelect = (stemId) => {
  selectedId = stemId;
  refresh();
};
scene.onDragMove = (stemId, angle, dist) => preview(moveStem(history.present, stemId, angle, dist));
scene.onDragEnd = () => {
  if (draft) apply(draft);
};
```

- [ ] **Step 6: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Check selecting, dragging and every per-flower control**

Create `tools/steps/select-drag.mjs`:

```js
const debug = (page, fn, arg) => page.evaluate(([f, a]) => window.__debug[f](a), [fn, arg]);
const expect = (ok, message) => { if (!ok) throw new Error(message); };
const stemOf = (b, id) => b.stems.find((s) => s.id === id);

export default async (page) => {
  const box = await page.locator('#view').boundingBox();
  const at = async (id) => {
    const p = await debug(page, 'screenOf', id);
    return { x: box.x + p.x, y: box.y + p.y };
  };
  const first = (await debug(page, 'bouquet')).stems[0].id;

  // Click a flower: it becomes selected and its controls appear.
  let p = await at(first);
  await page.mouse.click(p.x, p.y);
  const id = await debug(page, 'selected');
  expect(id !== null, 'clicking a flower selects one');
  expect(await page.isVisible('[data-key="remove"]'), 'selected-flower controls appear');

  // Drag the selected flower: it moves, and the camera does not.
  const before = stemOf(await debug(page, 'bouquet'), id);
  p = await at(id);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 90, p.y + 20, { steps: 12 });
  await page.mouse.up();
  const after = stemOf(await debug(page, 'bouquet'), id);
  expect(after.angle !== before.angle || after.dist !== before.dist, 'dragging moves the flower');
  expect((await debug(page, 'selected')) === id, 'the flower stays selected after a drag');

  // One undo reverses the whole drag.
  await page.click('[data-key="undo"]');
  const undone = stemOf(await debug(page, 'bouquet'), id);
  expect(undone.angle === before.angle && undone.dist === before.dist, 'one undo reverses the drag');
  await page.click('[data-key="redo"]');

  // Colour: only the flower's own colours are offered.
  const flower = stemOf(await debug(page, 'bouquet'), id).flower;
  const offered = await page.locator('[data-key^="flower-colour-"]').count();
  expect(offered >= 1, 'colour swatches are shown');
  if (offered > 1) {
    await page.locator('[data-key^="flower-colour-"]').nth(1).click();
    expect(stemOf(await debug(page, 'bouquet'), id).colour !== before.colour, 'colour changes');
  }

  // Height and tilt sliders.
  await page.locator('[data-key="height"]').fill('0.8');
  await page.locator('[data-key="height"]').dispatchEvent('change');
  expect(stemOf(await debug(page, 'bouquet'), id).height === 0.8, 'height slider works');
  await page.locator('[data-key="tilt"]').fill('0.3');
  await page.locator('[data-key="tilt"]').dispatchEvent('change');
  expect(stemOf(await debug(page, 'bouquet'), id).tilt === 0.3, 'tilt slider works');

  // Swap keeps the position.
  const target = flower === 'sunflower' ? 'rose' : 'sunflower';
  const preSwap = stemOf(await debug(page, 'bouquet'), id);
  await page.selectOption('[data-key="swap"]', target);
  const swapped = stemOf(await debug(page, 'bouquet'), id);
  expect(swapped.flower === target && swapped.angle === preSwap.angle && swapped.dist === preSwap.dist, 'swap keeps the position');

  // Remove clears the selection.
  const count = (await debug(page, 'bouquet')).stems.length;
  await page.click('[data-key="remove"]');
  expect((await debug(page, 'bouquet')).stems.length === count - 1, 'remove deletes the flower');
  expect((await debug(page, 'selected')) === null, 'selection clears when the flower is removed');

  // Click empty space: nothing is selected. Then select again for the screenshot.
  await page.mouse.click(box.x + 20, box.y + 20);
  expect((await debug(page, 'selected')) === null, 'clicking empty space selects nothing');
  p = await at((await debug(page, 'bouquet')).stems[0].id);
  await page.mouse.click(p.x, p.y);
};
```

Run: `npm run shot -- shots/task5-select.png tools/steps/select-drag.mjs`
Expected: `ok`. Read the screenshot: exactly one flower has a blue outline, and the panel shows its "Selected:" section with colour swatches, two sliders, the swap list and the remove button.

If "dragging moves the flower" fails, the invisible drag surface is probably not being picked. In `updateDragSurface`, replace `dragSurface.isVisible = false;` with `dragSurface.visibility = 0;` and rerun; if that also fails, give it a material with `alpha = 0` instead.

- [ ] **Step 8: Check that spinning still works when a flower is selected**

Run: `npm run shot -- shots/task5-orbit.png tools/steps/orbit.mjs`
Expected: `ok`, and the view has turned as in Task 3.

- [ ] **Step 9: Run the tests and commit**

Run: `npm test`
Expected: PASS.

```bash
git add -A
git commit -m "Add click to select, drag to move and per-flower controls"
```

- [ ] **Step 10: Code review checkpoint**

Dispatch one review subagent (model `opus`, effort `high`) with this brief, then fix every confirmed correctness finding, rerun `npm test` and the Task 5 browser checks, and commit the fixes:

> Review the code in `C:\Users\USER\Desktop\coding\claude_code_project\bouquet-designer\src` and `tests` against the spec at `docs/superpowers/specs/2026-10-11-bouquet-designer-design.md` and the plan at `docs/superpowers/plans/2026-10-11-bouquet-designer.md` (Tasks 0-5 are done; wrapping, saving and real models are not yet built, so do not report them missing). Look for correctness bugs, especially: the geometry in `arrange.ts`, pointer handling and camera detach/attach in `scene.ts` (stuck drags, lost pointer-up, stale selection), leaked or double-disposed Babylon meshes, and state drift between `main.ts`, the scene and the panel. Do not edit files. Report each finding as file and line, what goes wrong, and a concrete input or action that triggers it, most severe first. Say plainly if you find nothing.

---

### Task 6: Wrapping and ribbon

**Files:**
- Create: `src/wrap.ts`
- Modify: `src/scene.ts`

**Interfaces:**
- Consumes: `BINDING`, `surfacePoint` from `arrange.ts`; `ShapeId`, `Wrap`, `PaperId` from `bouquet.ts`; `PAPER_COLOURS`, `RIBBON_COLOURS` from `catalog.ts`.
- Produces: `buildWrap(scene: Scene, wrap: Wrap, shape: ShapeId, radius: number): TransformNode`. The caller disposes the previous node.

- [ ] **Step 1: Write `src/wrap.ts`**

```ts
import { Color3, Mesh, MeshBuilder, PBRMaterial, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { BINDING, surfacePoint } from './arrange';
import type { PaperId, ShapeId, Wrap } from './bouquet';
import { PAPER_COLOURS, RIBBON_COLOURS } from './catalog';

const PAPER_LOOK: Record<Exclude<PaperId, 'none'>, { roughness: number; alpha: number }> = {
  kraft: { roughness: 0.95, alpha: 1 },
  matte: { roughness: 0.7, alpha: 1 },
  tissue: { roughness: 0.6, alpha: 0.55 },
};
/** Fraction of a full turn the paper covers; the rest is the opening at the front. */
const PAPER_ARC = 0.78;
/** Turns the paper so its opening faces the default camera. Set in Task 6 Step 4. */
const PAPER_OPENING_TURN = 0;

function flatMaterial(scene: Scene, name: string, hex: string, roughness: number, alpha = 1): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = Color3.FromHexString(hex);
  m.metallic = 0;
  m.roughness = roughness;
  m.alpha = alpha;
  m.backFaceCulling = false;
  return m;
}

export function buildWrap(scene: Scene, wrap: Wrap, shape: ShapeId, radius: number): TransformNode {
  const root = new TransformNode('wrap', scene);
  const add = (mesh: Mesh, material: PBRMaterial) => {
    mesh.material = material;
    mesh.isPickable = false;
    mesh.parent = root;
  };

  const hasPaper = wrap.paper !== 'none';
  const neck = hasPaper ? 0.042 : 0.022;

  if (wrap.paper !== 'none') {
    const look = PAPER_LOOK[wrap.paper];
    const hex = PAPER_COLOURS.find((c) => c.id === wrap.paperColour)?.hex ?? PAPER_COLOURS[0].hex;
    // Size the paper from the rim of an even dome so it suits every shape.
    const rim = surfacePoint(shape === 'loose' ? 'loose' : 'round', 0, 1, radius).head;
    const rimRadius = Math.hypot(rim.x, rim.z) * 1.12;
    const rimHeight = rim.y + 0.03;
    const profile = [
      new Vector3(0.022, 0.02, 0),
      new Vector3(neck - 0.002, BINDING.y, 0),
      new Vector3(rimRadius * 0.6, BINDING.y + (rimHeight - BINDING.y) * 0.45, 0),
      new Vector3(rimRadius, rimHeight, 0),
    ];
    const paper = MeshBuilder.CreateLathe('paper', { shape: profile, arc: PAPER_ARC, tessellation: 48, sideOrientation: Mesh.DOUBLESIDE, cap: Mesh.NO_CAP }, scene);
    paper.rotation.y = PAPER_OPENING_TURN;
    add(paper, flatMaterial(scene, 'paperMaterial', hex, look.roughness, look.alpha));
  }

  const ribbonHex = RIBBON_COLOURS.find((c) => c.id === wrap.ribbonColour)?.hex ?? RIBBON_COLOURS[0].hex;
  const ribbon = flatMaterial(scene, 'ribbonMaterial', ribbonHex, 0.45);

  const band = MeshBuilder.CreateCylinder('ribbonBand', { height: 0.03, diameter: neck * 2, tessellation: 32 }, scene);
  band.position = new Vector3(BINDING.x, BINDING.y, BINDING.z);
  add(band, ribbon);

  // A simple bow on the front: two loops and two tails.
  for (const side of [-1, 1]) {
    const loop = MeshBuilder.CreateTorus('ribbonLoop', { diameter: 0.05, thickness: 0.012, tessellation: 24 }, scene);
    loop.scaling.y = 2.2;
    loop.rotation.x = Math.PI / 2;
    loop.position = new Vector3(side * 0.03, BINDING.y, -(neck + 0.008));
    add(loop, ribbon);

    const tail = MeshBuilder.CreateBox('ribbonTail', { width: 0.014, height: 0.09, depth: 0.002 }, scene);
    tail.rotation.z = side * 0.25;
    tail.position = new Vector3(side * 0.014, BINDING.y - 0.05, -(neck + 0.006));
    add(tail, ribbon);
  }

  return root;
}
```

- [ ] **Step 2: Draw the wrap from `src/scene.ts`**

Add the import:

```ts
import { buildWrap } from './wrap';
```

Inside `createScene`, next to the drag-surface variables, add:

```ts
  let wrapNode: TransformNode | null = null;
  let wrapFor = '';
```

At the end of `render`, after `applyHighlight(selectedId);`, add:

```ts
    const wrapKey = `${JSON.stringify(bouquet.wrap)}|${bouquet.shape}|${radius.toFixed(4)}`;
    if (wrapKey !== wrapFor) {
      wrapNode?.dispose(false, true);
      wrapNode = buildWrap(scene, bouquet.wrap, bouquet.shape, radius);
      for (const mesh of wrapNode.getChildMeshes()) shadows.addShadowCaster(mesh);
      wrapFor = wrapKey;
    }
```

(`dispose(false, true)` also disposes the wrap's own materials, which are created fresh each time.)

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Point the paper's opening at the camera**

Run: `npm run shot -- shots/task6-kraft.png`
Read the screenshot. The paper must wrap the back and sides of the bouquet with its opening centred on the camera side, so the flowers and the bow are visible from the default view. If the opening faces elsewhere, change `PAPER_OPENING_TURN` in `src/wrap.ts` (try `Math.PI / 2`, `Math.PI`, `-Math.PI / 2`, then fine steps of 0.1) and rerun until the opening is centred. Record the final value in the constant's comment.

- [ ] **Step 5: Check every wrap option and that it resizes**

Create `tools/steps/wrap.mjs`:

```js
const state = (page) => page.evaluate(() => window.__debug.bouquet());
const expect = (ok, message) => { if (!ok) throw new Error(message); };

export default async (page) => {
  await page.selectOption('[data-key="paper"]', process.env.PAPER ?? 'tissue');
  await page.click('[data-key="paper-colour-blush"]');
  await page.click('[data-key="ribbon-colour-navy"]');
  const { wrap } = await state(page);
  expect(wrap.paper === (process.env.PAPER ?? 'tissue') && wrap.paperColour === 'blush' && wrap.ribbonColour === 'navy', 'wrap choices are stored');
  for (let i = 0; i < Number(process.env.EXTRA ?? 0); i++) await page.click('[data-key="plus-daisy"]');
};
```

Run and read each screenshot:

```bash
PAPER=tissue npm run shot -- shots/task6-tissue.png tools/steps/wrap.mjs
PAPER=matte npm run shot -- shots/task6-matte.png tools/steps/wrap.mjs
PAPER=none npm run shot -- shots/task6-none.png tools/steps/wrap.mjs
PAPER=kraft EXTRA=20 npm run shot -- shots/task6-large.png tools/steps/wrap.mjs
SHAPE=cascade npm run shot -- shots/task6-cascade.png tools/steps/shape.mjs
```

Expected:
- tissue: blush paper you can partly see through, navy bow.
- matte: solid blush paper.
- none: no paper; stems visible with the navy band and bow at the crossing point.
- large: 32 flowers, and the paper is wider and taller so it still surrounds them.
- cascade: the front flowers hang out through the paper's opening and are not cut by it.

If the paper cuts through heads or stands far away from them, adjust the `1.12` rim scale, the `0.03` rim height and the middle profile point in `buildWrap`, then rerun.

- [ ] **Step 6: Confirm flowers are still clickable through the wrap**

Run: `npm run shot -- shots/task6-select.png tools/steps/select-drag.mjs`
Expected: `ok`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add wrapping paper and ribbon"
```

---

### Task 7: Saving, keyboard shortcuts and safety nets

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `loadBouquet`, `saveBouquet`, `Store` from `bouquet.ts`.
- Produces: the design is restored on load and saved after every recorded change; Ctrl+Z undoes; Ctrl+Y and Ctrl+Shift+Z redo.

- [ ] **Step 1: Load at start-up and save on every change in `src/main.ts`**

Add `loadBouquet`, `saveBouquet` and `type Store` to the import from `./bouquet`.

Replace the line `let history = createHistory(createDefaultBouquet(FLOWERS));` with:

```ts
/** Browser storage, or a stand-in that keeps nothing when the browser blocks it. */
const store: Store = (() => {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => {} };
  }
})();

let history = createHistory(loadBouquet(FLOWERS, store) ?? createDefaultBouquet(FLOWERS));
```

In `refresh`, add this as the last line of the function body:

```ts
  saveBouquet(history.present, store);
```

- [ ] **Step 2: Add the keyboard shortcuts in `src/main.ts`, before the final `refresh();`**

```ts
window.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey)) return;
  const key = event.key.toLowerCase();
  if (key === 'z' && !event.shiftKey) actions.undo();
  else if (key === 'y' || (key === 'z' && event.shiftKey)) actions.redo();
  else return;
  event.preventDefault();
});
```

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Check restore, shortcuts and bad saved data**

Create `tools/steps/persist.mjs`:

```js
const state = (page) => page.evaluate(() => window.__debug.bouquet());
const expect = (ok, message) => { if (!ok) throw new Error(message); };
const KEY = 'bouquet-designer:v1';

export default async (page) => {
  await page.evaluate((k) => localStorage.removeItem(k), KEY);
  await page.reload();
  await page.waitForTimeout(1500);

  // A change survives a refresh.
  await page.selectOption('[data-key="shape"]', 'loose');
  await page.click('[data-key="plus-lily"]');
  const saved = await state(page);
  await page.reload();
  await page.waitForTimeout(1500);
  expect(JSON.stringify(await state(page)) === JSON.stringify(saved), 'a refresh restores the design');

  // Keyboard undo and redo.
  await page.selectOption('[data-key="shape"]', 'round');
  await page.locator('#view').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('Control+z');
  expect((await state(page)).shape === 'loose', 'Ctrl+Z undoes');
  await page.keyboard.press('Control+y');
  expect((await state(page)).shape === 'round', 'Ctrl+Y redoes');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+z');
  expect((await state(page)).shape === 'round', 'Ctrl+Shift+Z redoes');

  // Corrupt and out-of-date saved data fall back to the default bouquet.
  for (const bad of ['{not json', JSON.stringify({ version: 1, shape: 'round', wrap: {}, stems: [] }), JSON.stringify({ ...saved, stems: [{ ...saved.stems[0], flower: 'cactus' }] })]) {
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, bad]);
    await page.reload();
    await page.waitForTimeout(1500);
    const b = await state(page);
    expect(b.stems.length === 12 && b.shape === 'round', `bad saved data loads the default: ${bad.slice(0, 30)}`);
  }
};
```

Run: `npm run shot -- shots/task7-persist.png tools/steps/persist.mjs`
Expected: `ok`, and the screenshot shows the default 12-flower bouquet.

- [ ] **Step 5: Check the small-screen notice and reset view**

Create `tools/steps/small-and-reset.mjs`:

```js
const expect = (ok, message) => { if (!ok) throw new Error(message); };

export default async (page) => {
  await page.setViewportSize({ width: 900, height: 700 });
  expect(await page.isVisible('#small-screen'), 'the notice shows on a narrow window');
  expect(!(await page.isVisible('#app')), 'the designer is hidden on a narrow window');
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await page.isVisible('#app'), 'the designer shows on a wide window');

  const box = await page.locator('#view').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 400, cy - 150, { steps: 12 });
  await page.mouse.up();
  await page.mouse.wheel(0, -600);
  await page.click('[data-key="reset-view"]');
};
```

Run: `npm run shot -- shots/task7-reset.png tools/steps/small-and-reset.mjs`
Expected: `ok`, and the screenshot matches the default front view from `shots/task6-kraft.png` (same angle and distance).

- [ ] **Step 6: Run the tests and commit**

Run: `npm test`
Expected: PASS.

```bash
git add -A
git commit -m "Restore the design on load, save on change, add undo shortcuts"
```

---

### Task 8: Real flower models and credits

**Files:**
- Modify: `src/scene.ts`, `src/catalog.ts`, `src/panel.ts`
- Create: `public/models/*.glb`, `public/credits.html`

**Interfaces:**
- Consumes: `FlowerType.model`, `petalMaterial`, `modelScale`, `modelHeadY`, `credit`.
- Produces: a flower whose catalogue entry has a model file is drawn with that model; one without, or whose file fails to load, keeps the placeholder.

This task depends on `docs/model-research.md` and on the shop owner. Its code is fixed; the per-model numbers in the catalogue are measured from the files that arrive.

- [ ] **Step 1: Use whatever model files are already there (does not wait for the user)**

Read `docs/model-research.md`. Do not download model files or create accounts yourself (Sketchfab needs the shop owner's account), and do not stop to ask. Look in `public/models` for `.glb` files the user has already put there. Continue with whichever flowers have files; the rest stay as placeholders. If there are none, skip Steps 2, 4 and 5 and the model half of Step 7, still do Steps 3, 6, 8 and 9, and prove the loading code with a small throwaway test model that is deleted before the commit. In the hand-over, list the recommended free set with links so the user can download the files later and fill in the catalogue.

- [ ] **Step 2: Inspect, convert and lighten each file**

For each downloaded file, from the project folder:

```bash
npx @gltf-transform/cli inspect "<path to file>"
```

Read the output for the triangle count, the material names, and the bounding box. If the file is not `.glb`, convert it first (FBX/OBJ/BLEND need Blender's glTF export; tell the user if Blender is not installed and leave that flower as a placeholder). If it has more than about 20,000 triangles:

```bash
npx @gltf-transform/cli simplify "<in.glb>" "public/models/<id>.glb" --ratio <target/actual> --error 0.001
npx @gltf-transform/cli inspect "public/models/<id>.glb"
```

Otherwise copy it to `public/models/<id>.glb`. Expected: every file in `public/models` reports at most about 20,000 triangles. Note for each: the name of the petal material (if there is a separate one), the height of the head centre, and the head width.

- [ ] **Step 3: Add model loading to `src/scene.ts`**

Add to the top of the file:

```ts
import '@babylonjs/loaders/glTF';
```

Add `AssetContainer` and `LoadAssetContainerAsync` to the `@babylonjs/core` import.

Inside `createScene`, after `buildPlaceholder`, add:

```ts
  /** Loaded model per flower id. null means the file failed and the stand-in is used. */
  const models = new Map<string, AssetContainer | null>();
  const loading = new Set<string>();
  let lastRender: { bouquet: Bouquet; selectedId: string | null } | null = null;

  function requestModel(type: FlowerType): void {
    if (!type.model || models.has(type.id) || loading.has(type.id)) return;
    loading.add(type.id);
    LoadAssetContainerAsync(`${import.meta.env.BASE_URL}models/${type.model}`, scene)
      .then((container) => models.set(type.id, container))
      .catch((error) => {
        console.warn(`Could not load the ${type.name} model; using the stand-in flower.`, error);
        models.set(type.id, null);
      })
      .finally(() => {
        loading.delete(type.id);
        if (lastRender) render(lastRender.bouquet, lastRender.selectedId);
      });
  }

  /** A copy of a loaded model, moved and scaled so its head centre is at the origin, facing local +Y. */
  function buildModel(type: FlowerType, hex: string, stemId: string, container: AssetContainer): TransformNode {
    const root = new TransformNode(`flower-${stemId}`, scene);
    const fit = new TransformNode('fit', scene);
    fit.parent = root;
    const scale = type.modelScale ?? 1;
    fit.scaling = new Vector3(scale, scale, scale);
    fit.position.y = -(type.modelHeadY ?? 0) * scale;
    // ponytail: each flower gets its own material copies; share one per colour if 40 stems run slowly.
    const copy = container.instantiateModelsToScene((name) => `${stemId}-${name}`, true);
    for (const node of copy.rootNodes) node.parent = fit;
    for (const mesh of root.getChildMeshes()) {
      mesh.metadata = { stemId };
      shadows.addShadowCaster(mesh);
      const m = mesh.material;
      if (type.petalMaterial && m instanceof PBRMaterial && m.name.includes(type.petalMaterial)) {
        m.albedoColor = Color3.FromHexString(hex);
      }
    }
    return root;
  }
```

In `render`, make this the first line of the function body:

```ts
    lastRender = { bouquet, selectedId };
```

and replace these two lines:

```ts
      const look = `${stem.flower}|${stem.colour}`;
```
```ts
        node = { root: buildPlaceholder(type, hex, stem.id), stem: null, look, placed: '' };
```

with:

```ts
      requestModel(type);
      const container = models.get(type.id) ?? null;
      const look = `${stem.flower}|${stem.colour}|${container ? 'model' : 'stand-in'}`;
```
```ts
        const root = container ? buildModel(type, hex, stem.id, container) : buildPlaceholder(type, hex, stem.id);
        node = { root, stem: null, look, placed: '' };
```

Because `render` now refers to itself through `requestModel`, keep both as function declarations (as written) so the order does not matter.

- [ ] **Step 4: Fill in the catalogue for each model**

For each flower with a file, edit its entry in `src/catalog.ts`: set `model` to the file name, `petalMaterial` to a distinctive part of the petal material's name (leave it out if the petals have no separate material, and in that case cut `colours` down to the one colour the model actually is), `modelHeadY` to the head-centre height from Step 2, `modelScale` to `headDiameter` divided by the model's head width, and `credit` to the author, licence and URL from `docs/model-research.md`. Adjust `headDiameter` if the real flower is clearly a different size.

- [ ] **Step 5: Fit each model by eye**

Run: `npm run shot -- shots/task8-models.png`, then again with `tools/steps/orbit.mjs`.
Read both. For each modelled flower confirm: the head sits where the placeholder head was (on the dome, at the end of the green stem); it is the right size next to its neighbours; it faces outward; tinted colours look like the named colour and only the petals are tinted. Correct `modelHeadY`, `modelScale`, `petalMaterial` and the colour `hex` values until all hold. If a model's own stem sticks out below the crossing point, lower it with `modelHeadY` no further; instead simplify the model in Step 2 with its stem removed, or accept it and note it in the summary.

- [ ] **Step 6: Check the fallback**

Temporarily set one entry's `model` to `'missing.glb'`, run `npm run shot -- shots/task8-fallback.png`.
Expected: the tool reports an error for the failed download (that is the browser's own network message and is expected here), and the screenshot shows that flower drawn as a stand-in while the others are models. Restore the correct file name.

- [ ] **Step 7: Check speed at 40 flowers**

Create `tools/steps/full.mjs`:

```js
export default async (page) => {
  for (let i = 0; i < 28; i++) await page.click(`[data-key="plus-${['rose', 'tulip', 'daisy', 'lily'][i % 4]}"]`);
  await page.waitForTimeout(3000);
  const fps = await page.evaluate(() => window.__debug.fps());
  const count = await page.evaluate(() => window.__debug.bouquet().stems.length);
  console.log(`stems=${count} fps=${fps.toFixed(0)}`);
  if (count !== 40) throw new Error('expected 40 stems');
};
```

Run it in the connected Chrome tab (real graphics card; headless Chrome draws with a slow software renderer, so its number does not count): click the plus buttons to reach 40 stems, wait 3 seconds, then read `window.__debug.fps()` and take a screenshot.
Expected: `stems=40` and `fps` of 50 or more on this machine. If it is lower, simplify the heaviest models further (Step 2) and, if still low, change `buildModel` to pass `false` for material cloning and tint a per-colour clone cached in a `Map` keyed by flower and colour.

- [ ] **Step 8: Add the credits page and link**

Write `public/credits.html` listing every model with a `credit`, one per line: flower name, "by" author, licence name, and the source link, plus the lighting image ("Studio Small 03, Poly Haven, CC0"). Use the same `<head>` as `index.html` with the title "Credits" and a link back to `./`.

In `src/panel.ts`, add as the last entry pushed to `sections`:

```ts
  sections.push(section('About', el('a', { href: `${import.meta.env.BASE_URL}credits.html` }, 'Model credits')));
```

- [ ] **Step 9: Verify and commit**

Run: `npx tsc --noEmit`, `npm test`, `npm run build`.
Expected: all succeed.

Run: `npm run shot -- shots/task8-select.png tools/steps/select-drag.mjs`
Expected: `ok` (selecting, dragging and recolouring work on real models).

```bash
git add -A
git commit -m "Add real flower models with tinting, fallback and credits"
```

---

### Task 9: Final review and walkthrough

**Files:**
- Modify: whatever the review finds.

- [ ] **Step 1: Run everything**

Run: `npm test`, `npx tsc --noEmit`, `npm run build`.
Expected: all succeed.

- [ ] **Step 2: Run every browser check again**

```bash
npm run shot -- shots/final-panel.png tools/steps/panel.mjs
npm run shot -- shots/final-select.png tools/steps/select-drag.mjs
npm run shot -- shots/final-persist.png tools/steps/persist.mjs
npm run shot -- shots/final-reset.png tools/steps/small-and-reset.mjs
PAPER=tissue npm run shot -- shots/final-wrap.png tools/steps/wrap.mjs
```

Expected: `ok` for each. Read every screenshot.

- [ ] **Step 3: Check the built site, not just the dev server**

Run `npm run preview` in the background, then `URL=http://localhost:4173/ npm run shot -- shots/final-built.png`.
Expected: `ok`, and the bouquet appears as in development. (`window.__debug` does not exist in the built site, so only run the plain screenshot here.)

- [ ] **Step 4: Walk the spec**

Open `docs/superpowers/specs/2026-10-11-bouquet-designer-design.md` and go through section 2 ("In the first version") line by line. For each line, name the screenshot or test that shows it working. Fix anything that has none.

- [ ] **Step 5: Final code review**

Dispatch one review subagent (model `opus`, effort `high`):

> Review the finished project at `C:\Users\USER\Desktop\coding\claude_code_project\bouquet-designer` against `docs/superpowers/specs/2026-10-11-bouquet-designer-design.md`. Read all of `src` and `tests`. Look for correctness bugs first (geometry, pointer and drag handling, undo history, saved-data validation, model loading and fallback, leaked Babylon resources), then spec requirements that are missing or wrong. Do not edit files. Report each finding as file and line, what goes wrong, and a concrete action that triggers it, most severe first. Say plainly if you find nothing.

Fix every confirmed finding, rerun Steps 1 and 2, and commit.

- [ ] **Step 6: Hand over**

Tell the user: what works, which flowers are real models and which are still stand-ins, anything that did not meet its target (for example frame rate), and how to run it (`npm run dev`) and build it (`npm run build`, output in `dist`).
