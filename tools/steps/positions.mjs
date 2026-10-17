// Prints, for every shape, each flower's screen position and the bouquet, plus the panel's HTML, so a run before and
// after a refactor can be diffed byte for byte. Usage: npm run shot -- shots/positions.png tools/steps/positions.mjs > out.txt
export default async (page) => {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(2500);
  for (const shape of ['round', 'cascade', 'loose', 'onesided']) {
    await page.selectOption('[data-key="shape"]', shape);
    await page.waitForTimeout(800);
    const data = await page.evaluate(() => {
      const b = window.__debug.bouquet();
      return { b, screen: b.stems.map((s) => [s.id, window.__debug.screenOf(s.id)]) };
    });
    console.log(`SHAPE ${shape}\n${JSON.stringify(data)}`);
  }
  console.log(`PANEL\n${await page.evaluate(() => document.getElementById('panel').innerHTML)}`);
};
