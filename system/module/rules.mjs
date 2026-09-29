/**
 * Pure rules of «Дике Поле» (Wild Words engine). No Foundry APIs — covered by unit tests.
 * The Wild Words Engine © Felix Isaacs, Quillhound Studios, Mythworks — CC BY 4.0.
 */

export const SKILLS = ["athletics", "artistry", "trickery", "will", "brawl", "care", "study", "herbalism", "manipulation", "hunting", "craft", "senses"];
export const KNOWLEDGES = ["steppe", "ruin", "oldworld"];
export const RATINGS = ["cohesion", "protection", "speed", "supply"];
export const IMPACTS = ["low", "medium", "high", "massive"];

export const LIMITS = {
  skill: 3, knowledge: 3, advantages: 3, campAdvantages: 2, rating: 4,
  aspects: 4, aspectLength: 8, tempAspects: 3, tempLength: 5, bonds: 3, bondMarks: 2, projects: 3,
  counterTrack: 3, cargo: 6, factionInfluence: 8, factionStart: 5, danger: 10, dangerStart: 4
};

/** Resource kinds with carry limits and barter value (p.26–29). */
export const RESOURCE_KINDS = {
  gear: { limit: 8, value: 2 },
  steppeShard: { limit: 4, value: 3, shard: "steppe" },
  ruinShard: { limit: 4, value: 3, shard: "ruin" },
  map: { limit: 4, value: 3 }
};
/** Shards share one limit. */
export const shardLimit = 4;

/** Campaign length presets for the character counters (p.86). */
export const COUNTER_MAX = { short: 3, long: 5 };

/**
 * Resolve an action roll.
 * @param {number[]} faces   the dice rolled (1–6)
 * @param {object} [o]
 * @param {number} [o.cuts=0]      highest dice removed before reading the result
 * @param {boolean} [o.desperate]  rolled with zero dice: 1–3 Disaster, 4–6 Conflict, never Triumph
 * @returns {{kept:number[], cut:number[], highest:number, result:"triumph"|"conflict"|"disaster", twist:boolean, twistValue:number|null}}
 */
export function resolve(faces, { cuts = 0, desperate = false } = {}) {
  const sorted = [...faces].sort((a, b) => b - a);
  const cut = sorted.slice(0, Math.min(cuts, sorted.length));
  const kept = sorted.slice(cut.length);
  const highest = kept.length ? kept[0] : 0;
  let result = highest >= 6 ? "triumph" : highest >= 4 ? "conflict" : "disaster";
  if (desperate && result === "triumph") result = "conflict";
  // Twist: any double among the kept dice (p.15). Optional twist table reads the highest double (p.16).
  const counts = new Map();
  for (const f of kept) counts.set(f, (counts.get(f) ?? 0) + 1);
  const doubles = [...counts].filter(([, n]) => n >= 2).map(([f]) => f);
  const twistValue = doubles.length ? Math.max(...doubles) : null;
  return { kept, cut, highest, result, twist: twistValue !== null, twistValue };
}

/** Result → tone of the optional twist table (p.16). */
export function twistTone(value) {
  if (value == null) return null;
  return value >= 6 ? "positive" : value >= 4 ? "neutral" : "negative";
}

/** Number of dice in the pool: base rating (skill/knowledge/rating) + advantages, capped per source. */
export function poolSize({ base = 0, advantages = 0, camp = false } = {}) {
  const b = Math.max(0, Math.min(base, camp ? LIMITS.rating : LIMITS.skill));
  const a = Math.max(0, Math.min(advantages, camp ? LIMITS.campAdvantages : LIMITS.advantages));
  return b + a;
}

/**
 * Track marks from a result and impact (p.15, p.17). Massive fills the whole track.
 * @returns {number|"all"}
 */
export function trackMarks(result, impact = "medium", { twistBoost = false } = {}) {
  if (result === "disaster") return 0;
  if (impact === "massive") return "all";
  const base = result === "triumph" ? 2 : 1;
  const mod = impact === "low" ? -1 : impact === "high" ? 1 : 0;
  return Math.max(0, base + mod + (twistBoost ? 1 : 0));
}

/** Apply marks to a track {value, max}; returns the new value (capped). */
export function fillTrack({ value = 0, max = 0 }, marks) {
  if (marks === "all") return max;
  return Math.max(0, Math.min(max, value + marks));
}

/**
 * Steppe/Ruin counter: a level plus a 3-box track (p.24). Adding marks rolls over into levels.
 * @returns {{level:number, track:number, gained:number, maxed:boolean}}
 */
export function addCounter({ level = 0, track = 0 }, marks = 1, max = COUNTER_MAX.long) {
  let l = level, t = track + marks, gained = 0;
  while (t >= LIMITS.counterTrack && l < max) { t -= LIMITS.counterTrack; l += 1; gained += 1; }
  if (l >= max) t = 0;
  if (t < 0) { t = 0; }
  return { level: Math.min(l, max), track: t, gained, maxed: l >= max };
}

/** Remove one mark from a counter track (satisfying a drive, p.22). Never lowers the level. */
export function easeCounter({ level = 0, track = 0 }) {
  return { level, track: Math.max(0, track - 1) };
}

/**
 * Damage into an aspect track: returns the new damage and any overflow that becomes a harm (кривда, p.34).
 * @param {{length:number, damage:number}} aspect
 */
export function damageAspect({ length = 0, damage = 0 }, amount) {
  const room = Math.max(0, length - damage);
  const taken = Math.min(room, amount);
  return { damage: damage + taken, overflow: amount - taken, broken: damage + taken >= length };
}

/** Development project lengths (p.56, p.71). */
export function projectLength(kind, current = 0) {
  if (kind === "skill" || kind === "knowledge") return [3, 5, 7][Math.min(current, 2)] ?? 7;
  if (kind === "aspect") return 6;
  if (kind === "rating") return [1, 3, 5, 7][Math.min(current, 3)] ?? 7;
  if (kind === "campAspect") return 8;
  return 4;
}

/** New aspect length: 8 minus the cost of its abilities (p.32), min 1. */
export function aspectLength(costs = []) {
  return Math.max(1, 8 - costs.reduce((a, b) => a + b, 0));
}

/** Danger counter (p.67): starts at 4 (or the previous value) + local activity; +1 per rest period; −1 per journey period. */
export function dangerStart(previous, activity = 0) {
  return Math.min(LIMITS.danger, (previous ?? LIMITS.dangerStart) + activity);
}
export const dangerCritical = v => v >= LIMITS.danger;

/** Barter value with tags (p.26): a useful tag +1, a negative tag −1. */
export function barterValue(kind, { good = 0, bad = 0 } = {}) {
  return Math.max(0, (RESOURCE_KINDS[kind]?.value ?? 1) + good - bad);
}
