// Puts every downloaded flower into the bouquet, 40 at a time, and saves a picture of each bouquet as
// shots/gallery-N.png. Fails if any model does not load or the page logs an error.
const KEY = 'bouquet-designer:v1';
const state = (page) => page.evaluate(() => window.__debug.bouquet());

export default async (page) => {
  const warnings = [];
  page.on('console', (m) => { if (m.type() === 'warning' && m.text().includes('Could not load')) warnings.push(m.text()); });

  const ids = await page.locator('[data-key^="plus-sf-"]').evaluateAll((nodes) => nodes.map((n) => n.dataset.key.slice(5)));
  for (let batch = 0; batch * 40 < ids.length; batch++) {
    const wanted = ids.slice(batch * 40, batch * 40 + 40);
    await page.evaluate((k) => localStorage.removeItem(k), KEY);
    await page.reload();
    await page.waitForTimeout(1500);

    // Swap the starting flowers for this batch. One flower must always remain, so add the first new one before removing.
    const starting = [...new Set((await state(page)).stems.map((s) => s.flower))];
    await page.click(`[data-key="plus-${wanted[0]}"]`);
    for (const flower of starting) {
      while (await page.locator(`[data-key="minus-${flower}"]`).count()) await page.click(`[data-key="minus-${flower}"]`);
    }
    for (const flower of wanted.slice(1)) await page.click(`[data-key="plus-${flower}"]`);
    await page.click('[data-key="rearrange"]');
    await page.waitForTimeout(6000);

    const stems = (await state(page)).stems;
    const missing = wanted.filter((id) => !stems.some((s) => s.flower === id));
    if (missing.length) throw new Error(`not added: ${missing.join(', ')}`);
    const fps = await page.evaluate(() => window.__debug.fps());
    await page.screenshot({ path: `shots/gallery-${batch + 1}.png` });
    console.log(`gallery-${batch + 1}: ${stems.length} flowers, ${fps.toFixed(0)} fps`);
  }
  if (warnings.length) throw new Error(`${warnings.length} models did not load:\n${warnings.join('\n')}`);
};
