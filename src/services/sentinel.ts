/**
 * Four-State Adaptive Pipeline & Quiet-Gap Swipe Sentinel (LearnShift Blueprint v2).
 *
 * Separates detecting scroll cadence from drawing UI:
 *   SLEEP -> SENTINEL (1 Hz counters) -> ARMED (pre-warmed) -> BURST (220ms GPU slide) -> LEARN
 * Never reads screen content or third-party text; counts swipe timestamps only.
 */

export type SentinelState = 'SLEEP' | 'SENTINEL' | 'ARMED' | 'BURST' | 'LEARN';

/**
 * Five-level Friction Ladder (Blueprint v2 Section 3.2):
 *   0: Honest heads-up pill
 *   1: Learning card (3-card micro-deck)
 *   2: Deceleration card (slow, low-arousal deck)
 *   3: Soft stop ("Take 5?" with 5 more min)
 *   4: Wind-down (bedtime Goodnight card)
 */
export type LadderLevel = 0 | 1 | 2 | 3 | 4;

export const QUIET_GAP_MS = 300;
export const MAX_DECKS_PER_DAY = 5;
export const DEFAULT_QUIET_MIN = 20;
export const ARMED_TIMEOUT_MS = 90_000;
export const BURST_DURATION_MS = 220;
export const DECEL_DURATION_MS = 420;

export type SentinelFeatures = {
  t_session: number;
  swipes_per_min: number;
  dwell_var: number;
  fast_skip_ratio: number;
  since_last_card: number;
  dismiss_streak: number;
  in_bedtime: boolean;
  risk: number;
  ram_mb: number;
  latency_ms: number;
};

export type SwipeWindow = {
  lastEventAt: number;
  swipeTimes: number[];
  totalSwipes: number;
};

export function createSwipeWindow(): SwipeWindow {
  return {
    lastEventAt: 0,
    swipeTimes: [],
    totalSwipes: 0,
  };
}

/**
 * Blueprint v2 Section 4 Part B two-layer quiet-gap debounce:
 * refresh `lastEventAt` on every scroll event, count a new swipe only when
 * `now - lastEventAt > QUIET_GAP_MS` (300 ms).
 */
export function recordSwipeEvent(win: SwipeWindow, now: number): { window: SwipeWindow; counted: boolean } {
  const isNewSwipe = win.lastEventAt === 0 || now - win.lastEventAt > QUIET_GAP_MS;
  if (!isNewSwipe) {
    return {
      window: { ...win, lastEventAt: now },
      counted: false,
    };
  }
  const nextTimes = [...win.swipeTimes, now].slice(-20);
  return {
    window: {
      lastEventAt: now,
      swipeTimes: nextTimes,
      totalSwipes: win.totalSwipes + 1,
    },
    counted: true,
  };
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export function computeFeatures(params: {
  win: SwipeWindow;
  now: number;
  sessionMinutes: number;
  sinceLastCardMin: number;
  dismissStreak: number;
  inBedtime: boolean;
  state: SentinelState;
}): SentinelFeatures {
  const { win, now, sessionMinutes, sinceLastCardMin, dismissStreak, inBedtime, state } = params;
  const times = win.swipeTimes;

  // Swipes in last 60s (scaled gracefully if the user has only scrolled briefly)
  const recent = times.filter((t) => now - t <= 60_000);
  let swipesPerMin = recent.length;
  if (recent.length >= 2) {
    const spanMin = Math.max(0.15, (now - recent[0]) / 60_000);
    swipesPerMin = Math.min(45, Math.round(recent.length / spanMin));
  }

  // Inter-swipe gaps (in seconds) across last up to 20 swipes
  const gapsSec: number[] = [];
  for (let i = 1; i < times.length; i++) {
    gapsSec.push(Math.max(0.2, (times[i] - times[i - 1]) / 1000));
  }

  let dwellVar = 0;
  let fastSkipRatio = 0;
  if (gapsSec.length > 0) {
    const mean = gapsSec.reduce((a, b) => a + b, 0) / gapsSec.length;
    dwellVar = gapsSec.reduce((acc, g) => acc + (g - mean) * (g - mean), 0) / gapsSec.length;
    const fastCount = gapsSec.filter((g) => g < 3.0).length;
    fastSkipRatio = fastCount / gapsSec.length;
  }

  // Blueprint v2 logistic score over session length + swipe cadence + bedtime
  const z =
    -3.2 +
    0.055 * sessionMinutes +
    0.08 * swipesPerMin +
    1.1 * fastSkipRatio +
    (inBedtime ? 2.4 : 0) -
    0.25 * Math.min(dismissStreak, 3);
  const risk = Math.max(0, Math.min(1, sigmoid(z)));

  const ramMb = state === 'SLEEP' ? 2 : state === 'SENTINEL' ? 8 : 32;
  const latencyMs = state === 'BURST' || state === 'ARMED' ? 42 : 0;

  return {
    t_session: Math.round(sessionMinutes * 10) / 10,
    swipes_per_min: swipesPerMin,
    dwell_var: Math.round(dwellVar * 10) / 10,
    fast_skip_ratio: Math.round(fastSkipRatio * 100) / 100,
    since_last_card: Math.round(sinceLastCardMin * 10) / 10,
    dismiss_streak: dismissStreak,
    in_bedtime: inBedtime,
    risk: Math.round(risk * 100) / 100,
    ram_mb: ramMb,
    latency_ms: latencyMs,
  };
}

export type ReceptivityResult = {
  receptive: boolean;
  reason: 'ok' | 'paused' | 'focusing' | 'quiet_window' | 'snoozed_1h' | 'daily_cap' | 'cooldown' | 'too_early';
};

export function checkReceptivity(params: {
  now: number;
  paused: boolean;
  focusing: boolean;
  quietUntil: number | null;
  notNowUntil: number | null;
  decksToday: number;
  dismissStreak: number;
  sinceLastCardMin: number;
  sessionMinutes: number;
}): ReceptivityResult {
  if (params.paused) return { receptive: false, reason: 'paused' };
  if (params.focusing) return { receptive: false, reason: 'focusing' };
  if (params.quietUntil != null && params.now < params.quietUntil) {
    return { receptive: false, reason: 'quiet_window' };
  }
  if (params.notNowUntil != null && params.now < params.notNowUntil) {
    return { receptive: false, reason: 'snoozed_1h' };
  }
  if (params.decksToday >= MAX_DECKS_PER_DAY) {
    return { receptive: false, reason: 'daily_cap' };
  }
  const cooldownMin = params.dismissStreak >= 2 ? 30 : params.dismissStreak === 1 ? 10 : 0;
  if (cooldownMin > 0 && params.sinceLastCardMin < cooldownMin) {
    return { receptive: false, reason: 'cooldown' };
  }
  if (params.sessionMinutes < 10) {
    return { receptive: false, reason: 'too_early' };
  }
  return { receptive: true, reason: 'ok' };
}

export function pickLadderLevel(params: {
  inBedtime: boolean;
  risk: number;
  dismissedRecently: boolean;
  hasSkillGap: boolean;
}): LadderLevel {
  if (params.inBedtime) return 4;
  if (params.dismissedRecently) return 3;
  if (!params.hasSkillGap) return 2;
  if (params.risk >= 0.65) return 1;
  return 0;
}

