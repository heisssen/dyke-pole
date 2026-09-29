/**
 * One-click outcomes from roll cards: taking damage (p.30, p.34) and task results (p.54–57, p.70).
 */
import { damageAspect, LIMITS } from "./rules.mjs";
import { ID, L, esc, getState } from "./state.mjs";

const { DialogV2 } = foundry.applications.api;
const FDE = form => new foundry.applications.ux.FormDataExtended(form).object;
const note = (actor, icon, title, body) => ChatMessage.create({
  speaker: ChatMessage.getSpeaker({ actor }),
  content: `<div class="ws-card ws-note"><header><i class="fa-solid ${icon}"></i> ${title}</header><div class="ws-body">${body}</div></div>`
});

/** Damage: into a fitting aspect; what doesn't fit (or no fitting aspect) becomes a harm (кривда). */
export async function takeDamage(actor, { suggested = 1 } = {}) {
  const aspects = actor.items.filter(i => i.type === "aspect" && !i.system.broken);
  const content = `<div class="form-group"><label>${L("WS.Damage.Amount")}</label><input type="number" name="n" value="${suggested}" min="1" max="12"></div>
    <p class="hint">${L("WS.Damage.Scale")}</p>
    <div class="form-group"><label>${L("WS.Damage.Into")}</label><select name="target">
      ${aspects.map(a => `<option value="${a.id}">${esc(a.name)} (${a.system.remaining}/${a.system.length})${a.system.temporary ? ` — ${L(`WS.Aspect.Kind.${a.system.kind}`)}` : ""}</option>`).join("")}
      <option value="">${L("WS.Damage.Harm")}</option></select></div>
    <div class="form-group"><label>${L("WS.Damage.HarmName")}</label><input type="text" name="harm" placeholder="${L("WS.Damage.HarmHint")}"></div>`;
  const res = await DialogV2.prompt({
    window: { title: L("WS.Damage.Title", { name: actor.name }), icon: "fa-solid fa-droplet" }, classes: ["dyke-pole", "ws-dialog"], content,
    ok: { label: "WS.Damage.Apply", callback: (ev, b) => FDE(b.form) }, rejectClose: false
  });
  if (!res) return;
  const n = Math.max(1, Number(res.n) || 1);
  let overflow = n, lines = [];
  const aspect = res.target ? actor.items.get(res.target) : null;
  if (aspect) {
    const r = damageAspect(aspect.system, n);
    await aspect.update({ "system.damage": r.damage });
    overflow = r.overflow;
    lines.push(L("WS.Damage.Took", { name: esc(aspect.name), n: n - r.overflow, left: aspect.system.length - r.damage }));
    if (r.broken) lines.push(L("WS.Damage.Broken", { name: esc(aspect.name) }));
  }
  if (overflow > 0) {
    const harms = actor.items.filter(i => i.type === "aspect" && i.system.temporary);
    if (harms.length >= LIMITS.tempAspects) {
      // At the limit (p.34): a harm grows instead, or a boon is lost.
      const worst = actor.items.filter(i => i.type === "aspect" && i.system.kind === "harm").sort((a, b) => a.system.length - b.system.length)[0];
      if (worst) {
        const length = Math.min(LIMITS.tempLength, worst.system.length + overflow);
        await worst.update({ "system.length": length, "system.damage": length });
        lines.push(L("WS.Damage.HarmWorse", { name: esc(worst.name), n: length }));
      } else {
        const boon = harms.find(i => i.system.kind === "boon");
        if (boon) { lines.push(L("WS.Damage.BoonLost", { name: esc(boon.name) })); await boon.delete(); }
      }
    } else {
      const length = Math.min(LIMITS.tempLength, overflow);
      await actor.createEmbeddedDocuments("Item", [{ type: "aspect", name: res.harm?.trim() || L("WS.New.harm"), system: { kind: "harm", length, damage: length } }]);
      lines.push(L("WS.Damage.NewHarm", { name: esc(res.harm?.trim() || L("WS.New.harm")), n: length }));
    }
    const full = actor.items.filter(i => i.type === "aspect" && i.system.kind === "harm" && i.system.length >= LIMITS.tempLength && i.system.damage >= i.system.length);
    if (full.length >= 3) lines.push(`<b class="critical">${L("WS.Damage.Death")}</b>`);
  }
  return note(actor, "fa-droplet", L("WS.Damage.Card", { n }), lines.map(l => `<p>${l}</p>`).join(""));
}

