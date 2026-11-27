import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useFonts } from 'expo-font';

import { PatyAvatar } from '@/components/mascot/Paty';
import { IS_TEACHER_APP } from '@/lib/config';
import { FONT_MAIN, FONT_SECONDARY } from '@/design/typography';

/**
 * On a laptop or desktop browser, LearnShift shows inside a 9:16 phone, the
 * way it looks on a real phone. The app runs in an embedded page of the same
 * site, so every screen lays itself out for phone width. Phones, embedded
 * pages and `?full` / "Full width" skip the frame.
 */
/** Set while a teacher or guardian is signed in on this browser. */
export const STAFF_KEY = 'ls-staff';

export const SHOW_FRAME: boolean = (() => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  if (IS_TEACHER_APP) return false;
  try {
    if (window.self !== window.top) return false;
    const q = new URLSearchParams(window.location.search);
    // `?phone` brings the frame back after "Open full width".
    if (q.has('phone')) window.localStorage.removeItem('ls-full');
    if (q.has('full')) return false;
    if (window.localStorage.getItem('ls-full') === '1') return false;
    // Teachers and guardians work on laptops: their screens get the full window.
    if (/^\/(teacher|guardian|reset-password|privacy-policy|auth)(\/|$)/.test(window.location.pathname)) return false;
    if (window.localStorage.getItem(STAFF_KEY) === '1') return false;
    if (q.get('mode') === 'signin') return false;
  } catch {
    return false;
  }
  return window.innerWidth >= 640;
})();

function size() {
  const h = Math.max(560, Math.min(window.innerHeight - 56, 920));
  return { h, w: Math.round((h * 9) / 16) };
}

export function PhoneFrame() {
  useFonts({
    [FONT_MAIN]: require('../../../assets/fonts/Bungee-Regular.ttf'),
    [FONT_SECONDARY]: require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf'),
  });
  const [{ w, h }, setSize] = useState(size);
  const [src] = useState(() => `${window.location.pathname}${window.location.search}`);
  const wide = typeof window !== 'undefined' && window.innerWidth >= 1100;

  useEffect(() => {
    const on = () => setSize(size());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  const fullWidth = () => {
    try {
      window.localStorage.setItem('ls-full', '1');
    } catch {
      // private mode: the query flag still works
    }
    window.location.href = `${window.location.pathname}?full`;
  };

  const staffSignIn = () => {
    window.location.href = '/onboarding?mode=signin&full';
  };

  const bezel = 12;
  return (
    <div style={styles.page}>
      {wide ? (
        <div style={styles.side}>
          <div style={styles.brandRow}>
            <PatyAvatar size={36} background="#FDF1E2" />
            <div style={styles.brand}>LearnShift</div>
          </div>
          <div style={styles.tag}>Scrolling better minutes.</div>
          <p style={styles.copy}>
            Paty notices long scrolls and turns them into 45-second lessons. One app for students, guardians and
            teachers.
          </p>
          <button type="button" onClick={staffSignIn} style={styles.button}>
            Teacher sign in
          </button>
          <button type="button" onClick={fullWidth} style={styles.secondary}>
            Open full width
          </button>
        </div>
      ) : null}
      <div style={styles.column}>
        <div
          style={{
            ...styles.device,
            width: w + bezel * 2,
            height: h + bezel * 2,
            padding: bezel,
          }}
        >
          <iframe
            title="LearnShift"
            src={src}
            style={{ ...styles.screen, width: w, height: h }}
            allow="clipboard-write"
          />
        </div>
        {!wide ? (
          <div style={{ display: 'flex', gap: 16 }}>
            <button type="button" onClick={staffSignIn} style={styles.link}>
              Teacher sign in
            </button>
            <button type="button" onClick={fullWidth} style={styles.link}>
              Open full width
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 72,
    background: 'radial-gradient(circle at 30% 20%, #FDF1E2 0%, #F3E2C8 55%, #E9CDB0 100%)',
    fontFamily: 'Inter_700Bold, system-ui, -apple-system, Segoe UI, sans-serif',
    overflow: 'hidden',
  },
  side: { maxWidth: 360, color: '#3A2A20' },
  brandRow: { display: 'flex', alignItems: 'center', gap: 12 },
  brand: {
    fontFamily: 'Bungee-Regular, system-ui, sans-serif',
    fontSize: 40,
    fontWeight: 'normal',
    letterSpacing: -0.6,
    color: '#C8400F',
  },
  tag: { fontSize: 22, fontWeight: 'normal', marginTop: 6 },
  copy: { fontSize: 16, lineHeight: 1.5, color: '#6B5546', marginTop: 16 },
  button: {
    marginTop: 18,
    border: 'none',
    borderRadius: 999,
    padding: '12px 20px',
    background: '#C8400F',
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold, system-ui, sans-serif',
    fontSize: 15,
    fontWeight: 'normal',
    cursor: 'pointer',
  },
  secondary: {
    marginTop: 18,
    marginLeft: 10,
    border: '1px solid #C8400F',
    borderRadius: 999,
    padding: '11px 20px',
    background: 'transparent',
    color: '#C8400F',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
  },
  column: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  device: {
    position: 'relative',
    boxSizing: 'content-box',
    borderRadius: 54,
    background: '#16110E',
    boxShadow: '0 30px 80px rgba(58, 42, 32, 0.35), inset 0 0 0 2px #3A2E27',
  },
  screen: { display: 'block', border: 'none', borderRadius: 42, background: '#FDF1E2' },
  link: {
    border: 'none',
    background: 'transparent',
    color: '#6B5546',
    fontSize: 14,
    textDecoration: 'underline',
    cursor: 'pointer',
  },
};
