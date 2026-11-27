import rawCatalog from '../../data/learningVideoSeeds.json';

export type MirrorPlatform = 'YOUTUBE' | 'TIKTOK' | 'FACEBOOK' | 'INSTAGRAM';

export type CanonicalMirrorPackage =
  | 'com.google.android.youtube'
  | 'com.zhiliaoapp.musically'
  | 'com.facebook.katana'
  | 'com.instagram.android';

export type PacingMode = 'ACTIVE_LEARNING_HOOK' | 'DEEP_LESSON' | 'LOW_STIM_DECELERATION';

export type SubjectTag = 'GRADE7_MATH' | 'SCIENCE' | 'ENGLISH' | 'PH_HISTORY' | 'FINLIT';

export type DoomscrollPosture = 'SUPINE_BEDTIME' | 'DESK_UPRIGHT';

export type LearningVideoSeed = {
  id: string;
  platform: MirrorPlatform;
  androidPackage: CanonicalMirrorPackage;
  creatorName: string;
  titleOrTopic: string;
  subjectTag: SubjectTag;
  depedCompetency: string;
  pacingMode: PacingMode;
  language: string;
  durationSeconds: number;
  deepLinkUrl: string;
  whyThisAppearedBadge: string;
};

export type VideoDisplayRecord = {
  timesShown: number;
  lastShownMs: number;
};

export type MirrorSelectionContext = {
  activeForegroundPackage: string;
  hourOfDay: number;
  sessionMinutes: number;
  posture: DoomscrollPosture;
  inBedtime?: boolean;
  preferredSubject?: string | null;
};

export type MirrorPlatformInfo = {
  platform: MirrorPlatform;
  label: string;
  canonicalPackage: CanonicalMirrorPackage;
};

export const MIRROR_PLATFORMS: readonly MirrorPlatformInfo[] = [
  { platform: 'YOUTUBE', label: 'YouTube', canonicalPackage: 'com.google.android.youtube' },
  { platform: 'TIKTOK', label: 'TikTok', canonicalPackage: 'com.zhiliaoapp.musically' },
  { platform: 'FACEBOOK', label: 'Facebook', canonicalPackage: 'com.facebook.katana' },
  { platform: 'INSTAGRAM', label: 'Instagram', canonicalPackage: 'com.instagram.android' },
];

export const LEARNING_VIDEO_CATALOG: readonly LearningVideoSeed[] = rawCatalog as LearningVideoSeed[];

const ALLOWED_DEEP_LINK_HOSTS = new Set([
  'www.youtube.com',
  'youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.tiktok.com',
  'tiktok.com',
  'm.tiktok.com',
  'www.facebook.com',
  'facebook.com',
  'm.facebook.com',
  'www.instagram.com',
  'instagram.com',
]);

/**
 * Normalizes regional and Lite Android package variants onto the canonical
 * catalog key used in learning_video_seeds.json / SQLite.
 */
export function normalizeMirrorPackage(pkg: string | null | undefined): CanonicalMirrorPackage | null {
  if (!pkg) return null;
  switch (pkg.trim()) {
    case 'com.google.android.youtube':
      return 'com.google.android.youtube';
    case 'com.zhiliaoapp.musically':
    case 'com.ss.android.ugc.trill':
    case 'com.zhiliaoapp.musically.go':
      return 'com.zhiliaoapp.musically';
    case 'com.facebook.katana':
    case 'com.facebook.lite':
      return 'com.facebook.katana';
    case 'com.instagram.android':
    case 'com.instagram.lite':
      return 'com.instagram.android';
    default:
      return null;
  }
}

export function mapAppSubjectToSeedTag(subject?: string | null): SubjectTag | null {
  switch (subject) {
    case 'math':
      return 'GRADE7_MATH';
    case 'science':
      return 'SCIENCE';
    case 'english':
      return 'ENGLISH';
    case 'araling-panlipunan':
      return 'PH_HISTORY';
    default:
      return null;
  }
}

export function isAllowedLearningDeepLink(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && ALLOWED_DEEP_LINK_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function isWithinBedtimeWindow(minuteOfDay: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? minuteOfDay >= start && minuteOfDay < end : minuteOfDay >= start || minuteOfDay < end;
}

export function desiredPacingMode(ctx: {
  hourOfDay: number;
  sessionMinutes: number;
  posture: DoomscrollPosture;
  inBedtime?: boolean;
}): PacingMode {
  if (ctx.posture === 'SUPINE_BEDTIME' || ctx.inBedtime === true || ctx.hourOfDay >= 22 || ctx.hourOfDay <= 4) {
    return 'LOW_STIM_DECELERATION';
  }
  if (ctx.sessionMinutes >= 35) {
    return 'DEEP_LESSON';
  }
  return 'ACTIVE_LEARNING_HOOK';
}

function pickLeastRecentlyShown(
  candidates: readonly LearningVideoSeed[],
  history: Readonly<Record<string, VideoDisplayRecord>>,
): LearningVideoSeed | null {
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestStat = history[best.id] ?? { timesShown: 0, lastShownMs: 0 };

  for (let i = 1; i < candidates.length; i += 1) {
    const item = candidates[i];
    const stat = history[item.id] ?? { timesShown: 0, lastShownMs: 0 };
    if (
      stat.timesShown < bestStat.timesShown ||
      (stat.timesShown === bestStat.timesShown && stat.lastShownMs < bestStat.lastShownMs)
    ) {
      best = item;
      bestStat = stat;
    }
  }
  return best;
}

/**
 * Pure reference implementation matching Kotlin LearningMirrorSelector 1:1.
 * Used for iOS/Web/IS_PITCH previews and pinned by automated local tests.
 */
export function selectLearningVideo(
  catalog: readonly LearningVideoSeed[],
  ctx: MirrorSelectionContext,
  history: Readonly<Record<string, VideoDisplayRecord>> = {},
): LearningVideoSeed | null {
  const canonicalPkg = normalizeMirrorPackage(ctx.activeForegroundPackage);
  if (!canonicalPkg) return null;

  const pkgSeeds = catalog.filter((item) => item.androidPackage === canonicalPkg);
  if (pkgSeeds.length === 0) return null;

  const mode = desiredPacingMode(ctx);
  const preferredTag = mapAppSubjectToSeedTag(ctx.preferredSubject);
  const modeSeeds = pkgSeeds.filter((item) => item.pacingMode === mode);

  const pools: (readonly LearningVideoSeed[])[] = [
    preferredTag ? modeSeeds.filter((item) => item.subjectTag === preferredTag) : [],
    modeSeeds,
    preferredTag ? pkgSeeds.filter((item) => item.subjectTag === preferredTag) : [],
    pkgSeeds,
  ];

  for (const pool of pools) {
    const chosen = pickLeastRecentlyShown(pool, history);
    if (chosen) return chosen;
  }
  return null;
}

export function formatMirrorBadge(
  sessionMinutes: number,
  video: Pick<LearningVideoSeed, 'whyThisAppearedBadge'> | null,
  lang: 'en' | 'fil' = 'en',
): string {
  const mins = Math.max(1, Math.round(sessionMinutes));
  const prefix = lang === 'fil' ? `${mins}m pahinga` : `${mins}m break`;
  const raw = video?.whyThisAppearedBadge?.trim() ?? '';
  const cleaned = raw.replace(/^(scroll\s*break\s*[•·-]\s*)/i, '').trim();
  const suffix = cleaned.length > 0 ? cleaned : lang === 'fil' ? 'Learning Feed Mode' : 'Learning Feed Mode';
  return `${prefix} · ${suffix}`;
}
