export default async function run({ page }) {
  await page.waitForTimeout(4000);
  await page.evaluate(() => { if ((Hooks.events.diceSoNiceReady ?? []).length > 1) Hooks.call("diceSoNiceReady", game.dice3d); });
  return page.evaluate(() => ({
    listeners: (Hooks.events.diceSoNiceReady ?? []).map(h => String(h.fn).slice(0, 80)),
    systems: [...game.dice3d.DiceFactory.systems.keys()],
    presets: [...game.dice3d.DiceFactory.systems.get("dyke-pole")?.dice?.keys?.() ?? []], colorsets: Object.keys(game.dice3d.exports?.COLORSETS ?? {}).filter(k => /dyke|moz/.test(k))
  }));
}
