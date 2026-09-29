/** Smoke: sheets render, pips, roll dialog → card → marks on a threat aspect, tracks panel & journey. */
export default async function run({ page, shot }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = ms => page.waitForTimeout(ms);
  const log = {};
  await ev(() => game.settings.set("core", "language", "uk"));
  await ev(async () => {
    await Actor.deleteDocuments(game.actors.map(a => a.id));
    await ChatMessage.deleteDocuments(game.messages.map(m => m.id));
    await game.settings.set("dyke-pole", "state", { tracks: [], camp: "" });
  });

  // Character with aspects and resources.
  const ids = await ev(async () => {
    const hero = await Actor.create({
      name: "Олена Паливода", type: "character",
      system: { origin: "Козаки", background: "Уцілілий", role: "Захисник", skills: { brawl: 2, athletics: 1, senses: 1 }, knowledges: { steppe: 1 },
        drives: [{ text: "Знайти тих, хто знищив мій табір", satisfied: 0, closed: false }], bonds: [{ name: "Ярема", uuid: "", marks: 1 }] }
    });
    await hero.createEmbeddedDocuments("Item", [
      { type: "aspect", name: "Шабля батька", system: { length: 5, abilities: [{ text: "Перевага в герці на конях", advantage: true, use: false }, { text: "Вплив атак збільшений", advantage: false, use: true }] } },
      { type: "aspect", name: "Кінь Вітер", system: { length: 4, damage: 1, abilities: [{ text: "Супутник — кінь", advantage: true, use: true }] } },
      { type: "aspect", name: "Поранене плече", system: { kind: "harm", length: 2 } },
      { type: "resource", name: "Паракордовий шнур", system: { kind: "gear", tags: [{ text: "міцний", good: true }] } },
      { type: "resource", name: "Сила десятьох", system: { kind: "steppeShard" } },
      { type: "resource", name: "Давній курган", system: { kind: "map", tags: [{ text: "схованка", good: true }] } }
    ]);
    const camp = await Actor.create({ name: "Табір Палія", type: "camp", system: { kind: "Козаки", drive: "Знищити осередок Орди", ratings: { protection: 3, supply: 3 },
      factions: [{ name: "Курінь воїнів", drive: "Бойовий дух", people: "Северин Деригора", resource: "зброя", aspect: "Табірна дисципліна", influence: 5 }], danger: 4 } });
    await camp.createEmbeddedDocuments("Item", [{ type: "aspect", name: "Віз-фортеця", system: { length: 6, controlledBy: "Курінь воїнів", abilities: [{ text: "Перевага під час захисту табору", advantage: true }] } }]);
    const threat = await Actor.create({ name: "Чорні козаки", type: "threat", system: { difficulty: "simple", drive: "Грабувати табори" } });
    await threat.createEmbeddedDocuments("Item", [
      { type: "aspect", name: "Вправні воїни", system: { length: 3, abilities: [{ text: "Вплив атак збільшений" }] } },
      { type: "aspect", name: "Шаблі", system: { length: 2, abilities: [{ text: "Атака, легкі ушкодження" }] } }
    ]);
    await game.dykePole.op("setCamp", { uuid: camp.uuid });
    return { hero: hero.id, camp: camp.id, threat: threat.id, target: threat.items.getName("Вправні воїни").uuid };
  });

  await ev(id => game.actors.get(id).sheet.render({ force: true }), ids.hero);
  await wait(1500);
  await shot("01-character");
  // Click a skill pip and the counter's 3rd box (rolls over).
  await page.click(".ws-character [data-path='system.skills.care'] .pip[data-n='2']");
  await wait(500);
  for (const n of [1, 2, 3]) { await page.click(`.ws-character [data-path='system.counters.ruin.track'] .pip[data-n='${n}']`); await wait(500); }
  log.afterClicks = await ev(id => { const s = game.actors.get(id).system; return { care: s.skills.care, ruin: s.counters.ruin }; }, ids.hero);
  // Edit a drive text through the form (array merge).
  await page.fill(".ws-character input[name='system.drives.0.text']", "Знайти тих, хто спалив мій табір");
  await page.press(".ws-character input[name='system.drives.0.text']", "Tab");
  await wait(600);
  log.drive = await ev(id => game.actors.get(id).system.drives.map(d => d.text), ids.hero);
  for (const tab of ["aspects", "resources", "growth"]) {
    await page.click(`.ws-character nav.tabs [data-tab='${tab}']`);
    await wait(500);
    await shot(`02-tab-${tab}`);
  }

  // Direct roll with a target → card → apply marks.
  await ev(async ({ hero, target }) => {
    const a = game.actors.get(hero);
    await game.dykePole.doRoll(a, { mode: "action", base: "skill.brawl", advantages: 1, cuts: 0, impact: "high", target });
    await game.dykePole.doRoll(a, { mode: "reaction", base: "skill.athletics", advantages: 0, cuts: 1 });
    await game.dykePole.doRoll(a, { mode: "luck", base: "knowledge.steppe" });
    await game.dykePole.doRoll(a, { mode: "task", task: "craftBoon", base: "skill.craft", advantages: 0 });
  }, ids);
  await wait(1200);
  const applied = await ev(async target => {
    const btn = document.querySelector("#chat .ws-apply:not([disabled])");
    const before = fromUuidSync(target).system.damage;
    btn?.click();
    await new Promise(r => setTimeout(r, 1200));
    return { had: !!btn, before, after: fromUuidSync(target).system.damage };
  }, ids.target);
  log.applied = applied;
  await shot("03-chat");

  // Roll dialog UI.
  await ev(id => { game.dykePole.roll(game.actors.get(id), { mode: "action", key: "skill.brawl" }); }, ids.hero);
  await wait(1200);
  await shot("04-roll-dialog");
  await page.click(".ws-roll-dialog button[data-action='ok']");
  await wait(1200);

  // Tracks panel with a journey and a secret timer.
  await ev(async () => {
    game.dykePole.tracks();
    await game.dykePole.op("addTrack", { name: "Споганений Парк", kind: "journey", max: 3 });
    const j = game.dykePole.state().tracks[0];
    await game.dykePole.op("journeyPhrase", { id: j.id, phrase: "полонений ординець" });
    await game.dykePole.op("addTrack", { name: "Ритуал чаклуна", kind: "timer", max: 6, secret: true });
  });
  await wait(1200);
  log.danger = await ev(id => game.actors.get(id).system.danger, ids.camp);
  await ev(() => foundry.applications.instances.forEach(a => a.id !== "ws-tracks" && a.close?.()));
  await ev(id => game.actors.get(id).sheet.render({ force: true }), ids.camp);
  await wait(1500);
  await shot("05-camp");
  await page.click(".ws-camp nav.tabs [data-tab='factions']");
  await wait(500);
  await shot("06-factions");
  await ev(id => game.actors.get(id).sheet.render({ force: true }), ids.threat);
  await wait(1200);
  await shot("07-threat");
  return log;
}
