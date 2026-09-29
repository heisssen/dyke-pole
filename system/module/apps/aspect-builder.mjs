/**
 * Aspect builder (p.31–33): a new aspect starts at 8 and each ability costs marks; a «use» ability is 1 cheaper.
 * Also the three development options for an existing aspect: +3 track, a new ability, merging two aspects.
 */
import { ABILITY_COSTS, ABILITY_BASE, abilityCost } from "../config.mjs";
import { LIMITS } from "../rules.mjs";
import { ID, L, esc } from "../state.mjs";

const { DialogV2 } = foundry.applications.api;
const renderTemplate = foundry.applications.handlebars.renderTemplate;

/**
 * Open the builder.
 * @param {Actor} actor
 * @param {Item} [aspect]  modify this aspect (base = its current length) instead of creating a new one
 */
export async function aspectBuilder(actor, aspect = null, { kind = "permanent" } = {}) {
  const base = aspect ? aspect.system.length : ABILITY_BASE;
  const groups = ["base", "advantage", "impact", "results", "resources", "narrative", "custom"].map(g => ({
    id: g, label: L(`WS.Build.Group.${g}`),
    options: ABILITY_COSTS.filter(a => a.group === g).map(a => ({ id: a.id, label: L(`WS.Build.Ability.${a.id}`), cost: a.cost, use: a.use }))
  }));
  const content = await renderTemplate(`systems/${ID}/templates/apps/aspect-builder.hbs`, {
    groups, base, name: aspect?.name ?? "", modify: !!aspect, existing: aspect?.system.abilities ?? [], rows: aspect ? [0] : [0, 1]
  });
  const res = await DialogV2.prompt({
    window: { title: aspect ? L("WS.Build.TitleModify", { name: aspect.name }) : L("WS.Build.Title"), icon: "fa-solid fa-feather" },
    classes: ["dyke-pole", "ws-dialog", "ws-builder"], position: { width: 800 }, content,
    ok: { label: aspect ? "WS.Build.Apply" : "WS.Build.Create", icon: "fa-solid fa-check", callback: (ev, b) => collect(b.form, base) },
    render: (ev, dlg) => wire(dlg.element, base),
    rejectClose: false
  });
  if (!res) return null;
  if (res.length < 1) { ui.notifications.warn(L("WS.Build.TooExpensive")); return null; }
  if (aspect) {
    await aspect.update({ "system.length": res.length, "system.damage": Math.min(aspect.system.damage, res.length), "system.abilities": [...aspect.system.abilities, ...res.abilities] });
    return aspect;
  }
  const [item] = await actor.createEmbeddedDocuments("Item", [{ type: "aspect", name: res.name || L("WS.New.permanent"), system: { kind, length: res.length, abilities: res.abilities } }]);
  return item;
}

function rowsOf(form) {
  return [...form.querySelectorAll(".ws-build-row")].map(r => ({
    type: r.querySelector("[name=type]").value,
    text: r.querySelector("[name=text]").value.trim(),
    addUse: r.querySelector("[name=addUse]")?.checked ?? false,
    custom: Number(r.querySelector("[name=custom]")?.value ?? 1)
  })).filter(r => r.type);
}
function collect(form, base) {
  const rows = rowsOf(form);
  const cost = rows.reduce((s, r) => s + abilityCost(r.type, r), 0);
  return {
    name: form.elements.name?.value?.trim(),
    length: Math.min(LIMITS.aspectLength, base - cost),
    abilities: rows.map(r => {
      const def = ABILITY_COSTS.find(a => a.id === r.type);
      return { text: r.text || L(`WS.Build.Ability.${r.type}`), advantage: !!def.advantage, use: def.use || r.addUse };
    })
  };
}
function wire(root, base) {
  const form = root.querySelector("form");
  const total = root.querySelector(".ws-build-total");
  const tpl = root.querySelector(".ws-build-row");
  const update = () => {
    let cost = 0;
    form.querySelectorAll(".ws-build-row").forEach(r => {
      const type = r.querySelector("[name=type]").value;
      const def = ABILITY_COSTS.find(a => a.id === type);
      const use = r.querySelector("[name=addUse]");
      use.disabled = !def || def.use;
      if (def?.use) use.checked = true;
      r.querySelector("[name=custom]").hidden = type !== "custom";
      const c = type ? abilityCost(type, { addUse: use.checked && !def?.use, custom: Number(r.querySelector("[name=custom]").value) }) : 0;
      r.querySelector(".cost").textContent = type ? `−${c}` : "";
      cost += c;
    });
    const len = base - cost;
    total.textContent = len;
    total.classList.toggle("bad", len < 1);
  };
  form.addEventListener("change", update);
  form.addEventListener("input", update);
  root.querySelector("[data-add-row]")?.addEventListener("click", () => {
    const clone = tpl.cloneNode(true);
    clone.querySelectorAll("input").forEach(i => { if (i.type === "checkbox") i.checked = false; else if (i.name !== "custom") i.value = ""; });
    clone.querySelector("select").value = "";
    tpl.parentElement.appendChild(clone);
    update();
  });
  root.addEventListener("click", ev => {
    const x = ev.target.closest("[data-remove-row]");
    if (x && form.querySelectorAll(".ws-build-row").length > 1) { x.closest(".ws-build-row").remove(); update(); }
  });
  update();
}

