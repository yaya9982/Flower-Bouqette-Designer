export default async (page) => {
  await page.selectOption('[data-key="shape"]', process.env.SHAPE);
};
