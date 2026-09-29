/**
 * Creation helpers: character wizard (pregen or from scratch), camp wizard (p.41), quick NPC (p.80).
 * Book content (camp types, pregens, suggestions) comes from CONFIG.DYKE_POLE / compendia — optional.
 */
import { SKILLS, KNOWLEDGES, RATINGS, LIMITS } from "../rules.mjs";
import { ID, L, esc, op } from "../state.mjs";
import { aspectBuilder } from "./aspect-builder.mjs";

const { DialogV2 } = foundry.applications.api;
const renderTemplate = foundry.applications.handlebars.renderTemplate;
const FDE = form => new foundry.applications.ux.FormDataExtended(form).object;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

/** All character actors in compendia (pregens). */
async function pregens() {
  const out = [];
  for (const pack of game.packs.filter(p => p.documentName === "Actor")) {
    const idx = await pack.getIndex({ fields: ["type", "img", "system.origin", "system.background", "system.role"] });
    for (const e of idx) if (e.type === "character") out.push({ uuid: e.uuid, name: e.name, img: e.img, sub: [e.system?.origin, e.system?.background, e.system?.role].filter(Boolean).join(" · ") });
  }
  return out;
}

/* ---------------- character ---------------- */
export async function characterWizard() {
  const list = await pregens();
  const choice = list.length ? await DialogV2.wait({
    window: { title: "WS.Wizard.CharTitle", icon: "fa-solid fa-user-plus" }, classes: ["dyke-pole", "ws-dialog"],
    content: `<p>${L("WS.Wizard.CharLead")}</p>`,
    buttons: [
      { action: "pregen", label: L("WS.Wizard.Pregen"), icon: "fa-solid fa-users" },
      { action: "scratch", label: L("WS.Wizard.Scratch"), icon: "fa-solid fa-pen-nib", default: true }
    ],
    rejectClose: false
  }) : "scratch";
  if (choice === "pregen") return pregenPicker(list);
  if (choice === "scratch") return scratchCharacter();
}

async function pregenPicker(list) {
  const content = `<div class="ws-pregens">${list.map(p => `<label class="ws-pregen"><input type="radio" name="uuid" value="${p.uuid}">
    <img src="${p.img}" alt=""><span><b>${esc(p.name)}</b><small>${esc(p.sub)}</small></span></label>`).join("")}</div>
    <div class="form-group"><label>${L("WS.Wizard.NameOptional")}</label><input type="text" name="name"></div>`;
  const res = await DialogV2.prompt({
    window: { title: "WS.Wizard.Pregen", icon: "fa-solid fa-users" }, classes: ["dyke-pole", "ws-dialog"], position: { width: 520 }, content,
    ok: { label: "WS.Wizard.Take", callback: (ev, b) => FDE(b.form) }, rejectClose: false
  });
  if (!res?.uuid) return;
  const uuid = await op("importActor", { uuid: res.uuid, name: res.name?.trim() || undefined });
  (await fromUuid(uuid))?.sheet.render({ force: true });
}

