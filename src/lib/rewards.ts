/**
 * Reward calculation, key builders, and pending-balance helpers.
 * Amounts and caps MUST stay in sync with `private.reward_amount` and
 * `public.claim_reward` in `supabase/migrations/20261128000001_reward_ledger.sql`.
 */

export type RewardKind = 'break' | 'quiz' | 'overlay_quiz' | 'deck' | 'focus' | 'module';

export const REWARD_RULES = {
  breakAmount: 20,
  quizPerCorrect: 10,
  quizMaxCorrect: 5,
  deckAmount: 5,
  focusStepMinutes: 5,
  focusPerStep: 3,
  focusMaxMinutes: 120,
  moduleAmount: 25,
  dailyTotalCap: 600,
  dailyBreakCap: 12,
  dailyDeckCap: 30,
  dailyFocusMinCap: 240,
} as const;

export type RewardMeta = {
  correct?: number;
  minutes?: number;
  sessionId?: string;
};

export type PendingReward = {
  key: string;
  kind: RewardKind;
  amount: number;
  ref: string | null;
  meta: RewardMeta;
  createdAt: string;
};

/** YYYY-MM-DD in Asia/Manila (UTC+8, no DST), matching the server ledger & Agos tide. */
export function manilaDayKey(d = new Date()): string {
  const manila = new Date(d.getTime() + 8 * 3600 * 1000);
  return manila.toISOString().slice(0, 10);
}

/** Local preview amount — mirrors `private.reward_amount(kind, meta)` on Postgres. */
export function rewardAmount(kind: RewardKind, meta: RewardMeta = {}): number {
  switch (kind) {
    case 'break':
      return REWARD_RULES.breakAmount;
    case 'quiz':
    case 'overlay_quiz': {
      const correct = Math.max(0, Math.min(REWARD_RULES.quizMaxCorrect, Math.trunc(Number(meta.correct) || 0)));
      return correct * REWARD_RULES.quizPerCorrect;
    }
    case 'deck':
      return REWARD_RULES.deckAmount;
    case 'focus': {
      const minutes = Math.max(0, Math.min(REWARD_RULES.focusMaxMinutes, Number(meta.minutes) || 0));
      return Math.round(minutes / REWARD_RULES.focusStepMinutes) * REWARD_RULES.focusPerStep;
    }
    case 'module':
      return REWARD_RULES.moduleAmount;
    default:
      return 0;
  }
}

export const breakRewardKey = (breakId: string) => `break:${breakId}`;
export const quizRewardKey = (sessionId: string) => `quiz:${sessionId}`;
export const overlayQuizRewardKey = (sessionId: string) => `overlay:${sessionId}`;
export const deckRewardKey = (cardId: string, day = manilaDayKey()) => `deck:${cardId}:${day}`;
export const focusRewardKey = (endAtMs: number) => `focus:${Math.trunc(endAtMs)}`;
export const moduleRewardKey = (moduleId: string) => `module:${moduleId}`;

let seq = 0;
/** Generates a unique session/break id. Call inside a lazy `useState` initializer, never bare in render. */
export function newRewardSessionId(prefix = 's'): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Displayed coin balance: server-confirmed balance plus any locally queued rewards not yet settled. */
export function displayedCoins(coinsConfirmed: number, pendingRewards: readonly Pick<PendingReward, 'amount'>[]): number {
  let pending = 0;
  for (const r of pendingRewards) pending += Math.max(0, r.amount);
  return Math.max(0, coinsConfirmed) + pending;
}
