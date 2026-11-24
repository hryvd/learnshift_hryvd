import assert from 'node:assert/strict';
import { adaptiveBreakIntervalSec, breakTransition } from '../src/services/learningBreak.ts';

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

// Adaptive break interval shortening for persistent distraction scrolling.
assert.equal(adaptiveBreakIntervalSec(120, 0), 120, 'streak 0 uses parent/base interval');
assert.equal(adaptiveBreakIntervalSec(120, 1), 90, 'streak 1 tightens to 75%');
assert.equal(adaptiveBreakIntervalSec(120, 2), 66, 'streak 2 tightens to 55%');
assert.equal(adaptiveBreakIntervalSec(120, 3), 48, 'streak 3 tightens to 40%');
assert.equal(adaptiveBreakIntervalSec(120, 5), 36, 'streak 4+ settles at 30%');
assert.equal(adaptiveBreakIntervalSec(15, 5), 10, 'short intervals respect the 10s safety floor');

console.log('Learning-break state checks passed (timer, gestures, adaptive interval, pause and resume).');
