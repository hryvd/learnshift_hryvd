import assert from 'node:assert/strict';
import {
  adaptiveBreakIntervalSec,
  adaptiveScrollUseIntervalSec,
  BREAK_INTERVAL_PRESETS,
  breakTransition,
  snapBreakIntervalSec,
} from '../src/services/learningBreak.ts';

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
state = breakTransition(state, { type: 'dismiss', interval: 45 });
assert.deepEqual(state, { stage: 'feed', remaining: 45 }, 'dismissal resumes content and resets interval');
assert.equal(
  breakTransition({ stage: 'ready', remaining: 0 }, { type: 'start' }).stage,
  'overlay',
  'accessible start is equivalent to an upward gesture',
);

// Presets are strictly 45s, 3m (180s), 9m (540s), 15m (900s).
assert.deepEqual(
  BREAK_INTERVAL_PRESETS.map((p) => p.sec),
  [45, 180, 540, 900],
);
assert.equal(snapBreakIntervalSec(15), 45);
assert.equal(snapBreakIntervalSec(180), 180);
assert.equal(snapBreakIntervalSec(540), 540);
assert.equal(snapBreakIntervalSec(900), 900);

// Adaptive break interval shortening for persistent distraction, session time, and fast scrolling.
assert.equal(adaptiveBreakIntervalSec(180, 0), 180, 'streak 0 uses base interval');
assert.equal(adaptiveBreakIntervalSec(180, 1), 135, 'streak 1 tightens to 75%');
assert.equal(adaptiveBreakIntervalSec(180, 2), 99, 'streak 2 tightens to 55%');
assert.equal(adaptiveBreakIntervalSec(180, 3), 72, 'streak 3 tightens to 40%');
assert.equal(adaptiveBreakIntervalSec(180, 5), 54, 'streak 4+ settles at 30%');
assert.equal(adaptiveBreakIntervalSec(45, 5), 30, 'short 45s intervals respect the 30s safety floor');

assert.ok(
  adaptiveScrollUseIntervalSec({ baseSec: 540, sessionMinutes: 25, swipesPerMin: 4 }) <
    adaptiveScrollUseIntervalSec({ baseSec: 540, sessionMinutes: 2, swipesPerMin: 4 }),
  'longer continuous use time must shorten break interval',
);
assert.ok(
  adaptiveScrollUseIntervalSec({ baseSec: 540, sessionMinutes: 2, swipesPerMin: 26 }) <
    adaptiveScrollUseIntervalSec({ baseSec: 540, sessionMinutes: 2, swipesPerMin: 4 }),
  'excessive scroll cadence must shorten break interval',
);

console.log('Learning-break state checks passed (presets 45s/3m/9m/15m, gestures, adaptive scroll & use-time interval).');
