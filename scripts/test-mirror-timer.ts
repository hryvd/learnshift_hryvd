import assert from 'node:assert/strict';

import {
  commitMirrorDispatch,
  createMirrorTimerState,
  MIRROR_COOLDOWN_MS,
  MIRROR_GAP_RESET_MS,
  normalizeMirrorMinutes,
  normalizeMirrorTriggerMode,
  stepMirrorTimer,
} from '../src/services/monitor/mirrorTimer';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

console.log('Mirror timer unit tests');

test('normalization defaults to smart / 15 min', () => {
  assert.equal(normalizeMirrorTriggerMode(undefined), 'smart');
  assert.equal(normalizeMirrorTriggerMode('weird'), 'smart');
  assert.equal(normalizeMirrorTriggerMode('timer'), 'timer');
  assert.equal(normalizeMirrorTriggerMode('both'), 'both');
  assert.equal(normalizeMirrorMinutes(undefined), 15);
  assert.equal(normalizeMirrorMinutes(12), 15);
  assert.equal(normalizeMirrorMinutes(5), 5);
  assert.equal(normalizeMirrorMinutes(30), 30);
});

test('timer fires at 5 min and restarts after commit', () => {
  let s = createMirrorTimerState();
  let t = 1_000_000;
  // 4 min 58 s -> not yet due
  let res = stepMirrorTimer(s, {
    nowMs: t,
    dtMs: 298_000,
    autoEnabled: true,
    mode: 'timer',
    timerMinutes: 5,
    screenAwake: true,
    inTargetApp: true,
    activePkg: 'com.google.android.youtube',
    suppressed: false,
    riskScore: 0.1,
  });
  assert.equal(res.shouldDispatch, false);
  assert.equal(res.remainingSec, 2);
  s = res.state;

  // +2 s -> fires at 5:00
  t += 2_000;
  res = stepMirrorTimer(s, {
    nowMs: t,
    dtMs: 2_000,
    autoEnabled: true,
    mode: 'timer',
    timerMinutes: 5,
    screenAwake: true,
    inTargetApp: true,
    activePkg: 'com.google.android.youtube',
    suppressed: false,
    riskScore: 0.1,
  });
  assert.equal(res.shouldDispatch, true);
  assert.equal(res.reason, 'timer');
  s = commitMirrorDispatch(res.state, t);
  assert.equal(s.accumulatedMs, 0);

  // Next tick shows fresh ~5 min countdown
  t += 2_000;
  res = stepMirrorTimer(s, {
    nowMs: t,
    dtMs: 2_000,
    autoEnabled: true,
    mode: 'timer',
    timerMinutes: 5,
    screenAwake: true,
    inTargetApp: true,
    activePkg: 'com.google.android.youtube',
    suppressed: false,
    riskScore: 0.1,
  });
  assert.equal(res.shouldDispatch, false);
  assert.equal(res.remainingSec, 298);
});

test('gap < 2 min pauses countdown; gap >= 2 min resets it', () => {
  let s = createMirrorTimerState();
  let t = 1_000_000;
  let res = stepMirrorTimer(s, {
    nowMs: t,
    dtMs: 180_000,
    autoEnabled: true,
    mode: 'timer',
    timerMinutes: 5,
    screenAwake: true,
    inTargetApp: true,
    activePkg: 'com.google.android.youtube',
    suppressed: false,
    riskScore: 0.1,
  });
  s = res.state;
  assert.equal(res.remainingSec, 120);

  // Leave to Home for 60 s (< 2 min) -> paused, keeps 180 s
  t += 60_000;
  res = stepMirrorTimer(s, {
    nowMs: t,
    dtMs: 2_000,
    autoEnabled: true,
    mode: 'timer',
    timerMinutes: 5,
    screenAwake: true,
    inTargetApp: false,
    activePkg: null,
    suppressed: false,
    riskScore: 0.1,
  });
  s = res.state;
  assert.equal(res.paused, true);
  assert.equal(res.remainingSec, 120);

  // Return to YouTube -> resumes from 180 s
  t += 2_000;
  res = stepMirrorTimer(s, {
    nowMs: t,
    dtMs: 2_000,
    autoEnabled: true,
    mode: 'timer',
    timerMinutes: 5,
    screenAwake: true,
    inTargetApp: true,
    activePkg: 'com.google.android.youtube',
    suppressed: false,
    riskScore: 0.1,
  });
  s = res.state;
  assert.equal(res.paused, false);
  assert.equal(res.remainingSec, 118);

  // Leave for 3 min (>= 2 min) -> resets to full 5 min
  t += MIRROR_GAP_RESET_MS + 60_000;
  res = stepMirrorTimer(s, {
    nowMs: t,
    dtMs: 2_000,
    autoEnabled: true,
    mode: 'timer',
    timerMinutes: 5,
    screenAwake: true,
    inTargetApp: false,
    activePkg: null,
    suppressed: false,
    riskScore: 0.1,
  });
  s = res.state;
  assert.equal(s.accumulatedMs, 0);
  assert.equal(res.remainingSec, 300);
});

