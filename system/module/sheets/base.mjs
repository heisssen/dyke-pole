/** Shared sheet behaviour: clickable pip tracks, editable row lists, embedded aspects/resources, rolls. */
import { ID, L } from "../state.mjs";
import { rollDialog } from "../roll.mjs";
import { LIMITS } from "../rules.mjs";

const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const TextEditor = foundry.applications.ux.TextEditor.implementation;

/** Pips for a track: [{n, on, cls}] */
export function pips(value, max, { cls = "" } = {}) {
  return Array.from({ length: max }, (_, i) => ({ n: i + 1, on: i < value, cls }));
}

/** Form fields like `system.drives.0.text` arrive as objects keyed by index; merge them back into the arrays. */
export function mergeArrays(doc, data) {
  const walk = (obj, path) => {
    for (const [k, v] of Object.entries(obj)) {
      const p = path ? `${path}.${k}` : k;
      const cur = foundry.utils.getProperty(doc, p);
      if (Array.isArray(cur) && v && typeof v === "object" && !Array.isArray(v)) {
        const arr = foundry.utils.deepClone(cur);
        for (const [i, row] of Object.entries(v)) arr[Number(i)] = foundry.utils.mergeObject(arr[Number(i)] ?? {}, row, { inplace: false });
        obj[k] = arr;
      } else if (v && typeof v === "object" && !Array.isArray(v)) walk(v, p);
    }
  };
  walk(data, "");
  return data;
}

