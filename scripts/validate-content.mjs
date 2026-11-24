import assert from 'node:assert/strict';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

const subjects = ['math', 'english', 'filipino', 'science', 'araling-panlipunan'];
const PER_GRADE = 60;
const write = process.argv.includes('--write');
const visualKinds = new Set(['scene', 'count', 'shape', 'clock', 'fraction', 'bars', 'grid']);
const visualScenes = new Set([
  'eye',
  'ear',
  'butterfly',
  'dog',
  'cat',
  'fish',
  'chicken',
  'plant',
  'flower',
  'sun',
  'rain_cloud',
  'ball',
  'ball_under_table',
  'books',
  'ruler',
  'thermometer',
  'magnet',
  'compass',
  'wash_hands',
  'school',
  'firefighter',
  'rice_field',
  'red_bag',
  'banana',
]);
const countItems = new Set(['pencil', 'banana', 'cookie', 'apple', 'star', 'marble', 'block']);
const shapes = new Set(['triangle', 'square', 'rectangle', 'circle', 'right_angle']);

function validateVisual(v, id) {
  assert(v && typeof v === 'object', `Invalid visual object ${id}`);
  assert(visualKinds.has(v.kind), `Invalid visual kind ${v.kind} in ${id}`);
  if (v.kind === 'scene') {
    assert(visualScenes.has(v.id), `Invalid visual scene ${v.id} in ${id}`);
  } else if (v.kind === 'count') {
    assert(countItems.has(v.item), `Invalid count item ${v.item} in ${id}`);
    assert(Number.isInteger(v.count) && v.count > 0, `Invalid count in ${id}`);
  } else if (v.kind === 'shape') {
    assert(shapes.has(v.shape), `Invalid shape ${v.shape} in ${id}`);
  } else if (v.kind === 'clock') {
    assert(Number.isFinite(v.hour) && Number.isFinite(v.minute), `Invalid clock in ${id}`);
  } else if (v.kind === 'fraction') {
    assert(Number.isInteger(v.parts) && v.parts >= 2, `Invalid fraction parts in ${id}`);
    assert(Number.isInteger(v.filled) && v.filled >= 0 && v.filled <= v.parts, `Invalid fraction filled in ${id}`);
  } else if (v.kind === 'bars') {
    assert(Array.isArray(v.items) && v.items.length > 0, `Invalid bars in ${id}`);
  } else if (v.kind === 'grid') {
    assert(Number.isInteger(v.rows) && v.rows > 0 && Number.isInteger(v.cols) && v.cols > 0, `Invalid grid in ${id}`);
  }
}
const ids = new Set();
const prompts = new Set();
const problems = [];

const norm = (s) => s.normalize('NFC').toLocaleLowerCase().replace(/\s+/g, ' ').replace(/[.?!:]+$/u, '').trim();

const bank = subjects.flatMap((subject) => {
  const questions = JSON.parse(readFileSync(new URL(`../src/data/bank/${subject}.json`, import.meta.url), 'utf8'));
  for (let grade = 1; grade <= 10; grade++) {
    const g = questions.filter((q) => q.grade === grade);
    assert.equal(g.length, PER_GRADE, `${subject}, grade ${grade}: ${PER_GRADE} questions required (has ${g.length})`);
    // Correct answers spread across A–D, and the answer is not usually the longest choice.
    const at = [0, 1, 2, 3].map((i) => g.filter((q) => q.answer === i).length);
    if (Math.min(...at) < 9) problems.push(`${subject} g${grade}: answer positions unbalanced ${at}`);
    const longest = g.filter((q) => {
      const len = q.options.map((o) => o.length);
      return len[q.answer] === Math.max(...len) && len.filter((l) => l === len[q.answer]).length === 1;
    }).length;
    if (longest / g.length > 0.4) problems.push(`${subject} g${grade}: answer is the longest choice in ${longest}/${g.length}`);
  }
  for (const q of questions) {
    assert(!ids.has(q.id), `Duplicate id ${q.id}`); ids.add(q.id);
    assert.match(q.id, new RegExp(`^${subject}-g${q.grade}-\\d{2}$`), `Bad id ${q.id}`);
    assert.equal(q.subject, subject);
    assert(Number.isInteger(q.grade) && q.grade >= 1 && q.grade <= 10, q.id);
    assert(q.id && q.topic?.trim() && q.prompt?.trim() && q.explanation?.trim(), `Missing content ${q.id}`);
    assert.equal(q.options.length, 4, q.id);
    assert(q.options.every((s) => typeof s === 'string' && s.trim()), q.id);
    assert.equal(new Set(q.options.map((s) => s.normalize('NFC').trim())).size, 4, `Repeated choice ${q.id}`);
    assert(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4, `Invalid answer ${q.id}`);
    if (q.visual !== undefined) validateVisual(q.visual, q.id);
    assert(!/\b(all|none) of the above\b|\blahat ng nabanggit\b/i.test(q.options.join(' ')), `"All/none of the above" in ${q.id}`);
    // Near-duplicates: same words after removing punctuation and case.
    const key = `${subject}:${norm(q.prompt)}`;
    assert(!prompts.has(key), `Repeated prompt ${q.id}`); prompts.add(key);
  }
  return questions;
});

assert.deepEqual(problems, [], `Quality checks failed:\n${problems.join('\n')}`);

// The Android overlay reads one grade at a time, so it never parses the whole bank.
const assetDir = new URL('../modules/usage-monitor/android/src/main/assets/', import.meta.url);
const legacy = new URL('learnshift-questions.json', assetDir);
for (let grade = 1; grade <= 10; grade++) {
  const file = new URL(`learnshift-questions-g${grade}.json`, assetDir);
  const expected = bank.filter((q) => q.grade === grade);
  if (write) writeFileSync(file, JSON.stringify(expected));
  assert(existsSync(file), `Missing native asset for grade ${grade}; run node scripts/validate-content.mjs --write`);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), expected, `Native grade ${grade} differs; run node scripts/validate-content.mjs --write`);
}
if (write && existsSync(legacy)) unlinkSync(legacy);
assert(!existsSync(legacy), 'Remove the old single-file native bank; run node scripts/validate-content.mjs --write');

console.log(`PASS: ${bank.length} questions; ${PER_GRADE} per grade and subject; balanced answers, unique IDs/prompts, matching native assets.`);
