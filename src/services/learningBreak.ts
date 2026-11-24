/** Timer readiness and user input are separate transitions. No gesture data is retained. */
export type BreakState = { stage: 'feed' | 'ready' | 'overlay'; remaining: number };
export type BreakEvent =
  | { type: 'tick' }
  | { type: 'swipe'; direction: 'up' | 'down' }
  | { type: 'start' }
  | { type: 'dismiss'; interval: number };

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
 * Shortens the next break timer each time the student persists on distracting
 * entertainment apps instead of studying, floored safely to avoid instant loops.
 */
export function adaptiveBreakIntervalSec(baseSec: number, persistentStreak: number): number {
  const safeBase = Math.max(10, Math.min(3600, Math.round(baseSec)));
  const idx = Math.max(0, Math.min(STREAK_FACTORS.length - 1, Math.floor(persistentStreak)));
  const floor = Math.min(safeBase, Math.max(10, Math.round(safeBase * 0.25)));
  return Math.max(floor, Math.round(safeBase * STREAK_FACTORS[idx]));
}
