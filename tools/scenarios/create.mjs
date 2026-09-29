/** Smoke for creation & automation: wizards, aspect builder, development, damage, task outcomes, random resources, NPC, rest. */
export default async function run({ page, shot }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = ms => page.waitForTimeout(ms);
  const click = async sel => { await page.waitForSelector(sel, { timeout: 8000 }); await page.click(sel); };
  const log = {};
  log.content = await ev(() => ({ active: game.modules.get("dyke-pole-content")?.active, camps: CONFIG.DYKE_POLE.campTypes.length, luck: Object.keys(CONFIG.DYKE_POLE.luckEvents).length }));
  await ev(async () => {
    await Actor.deleteDocuments(game.actors.map(a => a.id));
    await ChatMessage.deleteDocuments(game.messages.map(m => m.id));
    await JournalEntry.deleteDocuments(game.journal.map(j => j.id));
    await game.settings.set("dyke-pole", "state", { tracks: [], camp: "" });
    ui.sidebar.changeTab?.("actors", "primary");
  });
  await wait(800);
  log.dirButtons = await ev(() => document.querySelectorAll(".ws-dir-buttons button").length);

  // Camp wizard: Козаки, long game, 3 factions.
  await ev(() => { game.dykePole.campWizard(); });
  await click(".ws-wizard select[name=type]");
  await page.selectOption(".ws-wizard select[name=type]", "cossacks");
  await page.selectOption(".ws-wizard select[name=gameLength]", "3");
  for (const i of [0, 1, 2]) await page.check(`.ws-wizard section[data-type=cossacks] input[name='faction-cossacks-${i}']`);
  await page.fill(".ws-wizard input[name=name]", "Табір Палія");
  await wait(300);
  await shot("10-camp-wizard");
  await click(".ws-wizard button[data-action=ok]");
  await wait(1500);
  log.camp = await ev(() => { const c = game.actors.find(a => a.type === "camp"); return c && { name: c.name, ratings: c.system.ratings, factions: c.system.factions.map(f => f.name), aspects: c.items.map(i => `${i.name}(${i.system.length}/${i.system.controlledBy})`), active: game.dykePole.state().camp === c.uuid }; });

  // Character wizard → pregen.
  await ev(() => foundry.applications.instances.forEach(a => a.close?.()));
  await ev(() => { game.dykePole.characterWizard(); });
  await click(".ws-dialog button[data-action=pregen]");
  await click(".ws-pregen");
  await click(".ws-dialog button[data-action=ok]");
  await wait(1500);
  log.pregen = await ev(() => { const a = game.actors.find(x => x.type === "character"); return a && { name: a.name, origin: a.system.origin, items: a.items.size, skills: a.system.skills }; });

  // Character wizard → from scratch, then the aspect builder.
  await ev(() => foundry.applications.instances.forEach(a => a.close?.()));
  await ev(() => { game.dykePole.characterWizard(); });
  await click(".ws-dialog button[data-action=scratch]");
  await page.fill(".ws-wizard input[name=name]", "Ярема Кобзар");
  await page.fill(".ws-wizard input[name=origin]", "Чумак");
  await page.fill(".ws-wizard input[name=drive1]", "Знайти пісню, що заспокоює духів");
  await page.fill(".ws-wizard input[name='skills.artistry']", "2");
  await page.fill(".ws-wizard input[name='knowledges.steppe']", "1");
  await shot("11-char-wizard");
  await click(".ws-wizard button[data-action=ok]");
  await page.waitForSelector(".ws-builder", { timeout: 8000 });
  await page.fill(".ws-builder input[name=name]", "Кобза духів");
  const rows = await page.$$(".ws-builder .ws-build-row");
  await rows[0].$eval("select", s => { s.value = "advCommon"; s.dispatchEvent(new Event("change", { bubbles: true })); });
  await rows[0].$eval("input[name=text]", i => { i.value = "Зачаровані струни"; });
  await rows[1].$eval("select", s => { s.value = "secret"; s.dispatchEvent(new Event("change", { bubbles: true })); });
  await wait(300);
  log.builderLength = await ev(() => document.querySelector(".ws-build-total")?.textContent);
  await shot("12-builder");
  await click(".ws-builder button[data-action=ok]");
  await wait(1500);
  log.scratch = await ev(() => { const a = game.actors.getName("Ярема Кобзар"); return a && { artistry: a.system.skills.artistry, drives: a.system.drives.length, aspects: a.items.filter(i => i.type === "aspect").map(i => `${i.name}:${i.system.length}:${i.system.abilities.map(x => (x.advantage ? "(п)" : "") + (x.use ? "*" : "")).join(",")}`) }; });

  // Development: +3 on the new aspect.
  await ev(() => foundry.applications.instances.forEach(a => a.close?.()));
  await ev(() => { const a = game.actors.getName("Ярема Кобзар"); game.dykePole.aspectBuilder; a.sheet.render({ force: true }); });
  await wait(1200);
  await page.click(".ws-character nav.tabs [data-tab='aspects']");
  await wait(400);
  await page.click(".ws-character .ws-aspect [data-action=develop]");
  await click(".ws-dialog button[data-action=extend]");
  await wait(1000);
  log.developed = await ev(() => game.actors.getName("Ярема Кобзар").items.getName("Кобза духів").system.length);

  // Damage with overflow → harm.
  await ev(() => { game.dykePole.takeDamage(game.actors.getName("Ярема Кобзар")); });
  await page.waitForSelector(".ws-dialog input[name=n]");
  await page.fill(".ws-dialog input[name=n]", "9");
  await page.fill(".ws-dialog input[name=harm]", "Зламана рука");
  await click(".ws-dialog button[data-action=ok]");
  await wait(1200);
  log.damage = await ev(() => game.actors.getName("Ярема Кобзар").items.filter(i => i.type === "aspect").map(i => `${i.name}:${i.system.damage}/${i.system.length}:${i.system.kind}`));

  // Task outcome: gather (force a triumph by calling the outcome directly), random gear.
  await ev(() => { game.dykePole.op; import("/systems/dyke-pole/module/outcomes.mjs").then(m => m.taskOutcome(game.actors.getName("Ярема Кобзар"), { task: "gather", result: "conflict", twist: true })); });
  await page.waitForSelector(".ws-dialog input[name=name]");
  await page.fill(".ws-dialog input[name=name]", "Полин");
  await page.fill(".ws-dialog input[name=bad]", "гіркий");
  await page.fill(".ws-dialog input[name=good]", "лікувальний");
  await click(".ws-dialog button[data-action=ok]");
  await wait(1000);
  await page.click(".ws-character nav.tabs [data-tab='resources']");
  await wait(400);
  await page.click(".ws-character [data-action=randomResource][data-kind=gear]");
  await wait(1500);
  log.resources = await ev(() => game.actors.getName("Ярема Кобзар").items.filter(i => i.type === "resource").map(i => `${i.name}[${i.system.tags.map(t => (t.good ? "+" : "-") + t.text).join(",")}]`));
  await shot("13-resources");

  // Rest start with activity 2 (danger 4+2), quick NPC.
  await ev(() => { game.dykePole.tracks(); });
  await wait(800);
  await page.click("#ws-tracks [data-action=startRest]");
  await page.waitForSelector(".ws-dialog input[name=a]");
  await page.fill(".ws-dialog input[name=a]", "2");
  await click(".ws-dialog button[data-action=ok]");
  await wait(1000);
  log.danger = await ev(() => fromUuidSync(game.dykePole.state().camp).system.danger);
  await ev(() => { game.dykePole.quickNpc(); });
  await page.waitForSelector(".ws-dialog input[name=drive]");
  await page.selectOption(".ws-dialog select[name=kind]", "horde");
  await page.fill(".ws-dialog input[name=drive]", "Вислужитися перед ватажком");
  await click(".ws-dialog button[data-action=ok]");
  await wait(1000);
  log.npc = await ev(() => game.journal.getName("НІПи")?.pages.map(p => p.name));

  // Luck roll flavour.
  await ev(async () => game.dykePole.doRoll(game.actors.getName("Ярема Кобзар"), { mode: "luck", base: "skill.artistry" }));
  await wait(800);
  log.flavor = await ev(() => document.querySelector("#chat .ws-flavor")?.textContent.trim());
  await shot("14-chat");
  await ev(() => foundry.applications.instances.forEach(a => a.close?.()));
  await ev(() => game.actors.find(a => a.type === "camp").sheet.render({ force: true }));
  await wait(1200);
  await page.click(".ws-camp nav.tabs [data-tab='aspects']");
  await wait(400);
  await shot("15-camp-aspects");
  return log;
}
