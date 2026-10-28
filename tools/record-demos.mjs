// Usage: npm run dev, then: node tools/record-demos.mjs [bouquet|actions|shape|selected ...]
// Films the demo clips the panel's "?" buttons play (public/demos/<name>.mp4). Each clip is three scenes on three different
// bouquets, one after the other, and loops. The page is driven in Chrome with a big blue arrow cursor that moves at a human
// pace (see moveTo), screenshots are grabbed while it runs, and ffmpeg (on the PATH) joins them into an mp4.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const url = process.env.URL ?? 'http://localhost:5173/';
const out = resolve('public/demos');
mkdirSync(out, { recursive: true });
const CLIP = { x: 140, y: 0, width: 884, height: 640 };
const FPS = 25;

// ---- Human-paced cursor ----
// Movement time follows Fitts' law with the constants MacKenzie & Isokoski (CHI 2008) measured for a mouse
// (a = 94 ms, b = 174 ms/bit, 35 px targets: about 430 / 660 / 820 ms for 100 / 300 / 600 px), slowed 1.5x so a viewer can follow.
// Speed follows the minimum-jerk bell (slow, fast, slow); long moves bow slightly and overshoot a few px, then settle.
const FITTS_A = 94, FITTS_B = 174, TARGET = 35, SLOWER = 1.5;
const moveMs = (distance) => Math.max(450, SLOWER * (FITTS_A + FITTS_B * Math.log2(distance / TARGET + 1)));
const DWELL_MS = 300, PRESS_MS = 100, AFTER_CLICK_MS = 700;

let cur = { x: 500, y: 330 };
let bow = 1;
const moves = [];

/** Fastest speed (px/s) between samples at least 40 ms apart. */
function peakSpeed(samples) {
  let peak = 0;
  for (let i = 0, j = 1; j < samples.length; j++) {
    if (samples[j][0] - samples[i][0] < 40) continue;
    peak = Math.max(peak, Math.hypot(samples[j][1] - samples[i][1], samples[j][2] - samples[i][2]) / ((samples[j][0] - samples[i][0]) / 1000));
    i = j;
  }
  return peak;
}

async function moveTo(page, x, y) {
  const x0 = cur.x, y0 = cur.y, dx = x - x0, dy = y - y0, D = Math.hypot(dx, dy);
  if (D < 2) return;
  const T = D < 25 ? 300 : moveMs(D);
  const nx = -dy / D, ny = dx / D;
  const over = D >= 300 ? 6 : 0;
  const ex = x + (dx / D) * over, ey = y + (dy / D) * over;
  bow = -bow;
  const t0 = performance.now();
  const samples = [];
  for (;;) {
    const t = Math.min(1, (performance.now() - t0) / T);
    const s = 10 * t ** 3 - 15 * t ** 4 + 6 * t ** 5;
    const off = bow * 0.03 * D * Math.sin(Math.PI * s);
    const px = x0 + (ex - x0) * s + nx * off, py = y0 + (ey - y0) * s + ny * off;
    await page.mouse.move(px, py);
    samples.push([performance.now() - t0, px, py]);
    if (t >= 1) break;
    await page.waitForTimeout(8);
  }
  if (over) {
    const s0 = performance.now();
    for (;;) {
      const t = Math.min(1, (performance.now() - s0) / 110);
      await page.mouse.move(ex + (x - ex) * t, ey + (y - ey) * t);
      if (t >= 1) break;
      await page.waitForTimeout(8);
    }
  }
  await page.mouse.move(x, y);
  cur = { x, y };
  moves.push({ D, T: performance.now() - t0, peak: peakSpeed(samples) });
}

async function clickAt(page, x, y) {
  await moveTo(page, x, y);
  await page.waitForTimeout(DWELL_MS);
  await page.mouse.down();
  await page.waitForTimeout(PRESS_MS);
  await page.mouse.up();
  await page.waitForTimeout(AFTER_CLICK_MS);
}

async function centre(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  return { x: box.x + box.width / 2 + 2, y: box.y + box.height / 2 + 1, box };
}
const click = async (page, selector) => { const p = await centre(page, selector); await clickAt(page, p.x, p.y); };
const hover = async (page, selector) => { const p = await centre(page, selector); await moveTo(page, p.x, p.y); await page.waitForTimeout(DWELL_MS); return p; };
async function drag(page, from, to) {
  await moveTo(page, from.x, from.y);
  await page.waitForTimeout(250);
  await page.mouse.down();
  await moveTo(page, to.x, to.y);
  await page.mouse.up();
  await page.waitForTimeout(AFTER_CLICK_MS);
}
/** Drags a range slider's knob from where it is by a share of the track. */
async function slide(page, key, share) {
  const box = await page.locator(`[data-key="${key}"]`).first().boundingBox();
  const value = await page.locator(`[data-key="${key}"]`).first().evaluate((i) => (i.value - i.min) / (i.max - i.min));
  const knob = { x: box.x + 8 + (box.width - 16) * value, y: box.y + box.height / 2 };
  await drag(page, knob, { x: knob.x + (box.width - 16) * share, y: knob.y });
}

