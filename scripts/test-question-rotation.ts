// Checks that practice sessions cycle through unseen questions before repeating and keep answers correct.
import assert from 'node:assert/strict';
import { LOCAL_QUESTIONS, SUBJECTS } from '../src/data/localQuestions';
import { drawFromPool, pickSession, shuffleChoices } from '../src/data/pickQuestions';

const pool = LOCAL_QUESTIONS.filter((q) => q.grade === 5 && q.subject === 'math');
assert.equal(pool.length, 60);

// 12 sessions of 5 show all 60 questions exactly once, then a new cycle starts.
let seen: string[] = [];
const shown = new Set<string>();
for (let i = 0; i < 12; i++) {
  const d = drawFromPool(pool, seen, 5);
  for (const q of d.picked) {
    assert(!shown.has(q.id), `repeated ${q.id} before the cycle ended`);
    shown.add(q.id);
  }
  seen = d.seen;
}
assert.equal(shown.size, 60);
const next = drawFromPool(pool, seen, 5);
assert.equal(next.picked.length, 5);
assert.equal(next.seen.length, 5, 'cycle restarts after every question was shown');

// A partly-finished cycle finishes the unseen questions first.
const almost = pool.slice(0, 57).map((q) => q.id);
const tail = drawFromPool(pool, almost, 5);
const leftover = new Set(pool.slice(57).map((q) => q.id));
assert.equal(tail.picked.filter((q) => leftover.has(q.id)).length, 3);
assert.equal(new Set(tail.picked.map((q) => q.id)).size, 5);

// Shuffled choices still point at the same correct answer.
for (const q of LOCAL_QUESTIONS.slice(0, 500)) {
  const s = shuffleChoices(q);
  assert.equal(s.options[s.answer], q.options[q.answer]);
  assert.deepEqual([...s.options].sort(), [...q.options].sort());
}

// Mixed practice gives one question per subject.
const mixed = pickSession(3, 'mixed', {}, 5);
assert.equal(mixed.questions.length, SUBJECTS.length);
assert.equal(new Set(mixed.questions.map((q) => q.subject)).size, SUBJECTS.length);

console.log('PASS: rotation covers every question before repeating; shuffled answers stay correct; mixed covers all subjects.');
