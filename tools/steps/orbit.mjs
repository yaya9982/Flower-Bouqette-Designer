export default async (page) => {
  const box = await page.locator('#view').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 300, cy - 120, { steps: 12 });
  await page.mouse.up();
  await page.mouse.wheel(0, -400);
};
