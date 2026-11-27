import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Shared laptop mode (faculty rooms, computer labs): no offline copy of class
 * data, and an automatic sign-out after a period of inactivity.
 */
const KEY = 'ls-shared-pc';
export const IDLE_MS = 20 * 60 * 1000;
export const WARN_MS = 60 * 1000;

const listeners = new Set<() => void>();

export function isSharedLaptop(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setSharedLaptop(on: boolean) {
  try {
    if (on) window.localStorage.setItem(KEY, '1');
    else window.localStorage.removeItem(KEY);
  } catch {
    // storage blocked: nothing is cached anyway
  }
  listeners.forEach((l) => l());
}

export function useSharedLaptop(): boolean {
  const [on, setOn] = useState(isSharedLaptop);
  useEffect(() => {
    const l = () => setOn(isSharedLaptop());
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return on;
}

/**
 * Calls `onWarn` after IDLE_MS − WARN_MS without input, then `onTimeout`
 * WARN_MS later. Any input resets it (and `onActive` hides the warning).
 */
export function useIdleTimer(enabled: boolean, onWarn: () => void, onActive: () => void, onTimeout: () => void) {
  useEffect(() => {
    if (!enabled || Platform.OS !== 'web' || typeof window === 'undefined') return;
    let warn: ReturnType<typeof setTimeout>;
    let out: ReturnType<typeof setTimeout>;
    let warned = false;
    const arm = () => {
      clearTimeout(warn);
      clearTimeout(out);
      if (warned) {
        warned = false;
        onActive();
      }
      warn = setTimeout(() => {
        warned = true;
        onWarn();
        out = setTimeout(onTimeout, WARN_MS);
      }, IDLE_MS - WARN_MS);
    };
    const events = ['mousedown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    arm();
    return () => {
      clearTimeout(warn);
      clearTimeout(out);
      events.forEach((e) => window.removeEventListener(e, arm));
    };
    // Handlers are stable module callbacks from the caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