/** Scrolls the panel so the section with this heading starts at the top. */
const showSection = (page, title) => page.evaluate((t) => {
  const panel = document.querySelector('#panel');
  const h = [...panel.querySelectorAll('h2')].find((x) => x.textContent.startsWith(t));
  panel.scrollTop += h.getBoundingClientRect().top - panel.getBoundingClientRect().top - 6;
}, title);
/** The highest stem of that flower on screen: its head is the least likely to be hidden behind another. */
const stemScreen = (page, flower) => page.evaluate((f) => { const d = window.__debug; const all = d.bouquet().stems.filter((x) => x.flower === f).map((s) => ({ ...d.screenOf(s.id), id: s.id })); return all.sort((m, n) => m.y - n.y)[0]; }, flower);
const selectedId = (page) => page.evaluate(() => { const s = window.__debug.selected; return typeof s === 'function' ? s() : s; });
/** Row buttons of "Your bouquet": 0 = minus, 1 = plus. */
const rowButton = (i, which) => `.bouquet-list .row:nth-child(${i + 1}) button:nth-of-type(${which === 'minus' ? 1 : 2})`;

async function chooseShape(page, id) {
  const p = await hover(page, '[data-key="shape"]');
  await page.evaluate(([x, y]) => window.__demoRipple(x, y), [p.x, p.y]);
  await page.selectOption('[data-key="shape"]', id);
  await page.waitForTimeout(1500);
}
/** Where on screen a click selects a stem of that flower (tried before filming, since heads hide each other). */
async function findPick(page, flower) {
  const all = await page.evaluate((f) => { const d = window.__debug; return d.bouquet().stems.filter((x) => x.flower === f).map((s) => d.screenOf(s.id)); }, flower);
  for (const p of all.sort((m, n) => m.y - n.y)) {
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(250);
    const picked = await page.evaluate(() => { const d = window.__debug; const s = typeof d.selected === 'function' ? d.selected() : d.selected; return d.bouquet().stems.find((x) => x.id === s)?.flower; });
    if (picked === flower) { await page.mouse.click(60, 60); await page.waitForTimeout(250); return p; }
  }
  throw new Error(`no click selects a ${flower}`);
}
const RESET_VIEW = (page) => page.evaluate(() => document.querySelector('[data-key="reset-view"]').click());
/** Turns the camera by dragging empty bench, instantly (not filmed). */
async function turnNow(page, dx) {
  for (let left = dx; Math.abs(left) > 0.5; ) {
    const d = Math.max(-120, Math.min(120, left));
    await page.mouse.move(340 - d / 2, 570);
    await page.mouse.down();
    await page.mouse.move(340 + d / 2, 570, { steps: 6 });
    await page.mouse.up();
    left -= d;
  }
  await page.waitForTimeout(450);
}
/** Finds how far to turn the bouquet so a stem of that flower is at the front (lowest on screen), and a click then selects it. */
async function findFront(page, flower) {
  const ids = await page.evaluate((f) => window.__debug.bouquet().stems.filter((x) => x.flower === f).map((s) => s.id), flower);
  const where = (id) => page.evaluate((i) => window.__debug.screenOf(i), id);
  for (const id of ids) {
    await RESET_VIEW(page); await page.waitForTimeout(500);
    const STEP = 40, N = 10;
    await turnNow(page, -STEP * N);
    let best = { dx: 0, y: -Infinity };
    for (let k = -N; k <= N; k++) {
      const p = await where(id);
      if (p.y > best.y) best = { dx: k * STEP, y: p.y };
      if (k < N) await turnNow(page, STEP);
    }
    await RESET_VIEW(page); await page.waitForTimeout(500);
    await turnNow(page, best.dx);
    const p = await where(id);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(250);
    const picked = await page.evaluate(() => { const d = window.__debug; const s = typeof d.selected === 'function' ? d.selected() : d.selected; return d.bouquet().stems.find((x) => x.id === s)?.flower; });
    await page.mouse.click(60, 60); await page.waitForTimeout(250);
    await RESET_VIEW(page); await page.waitForTimeout(600);
    if (picked === flower) return { id, dx: best.dx };
  }
  throw new Error(`no stem of ${flower} can be brought to the front and picked`);
}
/** On camera: turns the bouquet by dx with the human-paced drag, then clicks the stem where it now is. */
async function turnAndSelect(page, scene) {
  const x0 = Math.max(60, Math.min(620 - scene.front.dx, 340 - scene.front.dx / 2));
  if (Math.abs(scene.front.dx) > 20) await drag(page, { x: x0, y: 570 }, { x: x0 + scene.front.dx, y: 570 });
  await page.waitForTimeout(600);
  const p = await page.evaluate((i) => window.__debug.screenOf(i), scene.front.id);
  await clickAt(page, p.x, p.y);
}
/** Where the selected stem's head is now. */
const selectedScreen = (page) => page.evaluate(() => { const d = window.__debug; return d.screenOf(typeof d.selected === 'function' ? d.selected() : d.selected); });

