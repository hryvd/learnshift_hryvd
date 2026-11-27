import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const write = process.argv.includes('--write');

const srcUrl = new URL('../src/data/learningVideoSeeds.json', import.meta.url);
const nativeUrl = new URL('../modules/usage-monitor/android/src/main/assets/learning_video_seeds.json', import.meta.url);

const PLATFORM_PACKAGE = {
  YOUTUBE: 'com.google.android.youtube',
  TIKTOK: 'com.zhiliaoapp.musically',
  FACEBOOK: 'com.facebook.katana',
  INSTAGRAM: 'com.instagram.android',
};

const PLATFORM_HOSTS = {
  YOUTUBE: new Set(['www.youtube.com', 'youtube.com', 'm.youtube.com', 'youtu.be']),
  TIKTOK: new Set(['www.tiktok.com', 'tiktok.com', 'm.tiktok.com']),
  FACEBOOK: new Set(['www.facebook.com', 'facebook.com', 'm.facebook.com']),
  INSTAGRAM: new Set(['www.instagram.com', 'instagram.com']),
};

const VALID_MODES = new Set(['ACTIVE_LEARNING_HOOK', 'DEEP_LESSON', 'LOW_STIM_DECELERATION']);
const VALID_SUBJECTS = new Set(['GRADE7_MATH', 'SCIENCE', 'ENGLISH', 'PH_HISTORY', 'FINLIT']);

const raw = readFileSync(srcUrl, 'utf8');
const seeds = JSON.parse(raw);
assert(Array.isArray(seeds) && seeds.length === 40, `Expected 40 learning video seeds, found ${seeds?.length}`);

const ids = new Set();
const urls = new Set();
const countsByPlatform = { YOUTUBE: 0, TIKTOK: 0, FACEBOOK: 0, INSTAGRAM: 0 };
const modesByPlatform = {
  YOUTUBE: new Set(),
  TIKTOK: new Set(),
  FACEBOOK: new Set(),
  INSTAGRAM: new Set(),
};

for (const item of seeds) {
  assert(item && typeof item === 'object', 'Each seed must be an object');
  assert(typeof item.id === 'string' && /^[a-z0-9_]+$/.test(item.id), `Invalid id: ${item.id}`);
  assert(!ids.has(item.id), `Duplicate id: ${item.id}`);
  ids.add(item.id);

  assert(item.platform in PLATFORM_PACKAGE, `Invalid platform ${item.platform} in ${item.id}`);
  assert.equal(
    item.androidPackage,
    PLATFORM_PACKAGE[item.platform],
    `androidPackage mismatch for ${item.id}: expected ${PLATFORM_PACKAGE[item.platform]}, got ${item.androidPackage}`,
  );
  assert(typeof item.creatorName === 'string' && item.creatorName.trim().length > 0, `Missing creatorName in ${item.id}`);
  assert(typeof item.titleOrTopic === 'string' && item.titleOrTopic.trim().length > 0, `Missing titleOrTopic in ${item.id}`);
  assert(VALID_SUBJECTS.has(item.subjectTag), `Invalid subjectTag ${item.subjectTag} in ${item.id}`);
  assert(typeof item.depedCompetency === 'string' && item.depedCompetency.trim().length > 0, `Missing depedCompetency in ${item.id}`);
  assert(VALID_MODES.has(item.pacingMode), `Invalid pacingMode ${item.pacingMode} in ${item.id}`);
  assert(typeof item.language === 'string' && item.language.trim().length > 0, `Missing language in ${item.id}`);
  assert(Number.isInteger(item.durationSeconds) && item.durationSeconds > 0, `Invalid durationSeconds in ${item.id}`);
  assert(
    typeof item.whyThisAppearedBadge === 'string' &&
      item.whyThisAppearedBadge.trim().length > 0 &&
      !/scroll break/i.test(item.whyThisAppearedBadge),
    `Badge must be clean and non-empty without redundant "Scroll break" prefix in ${item.id}`,
  );

  assert(typeof item.deepLinkUrl === 'string' && item.deepLinkUrl.startsWith('https://'), `deepLinkUrl must be https:// in ${item.id}`);
  const parsed = new URL(item.deepLinkUrl);
  assert.equal(parsed.protocol, 'https:', `Non-HTTPS protocol in ${item.id}`);
  assert(PLATFORM_HOSTS[item.platform].has(parsed.hostname.toLowerCase()), `Disallowed host ${parsed.hostname} for ${item.id}`);
  assert(!urls.has(item.deepLinkUrl), `Duplicate deepLinkUrl: ${item.deepLinkUrl}`);
  urls.add(item.deepLinkUrl);

  countsByPlatform[item.platform] += 1;
  modesByPlatform[item.platform].add(item.pacingMode);
}

for (const platform of Object.keys(PLATFORM_PACKAGE)) {
  assert(countsByPlatform[platform] >= 4, `Platform ${platform} must have at least 4 seeds`);
  for (const mode of VALID_MODES) {
    assert(modesByPlatform[platform].has(mode), `Platform ${platform} is missing pacingMode ${mode}`);
  }
}

if (write) {
  writeFileSync(nativeUrl, raw, 'utf8');
}
assert(existsSync(nativeUrl), 'Missing native asset learning_video_seeds.json; run node scripts/validate-learning-videos.mjs --write');
assert.deepEqual(
  JSON.parse(readFileSync(nativeUrl, 'utf8')),
  seeds,
  'Native learning_video_seeds.json differs from src/data/learningVideoSeeds.json; run node scripts/validate-learning-videos.mjs --write',
);

console.log(
  `PASS: ${seeds.length} learning video seeds verified (YT=${countsByPlatform.YOUTUBE}, TT=${countsByPlatform.TIKTOK}, FB=${countsByPlatform.FACEBOOK}, IG=${countsByPlatform.INSTAGRAM}), all HTTPS, all 3 pacing modes covered per platform, native asset synced.`,
);
