/**
 * CONFIG.DYKE_POLE — mechanics tables owned by the system, plus empty registries a content module fills in
 * (camp types, pregens' suggestions, random-event flavour). The system works without any of it.
 */

/** Aspect ability costs (Wild Words aspect building, p.33). `use`: the ability must be «used» (a mark each time). */
export const ABILITY_COSTS = [
  { id: "companion", group: "base", cost: 2, use: false },
  { id: "utility", group: "base", cost: 1, use: false },
  { id: "perception", group: "base", cost: 2, use: false },
  { id: "carry", group: "base", cost: 1, use: false },
  { id: "restore", group: "base", cost: 2, use: true },
  { id: "advNiche", group: "advantage", cost: 1, use: false, advantage: true },
  { id: "advCommon", group: "advantage", cost: 2, use: false, advantage: true },
  { id: "armorNiche", group: "impact", cost: 2, use: false },
  { id: "impactNiche", group: "impact", cost: 2, use: false },
  { id: "armorCommon", group: "impact", cost: 3, use: false },
  { id: "impactCommon", group: "impact", cost: 3, use: false },
  { id: "triumphNiche", group: "results", cost: 1, use: false },
  { id: "triumphCommon", group: "results", cost: 2, use: false },
  { id: "makeResource", group: "resources", cost: 2, use: true },
  { id: "addTags", group: "resources", cost: 2, use: true },
  { id: "secret", group: "narrative", cost: 2, use: true },
  { id: "detail", group: "narrative", cost: 2, use: true },
  { id: "custom", group: "custom", cost: 1, use: false }
];
export const ABILITY_BASE = 8;

/** Cost of one chosen ability: optionally made cheaper by 1 by adding «use» to a no-use ability (p.32). */
export function abilityCost(id, { addUse = false, custom = 1 } = {}) {
  const a = ABILITY_COSTS.find(x => x.id === id);
  if (!a) return 0;
  const base = a.id === "custom" ? Math.max(0, custom) : a.cost;
  return Math.max(0, base - (addUse && !a.use ? 1 : 0));
}

/** Quick NPC names (p.80): camp folk — Ukrainian, spirits — old Ukrainian, the Horde — Mongolian. */
export const NAMES = {
  folk: {
    m: ["Остап", "Тарас", "Степан", "Ярема", "Михайло", "Грицько", "Петро", "Максим", "Данило", "Іван", "Омелько", "Панас", "Северин", "Трохим", "Лука", "Карпо", "Назар", "Гнат", "Мирон", "Юхим"],
    f: ["Олена", "Олеся", "Зоряна", "Ганна", "Катерина", "Марія", "Оксана", "Мотря", "Параска", "Горпина", "Христя", "Уляна", "Настя", "Ярина", "Докія", "Соломія", "Одарка", "Василина", "Устина", "Меланія"],
    last: ["Паливода", "Ткач", "Бондар", "Коваль", "Шевчук", "Гончар", "Кравець", "Мельник", "Лисиця", "Сірко", "Вернигора", "Непийпиво", "Загорулько", "Чумак", "Швидкий", "Дубина", "Хмара", "Ворона", "Зозуля", "Кривоніс"]
  },
  spirit: ["Ярило", "Велимир", "Добромир", "Любомир", "Святогор", "Ратибор", "Мирослава", "Злата", "Ладомира", "Всеслава", "Радогост", "Живана", "Буривой", "Милолика", "Лютобор", "Дана", "Світлана", "Божедар", "Огнеслава", "Вишеслав"],
  horde: ["Батбаяр", "Ганбаатар", "Сухбаатар", "Тумур", "Бат-Эрдэне", "Мунхбат", "Жаргал", "Оюун", "Сарангэрэл", "Алтанцэцэг", "Хулан", "Цэцэг", "Баяр", "Очир", "Энхтуяа", "Хасар", "Жамуха", "Субэдэй", "Боорчу", "Отгон"]
};

export function registerConfig() {
  CONFIG.DYKE_POLE = {
    abilityCosts: ABILITY_COSTS, abilityBase: ABILITY_BASE, names: NAMES,
    /** [{id, name, drive, look, notes[], ratings:{cohesion:+1,…}, aspects:[{name, abilities:[{text, advantage, use}], length}], factions:[{name, drive, people, resource, aspect:{…}}]}] */
    campTypes: [],
    /** Suggestions for the character wizard. */
    origins: [], backgrounds: [], roles: [],
    /** Random-event flavour per skill/knowledge key (p.59). */
    luckEvents: {},
    /** Resource kind → RollTable uuid for «random resource» buttons. */
    randomTables: {},
    /** Compendium ids to look for pregens (type character) — any pack of characters works anyway. */
    pregenPacks: []
  };
}
