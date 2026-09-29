/**
 * The dice: action, reaction, luck (random event), shard control, camp rating and task rolls.
 * Pool = skill/knowledge/rating + advantages; cuts drop the highest dice; doubles are a twist.
 */
import { SKILLS, KNOWLEDGES, RATINGS, IMPACTS, LIMITS, resolve, poolSize, trackMarks, twistTone } from "./rules.mjs";
import { ID, L, esc, op, getState, describeTarget } from "./state.mjs";

const { DialogV2 } = foundry.applications.api;
const renderTemplate = foundry.applications.handlebars.renderTemplate;

export const MODES = ["action", "reaction", "luck", "control", "rating", "task"];
export const TASKS = ["gather", "craftBoon", "craftGear", "recover", "cargo"];

/** Everything a roll can target with marks: shared open tracks and threat aspects on the current scene / in the world. */
export function markTargets() {
  const out = [];
  for (const t of getState().tracks) if (!t.secret || game.user.isGM) out.push({ value: `track:${t.id}`, label: `${t.name} (${t.value}/${t.max})` });
  const threats = new Set([...(canvas.scene?.tokens ?? [])].map(t => t.actor).filter(a => a?.type === "threat"));
  if (game.user.isGM) for (const a of game.actors) if (a.type === "threat") threats.add(a);
  for (const a of threats) for (const i of a.items) if (i.type === "aspect" && !i.system.broken) {
    out.push({ value: i.uuid, label: `${a.name}: ${i.name} (${i.system.damage}/${i.system.length})` });
  }
  return out;
}

/** Open the roll dialog for an actor. `preset` may carry {mode, key, task}. */
export async function rollDialog(actor, preset = {}) {
  const isCamp = actor?.type === "camp";
  const mode = preset.mode ?? (isCamp ? "rating" : "action");
  const bases = isCamp
    ? RATINGS.map(k => ({ value: `rating.${k}`, label: `${L(`WS.Rating.${k}`)} (${actor.system.ratings[k]})` }))
    : [
      ...SKILLS.map(k => ({ value: `skill.${k}`, label: `${L(`WS.Skill.${k}`)} (${actor.system.skills[k]})`, group: L("WS.Sheet.Skills") })),
      ...KNOWLEDGES.map(k => ({ value: `knowledge.${k}`, label: `${L(`WS.Knowledge.${k}`)} (${actor.system.knowledges[k]})`, group: L("WS.Sheet.Knowledges") }))
    ];
  if (mode === "control") bases.splice(0, bases.length,
    { value: "counter.steppe", label: `${L("WS.Counter.steppe")} (${actor.system.counters.steppe.level})` },
    { value: "counter.ruin", label: `${L("WS.Counter.ruin")} (${actor.system.counters.ruin.level})` });
  // Advantage sources: aspect abilities marked (п) and gear.
  const sources = [];
  for (const i of actor?.items ?? []) {
    if (i.type === "aspect" && !i.system.broken) i.system.abilities.forEach((ab, n) => {
      if (ab.advantage) sources.push({ id: `${i.id}.${n}`, label: `${i.name}: ${ab.text}`, use: ab.use });
    });
    if (i.type === "resource" && i.system.kind === "gear") sources.push({ id: i.id, label: `${L("WS.Resource.gear")}: ${i.name}` });
  }
  const content = await renderTemplate(`systems/${ID}/templates/apps/roll-dialog.hbs`, {
    mode, modes: MODES.filter(m => isCamp ? ["rating", "task"].includes(m) : m !== "rating").map(m => ({ value: m, label: `WS.Roll.Mode.${m}`, selected: m === mode })),
    bases, key: preset.key, sources, impacts: IMPACTS.map(v => ({ value: v, label: `WS.Impact.${v}`, selected: v === "medium" })),
    tasks: TASKS.map(v => ({ value: v, label: `WS.Task.${v}`, selected: v === preset.task })),
    targets: markTargets(), maxAdv: isCamp ? LIMITS.campAdvantages : LIMITS.advantages, isCamp
  });
  const res = await DialogV2.prompt({
    window: { title: L("WS.Roll.Title", { name: actor.name }), icon: "fa-solid fa-dice" }, classes: ["dyke-pole", "ws-dialog", "ws-roll-dialog"],
    position: { width: 460 }, content,
    ok: { label: "WS.Roll.Roll", icon: "fa-solid fa-dice", callback: (ev, b) => new foundry.applications.ux.FormDataExtended(b.form).object },
    render: (ev, dlg) => {
      const f = dlg.element.querySelector("form");
      const sync = () => {
        const m = f.elements.mode.value;
        dlg.element.querySelectorAll("[data-show]").forEach(el => { el.hidden = !el.dataset.show.split(" ").includes(m); });
      };
      f.elements.mode.addEventListener("change", sync);
      sync();
    },
    rejectClose: false
  });
  if (!res) return null;
  return doRoll(actor, res);
}