test('snooze / focus suppression freezes without firing', () => {
  let s = createMirrorTimerState();
  let t = 1_000_000;
  let res = stepMirrorTimer(s, {
    nowMs: t,
    dtMs: 295_000,
    autoEnabled: true,
    mode: 'timer',
    timerMinutes: 5,
    screenAwake: true,
    inTargetApp: true,
    activePkg: 'com.zhiliaoapp.musically',
    suppressed: false,
    riskScore: 0.1,
  });
  s = res.state;

  // Suppressed for 5 min (snooze) -> stays frozen at 5 s remaining, never fires
  t += 300_000;
  res = stepMirrorTimer(s, {
    nowMs: t,
    dtMs: 300_000,
    autoEnabled: true,
    mode: 'timer',
    timerMinutes: 5,
    screenAwake: true,
    inTargetApp: true,
    activePkg: 'com.zhiliaoapp.musically',
    suppressed: true,
    riskScore: 0.99,
  });
  s = res.state;
  assert.equal(res.shouldDispatch, false);
  assert.equal(res.paused, true);
  assert.equal(res.remainingSec, 5);
});

test('both mode respects shared 180 s cooldown between smart and timer', () => {
  let s = createMirrorTimerState();
  let t = 1_000_000;
  // Smart fires at 4 min with high risk
  let res = stepMirrorTimer(s, {
    nowMs: t,
    dtMs: 240_000,
    autoEnabled: true,
    mode: 'both',
    timerMinutes: 5,
    screenAwake: true,
    inTargetApp: true,
    activePkg: 'com.google.android.youtube',
    suppressed: false,
    riskScore: 0.88,
  });
  assert.equal(res.shouldDispatch, true);
  assert.equal(res.reason, 'smart');
  s = commitMirrorDispatch(res.state, t);

  // 120 s later (< 180 s cooldown), even if smart risk is high, blocked by cooldown
  t += 120_000;
  res = stepMirrorTimer(s, {
    nowMs: t,
    dtMs: 120_000,
    autoEnabled: true,
    mode: 'both',
    timerMinutes: 5,
    screenAwake: true,
    inTargetApp: true,
    activePkg: 'com.google.android.youtube',
    suppressed: false,
    riskScore: 0.92,
  });
  assert.equal(res.shouldDispatch, false);
  s = res.state;

  // 60 s later (total 180 s since dispatch) -> cooldown cleared, smart can fire
  t += MIRROR_COOLDOWN_MS - 120_000;
  res = stepMirrorTimer(s, {
    nowMs: t,
    dtMs: 60_000,
    autoEnabled: true,
    mode: 'both',
    timerMinutes: 5,
    screenAwake: true,
    inTargetApp: true,
    activePkg: 'com.google.android.youtube',
    suppressed: false,
    riskScore: 0.92,
  });
  assert.equal(res.shouldDispatch, true);
  assert.equal(res.reason, 'smart');
});

test('smart mode does not report remainingSec and ignores timer threshold', () => {
  const s = createMirrorTimerState();
  const res = stepMirrorTimer(s, {
    nowMs: 1_000_000,
    dtMs: 600_000,
    autoEnabled: true,
    mode: 'smart',
    timerMinutes: 5,
    screenAwake: true,
    inTargetApp: true,
    activePkg: 'com.google.android.youtube',
    suppressed: false,
    riskScore: 0.4,
  });
  assert.equal(res.shouldDispatch, false);
  assert.equal(res.remainingSec, null);
});

console.log(`Passed ${passed} mirror timer tests.`);
