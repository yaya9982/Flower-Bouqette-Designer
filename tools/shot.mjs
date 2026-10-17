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