// ---- Scenes: each starts from a freshly loaded page with this bouquet ----
const PRESETS = { roses: 'preset-red-roses-gypsophila', pink: 'preset-pink-roses-carnations', peony: 'preset-peony-rose' };
const CLIPS = {
  bouquet: [
    { preset: null, async run(page) {
      await showSection(page, 'Your bouquet'); await page.waitForTimeout(600);
      await click(page, '[data-key="more-rose"]'); await click(page, '[data-key="more-rose"]');
      await click(page, '[data-key="minus-tulip"]'); await click(page, '[data-key="more-daisy"]');
    } },
    { preset: 'roses', async run(page) {
      await showSection(page, 'Your bouquet'); await page.waitForTimeout(600);
      await click(page, rowButton(0, 'plus')); await click(page, rowButton(1, 'plus'));
      await click(page, rowButton(0, 'minus')); await click(page, rowButton(1, 'plus'));
    } },
    { preset: 'peony', async run(page) {
      await showSection(page, 'Your bouquet'); await page.waitForTimeout(600);
      await click(page, rowButton(0, 'plus')); await click(page, rowButton(0, 'plus'));
      await click(page, rowButton(1, 'minus')); await click(page, rowButton(1, 'plus'));
    } },
  ],
  actions: [
    { preset: null, async run(page) {
      await showSection(page, 'Actions'); await page.waitForTimeout(600);
      for (let i = 0; i < 3; i++) await click(page, '[data-key="rearrange"]');
      await click(page, '[data-key="undo"]'); await click(page, '[data-key="undo"]');
    } },
    { preset: 'pink', async run(page) {
      await showSection(page, 'Actions'); await page.waitForTimeout(600);
      await click(page, '[data-key="rearrange"]'); await click(page, '[data-key="rearrange"]');
      await click(page, '[data-key="undo"]'); await click(page, '[data-key="redo"]'); await click(page, '[data-key="rearrange"]');
    } },
    { preset: 'peony', async run(page) {
      await showSection(page, 'Actions'); await page.waitForTimeout(600);
      await drag(page, { x: 460, y: 330 }, { x: 330, y: 300 });
      await click(page, '[data-key="reset-view"]'); await click(page, '[data-key="rearrange"]');
    } },
  ],
  shape: [
    { preset: null, async run(page) {
      await showSection(page, 'Shape'); await page.waitForTimeout(600);
      for (const id of ['cascade', 'loose', 'round']) await chooseShape(page, id);
    } },
    { preset: 'peony', async run(page) {
      await showSection(page, 'Shape'); await page.waitForTimeout(600);
      for (const id of ['onesided', 'cascade', 'round']) await chooseShape(page, id);
    } },
    { preset: 'pink', async run(page) {
      await showSection(page, 'Shape'); await page.waitForTimeout(600);
      for (const id of ['loose', 'onesided', 'round']) await chooseShape(page, id);
    } },
  ],
  selected: [
    { preset: null, pick: 'rose', async run(page, scene) {
      await clickAt(page, scene.at.x, scene.at.y); await showSection(page, 'Selected'); await page.waitForTimeout(500);
      await click(page, 'section:has(h2:text-matches("^Selected")) .swatch >> nth=2');
      await slide(page, 'height', 0.4);
    } },
    { preset: null, turn: 'daisy', async run(page, scene) {
      await turnAndSelect(page, scene); await showSection(page, 'Selected'); await page.waitForTimeout(500);
      await slide(page, 'tilt', 0.35);
      const p = await selectedScreen(page);
      await drag(page, p, { x: p.x - 70, y: p.y + 35 });
    } },
    { preset: null, turn: 'tulip', async run(page, scene) {
      await turnAndSelect(page, scene); await showSection(page, 'Selected'); await page.waitForTimeout(500);
      await click(page, '[data-key="swap-button"]');
      await click(page, '.flower-select-list [role="option"] >> nth=4');
      const p = await selectedScreen(page);
      await drag(page, p, { x: p.x + 60, y: p.y - 30 });
    } },
  ],
};

