// Selects the first flower, removes the paper so it can be seen, and drags Height to its lowest setting.
const debug = (page, fn, arg) => page.evaluate(([f, a]) => window.__debug[f](a), [fn, arg]);

export default async (page) => {
  await page.selectOption('[data-key="paper"]', 'none');
  const box = await page.locator('#view').boundingBox();
  const id = (await debug(page, 'bouquet')).stems[0].id;
  const p = await debug(page, 'screenOf', id);
  await page.mouse.click(box.x + p.x, box.y + p.y);
  await page.locator('[data-key="height"]').fill('-1');
  await page.locator('[data-key="height"]').dispatchEvent('change');
  const stem = (await debug(page, 'bouquet')).stems.find((s) => s.id === id);
  if (stem.height !== -1) throw new Error('height did not reach its lowest setting');
};
