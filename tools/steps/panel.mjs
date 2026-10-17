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

  expect(await page.locator('[data-key="minus-sunflower"]').count() === 0, 'a flower that is not in the bouquet has no row');
};
