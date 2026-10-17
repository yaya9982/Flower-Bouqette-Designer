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
