// Fills the bouquet to 40 stems with every flower type, so each model can be seen and the frame rate checked.
export default async (page) => {
  const types = ['sunflower', 'carnation', 'daisy', 'lily', 'tulip', 'rose'];
  for (let i = 0; i < 40; i++) {
    const plus = page.locator(`[data-key="plus-${types[i % types.length]}"]`);
    if (await plus.isEnabled()) await plus.click();
  }
  await page.waitForTimeout(4000);
  const stems = await page.evaluate(() => window.__debug.bouquet().stems);
  const fps = await page.evaluate(() => window.__debug.fps());
  console.log(`stems=${stems.length} fps=${fps.toFixed(0)} types=${[...new Set(stems.map((s) => s.flower))].join(',')}`);
};
