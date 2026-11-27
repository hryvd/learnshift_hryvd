/**
 * Attention Mirror (Option C) interface over:
 *   - Android: Real Work-Profile learning video deep-link launcher (Tier A, >= 6 GB RAM) +
 *              Opt-in 1-frame RAM-only ML Kit Smart Study Guard +
 *              Low-RAM 60 FPS native XML ViewPager2 Deceleration Deck (Tier C)
 *   - iOS / Web / Expo Go fallback: 4-platform verified learning video catalog +
 *              In-app 4-strategy Low-Stimulation Deceleration Deck
 */
import { Linking, Platform } from 'react-native';

import { UsageMonitor } from '../../../modules/usage-monitor';
import {
  formatMirrorBadge,
  isAllowedLearningDeepLink,
  LEARNING_VIDEO_CATALOG,
  MIRROR_PLATFORMS,
  selectLearningVideo,
  type CanonicalMirrorPackage,
  type LearningVideoSeed,
  type MirrorPlatform,
  type MirrorPlatformInfo,
  type PacingMode,
  type VideoDisplayRecord,
} from './learningMirrorSelector';

export {
  formatMirrorBadge,
  isAllowedLearningDeepLink,
  LEARNING_VIDEO_CATALOG,
  MIRROR_PLATFORMS,
  selectLearningVideo,
  type CanonicalMirrorPackage,
  type LearningVideoSeed,
  type MirrorPlatform,
  type MirrorPlatformInfo,
  type PacingMode,
  type VideoDisplayRecord,
};

export type MirrorStatus = {
  workProfileStatus: 'ACTIVE_AND_READY' | 'CAN_PROVISION' | 'BLOCKED_EXISTING_OR_UNSUPPORTED';
  tierAReady: boolean;
  studyGuardEnabled: boolean;
  studyGuardRunning: boolean;
  mirrorAutoEnabled: boolean;
  swipesPerMin: number;
  riskScore: number;
  batteryExempt: boolean;
  lastStrategy: string;
  lastVideoId: string;
  lastVideoTitle: string;
  catalogCount: number;
  nativeSupported: boolean;
};

export type MirrorShiftResult = {
  tier: string;
  video: LearningVideoSeed | null;
  badge: string;
  dispatchedNatively: boolean;
};

export const NEUTRAL_SEEDS = [
  {
    id: 'tax',
    label: 'Tax & Accounting Lectures',
    youtubeUrl: 'https://m.youtube.com/results?search_query=basic+accounting+depreciation+lecture',
    tiktokUrl: 'https://www.tiktok.com/search?q=accounting%20rules%20lecture',
  },
  {
    id: 'soil',
    label: 'Soil Taxonomy & Geology',
    youtubeUrl: 'https://m.youtube.com/results?search_query=usda+soil+taxonomy+horizons',
    tiktokUrl: 'https://www.tiktok.com/search?q=soil%20taxonomy%20geology',
  },
  {
    id: 'train',
    label: 'Slow Train Cab Views',
    youtubeUrl: 'https://m.youtube.com/results?search_query=slow+train+cab+view+no+talking',
    tiktokUrl: 'https://www.tiktok.com/search?q=slow%20train%20cab%20view',
  },
] as const;

export const OFFLINE_DECELERATION_CARDS = [
  {
    id: 'soil-1',
    topicTag: 'SOIL_TAXONOMY',
    badge: 'Low-Stimulation · Soil Taxonomy',
    title: 'Soil Horizons: The B-Horizon',
    body: 'In USDA Soil Taxonomy, the B-horizon (subsoil) accumulates illuviated silicate clay, iron, aluminum, or humus leached down from the upper A-horizon over centuries.',
  },
  {
    id: 'tax-1',
    topicTag: 'TAX_ACCOUNTING',
    badge: 'Low-Stimulation · Accounting',
    title: 'Straight-Line Depreciation Formula',
    body: 'Annual Depreciation Expense equals (Historical Asset Cost minus Estimated Salvage Value) divided by Useful Life in Years under standard accrual accounting rules.',
  },
  {
    id: 'parl-1',
    topicTag: 'PARLIAMENTARY_RULES',
    badge: 'Low-Stimulation · Civic Rules',
    title: 'Motion to Lay on the Table',
    body: 'Under standard parliamentary procedure, a motion to lay on the table temporarily suspends pending business without debate and requires a simple majority vote.',
  },
  {
    id: 'wind-1',
    topicTag: 'WIND_DOWN_CHORE',
    badge: 'Wind-Down · Micro-Chore',
    title: '10-Second Rest Checklist',
    body: '1. Plug in your charger.\n2. Check tomorrow’s morning alarm.\n3. Lower screen brightness and rest your eyes.',
  },
] as const;

export function getCatalogByPlatform(platform: MirrorPlatform): LearningVideoSeed[] {
  return LEARNING_VIDEO_CATALOG.filter((item) => item.platform === platform);
}

