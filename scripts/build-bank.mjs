// Builds src/data/bank/<subject>.json from the original 10 per grade plus scripts/content-src/<subject>-g<N>.mjs.
// Each source file exports `fixes` (edits to existing ids 01-10) and `add` (new questions as
// [topic, prompt, [correct, wrong, wrong, wrong], explanation]). New ids are numbered from 11, and the
// correct choice is rotated through positions A-D so answer positions stay balanced (the app shuffles them again).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const subjects = process.argv.slice(2).length ? process.argv.slice(2) : ['math', 'english', 'filipino', 'science', 'araling-panlipunan'];
for (const subject of subjects) {
  const file = new URL(`../src/data/bank/${subject}.json`, import.meta.url);
  const current = JSON.parse(readFileSync(file, 'utf8'));
  const out = [];
  for (let grade = 1; grade <= 10; grade++) {
    const base = current.filter((q) => q.grade === grade && Number(q.id.slice(-2)) <= 10);
    const src = new URL(`./content-src/${subject}-g${grade}.mjs`, import.meta.url);
    const mod = existsSync(src) ? await import(src.href) : { fixes: {}, add: [] };
    for (const q of base) out.push({ ...q, ...(mod.fixes?.[q.id.slice(-2)] ?? {}) });
    (mod.add ?? []).forEach(([topic, prompt, [correct, ...wrong], explanation], i) => {
      const answer = (i + grade) % 4;
      const options = [...wrong];
      options.splice(answer, 0, correct);
      out.push({ id: `${subject}-g${grade}-${String(11 + i).padStart(2, '0')}`, subject, grade, topic, prompt, options, answer, explanation });
    });
  }
  writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
  console.log(subject, out.length);
}