/** Development of an existing aspect (p.31): +3 track / new ability / merge with another aspect. */
export async function developAspect(actor, aspect) {
  const others = actor.items.filter(i => i.type === "aspect" && i !== aspect && i.system.temporary === aspect.system.temporary);
  const max = aspect.system.maxLength;
  const choice = await DialogV2.wait({
    window: { title: L("WS.Develop.Title", { name: aspect.name }), icon: "fa-solid fa-seedling" }, classes: ["dyke-pole", "ws-dialog"],
    content: `<p class="hint">${L("WS.Develop.Hint")}</p>`,
    buttons: [
      { action: "extend", label: L("WS.Develop.Extend"), icon: "fa-solid fa-up-long", disabled: aspect.system.length >= max },
      { action: "ability", label: L("WS.Develop.Ability"), icon: "fa-solid fa-feather" },
      { action: "merge", label: L("WS.Develop.Merge"), icon: "fa-solid fa-object-group", disabled: !others.length }
    ],
    rejectClose: false
  });
  if (choice === "extend") {
    const length = Math.min(max, aspect.system.length + 3);
    await aspect.update({ "system.length": length });
    return report(actor, L("WS.Develop.Extended", { name: esc(aspect.name), n: length }));
  }
  if (choice === "ability") return aspectBuilder(actor, aspect);
  if (choice === "merge") {
    const otherId = await DialogV2.prompt({
      window: { title: "WS.Develop.Merge" }, classes: ["dyke-pole", "ws-dialog"],
      content: `<div class="form-group"><label>${L("WS.Develop.MergeWith")}</label><select name="o">${others.map(o => `<option value="${o.id}">${esc(o.name)} (${o.system.length})</option>`).join("")}</select></div>
        <div class="form-group"><label>${L("WS.Develop.MergeName")}</label><input name="n" type="text" value="${esc(aspect.name)}"></div>
        <p class="hint">${L("WS.Develop.MergeHint")}</p>`,
      ok: { label: "WS.Develop.Merge", callback: (ev, b) => ({ id: b.form.elements.o.value, name: b.form.elements.n.value }) }, rejectClose: false
    });
    const other = otherId && actor.items.get(otherId.id);
    if (!other) return;
    const length = Math.min(max, aspect.system.length + other.system.length);
    await aspect.update({
      name: otherId.name || aspect.name, "system.length": length,
      "system.damage": Math.min(length, aspect.system.damage + other.system.damage),
      "system.abilities": [...aspect.system.abilities, ...other.system.abilities]
    });
    await other.delete();
    return report(actor, L("WS.Develop.Merged", { name: esc(aspect.name), n: length }));
  }
}

function report(actor, text) {
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="ws-card ws-note"><header><i class="fa-solid fa-seedling"></i> ${L("WS.Develop.Card")}</header><div class="ws-body">${text}</div></div>` });
}
