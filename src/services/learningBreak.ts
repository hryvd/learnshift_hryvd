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
