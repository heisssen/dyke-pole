export default async function run({ page }) {
  return page.evaluate(async () => {
    const a = game.actors.find(x => x.type === "character");
    await game.dykePole.doRoll(a, { mode: "luck", base: "skill.artistry" });
    const m = game.messages.contents.at(-1);
    return { luck: CONFIG.DYKE_POLE.luckEvents.artistry, has: m.content.includes("ws-flavor"), snippet: m.content.slice(0, 600) };
  });
}
