const state = (page) => page.evaluate(() => window.__debug.bouquet());
const expect = (ok, message) => { if (!ok) throw new Error(message); };

export default async (page) => {
  await page.selectOption('[data-key="paper"]', process.env.PAPER ?? 'tissue');
  await page.click('[data-key="paper-colour-blush"]');
  await page.click('[data-key="ribbon-colour-navy"]');
  const { wrap } = await state(page);
  expect(wrap.paper === (process.env.PAPER ?? 'tissue') && wrap.paperColour === 'blush' && wrap.ribbonColour === 'navy', 'wrap choices are stored');
  for (let i = 0; i < Number(process.env.EXTRA ?? 0); i++) await page.click('[data-key="plus-daisy"]');
};