/** Roll and post the card. `o`: {mode, base, advantages, src.*, cuts, impact, target, task}. */
export async function doRoll(actor, o) {
  const mode = o.mode;
  const [group, key] = String(o.base ?? "").split(".");
  const baseValue = group === "skill" ? actor.system.skills[key]
    : group === "knowledge" ? actor.system.knowledges[key]
      : group === "rating" ? actor.system.ratings[key]
        : group === "counter" ? actor.system.counters[key].level : 0;
  const checked = Object.entries(o).filter(([k, v]) => k.startsWith("src.") && v).map(([k]) => k.slice(4));
  const noAdv = mode === "luck" || mode === "control";
  const advantages = noAdv ? 0 : Number(o.advantages || 0) + checked.length;
  const cuts = noAdv ? 0 : Math.max(0, Number(o.cuts) || 0);
  const n = mode === "control" ? baseValue : poolSize({ base: baseValue, advantages, camp: actor.type === "camp" });
  const desperate = n <= 0;
  const roll = await new Roll(`${Math.max(1, n)}d6`).evaluate();
  const faces = roll.dice[0].results.map(r => r.result);
  const r = resolve(faces, { cuts, desperate });

  // Spend a mark on aspects whose (п) ability says «використай».
  for (const id of checked) {
    const [itemId, n2] = id.split(".");
    const item = actor.items.get(itemId);
    const ab = item?.system.abilities?.[Number(n2)];
    if (item?.type === "aspect" && ab?.use) await item.update({ "system.damage": Math.min(item.system.length, item.system.damage + 1) });
  }

  const marks = mode === "action" || mode === "rating" ? trackMarks(r.result, o.impact || "medium", { twistBoost: false }) : 0;
  const target = (mode === "action" || mode === "rating") && o.target ? describeTarget(o.target) : null;
  const sorted = [...faces].sort((a, b) => b - a);
  const dice = sorted.map((f, i) => ({ face: f, cut: i < r.cut.length, top: i === r.cut.length && !desperate, twin: r.twist && f === r.twistValue && i >= r.cut.length }));
  const label = group === "skill" ? L(`WS.Skill.${key}`) : group === "knowledge" ? L(`WS.Knowledge.${key}`) : group === "rating" ? L(`WS.Rating.${key}`) : group === "counter" ? L(`WS.Counter.${key}`) : "";
  const outcomeKey = mode === "task" ? `WS.Task.Out.${o.task}` : `WS.Roll.Out.${mode}`;
  const ctx = {
    actor, mode, label, modeLabel: L(`WS.Roll.Mode.${mode}`), task: mode === "task" ? L(`WS.Task.${o.task}`) : "",
    dice, result: r.result, resultLabel: L(`WS.Result.${r.result}`), outcome: L(`${outcomeKey}.${r.result}`),
    twist: r.twist, twistText: r.twist ? L(`${outcomeKey}.twist`) : "", tone: game.settings.get(ID, "twistTable") ? twistTone(r.twistValue) : null,
    desperate, cuts: r.cut.length, advantages, impact: mode === "action" || mode === "rating" ? L(`WS.Impact.${o.impact || "medium"}`) : "",
    marks, marksLabel: marks === "all" ? L("WS.Tracks.All") : marks, target, targetId: o.target || "",
    sources: checked.map(id => {
      const [itemId, n2] = id.split(".");
      const it = actor.items.get(itemId);
      return n2 !== undefined ? `${it?.name}: ${it?.system.abilities?.[Number(n2)]?.text}` : it?.name;
    }).filter(Boolean)
  };
  const content = await renderTemplate(`systems/${ID}/templates/chat/roll.hbs`, ctx);
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), content, flags: { [ID]: { roll: { marks, target: o.target || "", result: r.result } } } }, { rollMode: game.settings.get("core", "rollMode") });
  // Using a shard raises the matching counter (p.28) — the control roll is only rolled when in doubt, so it doesn't.
  return { ...r, marks };
}

/** Chat card buttons. */
export function onRenderChatMessage(message, html) {
  html.querySelectorAll?.("[data-ws-apply]").forEach(btn => {
    const f = message.getFlag(ID, "roll");
    if (!f?.target || f.applied) { btn.disabled = true; if (f?.applied) btn.classList.add("done"); return; }
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await op("mark", { target: f.target, marks: f.marks });
      if (message.isOwner) await message.setFlag(ID, "roll", { ...f, applied: true });
    });
  });
}
