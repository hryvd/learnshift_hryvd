/** Timer readiness and user input are separate transitions. No gesture data is retained. */
export type BreakState = { stage: 'feed' | 'ready' | 'overlay'; remaining: number };
export type BreakEvent =
  | { type: 'tick' }
  | { type: 'swipe'; direction: 'up' | 'down' }
  | { type: 'start' }
  | { type: 'dismiss'; interval: number };

export const BREAK_INTERVAL_PRESETS = [
  { sec: 45, label: '45s' },
  { sec: 180, label: '3m' },
  { sec: 540, label: '9m' },
  { sec: 900, label: '15m' },
] as const;

export type BreakIntervalSec = (typeof BREAK_INTERVAL_PRESETS)[number]['sec'];

/** Snaps any legacy timer interval to the nearest supported rate: 45s, 3m, 9m, or 15m. */
export function snapBreakIntervalSec(sec: number): BreakIntervalSec {
  const safe = Number.isFinite(sec) ? sec : 180;
  let best: BreakIntervalSec = 180;
  let bestDiff = Infinity;
  for (const p of BREAK_INTERVAL_PRESETS) {
    const diff = Math.abs(p.sec - safe);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = p.sec;
    }
  }
  return best;
}

export function breakTransition(state: BreakState, event: BreakEvent): BreakState {
  if (event.type === 'dismiss') return { stage: 'feed', remaining: Math.max(1, event.interval) };
  if (event.type === 'tick' && state.stage === 'feed') {
    const remaining = Math.max(0, state.remaining - 1);
    return { remaining, stage: remaining === 0 ? 'ready' : 'feed' };
  }
  if (state.stage === 'ready' && (event.type === 'start' || (event.type === 'swipe' && event.direction === 'up'))) {
    return { ...state, stage: 'overlay' };
  }
  return state;
}

const STREAK_FACTORS = [1.0, 0.75, 0.55, 0.4, 0.3] as const;

/**
 * Computes the adaptive delay (seconds) until the next LearnShift break card.
 * Longer continuous use time and faster/excessive scrolling both shorten the interval.
 */
export function adaptiveScrollUseIntervalSec(input: {
  baseSec: number;
  persistentStreak?: number;
  sessionMinutes?: number;
  swipesPerMin?: number;
  dwellVarianceSecSq?: number;
}): number {
  const safeBase = Math.max(30, Math.min(3600, Math.round(input.baseSec)));
  const streakIdx = Math.max(0, Math.min(STREAK_FACTORS.length - 1, Math.floor(input.persistentStreak ?? 0)));
  let multiplier: number = STREAK_FACTORS[streakIdx];

  const mins = Math.max(0, input.sessionMinutes ?? 0);
  if (mins >= 30) multiplier = Math.min(multiplier, 0.25);
  else if (mins >= 20) multiplier = Math.min(multiplier, 0.4);
  else if (mins >= 12) multiplier = Math.min(multiplier, 0.55);
  else if (mins >= 5) multiplier = Math.min(multiplier, 0.75);

  const swipes = Math.max(0, input.swipesPerMin ?? 0);
  const lowVariance = (input.dwellVarianceSecSq ?? 99) < 2.0;
  if (swipes >= 25) multiplier = Math.min(multiplier, 0.28);
  else if (swipes >= 18) multiplier = Math.min(multiplier, 0.45);
  else if (swipes >= 12) multiplier = Math.min(multiplier, 0.65);
  else if (swipes >= 8 && lowVariance) multiplier = Math.min(multiplier, 0.75);

  const floor = Math.min(safeBase, safeBase <= 45 ? 30 : 45);
  return Math.max(floor, Math.round(safeBase * multiplier));
}

/**
 * Shortens the next break timer each time the student persists on distracting
 * entertainment apps instead of studying, floored safely to avoid instant loops.
 */
export function adaptiveBreakIntervalSec(baseSec: number, persistentStreak: number): number {
  return adaptiveScrollUseIntervalSec({ baseSec, persistentStreak });
}
