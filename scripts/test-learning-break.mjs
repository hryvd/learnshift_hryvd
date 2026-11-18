import assert from 'node:assert/strict';
import { breakTransition } from '../src/services/learningBreak.ts';

let state = { stage: 'feed', remaining: 15 };
state = breakTransition(state, { type: 'swipe', direction: 'up' });
assert.equal(state.stage, 'feed', 'a swipe before the timer ends must not interrupt');
for (let i = 0; i < 15; i++) state = breakTransition(state, { type: 'tick' });
assert.deepEqual(state, { stage: 'ready', remaining: 0 }, 'expiry only arms the break');
for (let i = 0; i < 100; i++) state = breakTransition(state, { type: 'tick' });
assert.equal(state.stage, 'ready', 'waiting must never automatically show an overlay');
state = breakTransition(state, { type: 'swipe', direction: 'down' });
assert.equal(state.stage, 'ready', 'downward gestures must not open a break');
state = breakTransition(state, { type: 'swipe', direction: 'up' });
assert.equal(state.stage, 'overlay');
assert.equal(breakTransition(state, { type: 'tick' }), state, 'timer freezes while a question is visible');
state = breakTransition(state, { type: 'dismiss', interval: 30 });
assert.deepEqual(state, { stage: 'feed', remaining: 30 }, 'dismissal resumes content and resets interval');
assert.equal(
  breakTransition({ stage: 'ready', remaining: 0 }, { type: 'start' }).stage,
  'overlay',
  'accessible start is equivalent to an upward gesture',
);
console.log('Learning-break state checks passed (timer, gestures, pause and resume).');
