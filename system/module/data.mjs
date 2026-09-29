/** Data models: character, camp, threat actors; aspect and resource items. */
import { SKILLS, KNOWLEDGES, RATINGS, LIMITS } from "./rules.mjs";

const { fields } = foundry.data;
const str = (initial = "") => new fields.StringField({ required: true, blank: true, initial });
const html = () => new fields.HTMLField({ required: true, blank: true, initial: "" });
const int = (initial = 0, max) => new fields.NumberField({ required: true, integer: true, min: 0, initial, ...(max != null ? { max } : {}) });
const track = (value = 0, max = 3) => new fields.SchemaField({ value: int(value), max: int(max) });
const bool = (initial = false) => new fields.BooleanField({ initial });
const list = schema => new fields.ArrayField(new fields.SchemaField(schema));
const byKeys = (keys, make) => new fields.SchemaField(Object.fromEntries(keys.map(k => [k, make()])));

/** Development project: skill / knowledge / aspect / custom (p.35, p.56). */
const project = () => ({ name: str(), kind: str("custom"), target: str(), value: int(), max: int(3), notes: str() });

export class CharacterData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      origin: str(), background: str(), role: str(),                  // Походження, передісторія, роль
      skills: byKeys(SKILLS, () => int(0, LIMITS.skill)),
      knowledges: byKeys(KNOWLEDGES, () => int(0, LIMITS.knowledge)),
      counters: new fields.SchemaField({
        steppe: new fields.SchemaField({ level: int(), track: int(0, 2) }),
        ruin: new fields.SchemaField({ level: int(), track: int(0, 2) })
      }),
      drives: list({ text: str(), satisfied: int(), closed: bool() }),   // Прагнення
      bonds: list({ name: str(), uuid: str(), marks: int(0, LIMITS.bondMarks) }),
      projects: list(project()),
      facts: str(),                                                     // facts about the world from knowledge dots
      notes: html()
    };
  }
  get closedDrives() { return this.drives.filter(d => d.closed).length; }
}

export class CampData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      kind: str(), drive: str(), look: str(),
      ratings: byKeys(RATINGS, () => int(2, LIMITS.rating)),
      cargo: list({ name: str(), tags: str() }),
      factions: list({
        name: str(), drive: str(), people: str(), resource: str(), aspect: str(),
        influence: int(LIMITS.factionStart, LIMITS.factionInfluence)
      }),
      projects: list(project()),
      danger: int(LIMITS.dangerStart, LIMITS.danger),                   // Лічильник небезпеки
      notes: html()
    };
  }
}

export class ThreatData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      kind: str("human"),                                               // люди / духи / монстри / орда
      difficulty: str("simple"),
      drive: str(),
      quirks: str(),                                                    // Дивацтва
      appease: str(), banish: str(),                                    // Замирення і вигнання
      resources: str(),
      notes: html()
    };
  }
  /** The threat track is the sum of its aspects' tracks (p.92). */
  get track() {
    const aspects = this.parent.items.filter(i => i.type === "aspect");
    return { value: aspects.reduce((a, i) => a + i.system.damage, 0), max: aspects.reduce((a, i) => a + i.system.length, 0) };
  }
}

export class AspectData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      kind: str("permanent"),                                           // permanent | boon (користь) | harm (кривда)
      length: int(4, LIMITS.aspectLength), damage: int(0),
      abilities: list({ text: str(), advantage: bool(), use: bool() }),  // (п) advantage; «використай» costs a mark
      controlledBy: str(),                                              // camp aspects: faction in control
      description: html()
    };
  }
  get temporary() { return this.kind !== "permanent"; }
  get maxLength() { return this.temporary ? LIMITS.tempLength : LIMITS.aspectLength; }
  get remaining() { return Math.max(0, this.length - this.damage); }
  get broken() { return this.length > 0 && this.damage >= this.length; }
  static migrateData(d) {
    if (d.damage > d.length) d.damage = d.length;
    return super.migrateData(d);
  }
}

export class ResourceData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      kind: str("gear"),                                                // gear | steppeShard | ruinShard | map
      tags: list({ text: str(), good: bool(true) }),
      quantity: int(1),
      description: html()
    };
  }
}
