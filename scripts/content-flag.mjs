// Lists questions whose correct answer is the single longest choice: id | correct length | other choices.
import { readFileSync } from 'node:fs';
const [subject, grade] = process.argv.slice(2);
const a = JSON.parse(readFileSync(new URL(`../src/data/bank/${subject}.json`, import.meta.url), 'utf8'));
for (const q of a.filter((x) => x.grade === Number(grade))) {
  const l = q.options.map((o) => o.length);
  const m = Math.max(...l);
  if (l[q.answer] === m && l.filter((v) => v === m).length === 1)
    console.log(q.id.slice(-2), '|', l[q.answer], '||', q.options.filter((_, i) => i !== q.answer).join(' / '));
}
