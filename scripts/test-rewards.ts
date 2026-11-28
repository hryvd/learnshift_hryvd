import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  REWARD_RULES,
  breakRewardKey,
  deckRewardKey,
  displayedCoins,
  focusRewardKey,
  manilaDayKey,
  moduleRewardKey,
  overlayQuizRewardKey,
  quizRewardKey,
  rewardAmount,
  type PendingReward,
} from '../src/lib/rewards';

// 1. Key builders
assert.equal(breakRewardKey('abc-123'), 'break:abc-123');
assert.equal(quizRewardKey('q-42'), 'quiz:q-42');
assert.equal(overlayQuizRewardKey('ov-9'), 'overlay:ov-9');
assert.equal(deckRewardKey('card-7', '2026-11-28'), 'deck:card-7:2026-11-28');
assert.equal(focusRewardKey(1700000000123.9), 'focus:1700000000123');
assert.equal(moduleRewardKey('mod-uuid'), 'module:mod-uuid');

// Manila day helper: 2026-11-28T16:30:00Z is 2026-11-29 in UTC+8.
assert.equal(manilaDayKey(new Date('2026-11-28T16:30:00Z')), '2026-11-29');
assert.equal(manilaDayKey(new Date('2026-11-28T15:59:59Z')), '2026-11-28');

// 2. Local amount table matches server SQL rules
assert.equal(rewardAmount('break'), 20);
assert.equal(rewardAmount('deck'), 5);
assert.equal(rewardAmount('module'), 25);
assert.equal(rewardAmount('quiz', { correct: 0 }), 0);
assert.equal(rewardAmount('quiz', { correct: 3 }), 30);
assert.equal(rewardAmount('quiz', { correct: 5 }), 50);
assert.equal(rewardAmount('quiz', { correct: 99 }), 50); // clamped at 5
assert.equal(rewardAmount('overlay_quiz', { correct: 4 }), 40);
assert.equal(rewardAmount('focus', { minutes: 25 }), 15);
assert.equal(rewardAmount('focus', { minutes: 60 }), 36);
assert.equal(rewardAmount('focus', { minutes: 120 }), 72);
assert.equal(rewardAmount('focus', { minutes: 240 }), 72); // clamped at 120 min

// Cross-check server migration SQL constants to prevent drift
const sqlPath = path.resolve(__dirname, '../supabase/migrations/20261128000001_reward_ledger.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');
assert.match(sql, /when 'break' then\s+return 20;/i, 'SQL break reward must match 20');
assert.match(sql, /return v_correct \* 10;/i, 'SQL quiz reward must match 10 * correct');
assert.match(sql, /when 'deck' then\s+return 5;/i, 'SQL deck reward must match 5');
assert.match(sql, /return round\(v_minutes \/ 5\.0\)::int \* 3;/i, 'SQL focus reward must match round(min/5)*3');
assert.match(sql, /when 'module' then\s+return 25;/i, 'SQL module reward must match 25');
assert.match(sql, /v_today_coins >= 600/i, 'SQL daily cap must match 600');
assert.equal(REWARD_RULES.dailyTotalCap, 600);

// 3. Pending-merge math & two-device convergence
const pendingA: PendingReward[] = [
  { key: 'break:1', kind: 'break', amount: 20, ref: '1', meta: {}, createdAt: '2026-11-28T00:00:00Z' },
  { key: 'deck:c1:2026-11-28', kind: 'deck', amount: 5, ref: 'c1', meta: {}, createdAt: '2026-11-28T00:01:00Z' },
];
assert.equal(displayedCoins(100, pendingA), 125);
// After server confirms device B's +50 (confirmed becomes 150) while device A still has pendingA:
assert.equal(displayedCoins(150, pendingA), 175);
// After device A settles break:1 (server confirmed becomes 170):
const remaining = pendingA.filter((r) => r.key !== 'break:1');
assert.equal(displayedCoins(170, remaining), 175);
// After device A settles deck:c1 (server confirmed becomes 175):
assert.equal(displayedCoins(175, []), 175);

console.log('PASS: reward keys, server-SQL parity, caps, and pending-merge math verified.');
