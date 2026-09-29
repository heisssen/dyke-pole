/** Aspect and resource item sheets. */
import { BaseItemSheet } from "./base.mjs";
import { RESOURCE_KINDS, barterValue } from "../rules.mjs";
import { ID, L, op, esc } from "../state.mjs";

export class AspectSheet extends BaseItemSheet {
  static DEFAULT_OPTIONS = { classes: ["ws-aspect-sheet"] };
  static PARTS = { body: { template: `systems/${ID}/templates/items/aspect.hbs`, scrollable: [".ws-scroll"] } };
}

export class ResourceSheet extends BaseItemSheet {
  static DEFAULT_OPTIONS = { classes: ["ws-resource-sheet"], actions: { useShard: ResourceSheet.#useShard } };
  static PARTS = { body: { template: `systems/${ID}/templates/items/resource.hbs`, scrollable: [".ws-scroll"] } };
  async _prepareContext(o) {
    const ctx = await super._prepareContext(o);
    const s = this.item.system;
    const good = s.tags.filter(t => t.good).length, bad = s.tags.length - good;
    return Object.assign(ctx, {
      kinds: Object.keys(RESOURCE_KINDS).map(k => ({ value: k, label: `WS.Resource.${k}` })),
      value: barterValue(s.kind, { good, bad }),
      shard: !!RESOURCE_KINDS[s.kind]?.shard, isMap: s.kind === "map"
    });
  }

  /** Using a shard (p.28): a twist bound to its name, the shard is destroyed, the matching counter +1 (+2 with «Мітка»). */
  static async #useShard() {
    const item = this.item, actor = item.parent;
    if (!actor) return;
    const power = RESOURCE_KINDS[item.system.kind].shard;
    const tags = item.system.tags.map(t => t.text.toLowerCase());
    const echo = tags.some(t => t.startsWith("відлун") || t.startsWith("echo"));
    const marks = tags.some(t => t.startsWith("мітк") || t.startsWith("mark")) ? 2 : 1;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="ws-card ws-shard ws-${power}"><header><i class="fa-solid fa-gem"></i> ${L("WS.Resource.ShardUsed", { name: esc(item.name) })}</header>
        <div class="ws-body">${L(`WS.Resource.ShardTone.${power}`)}${item.system.tags.length ? `<p>${item.system.tags.map(t => `<span class="tag">${esc(t.text)}</span>`).join(" ")}</p>` : ""}</div></div>`
    });
    await op("counter", { uuid: actor.uuid, power, marks });
    // «Відлуння»: can be used twice — drop the tag instead of the shard the first time.
    if (echo) await item.update({ "system.tags": item.system.tags.filter(t => !/^(відлун|echo)/i.test(t.text)) });
    else { this.close(); await item.delete(); }
  }
}
