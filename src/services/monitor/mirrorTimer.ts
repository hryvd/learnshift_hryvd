/**
 * Pure decision engine for Attention Mirror timer & smart triggers.
 * Kotlin twin: modules/usage-monitor/android/src/main/java/expo/modules/usagemonitor/mirror/MirrorTimer.kt
 */

export type MirrorTriggerMode = 'smart' | 'timer' | 'both';

export const MIRROR_TIMER_MINUTES = [5, 10, 15, 20, 30] as const;
export type MirrorTimerMinutes = (typeof MIRROR_TIMER_MINUTES)[number];

/** Gaps under 2 minutes pause the timer; gaps >= 2 minutes reset it. */
export const MIRROR_GAP_RESET_MS = 2 * 60_000;
/** Shared minimum gap between any two Mirror dispatches (Smart or Timer). */
export const MIRROR_COOLDOWN_MS = 180_000;
/** Smart behavioral risk threshold. */
export const MIRROR_SMART_RISK_THRESHOLD = 0.75;

export type MirrorTimerState = {
  activePkg: string | null;
  accumulatedMs: number;
  lastActiveAtMs: number;
  lastDispatchAtMs: number;
  paused: boolean;
};

export type MirrorTickInput = {
  nowMs: number;
  dtMs: number;
  autoEnabled: boolean;
  mode: MirrorTriggerMode;
  timerMinutes: number;
  screenAwake: boolean;
  inTargetApp: boolean;
  activePkg: string | null;
  suppressed: boolean;
  riskScore: number;
};

export type MirrorDispatchReason = 'none' | 'smart' | 'timer';

export type MirrorTickResult = {
  state: MirrorTimerState;
  shouldDispatch: boolean;
  reason: MirrorDispatchReason;
  remainingSec: number | null;
  paused: boolean;
};

export function createMirrorTimerState(): MirrorTimerState {
  return {
    activePkg: null,
    accumulatedMs: 0,
    lastActiveAtMs: 0,
    lastDispatchAtMs: 0,
    paused: false,
  };
}

export function normalizeMirrorTriggerMode(raw: string | null | undefined): MirrorTriggerMode {
  if (raw === 'timer' || raw === 'both' || raw === 'smart') return raw;
  return 'smart';
}

export function normalizeMirrorMinutes(raw: number | null | undefined): MirrorTimerMinutes {
  if (typeof raw === 'number' && (MIRROR_TIMER_MINUTES as readonly number[]).includes(raw)) {
    return raw as MirrorTimerMinutes;
  }
  return 15;
}

function calcRemainingSec(mode: MirrorTriggerMode, autoEnabled: boolean, targetMs: number, accumulatedMs: number): number | null {
  if (!autoEnabled || (mode !== 'timer' && mode !== 'both')) return null;
  const rem = Math.max(0, targetMs - accumulatedMs);
  return Math.ceil(rem / 1000);
}

/**
 * Evaluates one monitor tick. When `shouldDispatch` is true, the caller checks
 * Smart Study Guard (if enabled), dispatches the shift, and calls `commitMirrorDispatch`
 * so the timer restarts and the shared 180 s cooldown starts.
 */
