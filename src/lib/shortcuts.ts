import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

export const IS_MAC =
  Platform.OS === 'web' && typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform ?? '');

/** "⌘" on Mac, "Ctrl" elsewhere. */
export const MOD = IS_MAC ? '⌘' : 'Ctrl';

/** True while the user is typing, so single-key shortcuts never steal letters. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

type Opts = { mod?: boolean; enabled?: boolean; allowInInput?: boolean };

/**
 * Web keyboard shortcut. `mod` means ⌘ on Mac / Ctrl elsewhere. Without `mod`,
 * the key only fires when no field is focused and no modifier is held.
 */
export function useShortcut(key: string, handler: (e: KeyboardEvent) => void, opts: Opts = {}) {
  const { mod = false, enabled = true, allowInInput = false } = opts;
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== key.toLowerCase()) return;
      const modDown = IS_MAC ? e.metaKey : e.ctrlKey;
      if (mod !== modDown) return;
      if (!mod && (e.altKey || e.ctrlKey || e.metaKey)) return;
      if (!allowInInput && isTyping(e.target)) return;
      e.preventDefault();
      ref.current(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [key, mod, enabled, allowInInput]);
}
