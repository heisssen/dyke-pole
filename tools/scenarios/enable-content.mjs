/** Enable the private content module in the dev world (the page reloads). */
export default async function run({ page }) {
  const had = await page.evaluate(() => game.modules.get("dyke-pole-content")?.active ?? null);
  if (had === false) {
    await page.evaluate(async () => {
      const cfg = game.settings.get("core", "moduleConfiguration");
      await game.settings.set("core", "moduleConfiguration", { ...cfg, "dyke-pole-content": true });
    });
    await page.waitForTimeout(3000);
  }
  return { had };
}
