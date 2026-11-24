// Quick authoring report: per grade count, answer positions, "answer is longest" count, duplicate prompts.
import { readFileSync } from 'node:fs';
for (const subject of process.argv.slice(2)) {
  const a = JSON.parse(readFileSync(new URL(`../src/data/bank/${subject}.json`, import.meta.url), 'utf8'));
  for (let g = 1; g <= 10; g++) {
    const q = a.filter((x) => x.grade === g);
    let L = 0;
    for (const x of q) { const l = x.options.map((o) => o.length); const m = Math.max(...l); if (l[x.answer] === m && l.filter((v) => v === m).length === 1) L++; }
    console.log(subject, 'g' + g, q.length, [0, 1, 2, 3].map((i) => q.filter((x) => x.answer === i).length).join(','), 'longest', L);
  }
  const seen = {};
  for (const x of a) { const k = x.prompt.toLowerCase().replace(/\s+/g, ' ').replace(/[.?!:]+$/u, '').trim(); if (seen[k]) console.log('DUP', x.id, seen[k]); seen[k] = x.id; }
}