/** Task results: create what the roll produced (gather, craft, recover, cargo). */
export async function taskOutcome(actor, { task, result, twist }) {
  if (result === "disaster" && task !== "craftGear") return note(actor, "fa-xmark", L(`WS.Task.${task}`), L(`WS.Task.Out.${task}.disaster`));
  const neg = result === "conflict";
  const twistLine = twist ? `<p class="hint">${L(`WS.Task.Out.${task}.twist`)}</p>` : "";
  if (task === "gather" || task === "craftGear" || task === "cargo") {
    if (task === "craftGear" && result === "disaster") {
      const gear = actor.items.filter(i => i.type === "resource" && i.system.kind === "gear");
      if (!gear.length) return;
      const id = await DialogV2.prompt({
        window: { title: L("WS.Task.craftGear") }, classes: ["dyke-pole", "ws-dialog"],
        content: `<p>${L("WS.Task.Out.craftGear.disaster")}</p><select name="g">${gear.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join("")}</select>`,
        ok: { label: "WS.Task.Lose", callback: (ev, b) => b.form.elements.g.value }, rejectClose: false
      });
      const g = id && actor.items.get(id);
      if (g) { await note(actor, "fa-hammer", L("WS.Task.craftGear"), L("WS.Task.Lost", { name: esc(g.name) })); await g.delete(); }
      return;
    }
    const res = await DialogV2.prompt({
      window: { title: L(`WS.Task.${task}`), icon: "fa-solid fa-sack" }, classes: ["dyke-pole", "ws-dialog"],
      content: `<p>${L(`WS.Task.Out.${task}.${result}`)}</p>${twistLine}
        <div class="form-group"><label>${L("WS.Task.What")}</label><input type="text" name="name" autofocus></div>
        ${neg ? `<div class="form-group"><label>${L("WS.Task.BadTag")}</label><input type="text" name="bad"></div>` : ""}
        ${twist ? `<div class="form-group"><label>${L("WS.Task.GoodTag")}</label><input type="text" name="good"></div>` : ""}`,
      ok: { label: "WS.Task.Take", callback: (ev, b) => FDE(b.form) }, rejectClose: false
    });
    if (!res?.name?.trim()) return;
    const tags = [...(res.good ? [{ text: res.good, good: true }] : []), ...(res.bad ? [{ text: res.bad, good: false }] : [])];
    if (task === "cargo") {
      const camp = fromUuidSync(getState().camp);
      if (!camp?.isOwner) return ui.notifications.warn(L("WS.Tracks.NoCamp"));
      await camp.update({ "system.cargo": [...camp.system.cargo, { name: res.name.trim(), tags: tags.map(t => (t.good ? "" : "−") + t.text).join(", ") }] });
      return note(actor, "fa-box", L("WS.Task.cargo"), L("WS.Task.CargoAdded", { name: esc(res.name), camp: esc(camp.name) }));
    }
    await actor.createEmbeddedDocuments("Item", [{ type: "resource", name: res.name.trim(), system: { kind: "gear", tags } }]);
    return note(actor, "fa-sack", L(`WS.Task.${task}`), L("WS.Task.Got", { name: esc(res.name) }));
  }
  if (task === "craftBoon") {
    const length = result === "triumph" ? 3 : 2;
    const res = await DialogV2.prompt({
      window: { title: L("WS.Task.craftBoon"), icon: "fa-solid fa-sun" }, classes: ["dyke-pole", "ws-dialog"],
      content: `<p>${L(`WS.Task.Out.craftBoon.${result}`)}</p>${twistLine}
        <div class="form-group"><label>${L("WS.Task.What")}</label><input type="text" name="name" autofocus></div>
        <div class="form-group"><label>${L("WS.Aspect.Abilities")}</label><input type="text" name="ability"></div>
        <label class="checkbox"><input type="checkbox" name="adv"> ${L("WS.Aspect.AdvantageTip")}</label>`,
      ok: { label: "WS.Task.Take", callback: (ev, b) => FDE(b.form) }, rejectClose: false
    });
    if (!res?.name?.trim()) return;
    await actor.createEmbeddedDocuments("Item", [{ type: "aspect", name: res.name.trim(), system: { kind: "boon", length, abilities: res.ability ? [{ text: res.ability, advantage: !!res.adv, use: true }] : [] } }]);
    return note(actor, "fa-sun", L("WS.Task.craftBoon"), L("WS.Task.BoonMade", { name: esc(res.name), n: length }));
  }
  if (task === "recover") {
    const marks = result === "triumph" ? 2 : 1;
    const hurt = actor.items.filter(i => i.type === "aspect" && i.system.damage > 0);
    if (!hurt.length) return ui.notifications.info(L("WS.Task.NothingToRecover"));
    const res = await DialogV2.prompt({
      window: { title: L("WS.Task.recover"), icon: "fa-solid fa-heart" }, classes: ["dyke-pole", "ws-dialog"],
      content: `<p>${L(`WS.Task.Out.recover.${result}`)}</p>${twistLine}
        <div class="form-group"><label>${L("WS.Task.Which")}</label><select name="a">${hurt.map(a => `<option value="${a.id}">${esc(a.name)} (${a.system.damage})</option>`).join("")}</select></div>
        ${twist && hurt.length > 1 ? `<div class="form-group"><label>${L("WS.Task.Second")}</label><select name="b"><option value=""></option>${hurt.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join("")}</select></div>` : ""}
        <label class="checkbox"><input type="checkbox" name="bond"> ${L("WS.Task.WithBond")}</label>`,
      ok: { label: "WS.Task.Recover", callback: (ev, b) => FDE(b.form) }, rejectClose: false
    });
    if (!res) return;
    const n = marks + (res.bond ? 1 : 0);
    const out = [];
    for (const id of [res.a, res.b].filter(Boolean)) {
      const a = actor.items.get(id);
      const before = a.system.damage;
      const left = Math.max(0, before - n);
      // A harm healed to zero disappears.
      if (a.system.kind === "harm" && left === 0) { out.push(L("WS.Task.HarmGone", { name: esc(a.name) })); await a.delete(); }
      else { await a.update({ "system.damage": left }); out.push(L("WS.Task.Recovered", { name: esc(a.name), n: before - left })); }
    }
    return note(actor, "fa-heart", L("WS.Task.recover"), out.map(l => `<p>${l}</p>`).join(""));
  }
}
