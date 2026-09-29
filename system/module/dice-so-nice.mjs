/** Optional Dice So Nice integration: parchment d6 in the book's ink and type, a feather-grass six. */
import { ID } from "./state.mjs";

export function registerDiceSoNice() {
  Hooks.once("diceSoNiceReady", dice3d => {
    const path = `systems/${ID}/assets/dice`;
    dice3d.addSystem({ id: ID, name: "Дике Поле" }, "preferred");
    dice3d.addTexture("dyke-pole-paper", { name: "Дике Поле: пергамент", composite: "multiply", source: `${path}/paper.webp` });
    dice3d.addColorset({
      name: "dyke-pole", description: "Дике Поле — пергамент", category: "Дике Поле",
      foreground: "#2b2519", background: "#f3ead2", outline: "#b39a3b", edge: "#8a7a2e",
      texture: "dyke-pole-paper", material: "wood", font: "WSHead", fontScale: { d6: 1.15 }
    }, "default");
    dice3d.addColorset({
      name: "dyke-pole-ruin", description: "Дике Поле — Руїна", category: "Дике Поле",
      foreground: "#f0dc8a", background: "#5b2c4f", outline: "#1a0f18", edge: "#3a1a33",
      texture: "dyke-pole-paper", material: "metal", font: "WSHead"
    });
    dice3d.addColorset({
      name: "dyke-pole-steppe", description: "Дике Поле — Степ", category: "Дике Поле",
      foreground: "#f3ead2", background: "#5e7d34", outline: "#2b2519", edge: "#3f5522",
      texture: "dyke-pole-paper", material: "wood", font: "WSHead"
    });
    dice3d.addDicePreset({
      type: "d6", system: ID, colorset: "dyke-pole", font: "WSHead", fontScale: 1.15,
      labels: ["1", "2", "3", "4", "5", `${path}/d6-6.png`]
    });
  });
}