export function stepMirrorTimer(prev: MirrorTimerState, input: MirrorTickInput): MirrorTickResult {
  const mode = normalizeMirrorTriggerMode(input.mode);
  const minutes = normalizeMirrorMinutes(input.timerMinutes);
  const targetMs = minutes * 60_000;
  const timerEnabled = mode === 'timer' || mode === 'both';
  const smartEnabled = mode === 'smart' || mode === 'both';

  if (!input.autoEnabled) {
    const reset: MirrorTimerState = {
      ...prev,
      activePkg: null,
      accumulatedMs: 0,
      lastActiveAtMs: 0,
      paused: false,
    };
    return {
      state: reset,
      shouldDispatch: false,
      reason: 'none',
      remainingSec: null,
      paused: false,
    };
  }

  // Screen off for >= 2 min always resets the continuous timer.
  if (!input.screenAwake) {
    const expired = prev.lastActiveAtMs > 0 && input.nowMs - prev.lastActiveAtMs >= MIRROR_GAP_RESET_MS;
    const next: MirrorTimerState = expired
      ? { ...prev, activePkg: null, accumulatedMs: 0, lastActiveAtMs: 0, paused: false }
      : { ...prev, paused: prev.accumulatedMs > 0 };
    return {
      state: next,
      shouldDispatch: false,
      reason: 'none',
      remainingSec: calcRemainingSec(mode, true, targetMs, next.accumulatedMs),
      paused: next.paused,
    };
  }

  // Snooze, focus mode, lockdown, overlay showing, or not-now freezes the timer.
  if (input.suppressed) {
    const next: MirrorTimerState = {
      ...prev,
      // Keep the gap clock alive while frozen in a target app so a 5-min snooze
      // freezes the countdown instead of resetting it.
      lastActiveAtMs: input.inTargetApp && prev.accumulatedMs > 0 ? input.nowMs : prev.lastActiveAtMs,
      paused: prev.accumulatedMs > 0 || input.inTargetApp,
    };
    return {
      state: next,
      shouldDispatch: false,
      reason: 'none',
      remainingSec: calcRemainingSec(mode, true, targetMs, next.accumulatedMs),
      paused: next.paused,
    };
  }

  // Left to a non-target app (or Home): < 2 min pauses, >= 2 min resets.
  if (!input.inTargetApp || !input.activePkg) {
    const expired = prev.lastActiveAtMs > 0 && input.nowMs - prev.lastActiveAtMs >= MIRROR_GAP_RESET_MS;
    const next: MirrorTimerState = expired
      ? { ...prev, activePkg: null, accumulatedMs: 0, lastActiveAtMs: 0, paused: false }
      : { ...prev, paused: prev.accumulatedMs > 0 };
    return {
      state: next,
      shouldDispatch: false,
      reason: 'none',
      remainingSec: calcRemainingSec(mode, true, targetMs, next.accumulatedMs),
      paused: next.paused,
    };
  }

  // Actively awake, unsuppressed, and in a target app.
  const gapReset = prev.lastActiveAtMs > 0 && input.nowMs - prev.lastActiveAtMs >= MIRROR_GAP_RESET_MS;
  const baseAccum = gapReset ? 0 : prev.accumulatedMs;
  const dt = Math.max(0, input.dtMs);
  const nextAccum = timerEnabled ? baseAccum + dt : 0;

  const nextState: MirrorTimerState = {
    ...prev,
    activePkg: input.activePkg,
    accumulatedMs: nextAccum,
    lastActiveAtMs: input.nowMs,
    paused: false,
  };

  const cooldownReady = prev.lastDispatchAtMs === 0 || input.nowMs - prev.lastDispatchAtMs >= MIRROR_COOLDOWN_MS;
  const timerDue = timerEnabled && nextAccum >= targetMs;
  const smartDue = smartEnabled && input.riskScore > MIRROR_SMART_RISK_THRESHOLD;

  if (cooldownReady && (timerDue || smartDue)) {
    const reason: MirrorDispatchReason = timerDue ? 'timer' : 'smart';
    return {
      state: nextState,
      shouldDispatch: true,
      reason,
      remainingSec: calcRemainingSec(mode, true, targetMs, nextAccum),
      paused: false,
    };
  }

  return {
    state: nextState,
    shouldDispatch: false,
    reason: 'none',
    remainingSec: calcRemainingSec(mode, true, targetMs, nextAccum),
    paused: false,
  };
}

/** Call immediately after a Mirror shift is actually dispatched. */
export function commitMirrorDispatch(state: MirrorTimerState, nowMs: number): MirrorTimerState {
  return {
    ...state,
    accumulatedMs: 0,
    lastActiveAtMs: nowMs,
    lastDispatchAtMs: nowMs,
    paused: false,
  };
}
