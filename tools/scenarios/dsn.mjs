/** Enable Dice So Nice (reloads once), then check our preset and roll a d6 for a screenshot. */
export default async function run({ page, shot }) {
  const active = await page.evaluate(() => game.modules.get("dice-so-nice")?.active);
  if (!active) {
    await page.evaluate(async () => {
      const cfg = game.settings.get("core", "moduleConfiguration");
      await game.settings.set("core", "moduleConfiguration", { ...cfg, "dice-so-nice": true });
    });
    return { enabled: "now — rerun" };
  }
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => {
    const f = game.dice3d?.DiceFactory;
    return { dice3d: !!game.dice3d, systems: f ? [...(f.systems?.keys?.() ?? [])] : null, colorsets: Object.keys(game.dice3d?.exports?.COLORSETS ?? {}).filter(k => k.startsWith("dyke") || k.startsWith("moz")) };
  });
  await page.evaluate(async () => {
    const a = game.actors.find(x => x.type === "character");
    await game.dykePole.doRoll(a, { mode: "action", base: "skill.artistry", advantages: 3 });
  });
  await page.waitForTimeout(1600);
  await shot("20-dsn");
  return info;
}
