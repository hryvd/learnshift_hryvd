import type { Session } from '@supabase/supabase-js';

export type PasswordSupport =
  | { supported: true }
  | { supported: false; reason: 'demo' | 'unavailable' }
  | { supported: false; reason: 'external_provider'; providerLabel: string };

const LABELS: Record<string, string> = {
  google: 'Google',
  apple: 'Apple',
  facebook: 'Facebook',
  azure: 'Microsoft',
  github: 'GitHub',
};

/** Whether this sign-in can change its password in the app. */
export function getPasswordChangeSupport(session: Session | null, isPitch: boolean): PasswordSupport {
  if (isPitch) return { supported: false, reason: 'demo' };
  const user = session?.user;
  if (!user) return { supported: false, reason: 'unavailable' };
  const providers = new Set<string>();
  for (const i of user.identities ?? []) if (i.provider) providers.add(i.provider);
  const meta = user.app_metadata as { provider?: string; providers?: string[] } | undefined;
  for (const p of meta?.providers ?? []) providers.add(p);
  if (meta?.provider) providers.add(meta.provider);
  if (providers.has('email') || providers.size === 0) return { supported: true };
  const first = [...providers][0];
  return { supported: false, reason: 'external_provider', providerLabel: LABELS[first] ?? 'your sign-in provider' };
}
