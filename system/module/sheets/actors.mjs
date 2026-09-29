/** Character, camp and threat sheets. */
import { BaseActorSheet, pips } from "./base.mjs";
import { SKILLS, KNOWLEDGES, RATINGS, RESOURCE_KINDS, LIMITS, shardLimit, projectLength } from "../rules.mjs";
import { ID, L, op, getState, counterMax } from "../state.mjs";

const T = p => `systems/${ID}/templates/sheets/${p}.hbs`;

export class CharacterSheet extends BaseActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["ws-character"],
    position: { width: 760, height: 860 },
    actions: { counterPip: CharacterSheet.#counterPip, counterMark: CharacterSheet.#counterMark, driveSatisfy: CharacterSheet.#driveSatisfy, project: CharacterSheet.#project }
  };
  static PARTS = {
    header: { template: T("character-header") },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: T("character-main"), scrollable: [""] },
    aspects: { template: T("aspects"), scrollable: [""] },
    resources: { template: T("resources"), scrollable: [""] },
    growth: { template: T("character-growth"), scrollable: [""] },
    notes: { template: T("notes"), scrollable: [""] }
  };
  static TABS = {
    primary: {
      tabs: [
        { id: "main", label: "WS.Tab.Main", icon: "fa-solid fa-user" },
        { id: "aspects", label: "WS.Tab.Aspects", icon: "fa-solid fa-feather" },
        { id: "resources", label: "WS.Tab.Resources", icon: "fa-solid fa-sack" },
        { id: "growth", label: "WS.Tab.Growth", icon: "fa-solid fa-seedling" },
        { id: "notes", label: "WS.Tab.Notes", icon: "fa-solid fa-book-open" }
      ],
      initial: "main"
    }
  };

  async _prepareContext(o) {
    const ctx = await super._prepareContext(o);
    const s = this.actor.system;
    const max = counterMax();
    const counter = k => ({
      key: k, label: L(`WS.Counter.${k}`), level: s.counters[k].level, max,
      levels: pips(s.counters[k].level, max, { cls: k }), track: pips(s.counters[k].track, LIMITS.counterTrack - 0, { cls: k })
    });
    const res = this.actor.items.filter(i => i.type === "resource");
    const shards = res.filter(i => RESOURCE_KINDS[i.system.kind]?.shard);
    return Object.assign(ctx, {
      skills: SKILLS.map(k => ({ key: k, label: L(`WS.Skill.${k}`), hint: L(`WS.SkillHint.${k}`), value: s.skills[k], pips: pips(s.skills[k], LIMITS.skill) })),
      knowledges: KNOWLEDGES.map(k => ({ key: k, label: L(`WS.Knowledge.${k}`), hint: L(`WS.KnowledgeHint.${k}`), value: s.knowledges[k], pips: pips(s.knowledges[k], LIMITS.knowledge) })),
      counters: [counter("steppe"), counter("ruin")],
      drives: s.drives.map((d, i) => ({ ...d, i })),
      bonds: s.bonds.map((b, i) => ({ ...b, i, pips: pips(b.marks, LIMITS.bondMarks) })),
      projects: s.projects.map((p, i) => ({ ...p, i, pips: pips(p.value, p.max) })),
      resourceGroups: [
        { kind: "gear", label: L("WS.Resource.gear"), limit: RESOURCE_KINDS.gear.limit, items: res.filter(i => i.system.kind === "gear") },
        { kind: "steppeShard", alt: "ruinShard", label: L("WS.Resource.shards"), limit: shardLimit, items: shards },
        { kind: "map", label: L("WS.Resource.map"), limit: RESOURCE_KINDS.map.limit, items: res.filter(i => i.system.kind === "map") }
      ].map(g => ({ ...g, count: g.items.length, over: g.items.length > g.limit, items: g.items.map(i => ({ id: i.id, name: i.name, img: i.img, kind: i.system.kind, tags: i.system.tags, qty: i.system.quantity })) })),
      canBond: s.bonds.length < LIMITS.bonds, canProject: s.projects.length < LIMITS.projects, canDrive: s.drives.length < 3,
      projectKinds: ["skill", "knowledge", "aspect", "custom"].map(k => ({ value: k, label: `WS.Project.${k}` }))
    });
  }

  /** Clicking the counter track: filling the 3rd box rolls over into the next level (on the GM). */
  static async #counterPip(ev, t) {
    const power = t.closest("[data-path]").dataset.path.split(".")[2];
    const cur = this.actor.system.counters[power].track;
    const n = Number(t.dataset.n);
    if (n <= cur) return this.actor.update({ [`system.counters.${power}.track`]: n - 1 });
    return op("counter", { uuid: this.actor.uuid, power, marks: n - cur });
  }

  /** +1 mark on a counter (from shards, Ruin exposure, spirits) — rolls over into levels on the GM. */
  static #counterMark(ev, t) { return op("counter", { uuid: this.actor.uuid, power: t.dataset.power, marks: Number(t.dataset.marks ?? 1) }); }

  /** «Задовільнення прагнення»: remove a mark from the Steppe or Ruin track (p.22). */
  static async #driveSatisfy(ev, t) {
    const i = Number(t.closest("[data-index]").dataset.index);
    const drives = foundry.utils.deepClone(this.actor.system.drives);
    drives[i].satisfied += 1;
    const c = this.actor.system.counters;
    const power = c.ruin.track >= c.steppe.track ? "ruin" : "steppe";
    await this.actor.update({ "system.drives": drives, [`system.counters.${power}.track`]: Math.max(0, c[power].track - 1) });
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<div class="ws-card ws-drive"><header><i class="fa-solid fa-star"></i> ${L("WS.Drive.Satisfied")}</header><div class="ws-body"><blockquote>${foundry.utils.escapeHTML(drives[i].text)}</blockquote>${L("WS.Drive.SatisfiedHint", { power: L(`WS.Counter.${power}`) })}</div></div>`
    });
  }

  /** New project with the book's length for its kind (p.56). */
  static async #project(ev, t) {
    const projects = foundry.utils.deepClone(this.actor.system.projects);
    if (projects.length >= LIMITS.projects) return ui.notifications.warn(L("WS.Notify.Limit", { n: LIMITS.projects }));
    projects.push({ name: L("WS.Project.New"), kind: "custom", target: "", value: 0, max: 4, notes: "" });
    await this.actor.update({ "system.projects": projects });
  }

  /** Changing a project's kind/target recalculates its length. */
  async _onChangeForm(formConfig, event) {
    const el = event.target;
    if (el?.name?.match(/^system\.projects\.\d+\.(kind|target)$/)) {
      const i = Number(el.name.split(".")[2]);
      const row = el.closest("[data-index]");
      const kind = row.querySelector("[name$='.kind']").value;
      const target = row.querySelector("[name$='.target']")?.value;
      const cur = kind === "skill" ? this.actor.system.skills[target] : kind === "knowledge" ? this.actor.system.knowledges[target] : 0;
      const max = kind === "custom" ? this.actor.system.projects[i].max : projectLength(kind, cur ?? 0);
      const maxEl = row.querySelector("[name$='.max']");
      if (maxEl) maxEl.value = max;
    }
    return super._onChangeForm(formConfig, event);
  }
}

export class CampSheet extends BaseActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["ws-camp"],
    position: { width: 780, height: 860 },
    actions: { activate: CampSheet.#activate, dangerPip: CampSheet.#dangerPip }
  };
  static PARTS = {
    header: { template: T("camp-header") },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: T("camp-main"), scrollable: [""] },
    aspects: { template: T("aspects"), scrollable: [""] },
    factions: { template: T("camp-factions"), scrollable: [""] },
    notes: { template: T("notes"), scrollable: [""] }
  };
  static TABS = {
    primary: {
      tabs: [
        { id: "main", label: "WS.Tab.Camp", icon: "fa-solid fa-caravan" },
        { id: "aspects", label: "WS.Tab.Aspects", icon: "fa-solid fa-feather" },
        { id: "factions", label: "WS.Tab.Factions", icon: "fa-solid fa-people-group" },
        { id: "notes", label: "WS.Tab.Notes", icon: "fa-solid fa-book-open" }
      ],
      initial: "main"
    }
  };
  async _prepareContext(o) {
    const ctx = await super._prepareContext(o);
    const s = this.actor.system;
    return Object.assign(ctx, {
      ratings: RATINGS.map(k => ({ key: k, label: L(`WS.Rating.${k}`), hint: L(`WS.RatingHint.${k}`), value: s.ratings[k], pips: pips(s.ratings[k], LIMITS.rating), zero: s.ratings[k] === 0 })),
      cargo: s.cargo.map((c, i) => ({ ...c, i })), cargoLimit: LIMITS.cargo, canCargo: true,
      factions: s.factions.map((f, i) => ({ ...f, i, pips: pips(f.influence, LIMITS.factionInfluence) })),
      projects: s.projects.map((p, i) => ({ ...p, i, pips: pips(p.value, p.max) })),
      danger: pips(s.danger, LIMITS.danger).map(p => ({ ...p, critical: p.n === LIMITS.danger })),
      isActive: getState().camp === this.actor.uuid,
      canProject: s.projects.length < LIMITS.projects,
      projectKinds: ["rating", "campAspect", "custom"].map(k => ({ value: k, label: `WS.Project.${k}` }))
    });
  }
  static #activate() { return op("setCamp", { uuid: this.actor.uuid }); }
  static async #dangerPip(ev, t) {
    const n = Number(t.dataset.n);
    await this.actor.update({ "system.danger": this.actor.system.danger === n ? n - 1 : n });
  }
}

export class ThreatSheet extends BaseActorSheet {
  static DEFAULT_OPTIONS = { classes: ["ws-threat"], position: { width: 620, height: 760 } };
  static PARTS = { body: { template: T("threat"), scrollable: [".ws-scroll"] } };
  async _prepareContext(o) {
    const ctx = await super._prepareContext(o);
    const tr = this.actor.system.track;
    return Object.assign(ctx, {
      total: tr, totalPips: pips(tr.value, tr.max),
      difficulties: ["simple", "medium", "hard", "deadly"].map(v => ({ value: v, label: `WS.Difficulty.${v}` })),
      kinds: ["human", "spirit", "monster", "horde"].map(v => ({ value: v, label: `WS.ThreatKind.${v}` }))
    });
  }
}
