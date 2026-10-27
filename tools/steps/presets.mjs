// The three preset buttons and the Explore more list each load their bouquet, and Undo brings back the one before.
const state = (page) => page.evaluate(() => window.__debug.bouquet());
const expect = (ok, message) => { if (!ok) throw new Error(message); };

export default async (page) => {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(1500);
  const before = JSON.stringify(await state(page));

  const featured = await page.locator('.presets [data-key^="preset-"]:not([data-key="preset-random"])').evaluateAll((n) => n.map((b) => b.dataset.key));
  expect(featured.length === 3, `three featured presets (found ${featured.length})`);
  for (const key of featured) {
    await page.click(`[data-key="${key}"]`);
    expect((await state(page)).stems.length > 10, `${key} loads a full bouquet`);
  }

  await page.click('[data-key="preset-random"]');
  const others = await page.locator('.preset-list [data-key^="preset-"]').evaluateAll((n) => n.map((b) => b.dataset.key));
  expect(others.length === 27, `Explore more lists the other 27 (found ${others.length})`);
  for (const key of others) {
    await page.click(`[data-key="${key}"]`);
    const b = await state(page);
    expect(b.stems.length > 10, `${key} loads a full bouquet`);
  }

  for (let i = 0; i < featured.length + others.length; i++) await page.click('[data-key="undo"]');
  expect(JSON.stringify(await state(page)) === before, 'undo returns to the starting bouquet');

  await page.click('[data-key="preset-orchid-cascade"]');
  await page.waitForTimeout(4000);
};
