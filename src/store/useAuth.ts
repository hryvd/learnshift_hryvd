import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { HAS_BACKEND_CONFIG, IS_PITCH } from '@/lib/config';
import { supabase } from '@/lib/supabase';

import type { Lang, Role } from './useAppStore';

export type Profile = {
  id: string;
  role: Role;
  display_name: string;
  grade: number | null;
  lang: Lang;
  email: string;
};

type AuthState = {
  /** loading → signedOut | signedIn. Pitch builds are always "signedIn" offline. */
  status: 'loading' | 'signedOut' | 'signedIn';
  session: Session | null;
  profile: Profile | null;
  /** Set when the profile could not be loaded (offline on first launch). */
  error: string | null;
};

export const useAuth = create<AuthState>()(() => ({
  status: IS_PITCH ? 'signedIn' : 'loading',
  session: null,
  profile: null,
  error: null,
}));

async function loadProfile(session: Session): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, display_name, grade, lang')
    .eq('id', session.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...(data as Omit<Profile, 'email'>), email: session.user.email ?? '' };
}

/** Cached profile so the app opens offline after the first sign-in. */
const CACHE_KEY = 'learnshift-profile';
async function cacheProfile(p: Profile | null) {
  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  if (p) await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(p));
  else await AsyncStorage.removeItem(CACHE_KEY);
}
async function cachedProfile(id: string): Promise<Profile | null> {
  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  try {
    const p = JSON.parse((await AsyncStorage.getItem(CACHE_KEY)) ?? 'null') as Profile | null;
    return p?.id === id ? p : null;
  } catch {
    return null;
  }
}

/** Startup must never wait on the network forever. */
const BOOT_TIMEOUT_MS = 4000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

async function apply(session: Session | null) {
  if (!session) {
    useAuth.setState({ status: 'signedOut', session: null, profile: null, error: null });
    await cacheProfile(null);
    return;
  }
  try {
    // Slow network: fall back to the cached profile below instead of hanging.
    const profile = await withTimeout(loadProfile(session), BOOT_TIMEOUT_MS);
    if (!profile) {
      // The account exists but its profile is gone (deleted elsewhere).
      await supabase.auth.signOut();
      return;
    }
    await cacheProfile(profile);
    useAuth.setState({ status: 'signedIn', session, profile, error: null });
  } catch (e) {
    const cached = await cachedProfile(session.user.id);
    useAuth.setState({
      status: cached ? 'signedIn' : 'signedOut',
      session: cached ? session : null,
      profile: cached,
      error: cached ? null : (e as Error).message,
    });
  }
}

let started = false;
/** Starts listening for sign-in / sign-out. Safe to call more than once. */
export function startAuth() {
  if (started || IS_PITCH) return;
  started = true;
  if (!HAS_BACKEND_CONFIG) {
    useAuth.setState({ status: 'signedOut', error: 'Account services are not configured in this build.' });
    return;
  }
  const boot = supabase.auth.getSession();
  withTimeout(boot, BOOT_TIMEOUT_MS)
    .then(({ data }) => apply(data.session))
    .catch(() => {
      if (useAuth.getState().status !== 'loading') return;
      useAuth.setState({
        status: 'signedOut',
        session: null,
        profile: null,
        error: 'Could not restore your session. Check your connection and sign in again.',
      });
      // If the session turns up late, still sign the user back in.
      boot.then(({ data }) => (data.session ? apply(data.session) : undefined)).catch(() => {});
    });
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION') return;
    if (event === 'TOKEN_REFRESHED') {
      useAuth.setState({ session });
      return;
    }
    // Run outside the callback: Supabase warns against awaiting inside it.
    setTimeout(() => apply(session), 0);
  });
}

export async function refreshProfile() {
  const { session } = useAuth.getState();
  if (session) await apply(session);
}

export function patchProfile(patch: Partial<Profile>) {
  const p = useAuth.getState().profile;
  if (!p) return;
  const next = { ...p, ...patch };
  useAuth.setState({ profile: next });
  cacheProfile(next);
}

/** Resolves once the signed-in profile has loaded (or null after `ms`). */
export function waitForProfile(ms = 12000): Promise<Profile | null> {
  const now = useAuth.getState();
  if (now.status === 'signedIn' && now.profile) return Promise.resolve(now.profile);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      unsub();
      resolve(useAuth.getState().profile);
    }, ms);
    const unsub = useAuth.subscribe((s) => {
      if (s.status === 'signedIn' && s.profile) {
        clearTimeout(timer);
        unsub();
        resolve(s.profile);
      }
    });
  });
}
