/**
 * Shared table state: open/secret tracks (obstacles, threats' timers, the journey with its key phrases)
 * and the active camp. Stored in a world setting; players change it through `op()`, which runs on the active GM.
 */
import { fillTrack, addCounter, COUNTER_MAX, LIMITS } from "./rules.mjs";

export const ID = "dyke-pole";
const CHANNEL = `system.${ID}`;
export const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
export const esc = t => foundry.utils.escapeHTML(String(t ?? ""));

export const DEFAULT_STATE = { tracks: [], camp: "" };
export const getState = () => foundry.utils.mergeObject(foundry.utils.deepClone(DEFAULT_STATE), game.settings.get(ID, "state") ?? {});
const setState = s => game.settings.set(ID, "state", s);

export function registerSettings() {
  game.settings.register(ID, "state", {
    scope: "world", config: false, type: Object, default: DEFAULT_STATE,
    onChange: () => Hooks.callAll("dykePoleStateChanged", getState())
  });
  game.settings.register(ID, "campaign", {
    name: "WS.Setting.Campaign", hint: "WS.Setting.CampaignHint", scope: "world", config: true, type: String,
    choices: { short: "WS.Setting.Short", long: "WS.Setting.Long" }, default: "long"
  });
  game.settings.register(ID, "twistTable", {
    name: "WS.Setting.TwistTable", hint: "WS.Setting.TwistTableHint", scope: "world", config: true, type: Boolean, default: false
  });
}
export const counterMax = () => COUNTER_MAX[game.settings.get(ID, "campaign")] ?? COUNTER_MAX.long;

/* ---------------- socket ---------------- */
const pending = new Map();
export function initSocket() {
  game.socket.on(CHANNEL, async msg => {
    if (msg.type === "result") {
      const p = pending.get(msg.id);
      if (p && msg.to === game.user.id) { pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error)) : p.resolve(msg.result); }
      return;
    }
    if (msg.type !== "op" || !game.users.activeGM?.isSelf) return;
    let result = null, error = null;
    try { result = await runOp(msg.name, msg.data, game.users.get(msg.from)); } catch (err) { console.error(err); error = err.message; }
    game.socket.emit(CHANNEL, { type: "result", id: msg.id, to: msg.from, result, error });
  });
}
export async function op(name, data = {}) {
  if (game.users.activeGM?.isSelf) return runOp(name, data, game.user);
  if (!game.users.activeGM) { ui.notifications.warn("WS.Notify.NoGM", { localize: true }); return null; }
  const id = foundry.utils.randomID();
  const p = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  game.socket.emit(CHANNEL, { type: "op", id, name, data, from: game.user.id });
  return p;
}
async function runOp(name, data, user) {
  const s = foundry.utils.deepClone(getState());
  const O = OPS[name];
  if (!O) throw new Error(`unknown op ${name}`);
  const out = await O(s, data, { user });
  if (out !== false) await setState(s);
  return out;
}

export function card(title, body, { speaker = null, icon = "fa-feather", kind = "note" } = {}) {
  return ChatMessage.create({
    speaker: speaker ?? { alias: L("WS.Title") },
    content: `<div class="ws-card ws-${kind}"><header><i class="fa-solid ${icon}"></i> ${title}</header>${body ? `<div class="ws-body">${body}</div>` : ""}</div>`,
    flags: { [ID]: { kind } }
  });
}

/** Resolve a mark target: "track:<id>" (shared track) or an aspect uuid (threat/character/camp aspect). */
export function describeTarget(target) {
  if (!target) return null;
  if (target.startsWith("track:")) {
    const t = getState().tracks.find(x => x.id === target.slice(6));
    return t ? { name: t.name, value: t.value, max: t.max } : null;
  }
  const item = fromUuidSync(target);
  return item ? { name: `${item.parent?.name ?? ""} — ${item.name}`, value: item.system.damage, max: item.system.length } : null;
}

/* ---------------- operations ---------------- */
const OPS = {
  async addTrack(s, d) {
    s.tracks.push({ id: foundry.utils.randomID(), name: d.name || L("WS.Tracks.New"), kind: d.kind || "obstacle", value: 0, max: Math.max(1, d.max || 4), secret: !!d.secret, phrases: [] });
  },
  async editTrack(s, d) {
    const t = s.tracks.find(x => x.id === d.id);
    if (!t) return false;
    for (const k of ["name", "kind", "secret"]) if (k in d) t[k] = d[k];
    if ("max" in d) { t.max = Math.max(1, Number(d.max) || 1); t.value = Math.min(t.value, t.max); }
  },
  async removeTrack(s, d) { s.tracks = s.tracks.filter(x => x.id !== d.id); },
  async setTrack(s, d) {
    const t = s.tracks.find(x => x.id === d.id);
    if (!t) return false;
    t.value = Math.max(0, Math.min(t.max, d.value));
  },
  /** A journey period ends: next mark + key phrase (p.53); the camp's danger counter drops by 1. */
  async journeyPhrase(s, d) {
    const t = s.tracks.find(x => x.id === d.id);
    if (!t) return false;
    t.phrases[t.value] = d.phrase ?? "";
    t.value = Math.min(t.max, t.value + 1);
    const camp = s.camp ? fromUuidSync(s.camp) : null;
    if (camp && d.phrase !== undefined) await camp.update({ "system.danger": Math.max(0, camp.system.danger - 1) });
    await card(L("WS.Journey.Period", { n: t.value, max: t.max }), d.phrase ? `<blockquote>${esc(d.phrase)}</blockquote>` : "", { icon: "fa-route", kind: "journey" });
  },
  async setCamp(s, d) { s.camp = d.uuid ?? ""; },

  /** Put marks from a roll on a target (card button). */
  async mark(s, d, { user }) {
    const marks = d.marks === "all" ? "all" : Number(d.marks) || 0;
    if (d.target.startsWith("track:")) {
      const t = s.tracks.find(x => x.id === d.target.slice(6));
      if (!t) return false;
      t.value = fillTrack(t, marks);
      return { name: t.name, value: t.value, max: t.max };
    }
    const item = await fromUuid(d.target);
    if (!item) return false;
    const damage = fillTrack({ value: item.system.damage, max: item.system.length }, marks);
    await item.update({ "system.damage": damage });
    return false;
  },

  /** Counter marks (shard use, Ruin exposure). Rolls over into levels, reports maxing out. */
  async counter(s, d) {
    const a = await fromUuid(d.uuid);
    if (!a) return false;
    const cur = a.system.counters[d.power];
    const r = addCounter(cur, d.marks ?? 1, counterMax());
    await a.update({ [`system.counters.${d.power}`]: { level: r.level, track: r.track } });
    if (r.gained) await card(L(`WS.Counter.Up.${d.power}`, { name: esc(a.name), level: r.level }), L(`WS.Counter.Effect.${d.power}`), { speaker: ChatMessage.getSpeaker({ actor: a }), icon: d.power === "ruin" ? "fa-skull" : "fa-seedling", kind: d.power });
    if (r.maxed) await card(L(`WS.Counter.Max.${d.power}`, { name: esc(a.name) }), "", { speaker: ChatMessage.getSpeaker({ actor: a }), icon: "fa-triangle-exclamation", kind: d.power });
    return false;
  }
};

export const MAX_DANGER = LIMITS.danger;