async function scratchCharacter() {
  const C = CONFIG.DYKE_POLE;
  const content = await renderTemplate(`systems/${ID}/templates/apps/char-wizard.hbs`, {
    skills: SKILLS.map(k => ({ key: k, label: L(`WS.Skill.${k}`), hint: L(`WS.SkillHint.${k}`) })),
    knowledges: KNOWLEDGES.map(k => ({ key: k, label: L(`WS.Knowledge.${k}`), hint: L(`WS.KnowledgeHint.${k}`) })),
    origins: C.origins, backgrounds: C.backgrounds, roles: C.roles
  });
  const res = await DialogV2.prompt({
    window: { title: "WS.Wizard.Scratch", icon: "fa-solid fa-pen-nib" }, classes: ["dyke-pole", "ws-dialog", "ws-wizard"], position: { width: 640 }, content,
    ok: { label: "WS.Wizard.Create", icon: "fa-solid fa-check", callback: (ev, b) => FDE(b.form) },
    render: (ev, dlg) => {
      const f = dlg.element.querySelector("form");
      const sum = () => {
        const s = SKILLS.reduce((a, k) => a + Number(f.elements[`skills.${k}`].value || 0), 0);
        const kn = KNOWLEDGES.reduce((a, k) => a + Number(f.elements[`knowledges.${k}`].value || 0), 0);
        dlg.element.querySelector(".sum-skills").textContent = s;
        dlg.element.querySelector(".sum-know").textContent = kn;
      };
      f.addEventListener("input", sum);
      sum();
    },
    rejectClose: false
  });
  if (!res) return;
  const num = v => Math.max(0, Math.min(3, Number(v) || 0));
  const data = {
    name: res.name?.trim() || L("WS.Wizard.Unnamed"), type: "character",
    system: {
      origin: res.origin ?? "", background: res.background ?? "", role: res.role ?? "",
      skills: Object.fromEntries(SKILLS.map(k => [k, num(res[`skills.${k}`])])),
      knowledges: Object.fromEntries(KNOWLEDGES.map(k => [k, num(res[`knowledges.${k}`])])),
      drives: [res.drive1, res.drive2, res.drive3].filter(t => t?.trim()).map(text => ({ text: text.trim(), satisfied: 0, closed: false }))
    }
  };
  const uuid = await op("createActor", { data });
  const actor = await fromUuid(uuid);
  if (!actor) return;
  actor.sheet.render({ force: true });
  if (res.firstAspect) await aspectBuilder(actor);
}

