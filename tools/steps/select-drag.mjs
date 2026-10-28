const debug = (page, fn, arg) => page.evaluate(([f, a]) => window.__debug[f](a), [fn, arg]);
const expect = (ok, message) => { if (!ok) throw new Error(message); };
const stemOf = (b, id) => b.stems.find((s) => s.id === id);

export default async (page) => {
  const box = await page.locator('#view').boundingBox();
  const at = async (id) => {
    const p = await debug(page, 'screenOf', id);
    return { x: box.x + p.x, y: box.y + p.y };
  };
  const first = (await debug(page, 'bouquet')).stems[0].id;

  // Click a flower: it becomes selected and its controls appear.
  let p = await at(first);
  await page.mouse.click(p.x, p.y);
  const id = await debug(page, 'selected');
  expect(id !== null, 'clicking a flower selects one');
  expect(await page.isVisible('[data-key="remove"]'), 'selected-flower controls appear');

  // Drag the selected flower: it moves, and the camera does not.
  const before = stemOf(await debug(page, 'bouquet'), id);
  p = await at(id);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 90, p.y + 20, { steps: 12 });
  await page.mouse.up();
  const after = stemOf(await debug(page, 'bouquet'), id);
  expect(after.angle !== before.angle || after.dist !== before.dist, 'dragging moves the flower');
  expect((await debug(page, 'selected')) === id, 'the flower stays selected after a drag');

  // One undo reverses the whole drag.
  await page.click('[data-key="undo"]');
  const undone = stemOf(await debug(page, 'bouquet'), id);
  expect(undone.angle === before.angle && undone.dist === before.dist, 'one undo reverses the drag');
  await page.click('[data-key="redo"]');

  // Colour: only the flower's own colours are offered.
  const flower = stemOf(await debug(page, 'bouquet'), id).flower;
  const offered = await page.locator('[data-key^="flower-colour-"]').count();
  expect(offered >= 1, 'colour swatches are shown');
  if (offered > 1) {
    await page.locator('[data-key^="flower-colour-"]').nth(1).click();
    expect(stemOf(await debug(page, 'bouquet'), id).colour !== before.colour, 'colour changes');
  }

  // Height and tilt sliders.
  await page.locator('[data-key="height"]').fill('0.8');
  await page.locator('[data-key="height"]').dispatchEvent('change');
  expect(stemOf(await debug(page, 'bouquet'), id).height === 0.8, 'height slider works');
  await page.locator('[data-key="tilt"]').fill('0.3');
  await page.locator('[data-key="tilt"]').dispatchEvent('change');
  expect(stemOf(await debug(page, 'bouquet'), id).tilt === 0.3, 'tilt slider works');

  // Swap keeps the position.
  const target = flower === 'sunflower' ? 'rose' : 'sunflower';
  const preSwap = stemOf(await debug(page, 'bouquet'), id);
  await page.locator('[data-key="swap"] button').click();
  await page.locator(`[data-key="swap"] #swap-opt-${target}`).click();
  const swapped = stemOf(await debug(page, 'bouquet'), id);
  expect(swapped.flower === target && swapped.angle === preSwap.angle && swapped.dist === preSwap.dist, 'swap keeps the position');

  // Remove clears the selection.
  const count = (await debug(page, 'bouquet')).stems.length;
  await page.click('[data-key="remove"]');
  expect((await debug(page, 'bouquet')).stems.length === count - 1, 'remove deletes the flower');
  expect((await debug(page, 'selected')) === null, 'selection clears when the flower is removed');

  // Click empty space: nothing is selected. Then select again for the screenshot.
  await page.mouse.click(box.x + 20, box.y + 20);
  expect((await debug(page, 'selected')) === null, 'clicking empty space selects nothing');
  p = await at((await debug(page, 'bouquet')).stems[0].id);
  await page.mouse.click(p.x, p.y);
};
