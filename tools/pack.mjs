/** Build the system's own compendium: a short Wild Words rules reference (written for this system, CC BY 4.0 engine). */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { compilePack } from "@foundryvtt/foundryvtt-cli";

const id = seed => crypto.createHash("sha1").update(seed).digest("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 16);
const stats = { coreVersion: "14", systemId: "dyke-pole", systemVersion: "0.1.0", createdTime: 0, modifiedTime: 0, lastModifiedBy: null };
const note = t => `<p style="background:#bcd3d6;padding:6px 10px;border-left:3px solid #2c4a50"><em>${t}</em></p>`;

const PAGES = [
  ["Кидок дії", `
<p>Збір: <strong>навичка чи знання (до 3к6) + переваги (до 3к6)</strong>. Результат — найвища кістка після зрізів.</p>
<table><thead><tr><th>Кістка</th><th>Результат</th><th>Позначки на трек</th></tr></thead><tbody>
<tr><td>6</td><td>Тріумф — успіх без наслідків</td><td>2</td></tr>
<tr><td>4–5</td><td>Конфлікт — успіх із наслідками</td><td>1</td></tr>
<tr><td>1–3</td><td>Лихо — провал зі значними наслідками</td><td>—</td></tr>
<tr><td>дубль</td><td>Твіст — новий елемент у сцені</td><td></td></tr></tbody></table>
<p>Без жодної кістки кидається одна, але Тріумф неможливий. <strong>Зріз</strong> прибирає найвищу кістку до читання результату.
<strong>Вплив</strong> (низький −1, середній, високий +1, масивний — весь трек) змінює кількість позначок.</p>
${note("У Foundry: кнопка кидка на аркуші або кубик біля навички. Діалог рахує переваги з аспектів (п) і спорядження, зрізи, вплив; картка в чаті ставить позначки на обраний трек одним кліком.")}`],
  ["Реакції, талан, контроль", `
<p><strong>Реакція</strong> — захист від дії майстра: 6 — уникнення всього, 4–5 — більшості, 1–3 — повні ушкодження; дубль — контратака на 1 позначку.</p>
<p><strong>Талан</strong> (випадкова подія) — тільки рейтинг навички чи знання, без переваг: навичка задає характер події, результат — обставини.</p>
<p><strong>Контроль уламка</strong> — кісток стільки, скільки рівень відповідного лічильника.</p>`],
  ["Аспекти й лічильники", `
<p>Аспект: назва, трек (до 8) і здібності. Ушкодження стирають трек; на нулі здібності недоступні, надлишок стає кривдою.
Максимум 4 аспекти й 3 тимчасові (користь чи кривда, до 5).</p>
<p>Лічильники Степу й Руїни: рівень + трек на 3; повний трек підіймає рівень. Максимальний рівень — перетворення на духа Степу чи погань.</p>
${note("У Foundry: клік по кружечку ставить ушкодження; третя позначка лічильника автоматично підіймає рівень і пише картку в чат.")}`],
  ["Табір, подорож, відпочинок", `
<p>Табір: рейтинги згуртованості, захищеності, швидкості й забезпеченості (до 4), вантаж (6), фракції з впливом (8, старт 5), аспекти, проєкти.</p>
<p>Подорож: мета, формувальні запитання, трек періодів (зазвичай 3) з ключовою фразою в кінці кожного, фінальна локація.</p>
<p>Відпочинок: лічильник небезпеки (старт 4) +1 за період; на 10 Степ чи Руїна забирає табір. Кожен період подорожі знижує його на 1.</p>
${note("У Foundry: панель «Треки» (кнопка з кружечком ліворуч) — подорожі з фразами, перешкоди, таймери і лічильник небезпеки активного табору.")}`],
  ["Ліцензія", `<p>This work is Told by Wild Words (<a href="http://www.wildwords-srd.com/">wildwords-srd.com</a>). The Wild Words Engine is a product of
Felix Isaacs, Quillhound Studios and Mythworks, licensed under <a href="http://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.
Told by Wild Words™ is a trademark of Mythopoeia, Inc.</p>
<p>«Дике Поле» — сетинг © «КУРА», 2025 (текст: Святослав Демченко, Євген Мокеєв). Ця система — фанатська реалізація механік для Foundry VTT; сетинг, тексти й ілюстрації книги в неї не входять.</p>`]
];

const jid = id("ws-rules");
const docs = [{
  _id: jid, _key: `!journal!${jid}`, name: "Дике Поле: коротко про правила", folder: null, sort: 0, ownership: { default: 0 }, flags: {}, _stats: stats,
  pages: PAGES.map(([name, html], i) => {
    const pid = id(`ws-rules-${i}`);
    return { _id: pid, _key: `!journal.pages!${jid}.${pid}`, name, type: "text", title: { show: true, level: 1 }, text: { format: 1, content: html }, sort: (i + 1) * 100, ownership: { default: -1 }, flags: {}, _stats: stats };
  })
}];

const src = path.resolve("packs-src/rules");
fs.rmSync(src, { recursive: true, force: true });
fs.mkdirSync(src, { recursive: true });
for (const d of docs) fs.writeFileSync(path.join(src, `${d._id}.json`), JSON.stringify(d, null, 2));
const out = path.resolve("system/packs/rules");
fs.rmSync(out, { recursive: true, force: true });
await compilePack(src, out, { log: false });
console.log("packed rules");
