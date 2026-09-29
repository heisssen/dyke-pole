/** The shared Tracks panel: journey (periods + key phrases), obstacles/timers, the active camp's danger counter. */
import { ID, L, esc, op, getState, card } from "../state.mjs";
import { LIMITS, dangerStart, dangerCritical } from "../rules.mjs";
import { pips } from "../sheets/base.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

export class TracksPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static instance = null;
  static toggle() {
    if (this.instance?.rendered) return this.instance.close();
    this.instance ??= new this();
    return this.instance.render({ force: true });
  }

  static DEFAULT_OPTIONS = {
    id: "ws-tracks",
    classes: ["dyke-pole", "ws-tracks"],
    window: { title: "WS.Tracks.Title", icon: "fa-solid fa-circle-dot", resizable: true },
    position: { width: 380, height: 620, top: 80, left: 120 },
    actions: {
      add: TracksPanel.#add, journey: TracksPanel.#journey, period: TracksPanel.#period, remove: TracksPanel.#remove,
      edit: TracksPanel.#edit, pip: TracksPanel.#pip, danger: TracksPanel.#danger, rest: TracksPanel.#rest, openCamp: TracksPanel.#openCamp
    }
  };
  static PARTS = { body: { template: `systems/${ID}/templates/apps/tracks.hbs`, scrollable: [".ws-scroll"] } };

  async _prepareContext() {
    const s = getState();
    const camp = s.camp ? fromUuidSync(s.camp) : null;
    const tracks = s.tracks.filter(t => !t.secret || game.user.isGM).map(t => ({
      ...t, pips: pips(t.value, t.max), done: t.value >= t.max,
      phrases: t.kind === "journey" ? Array.from({ length: t.max }, (_, i) => ({ n: i + 1, text: t.phrases[i] ?? "", passed: i < t.value })) : null
    }));
    return {
      isGM: game.user.isGM, camp, tracks,
      journeys: tracks.filter(t => t.kind === "journey"), others: tracks.filter(t => t.kind !== "journey"),
      danger: camp ? pips(camp.system.danger, LIMITS.danger).map(p => ({ ...p, critical: p.n === LIMITS.danger })) : null,
      dangerValue: camp?.system.danger ?? 0, critical: camp ? dangerCritical(camp.system.danger) : false
    };
  }

  _onRender(ctx, opts) {
    super._onRender(ctx, opts);
    this._hook ??= Hooks.on("dykePoleStateChanged", () => this.render());
    this._actorHook ??= Hooks.on("updateActor", a => { if (a.uuid === getState().camp) this.render(); });
  }
  async close(o) {
    if (this._hook) Hooks.off("dykePoleStateChanged", this._hook);
    if (this._actorHook) Hooks.off("updateActor", this._actorHook);
    this._hook = this._actorHook = null;
    return super.close(o);
  }

  static async #add() {
    const res = await DialogV2.prompt({
      window: { title: "WS.Tracks.Add", icon: "fa-solid fa-plus" }, classes: ["dyke-pole", "ws-dialog"],
      content: `<div class="form-group"><label>${L("WS.Tracks.Name")}</label><input name="name" type="text" autofocus></div>
        <div class="form-group"><label>${L("WS.Tracks.Kind")}</label><select name="kind">
          ${["obstacle", "challenge", "timer"].map(k => `<option value="${k}">${L(`WS.Tracks.Kinds.${k}`)}</option>`).join("")}</select></div>
        <div class="form-group"><label>${L("WS.Tracks.Length")}</label><input name="max" type="number" value="4" min="1" max="20"></div>
        ${game.user.isGM ? `<label class="checkbox"><input type="checkbox" name="secret"> ${L("WS.Tracks.Secret")}</label>` : ""}
        <p class="hint">${L("WS.Tracks.LengthHint")}</p>`,
      ok: { label: "WS.Tracks.Create", callback: (ev, b) => new foundry.applications.ux.FormDataExtended(b.form).object },
      rejectClose: false
    });
    if (res) return op("addTrack", { ...res, max: Number(res.max) });
  }

  /** A new journey (p.50–53): goal + length (3 by default); the danger counter drops as periods pass. */
  static async #journey() {
    const res = await DialogV2.prompt({
      window: { title: "WS.Journey.New", icon: "fa-solid fa-route" }, classes: ["dyke-pole", "ws-dialog"],
      content: `<div class="form-group"><label>${L("WS.Journey.Goal")}</label><input name="name" type="text" autofocus placeholder="${L("WS.Journey.GoalHint")}"></div>
        <div class="form-group"><label>${L("WS.Journey.Length")}</label><input name="max" type="number" value="3" min="1" max="12"></div>
        <p class="hint">${L("WS.Journey.Hint")}</p>`,
      ok: { label: "WS.Journey.Start", callback: (ev, b) => new foundry.applications.ux.FormDataExtended(b.form).object },
      rejectClose: false
    });
    if (!res) return;
    await op("addTrack", { name: res.name || L("WS.Journey.Default"), kind: "journey", max: Number(res.max) || 3 });
    await card(L("WS.Journey.Started"), `<blockquote>${esc(res.name)}</blockquote>${L("WS.Journey.Questions")}`, { icon: "fa-route", kind: "journey" });
  }

  /** End of a journey period: record the key phrase (p.53). */
  static async #period(ev, t) {
    const id = t.closest("[data-id]").dataset.id;
    const phrase = await DialogV2.prompt({
      window: { title: "WS.Journey.EndPeriod", icon: "fa-solid fa-flag" }, classes: ["dyke-pole", "ws-dialog"],
      content: `<p class="hint">${L("WS.Journey.PhraseHint")}</p><input name="p" type="text" autofocus>`,
      ok: { label: "WS.Journey.Record", callback: (ev, b) => b.form.elements.p.value }, rejectClose: false
    });
    if (phrase !== null && phrase !== undefined) return op("journeyPhrase", { id, phrase });
  }

  static async #remove(ev, t) {
    const id = t.closest("[data-id]").dataset.id;
    const ok = await DialogV2.confirm({ window: { title: "WS.Delete" }, content: `<p>${L("WS.Tracks.RemoveAsk")}</p>`, classes: ["dyke-pole", "ws-dialog"] });
    if (ok) return op("removeTrack", { id });
  }
  static async #edit(ev, t) {
    const tr = getState().tracks.find(x => x.id === t.closest("[data-id]").dataset.id);
    if (!tr) return;
    const res = await DialogV2.prompt({
      window: { title: "WS.Tracks.Edit" }, classes: ["dyke-pole", "ws-dialog"],
      content: `<div class="form-group"><label>${L("WS.Tracks.Name")}</label><input name="name" type="text" value="${esc(tr.name)}"></div>
        <div class="form-group"><label>${L("WS.Tracks.Length")}</label><input name="max" type="number" value="${tr.max}" min="1" max="20"></div>
        ${game.user.isGM ? `<label class="checkbox"><input type="checkbox" name="secret" ${tr.secret ? "checked" : ""}> ${L("WS.Tracks.Secret")}</label>` : ""}`,
      ok: { label: "WS.Save", callback: (ev, b) => new foundry.applications.ux.FormDataExtended(b.form).object }, rejectClose: false
    });
    if (res) return op("editTrack", { id: tr.id, ...res, max: Number(res.max) });
  }
  static #pip(ev, t) {
    const tr = getState().tracks.find(x => x.id === t.closest("[data-id]").dataset.id);
    const n = Number(t.dataset.n);
    return op("setTrack", { id: tr.id, value: tr.value === n ? n - 1 : n });
  }
  static async #danger(ev, t) {
    const camp = fromUuidSync(getState().camp);
    if (!camp?.isOwner) return;
    const n = Number(t.dataset.n);
    await camp.update({ "system.danger": camp.system.danger === n ? n - 1 : n });
  }

  /** A rest period (p.67): danger +1; at 10 the Steppe/Ruin turns on the camp. */
  static async #rest() {
    const camp = fromUuidSync(getState().camp);
    if (!camp) return;
    const next = Math.min(LIMITS.danger, camp.system.danger + 1);
    await camp.update({ "system.danger": next });
    await card(L("WS.Rest.Period", { n: next }), dangerCritical(next) ? `<p class="critical">${L("WS.Rest.Critical")}</p>` : L("WS.Rest.Hint"), { icon: "fa-campground", kind: dangerCritical(next) ? "danger" : "rest" });
  }
  static #openCamp() { fromUuidSync(getState().camp)?.sheet.render({ force: true }); }
}

export { dangerStart };