// ---- Filming ----
const CURSOR = `
#checkout,#florist{display:none!important}
#democursor{position:fixed;z-index:99999;left:-80px;top:0;width:34px;height:50px;pointer-events:none;filter:drop-shadow(0 0 1.5px #000) drop-shadow(0 3px 3px rgb(0 0 0 / .4))}
.demoring{position:fixed;z-index:99998;width:26px;height:26px;margin:-13px 0 0 -13px;border:5px solid rgb(21 96 255 / .85);border-radius:50%;pointer-events:none;animation:demoring 520ms ease-out forwards}
@keyframes demoring{from{transform:scale(.5);opacity:1}to{transform:scale(3.2);opacity:0}}`;

async function openScene(browser, preset) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
  await page.addInitScript((css) => {
    addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style'); style.textContent = css; document.head.append(style);
      const dot = document.createElement('div'); dot.id = 'democursor';
      dot.innerHTML = '<svg viewBox="0 0 16 24" width="34" height="50"><path d="M1.2 1.2V18.6L5.3 14.7L8.1 21.6L10.7 20.5L7.9 13.7H13.6Z" fill="#1560ff" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
      document.body.append(dot);
      const ring = (x, y) => { const r = document.createElement('div'); r.className = 'demoring'; r.style.left = x + 'px'; r.style.top = y + 'px'; document.body.append(r); setTimeout(() => r.remove(), 600); };
      window.__demoRipple = ring;
      addEventListener('mousemove', (e) => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }, true);
      addEventListener('mousedown', (e) => ring(e.clientX, e.clientY), true);
    });
  }, CURSOR);
  await page.goto(url);
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload();
  await page.waitForTimeout(2500);
  if (preset) {
    await page.evaluate((key) => document.querySelector(`[data-key="${key}"]`).click(), PRESETS[preset]);
    await page.waitForTimeout(1500);
  }
  cur = { x: 520, y: 340 };
  await page.mouse.move(cur.x, cur.y);
  return page;
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CLIPS);
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const name of names) {
  const frames = [];
  for (const [i, scene] of CLIPS[name].entries()) {
    const page = await openScene(browser, scene.preset);
    if (scene.turn) { scene.front = await findFront(page, scene.turn); await page.mouse.move(cur.x, cur.y); }
    if (scene.pick) { scene.at = await findPick(page, scene.pick); await page.mouse.move(cur.x, cur.y); }
    const shots = [];
    let filming = true;
    const grab = (async () => { while (filming) { const buf = await page.screenshot({ type: 'jpeg', quality: 86, clip: CLIP }); shots.push([performance.now(), buf]); } })();
    await scene.run(page, scene);
    await page.waitForTimeout(700);
    filming = false;
    await grab;
    await page.close();
    // Constant frame rate: each output frame shows the latest shot taken before its time.
    const first = shots[0][0], last = shots.at(-1)[0];
    for (let t = first, k = 0; t <= last; t += 1000 / FPS) {
      while (k + 1 < shots.length && shots[k + 1][0] <= t) k++;
      frames.push(shots[k][1]);
    }
    console.log(`${name} scene ${i + 1}: ${((last - first) / 1000).toFixed(1)} s`);
  }
  const dir = mkdtempSync(join(tmpdir(), `demo-${name}-`));
  frames.forEach((f, i) => writeFileSync(join(dir, `${String(i).padStart(5, '0')}.jpg`), f));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(dir, '%05d.jpg'), '-vf', 'scale=640:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '32', '-preset', 'slow', '-movflags', '+faststart', '-an', join(out, `${name}.mp4`)]);
  rmSync(dir, { recursive: true, force: true });
  console.log(`${name}: ${frames.length} frames, ${(frames.length / FPS).toFixed(1)} s`);
}
await browser.close();

// How the cursor moved, to compare with the Fitts figures above (lab: 430 / 660 / 820 ms for 100 / 300 / 600 px).
const bucket = (lo, hi) => moves.filter((m) => m.D >= lo && m.D < hi);
for (const [label, lo, hi] of [['<150 px', 0, 150], ['150-450 px', 150, 450], ['450+ px', 450, 1e9]]) {
  const b = bucket(lo, hi);
  if (b.length) console.log(`moves ${label}: ${b.length}, mean distance ${Math.round(b.reduce((s, m) => s + m.D, 0) / b.length)} px, mean time ${Math.round(b.reduce((s, m) => s + m.T, 0) / b.length)} ms, mean peak ${Math.round(b.reduce((s, m) => s + m.peak, 0) / b.length)} px/s`);
}