export function getMirrorStatus(): MirrorStatus {
  if (Platform.OS === 'android' && UsageMonitor?.getMirrorStatus) {
    try {
      const raw = UsageMonitor.getMirrorStatus();
      return {
        ...raw,
        lastVideoId: raw.lastVideoId ?? '',
        lastVideoTitle: raw.lastVideoTitle ?? '',
        catalogCount: raw.catalogCount && raw.catalogCount > 0 ? raw.catalogCount : LEARNING_VIDEO_CATALOG.length,
        nativeSupported: true,
      };
    } catch {
      // fall through
    }
  }
  return {
    workProfileStatus: 'BLOCKED_EXISTING_OR_UNSUPPORTED',
    tierAReady: false,
    studyGuardEnabled: false,
    studyGuardRunning: false,
    mirrorAutoEnabled: false,
    swipesPerMin: 0,
    riskScore: 0.18,
    batteryExempt: true,
    lastStrategy: 'IN_APP_DECELERATION',
    lastVideoId: '',
    lastVideoTitle: '',
    catalogCount: LEARNING_VIDEO_CATALOG.length,
    nativeSupported: false,
  };
}

export function provisionWorkProfile(): boolean {
  if (Platform.OS === 'android' && UsageMonitor?.provisionMirrorWorkProfile) {
    return UsageMonitor.provisionMirrorWorkProfile();
  }
  return false;
}

export function openOemAutostartSettings(): void {
  if (Platform.OS === 'android' && UsageMonitor?.openOemAutostart) {
    UsageMonitor.openOemAutostart();
  }
}

export async function setSmartStudyGuard(enabled: boolean): Promise<boolean> {
  if (Platform.OS === 'android' && UsageMonitor?.requestSmartStudyGuard) {
    return UsageMonitor.requestSmartStudyGuard(enabled);
  }
  return false;
}

export function setMirrorAuto(enabled: boolean): void {
  if (Platform.OS === 'android' && UsageMonitor?.setMirrorAutoEnabled) {
    UsageMonitor.setMirrorAutoEnabled(enabled);
  }
}

export function triggerMirrorIntervention(targetPkg = 'com.zhiliaoapp.musically'): string | null {
  if (Platform.OS === 'android' && UsageMonitor?.triggerMirrorIntervention) {
    return UsageMonitor.triggerMirrorIntervention(targetPkg);
  }
  return null;
}

export async function triggerMirrorLearningShift(
  targetPkg: CanonicalMirrorPackage = 'com.google.android.youtube',
  opts?: {
    preferredSubject?: string | null;
    lang?: 'en' | 'fil';
    inBedtime?: boolean;
    sessionMinutes?: number;
    history?: Readonly<Record<string, VideoDisplayRecord>>;
  },
): Promise<MirrorShiftResult> {
  const lang = opts?.lang ?? 'en';
  const sessionMinutes = opts?.sessionMinutes ?? 25;

  if (Platform.OS === 'android' && UsageMonitor?.triggerMirrorLearningShift) {
    try {
      const res = await UsageMonitor.triggerMirrorLearningShift(targetPkg);
      const matched = LEARNING_VIDEO_CATALOG.find((v) => v.id === res.videoId) ?? null;
      return {
        tier: res.tier,
        video: matched,
        badge: res.badge || formatMirrorBadge(sessionMinutes, matched, lang),
        dispatchedNatively: true,
      };
    } catch {
      // fall through to legacy native or JS preview
    }
  }

  const preview = selectLearningVideo(
    LEARNING_VIDEO_CATALOG,
    {
      activeForegroundPackage: targetPkg,
      hourOfDay: new Date().getHours(),
      sessionMinutes,
      posture: 'DESK_UPRIGHT',
      inBedtime: opts?.inBedtime ?? false,
      preferredSubject: opts?.preferredSubject ?? null,
    },
    opts?.history ?? {},
  );
  const badge = formatMirrorBadge(sessionMinutes, preview, lang);

  if (Platform.OS === 'android' && UsageMonitor?.triggerMirrorIntervention) {
    const tier = UsageMonitor.triggerMirrorIntervention(targetPkg);
    return { tier: tier ?? 'TIER_A_WORK_PROFILE_REAL_APP', video: preview, badge, dispatchedNatively: true };
  }

  return {
    tier: 'IN_APP_LEARNING_PREVIEW',
    video: preview,
    badge,
    dispatchedNatively: false,
  };
}

export function openNeutralSeedUrl(url: string): void {
  if (!isAllowedLearningDeepLink(url)) return;
  if (Platform.OS === 'android' && UsageMonitor?.openNeutralSeed) {
    UsageMonitor.openNeutralSeed(url);
  } else {
    void Linking.openURL(url).catch(() => {});
  }
}

export function openLearningSeed(seed: LearningVideoSeed, lang: 'en' | 'fil' = 'en'): boolean {
  if (!isAllowedLearningDeepLink(seed.deepLinkUrl)) return false;
  const badge = formatMirrorBadge(1, seed, lang);
  if (Platform.OS === 'android' && UsageMonitor?.openLearningSeedInWorkSpace) {
    try {
      return UsageMonitor.openLearningSeedInWorkSpace(seed.androidPackage, seed.deepLinkUrl, badge);
    } catch {
      // fall through
    }
  }
  if (Platform.OS === 'android' && UsageMonitor?.openNeutralSeed) {
    UsageMonitor.openNeutralSeed(seed.deepLinkUrl);
    return true;
  }
  void Linking.openURL(seed.deepLinkUrl).catch(() => {});
  return true;
}

export async function exportPilotCsv(): Promise<string | null> {
  if (Platform.OS === 'android' && UsageMonitor?.exportMirrorPilotCsv) {
    return UsageMonitor.exportMirrorPilotCsv();
  }
  return null;
}
