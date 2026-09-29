/**
 * «Дике Поле» — a Foundry VTT v14 system for the Wild Words engine game by «КУРА».
 * This work is Told by Wild Words (http://www.wildwords-srd.com/). The Wild Words Engine is a product of
 * Felix Isaacs, Quillhound Studios and Mythworks, licensed CC BY 4.0. Told by Wild Words™ is a trademark of Mythopoeia, Inc.
 */
import { CharacterData, CampData, ThreatData, AspectData, ResourceData } from "./module/data.mjs";
import { CharacterSheet, CampSheet, ThreatSheet } from "./module/sheets/actors.mjs";
import { AspectSheet, ResourceSheet } from "./module/sheets/items.mjs";
import { TracksPanel } from "./module/apps/tracks.mjs";
import { ID, registerSettings, initSocket, getState, op } from "./module/state.mjs";
import { rollDialog, doRoll, onRenderChatMessage } from "./module/roll.mjs";
import * as rules from "./module/rules.mjs";

export const DEFAULT_IMG = {
  Actor: { character: "icons/svg/mystery-man.svg", camp: "icons/environment/settlement/wagon.webp", threat: "icons/creatures/unholy/demon-fanged-horned-yellow.webp" },
  Item: {
    aspect: "icons/magic/symbols/circle-ouroboros.webp",
    resource: {
      gear: "icons/tools/smithing/anvil.webp", steppeShard: "icons/commodities/gems/gem-faceted-diamond-green.webp",
      ruinShard: "icons/commodities/gems/gem-cluster-purple.webp", map: "icons/tools/navigation/map-chart-tan.webp"
    }
  }
};

Hooks.once("init", () => {
  Object.assign(CONFIG.Actor.dataModels, { character: CharacterData, camp: CampData, threat: ThreatData });
  Object.assign(CONFIG.Item.dataModels, { aspect: AspectData, resource: ResourceData });
  CONFIG.Actor.trackableAttributes = {
    character: { bar: [], value: [] },
    camp: { bar: [], value: ["danger", "ratings.cohesion", "ratings.protection", "ratings.speed", "ratings.supply"] },
    threat: { bar: [], value: [] }
  };

  const { Actors, Items } = foundry.documents.collections;
  Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  Items.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
  Actors.registerSheet(ID, CharacterSheet, { types: ["character"], makeDefault: true, label: "WS.SheetName.character" });
  Actors.registerSheet(ID, CampSheet, { types: ["camp"], makeDefault: true, label: "WS.SheetName.camp" });
  Actors.registerSheet(ID, ThreatSheet, { types: ["threat"], makeDefault: true, label: "WS.SheetName.threat" });
  Items.registerSheet(ID, AspectSheet, { types: ["aspect"], makeDefault: true, label: "WS.SheetName.aspect" });
  Items.registerSheet(ID, ResourceSheet, { types: ["resource"], makeDefault: true, label: "WS.SheetName.resource" });

  registerSettings();
  foundry.applications.handlebars.loadTemplates([`systems/${ID}/templates/parts/pips.hbs`]);
  game.dykePole = { rules, roll: rollDialog, doRoll, tracks: () => TracksPanel.toggle(), state: getState, op };
});

Hooks.once("ready", () => initSocket());

/* Default artwork per type/kind. */
Hooks.on("preCreateActor", (doc, data) => {
  if (!data.img || data.img === "icons/svg/mystery-man.svg") doc.updateSource({ img: DEFAULT_IMG.Actor[doc.type] ?? doc.img });
  if (doc.type === "camp" || doc.type === "character") doc.updateSource({ "prototypeToken.actorLink": true });
});
Hooks.on("preCreateItem", (doc, data) => {
  if (data.img && data.img !== "icons/svg/item-bag.svg") return;
  const img = doc.type === "resource" ? DEFAULT_IMG.Item.resource[doc.system.kind] : DEFAULT_IMG.Item[doc.type];
  if (img) doc.updateSource({ img });
});
/* Changing a resource's kind swaps its default icon. */
Hooks.on("preUpdateItem", (doc, change) => {
  const kind = change.system?.kind;
  if (doc.type !== "resource" || !kind) return;
  if (Object.values(DEFAULT_IMG.Item.resource).includes(doc.img)) change.img = DEFAULT_IMG.Item.resource[kind];
});

Hooks.on("renderChatMessageHTML", onRenderChatMessage);

/* Tracks panel in the token controls. */
Hooks.on("getSceneControlButtons", controls => {
  const tokens = controls.tokens ?? controls.token;
  if (!tokens?.tools) return;
  tokens.tools.wsTracks = {
    name: "wsTracks", title: "WS.Tracks.Title", icon: "fa-solid fa-circle-dot", order: 60, button: true,
    onChange: () => TracksPanel.toggle()
  };
});