/* ---------------- camp (p.41) ---------------- */
export async function campWizard() {
  const types = CONFIG.DYKE_POLE.campTypes;
  const content = await renderTemplate(`systems/${ID}/templates/apps/camp-wizard.hbs`, {
    types: types.map(t => ({
      ...t, ratingText: Object.entries(t.ratings ?? {}).map(([k, v]) => `${L(`WS.Rating.${k}`)} +${v}`).join(", ")
    })),
    ratings: RATINGS.map(k => ({ key: k, label: L(`WS.Rating.${k}`) }))
  });
  const res = await DialogV2.prompt({
    window: { title: "WS.Wizard.CampTitle", icon: "fa-solid fa-caravan" }, classes: ["dyke-pole", "ws-dialog", "ws-wizard"], position: { width: 680 }, content,
    ok: { label: "WS.Wizard.Create", icon: "fa-solid fa-check", callback: (ev, b) => FDE(b.form) },
    render: (ev, dlg) => wireCamp(dlg.element, types),
    rejectClose: false
  });
  if (!res) return;
  const type = types.find(t => t.id === res.type);
  const ratings = Object.fromEntries(RATINGS.map(k => [k, Math.min(LIMITS.rating, 2 + (type?.ratings?.[k] ?? (res.type ? 0 : Number(res[`bonus.${k}`] || 0))))]));
  const chosen = (type?.factions ?? []).filter((f, i) => res[`faction-${type.id}-${i}`]);
  const aspects = [
    ...chosen.map(f => ({ ...f.aspect, controlledBy: f.name })),
    ...(type?.aspects ?? []).filter((a, i) => res[`aspect-${type.id}-${i}`])
  ];
  const data = {
    name: res.name?.trim() || type?.name || L("WS.Wizard.Camp"), type: "camp", img: type?.img,
    system: {
      kind: type?.name ?? res.kind ?? "", drive: res.drive ?? "", look: type?.look ?? "", ratings,
      factions: chosen.map(f => ({ name: f.name, drive: f.drive ?? "", people: f.people ?? "", resource: f.resource ?? "", aspect: f.aspect?.name ?? "", influence: LIMITS.factionStart })),
      notes: type?.notes?.length ? `<ul>${type.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : ""
    },
    items: aspects.map(a => ({ type: "aspect", name: a.name, system: { kind: "permanent", length: a.length ?? 4, controlledBy: a.controlledBy ?? "", abilities: a.abilities ?? [] } }))
  };
  const uuid = await op("createActor", { data, shared: true, activate: true });
  (await fromUuid(uuid))?.sheet.render({ force: true });
}

function wireCamp(root, types) {
  const f = root.querySelector("form");
  const sync = () => {
    const t = types.find(x => x.id === f.elements.type.value);
    root.querySelectorAll("[data-type]").forEach(el => { el.hidden = el.dataset.type !== (t?.id ?? ""); });
    root.querySelector(".custom-type").hidden = !!t;
    if (t && !f.elements.drive.dataset.touched) f.elements.drive.value = t.drive ?? "";
    // Limit factions to the game length; aspects: one per chosen faction, the rest (to 3) from the type.
    const n = Number(f.elements.gameLength.value);
    const boxes = [...root.querySelectorAll(`[data-type="${t?.id}"] input[data-faction]`)];
    const on = boxes.filter(b => b.checked);
    boxes.forEach(b => { b.disabled = !b.checked && on.length >= n; });
    const aspectBoxes = [...root.querySelectorAll(`[data-type="${t?.id}"] input[data-aspect]`)];
    const need = Math.max(0, 3 - on.length);
    const onA = aspectBoxes.filter(b => b.checked);
    aspectBoxes.forEach(b => { b.disabled = !b.checked && onA.length >= need; });
    const note = root.querySelector(".ws-camp-count");
    if (note) note.textContent = L("WS.Wizard.CampCount", { f: on.length, n, a: onA.length, need });
  };
  f.elements.drive.addEventListener("input", () => { f.elements.drive.dataset.touched = "1"; });
  f.addEventListener("change", sync);
  sync();
}

/* ---------------- quick NPC (p.80) ---------------- */
export async function quickNpc() {
  const N = CONFIG.DYKE_POLE.names;
  const nameFor = kind => kind === "spirit" ? pick(N.spirit) : kind === "horde" ? pick(N.horde)
    : `${pick(Math.random() < .5 ? N.folk.m : N.folk.f)} ${pick(N.folk.last)}`;
  const content = `<div class="form-group"><label>${L("WS.Npc.Kind")}</label><select name="kind">
      ${["folk", "spirit", "horde"].map(k => `<option value="${k}">${L(`WS.Npc.Kinds.${k}`)}</option>`).join("")}</select></div>
    <div class="form-group"><label>${L("WS.Npc.Name")}</label><div class="form-fields"><input type="text" name="name" value="${esc(nameFor("folk"))}"><button type="button" data-reroll><i class="fa-solid fa-dice"></i></button></div></div>
    ${["drive", "trait", "impression", "problem"].map(k => `<div class="form-group"><label>${L(`WS.Npc.${k}`)}</label><input type="text" name="${k}" placeholder="${L(`WS.Npc.${k}Hint`)}"></div>`).join("")}`;
  const res = await DialogV2.prompt({
    window: { title: "WS.Npc.Title", icon: "fa-solid fa-user-secret" }, classes: ["dyke-pole", "ws-dialog"], position: { width: 480 }, content,
    ok: { label: "WS.Npc.Save", callback: (ev, b) => FDE(b.form) },
    render: (ev, dlg) => {
      const f = dlg.element.querySelector("form");
      const re = () => { f.elements.name.value = nameFor(f.elements.kind.value); };
      dlg.element.querySelector("[data-reroll]").addEventListener("click", re);
      f.elements.kind.addEventListener("change", re);
    },
    rejectClose: false
  });
  if (!res) return;
  const html = `<ul>${["drive", "trait", "impression", "problem"].filter(k => res[k]).map(k => `<li><strong>${L(`WS.Npc.${k}`)}.</strong> ${esc(res[k])}</li>`).join("")}</ul>`;
  let j = game.journal.getName(L("WS.Npc.Journal"));
  if (!j && game.user.isGM) j = await JournalEntry.create({ name: L("WS.Npc.Journal") });
  if (j?.isOwner) await j.createEmbeddedDocuments("JournalEntryPage", [{ name: res.name, type: "text", text: { content: `<p><em>${L(`WS.Npc.Kinds.${res.kind}`)}</em></p>${html}` } }]);
  ChatMessage.create({
    whisper: game.users.filter(u => u.isGM).map(u => u.id),
    content: `<div class="ws-card ws-note"><header><i class="fa-solid fa-user-secret"></i> ${esc(res.name)}</header><div class="ws-body">${html}</div></div>`
  });
}
