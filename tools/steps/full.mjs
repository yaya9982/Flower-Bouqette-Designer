export default async (page) => {
  for (let i = 0; i < 28; i++) await page.click(`[data-key="plus-${['rose', 'tulip', 'daisy', 'lily'][i % 4]}"]`);
  await page.waitForTimeout(3000);
  const fps = await page.evaluate(() => window.__debug.fps());
  const count = await page.evaluate(() => window.__debug.bouquet().stems.length);
  console.log(`stems=${count} fps=${fps.toFixed(0)}`);
  if (count !== 40) throw new Error('expected 40 stems');
};
