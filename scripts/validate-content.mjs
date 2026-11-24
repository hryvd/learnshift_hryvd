import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const subjects = ['math', 'english', 'filipino', 'science', 'araling-panlipunan'];
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
    if (q.visual !== undefined) validateVisual(q.visual, q.id);
    const key = `${subject}:${q.prompt.trim().toLocaleLowerCase()}`;
    assert(!prompts.has(key), `Repeated prompt ${q.id}`); prompts.add(key);
  }
  return questions;
});
const nativeAsset = new URL('../modules/usage-monitor/android/src/main/assets/learnshift-questions.json', import.meta.url);
if (process.argv.includes('--write')) writeFileSync(nativeAsset, JSON.stringify(bank));
assert.deepEqual(JSON.parse(readFileSync(nativeAsset, 'utf8')), bank, 'Native bank differs; run node scripts/validate-content.mjs --write');
console.log(`PASS: ${bank.length} questions; 100 per subject, 10 per grade; valid choices, unique IDs/prompts, matching native asset.`);