export class BaseActorSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["dyke-pole", "ws-sheet"],
    form: { submitOnChange: true },
    window: { resizable: true },
    actions: {
      pip: BaseActorSheet.#pip, addRow: BaseActorSheet.#addRow, removeRow: BaseActorSheet.#removeRow,
      createItem: BaseActorSheet.#createItem, editItem: BaseActorSheet.#editItem, deleteItem: BaseActorSheet.#deleteItem,
      itemPip: BaseActorSheet.#itemPip, roll: BaseActorSheet.#roll, postItem: BaseActorSheet.#postItem
    }
  };

  tabGroups = { primary: "main" };

  _processFormData(event, form, formData) {
    return mergeArrays(this.actor, super._processFormData(event, form, formData));
  }

  async _prepareContext(o) {
    const ctx = await super._prepareContext(o);
    const actor = this.actor;
    const aspects = actor.items.filter(i => i.type === "aspect").sort((a, b) => a.sort - b.sort);
    const view = i => ({
      id: i.id, uuid: i.uuid, name: i.name, img: i.img, kind: i.system.kind, temporary: i.system.temporary,
      damage: i.system.damage, length: i.system.length, broken: i.system.broken, controlledBy: i.system.controlledBy,
      pips: pips(i.system.damage, i.system.length, { cls: "dmg" }), abilities: i.system.abilities
    });
    return Object.assign(ctx, {
      actor, system: actor.system, editable: this.isEditable, owner: actor.isOwner, isGM: game.user.isGM,
      aspects: aspects.filter(i => !i.system.temporary).map(view),
      temps: aspects.filter(i => i.system.temporary).map(view),
      limits: LIMITS,
      notesHTML: await TextEditor.enrichHTML(actor.system.notes ?? "", { relativeTo: actor, secrets: actor.isOwner })
    });
  }

  /** Tab parts get their own `tab` entry; the navigation part gets the list. */
  async _preparePartContext(partId, ctx, o) {
    ctx = await super._preparePartContext(partId, ctx, o);
    if (!this.constructor.TABS?.primary) return ctx;
    const tabs = this._prepareTabs("primary");
    if (partId === "tabs") ctx.tabs = tabs;
    if (tabs[partId]) ctx.tab = tabs[partId];
    return ctx;
  }

  /** Click the n-th pip of `path` (0 when clicking the only filled last pip). */
  static async #pip(ev, t) {
    const path = t.closest("[data-path]").dataset.path;
    const n = Number(t.dataset.n);
    const cur = foundry.utils.getProperty(this.actor, path) ?? 0;
    const min = Number(t.closest("[data-path]").dataset.min ?? 0);
    await this.actor.update({ [path]: Math.max(min, cur === n ? n - 1 : n) });
  }
  static async #addRow(ev, t) {
    const path = t.dataset.path;
    const arr = foundry.utils.deepClone(foundry.utils.getProperty(this.actor, path) ?? []);
    const max = Number(t.dataset.max ?? 99);
    if (arr.length >= max) return ui.notifications.warn(L("WS.Notify.Limit", { n: max }));
    arr.push(JSON.parse(t.dataset.row ?? "{}"));
    await this.actor.update({ [path]: arr });
  }
  static async #removeRow(ev, t) {
    const path = t.closest("[data-list]").dataset.list;
    const i = Number(t.closest("[data-index]").dataset.index);
    const arr = foundry.utils.deepClone(foundry.utils.getProperty(this.actor, path) ?? []);
    arr.splice(i, 1);
    await this.actor.update({ [path]: arr });
  }
  static async #createItem(ev, t) {
    const type = t.dataset.type;
    const system = t.dataset.kind ? { kind: t.dataset.kind } : {};
    if (type === "aspect") {
      const list = this.actor.items.filter(i => i.type === "aspect");
      const temp = t.dataset.kind && t.dataset.kind !== "permanent";
      const count = list.filter(i => i.system.temporary === !!temp).length;
      const max = temp ? LIMITS.tempAspects : LIMITS.aspects;
      if (this.actor.type === "character" && count >= max) return ui.notifications.warn(L(temp ? "WS.Notify.TempLimit" : "WS.Notify.AspectLimit", { n: max }));
      if (temp) system.length = 3;
    }
    const [item] = await this.actor.createEmbeddedDocuments("Item", [{ type, name: L(`WS.New.${t.dataset.kind ?? type}`), system }]);
    item?.sheet.render({ force: true });
  }
  static #editItem(ev, t) { this.actor.items.get(t.closest("[data-item-id]").dataset.itemId)?.sheet.render({ force: true }); }
  static async #deleteItem(ev, t) {
    const item = this.actor.items.get(t.closest("[data-item-id]").dataset.itemId);
    if (!item) return;
    const ok = await DialogV2.confirm({ window: { title: L("WS.Delete") }, content: `<p>${L("WS.DeleteAsk", { name: foundry.utils.escapeHTML(item.name) })}</p>`, classes: ["dyke-pole", "ws-dialog"] });
    if (ok) await item.delete();
  }
  /** Aspect pips are damage: clicking sets damage to n (or n−1 when it was exactly n). */
  static async #itemPip(ev, t) {
    const item = this.actor.items.get(t.closest("[data-item-id]").dataset.itemId);
    const n = Number(t.dataset.n);
    await item.update({ "system.damage": item.system.damage === n ? n - 1 : n });
  }
  static #roll(ev, t) { return rollDialog(this.actor, { mode: t.dataset.mode, key: t.dataset.key, task: t.dataset.task }); }
  static async #postItem(ev, t) {
    const item = this.actor.items.get(t.closest("[data-item-id]").dataset.itemId);
    if (!item) return;
    const abil = (item.system.abilities ?? []).map(a => `<li>${a.advantage ? "<b>(п)</b> " : ""}${foundry.utils.escapeHTML(a.text)}${a.use ? ` <em>(${L("WS.Aspect.Use")})</em>` : ""}</li>`).join("");
    const tags = (item.system.tags ?? []).map(x => `<span class="tag ${x.good ? "" : "bad"}">${foundry.utils.escapeHTML(x.text)}</span>`).join(" ");
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<div class="ws-card ws-item"><header><img src="${item.img}"> ${foundry.utils.escapeHTML(item.name)}</header><div class="ws-body">${tags}${abil ? `<ul>${abil}</ul>` : ""}${item.system.description ?? ""}</div></div>`
    });
  }

  /** Drop an aspect/resource item: normal embedded drop. Drop an actor onto bonds (character sheets). */
  _onRender(ctx, opts) {
    super._onRender(ctx, opts);
    this.element.querySelectorAll("[data-drag-item]").forEach(el => {
      el.setAttribute("draggable", "true");
      el.addEventListener("dragstart", ev => {
        const item = this.actor.items.get(el.dataset.itemId);
        if (item) ev.dataTransfer.setData("text/plain", JSON.stringify(item.toDragData()));
      });
    });
  }
}

/** Item sheets: aspect and resource. */
export class BaseItemSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["dyke-pole", "ws-sheet", "ws-item-sheet"],
    form: { submitOnChange: true },
    position: { width: 460, height: 560 },
    window: { resizable: true },
    actions: { addRow: BaseItemSheet.#addRow, removeRow: BaseItemSheet.#removeRow, pip: BaseItemSheet.#pip }
  };
  _processFormData(event, form, formData) {
    return mergeArrays(this.item, super._processFormData(event, form, formData));
  }
  async _prepareContext(o) {
    const ctx = await super._prepareContext(o);
    const item = this.item;
    return Object.assign(ctx, {
      item, system: item.system, editable: this.isEditable,
      pips: item.type === "aspect" ? pips(item.system.damage, item.system.length, { cls: "dmg" }) : [],
      descriptionHTML: await TextEditor.enrichHTML(item.system.description ?? "", { relativeTo: item })
    });
  }
  static async #addRow(ev, t) {
    const path = t.dataset.path;
    const arr = foundry.utils.deepClone(foundry.utils.getProperty(this.item, path) ?? []);
    arr.push(JSON.parse(t.dataset.row ?? "{}"));
    await this.item.update({ [path]: arr });
  }
  static async #removeRow(ev, t) {
    const path = t.closest("[data-list]").dataset.list;
    const i = Number(t.closest("[data-index]").dataset.index);
    const arr = foundry.utils.deepClone(foundry.utils.getProperty(this.item, path) ?? []);
    arr.splice(i, 1);
    await this.item.update({ [path]: arr });
  }
  static async #pip(ev, t) {
    const n = Number(t.dataset.n);
    await this.item.update({ "system.damage": this.item.system.damage === n ? n - 1 : n });
  }
}
