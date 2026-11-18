import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const subjects = ['math', 'english', 'filipino', 'science', 'araling-panlipunan'];
const ids = new Set();
const prompts = new Set();
const bank = subjects.flatMap((subject) => {
  const questions = JSON.parse(readFileSync(new URL(`../src/data/bank/${subject}.json`, import.meta.url), 'utf8'));
  assert.equal(questions.length, 100, `${subject}: 100 questions required`);
  for (let grade = 1; grade <= 10; grade++) assert.equal(questions.filter((q) => q.grade === grade).length, 10, `${subject}, grade ${grade}`);
  for (const q of questions) {
    assert(!ids.has(q.id), `Duplicate id ${q.id}`); ids.add(q.id);
    assert.equal(q.subject, subject);
    assert(Number.isInteger(q.grade) && q.grade >= 1 && q.grade <= 10, q.id);
    assert(q.id && q.topic?.trim() && q.prompt?.trim() && q.explanation?.trim(), `Missing content ${q.id}`);
    assert.equal(q.options.length, 4, q.id);
    assert(q.options.every((s) => typeof s === 'string' && s.trim()), q.id);
    assert.equal(new Set(q.options.map((s) => s.normalize('NFC').trim())).size, 4, `Repeated choice ${q.id}`);
    assert(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4, `Invalid answer ${q.id}`);
    const key = `${subject}:${q.prompt.trim().toLocaleLowerCase()}`;
    assert(!prompts.has(key), `Repeated prompt ${q.id}`); prompts.add(key);
  }
  return questions;
});
const nativeAsset = new URL('../modules/usage-monitor/android/src/main/assets/learnshift-questions.json', import.meta.url);
if (process.argv.includes('--write')) writeFileSync(nativeAsset, JSON.stringify(bank));
assert.deepEqual(JSON.parse(readFileSync(nativeAsset, 'utf8')), bank, 'Native bank differs; run node scripts/validate-content.mjs --write');
console.log(`PASS: ${bank.length} questions; 100 per subject, 10 per grade; valid choices, unique IDs/prompts, matching native asset.`);
