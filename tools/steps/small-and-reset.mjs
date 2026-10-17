const expect = (ok, message) => { if (!ok) throw new Error(message); };

export default async (page) => {
  await page.setViewportSize({ width: 900, height: 700 });
  expect(await page.isVisible('#small-screen'), 'the notice shows on a narrow window');
  expect(!(await page.isVisible('#app')), 'the designer is hidden on a narrow window');
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await page.isVisible('#app'), 'the designer shows on a wide window');

  const box = await page.locator('#view').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 400, cy - 150, { steps: 12 });
  await page.mouse.up();
  await page.mouse.wheel(0, -600);
  await page.click('[data-key="reset-view"]');
};
