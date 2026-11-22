import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/** Background refresh while a screen is open, in case a realtime event was missed. */
export const AUTO_REFRESH_MS = 60_000;
/** After this long in the background, realtime channels are rebuilt on return. */
const RESUBSCRIBE_AFTER_MS = 30_000;

/**
 * A number that changes when the app returns from a long stay in the background.
 * Put it in an effect's dependencies to rebuild realtime channels: phones often
 * drop the socket while the app is asleep, and a dead channel never fires again.
 */
export function useResumeKey(): number {
  const [key, setKey] = useState(0);
  const hiddenAt = useRef<number | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        if (hiddenAt.current != null && Date.now() - hiddenAt.current > RESUBSCRIBE_AFTER_MS) setKey((k) => k + 1);
        hiddenAt.current = null;
      } else if (hiddenAt.current == null) {
        hiddenAt.current = Date.now();
      }
    });
    return () => sub.remove();
  }, []);
  return key;
}

/** Calls `fn` every `ms` while the app is in front (skips while in the background). */
export function useInterval(fn: () => void, ms = AUTO_REFRESH_MS, enabled = true) {
  const saved = useRef(fn);
  useEffect(() => {
    saved.current = fn;
  }, [fn]);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (AppState.currentState === 'active') saved.current();
    }, ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
}

/** Pull-to-refresh state: `refreshing` stays on until `load` settles. */
export function usePullRefresh(load: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load()
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, [load]);
  return { refreshing, onRefresh };
}
