import assert from 'node:assert/strict';
import {
  desiredPacingMode,
  formatMirrorBadge,
  isAllowedLearningDeepLink,
  isWithinBedtimeWindow,
  LEARNING_VIDEO_CATALOG,
  normalizeMirrorPackage,
  selectLearningVideo,
  type LearningVideoSeed,
  type VideoDisplayRecord,
} from '../src/services/monitor/learningMirrorSelector.ts';

// 1. Package normalization (including PH budget phone Lite & Asia variants)
assert.equal(normalizeMirrorPackage('com.google.android.youtube'), 'com.google.android.youtube');
assert.equal(normalizeMirrorPackage('com.zhiliaoapp.musically'), 'com.zhiliaoapp.musically');
assert.equal(normalizeMirrorPackage('com.ss.android.ugc.trill'), 'com.zhiliaoapp.musically');
assert.equal(normalizeMirrorPackage('com.zhiliaoapp.musically.go'), 'com.zhiliaoapp.musically');
assert.equal(normalizeMirrorPackage('com.facebook.katana'), 'com.facebook.katana');
assert.equal(normalizeMirrorPackage('com.facebook.lite'), 'com.facebook.katana');
assert.equal(normalizeMirrorPackage('com.instagram.android'), 'com.instagram.android');
assert.equal(normalizeMirrorPackage('com.instagram.lite'), 'com.instagram.android');
assert.equal(normalizeMirrorPackage('com.mobile.legends'), null);
assert.equal(normalizeMirrorPackage(''), null);

// 2. Bedtime, late-night, posture, and daytime pacing mode precedence
assert.equal(
  desiredPacingMode({ hourOfDay: 14, sessionMinutes: 18, posture: 'DESK_UPRIGHT', inBedtime: false }),
  'ACTIVE_LEARNING_HOOK',
);
assert.equal(
  desiredPacingMode({ hourOfDay: 15, sessionMinutes: 35, posture: 'DESK_UPRIGHT', inBedtime: false }),
  'DEEP_LESSON',
);
assert.equal(
  desiredPacingMode({ hourOfDay: 22, sessionMinutes: 10, posture: 'DESK_UPRIGHT', inBedtime: false }),
  'LOW_STIM_DECELERATION',
);
assert.equal(
  desiredPacingMode({ hourOfDay: 2, sessionMinutes: 40, posture: 'DESK_UPRIGHT', inBedtime: false }),
  'LOW_STIM_DECELERATION',
);
assert.equal(
  desiredPacingMode({ hourOfDay: 16, sessionMinutes: 12, posture: 'SUPINE_BEDTIME', inBedtime: false }),
  'LOW_STIM_DECELERATION',
);
assert.equal(
  desiredPacingMode({ hourOfDay: 20, sessionMinutes: 20, posture: 'DESK_UPRIGHT', inBedtime: true }),
  'LOW_STIM_DECELERATION',
  'student configured bedtime (e.g. 20:00) must override daytime hook',
);
assert.equal(isWithinBedtimeWindow(21 * 60 + 30, 21 * 60, 6 * 60), true);
assert.equal(isWithinBedtimeWindow(14 * 60, 21 * 60, 6 * 60), false);

// 3. Subject preference + LRU rotation without consecutive repeats
const firstScience = selectLearningVideo(
  LEARNING_VIDEO_CATALOG,
  {
    activeForegroundPackage: 'com.google.android.youtube',
    hourOfDay: 14,
    sessionMinutes: 15,
    posture: 'DESK_UPRIGHT',
    preferredSubject: 'science',
  },
  {},
);
assert.ok(firstScience);
assert.equal(firstScience.pacingMode, 'ACTIVE_LEARNING_HOOK');
assert.equal(firstScience.subjectTag, 'SCIENCE');

// Exhausting all YT ACTIVE_LEARNING_HOOK items rotates cleanly by LRU
const ytHooks = LEARNING_VIDEO_CATALOG.filter(
  (v) => v.androidPackage === 'com.google.android.youtube' && v.pacingMode === 'ACTIVE_LEARNING_HOOK',
);
const seenHookIds: string[] = [];
const hookHistory: Record<string, VideoDisplayRecord> = {};
for (let i = 0; i < ytHooks.length; i += 1) {
  const chosen = selectLearningVideo(
    LEARNING_VIDEO_CATALOG,
    {
      activeForegroundPackage: 'com.google.android.youtube',
      hourOfDay: 13,
      sessionMinutes: 15,
      posture: 'DESK_UPRIGHT',
    },
    hookHistory,
  );
  assert.ok(chosen);
  assert.equal(chosen.pacingMode, 'ACTIVE_LEARNING_HOOK');
  seenHookIds.push(chosen.id);
  hookHistory[chosen.id] = { timesShown: 1, lastShownMs: 1000 + i };
}
assert.equal(new Set(seenHookIds).size, ytHooks.length, 'every hook must rotate once before repeating');

// 4. Mode gap fallback: if a platform catalog has no DEEP_LESSON items, fall back to anyMode via LRU
const noDeepSubset: LearningVideoSeed[] = LEARNING_VIDEO_CATALOG.filter(
  (v) => v.androidPackage === 'com.instagram.android' && v.pacingMode !== 'DEEP_LESSON',
);
const igFallback = selectLearningVideo(
  noDeepSubset,
  {
    activeForegroundPackage: 'com.instagram.lite',
    hourOfDay: 15,
    sessionMinutes: 42,
    posture: 'DESK_UPRIGHT',
  },
  {},
);
assert.ok(igFallback);
assert.equal(igFallback.androidPackage, 'com.instagram.android');

// 5. Deep-link URL security allowlist
assert.equal(isAllowedLearningDeepLink('https://www.youtube.com/watch?v=_kelDJFjhOo'), true);
assert.equal(isAllowedLearningDeepLink('https://www.tiktok.com/@teamlyqa'), true);
assert.equal(isAllowedLearningDeepLink('https://www.facebook.com/KnowledgeChannel'), true);
assert.equal(isAllowedLearningDeepLink('https://www.instagram.com/kurzgesagt'), true);
assert.equal(isAllowedLearningDeepLink('http://www.youtube.com/watch?v=_kelDJFjhOo'), false, 'cleartext HTTP must be rejected');
assert.equal(isAllowedLearningDeepLink('javascript:alert(1)'), false);
assert.equal(isAllowedLearningDeepLink('file:///etc/passwd'), false);
assert.equal(isAllowedLearningDeepLink('https://evil-youtube.com/watch?v=123'), false);
assert.equal(isAllowedLearningDeepLink('https://youtube.com.evil.example/watch?v=123'), false);

// 6. Badge formatting never duplicates "break • Scroll break"
assert.equal(
  formatMirrorBadge(25, { whyThisAppearedBadge: '55s Geometry Hook' }, 'en'),
  '25m break · 55s Geometry Hook',
);
assert.equal(
  formatMirrorBadge(25, { whyThisAppearedBadge: 'Scroll break • 55s Geometry Hook' }, 'en'),
  '25m break · 55s Geometry Hook',
);
assert.equal(
  formatMirrorBadge(25, { whyThisAppearedBadge: '55s Geometry Hook' }, 'fil'),
  '25m pahinga · 55s Geometry Hook',
);
assert.equal(formatMirrorBadge(0, null, 'en'), '1m break · Learning Feed Mode');

console.log('Mirror learning video selector checks passed (normalizer, bedtime/posture modes, subject preference, LRU rotation, allowlist, badge formatting).');
