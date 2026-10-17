// The colour wheel narrows the "Add flowers" list, and a flower added under a colour comes in that colour.
const KEY = 'bouquet-designer:v1';
const state = (page) => page.evaluate(() => window.__debug.bouquet());
const expect = (ok, message) => { if (!ok) throw new Error(message); };
const listed = (page) => page.locator('.flower-list [data-key^="plus-"]').count();
const hubCount = async (page) => Number((await page.locator('.hub-count').textContent()).split(' ')[0]);

export default async (page) => {
  await page.evaluate((k) => localStorage.removeItem(k), KEY);
  await page.reload();
  await page.waitForTimeout(1500);

  const all = await listed(page);
  expect(all === await hubCount(page), 'with no colour picked the list holds every flower');

  // Every wedge narrows the list to the number it announces.
  const wedges = await page.locator('.wedge').evaluateAll((nodes) => nodes.map((n) => n.dataset.key));
  expect(wedges.length >= 5, `the wheel has a wedge per colour (found ${wedges.length})`);
  for (const key of wedges) {
    await page.click(`[data-key="${key}"]`);
    const shown = await listed(page);
    expect(shown > 0 && shown < all && shown === await hubCount(page), `${key} narrows the list (${shown} of ${all})`);
    expect(await page.getAttribute(`[data-key="${key}"]`, 'aria-pressed') === 'true', `${key} is marked as picked`);
  }

  // A recolourable flower added under Pink arrives pink, not in its first colour.
  await page.click('[data-key="wheel-pink"]');
  await page.click('[data-key="plus-rose"]');
  expect((await state(page)).stems.at(-1).colour === 'pink', 'a rose added under Pink is pink');
  expect(await page.getAttribute('[data-key="wheel-pink"]', 'aria-pressed') === 'true', 'the colour stays picked after adding');

  // A downloaded flower can be added, and appears under "Your bouquet".
  const first = await page.locator('.flower-list [data-key^="plus-sf-"]').first().getAttribute('data-key');
  await page.click(`[data-key="${first}"]`);
  const flower = first.slice(5);
  expect((await state(page)).stems.at(-1).flower === flower, 'a downloaded flower is added');
  expect(await page.locator(`[data-key="minus-${flower}"]`).count() === 1, 'it gets a row in the bouquet');

  // Keyboard: Enter on the middle of the wheel shows everything again.
  await page.focus('[data-key="wheel-all"]');
  await page.keyboard.press('Enter');
  expect(await listed(page) === all, 'the middle of the wheel clears the colour');

  await page.click('[data-key="wheel-pink"]');
  await page.evaluate(() => { document.getElementById('panel').scrollTop = 0; });
  await page.waitForTimeout(3000);
};
