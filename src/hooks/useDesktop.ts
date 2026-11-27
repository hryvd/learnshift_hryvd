import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

/** Laptop layout: web, at least 960 CSS px wide (1280×720 at up to 133% zoom). */
export const DESKTOP_MIN = 960;
export const SIDEBAR_W = 248;
export const SIDEBAR_W_COMPACT = 220;

export function useDesktop() {
  const { width, height } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_MIN;
  const sidebar = !isDesktop ? 0 : width < 1200 ? SIDEBAR_W_COMPACT : SIDEBAR_W;
  /** Width left for the page next to the sidebar. */
  const contentWidth = width - sidebar;
  return { isDesktop, sidebar, contentWidth, width, height };
}

/** Browser connectivity. Always online on native. */
export function useOnline() {
  const [online, setOnline] = useState(() =>
    Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.onLine !== false : true,
  );
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

/** Chrome/Edge install prompt, when the browser offers one. */
export function useInstallPrompt() {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  const standalone =
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(display-mode: standalone)').matches;
  return {
    canInstall: !!deferred,
    installed: standalone,
    install: async () => {
      if (!deferred) return false;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      listeners.forEach((l) => l());
      return outcome === 'accepted';
    },
  };
}
