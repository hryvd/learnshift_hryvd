// Shared edge function helpers (Deno).
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.119.0';

export const cors = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
};

// Browsers may call these functions only from LearnShift's own sites (production,
// EAS preview deployments, local dev). Native apps send no Origin and are unaffected.
const EXTRA_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((o) => o.trim()).filter(Boolean);
export function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (EXTRA_ORIGINS.includes(origin)) return origin;
  if (/^https:\/\/learnshift(--[a-z0-9-]+)?\.expo\.app$/.test(origin)) return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}

function withCors(res: Response, origin: string | null): Response {
  const ok = allowedOrigin(origin);
  if (!ok) return res;
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', ok);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Service-role client: bypasses RLS, so every caller check happens in code. */
export const admin: SupabaseClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export async function requireUser(req: Request): Promise<User> {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Sign in first');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Sign in first');
  return data.user;
}

export async function rateTake(user: string, kind: string, max: number, windowS: number) {
  const { data, error } = await admin.rpc('rate_take', { p_user: user, p_kind: kind, p_max: max, p_window_s: windowS });
  if (error) throw error;
  return data === true;
}

export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    const origin = req.headers.get('origin');
    if (req.method === 'OPTIONS') return withCors(new Response('ok', { headers: cors }), origin);
    if (req.method !== 'POST') return withCors(json({ error: 'POST only' }, 405), origin);
    try {
      return withCors(await handler(req), origin);
    } catch (e) {
      if (e instanceof HttpError) return withCors(json({ error: e.message }, e.status), origin);
      console.error(e);
      return withCors(json({ error: 'Something went wrong' }, 500), origin);
    }
  });
}

// ── Push notifications (Expo push service) ───────────────────────────────

export type Push = { title: string; body: string; data?: Record<string, unknown> };

export async function pushTo(userIds: string[], msg: Push) {
  if (userIds.length === 0) return 0;
  const { data: tokens } = await admin.from('push_tokens').select('token').in('user_id', userIds);
  if (!tokens?.length) return 0;
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(
      tokens.map((t) => ({
        to: t.token,
        title: msg.title,
        body: msg.body,
        data: msg.data ?? {},
        sound: 'default',
        channelId: 'family',
        priority: 'high',
      })),
    ),
  });
  const out = await res.json().catch(() => null);
  // Forget tokens for uninstalled apps.
  const dead: string[] = [];
  (out?.data ?? []).forEach((r: { status: string; details?: { error?: string } }, i: number) => {
    if (r.status === 'error' && r.details?.error === 'DeviceNotRegistered') dead.push(tokens[i].token);
  });
  if (dead.length) await admin.from('push_tokens').delete().in('token', dead);
  return tokens.length - dead.length;
}

export async function guardiansOf(studentId: string, onlyAlerts = false): Promise<string[]> {
  const { data } = await admin.from('guardian_links').select('guardian_id').eq('student_id', studentId);
  const ids = (data ?? []).map((r) => r.guardian_id as string);
  if (!onlyAlerts || ids.length === 0) return ids;
  const { data: c } = await admin.from('guardian_controls').select('late_alerts').eq('student_id', studentId).maybeSingle();
  return c && c.late_alerts === false ? [] : ids;
}

export async function nameOf(id: string): Promise<{ name: string; lang: 'en' | 'fil' }> {
  const { data } = await admin.from('profiles').select('display_name, lang').eq('id', id).maybeSingle();
  return { name: data?.display_name?.split(' ')[0] ?? 'Your child', lang: data?.lang === 'fil' ? 'fil' : 'en' };
}

/** Manila-time minutes since midnight (Asia/Manila = UTC+8, no DST). */
export function manilaClockMinutes(now = new Date()): number {
  const manilaMs = now.getTime() + 8 * 3600 * 1000;
  const d = new Date(manilaMs);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** True when a student is inside their bedtime wind-down window (quiet hours for social pushes). */
export async function isQuietHours(studentId: string, now = new Date()): Promise<boolean> {
  const { data } = await admin
    .from('student_settings')
    .select('bedtime_start, bedtime_end')
    .eq('student_id', studentId)
    .maybeSingle();
  const start = data?.bedtime_start ?? 22 * 60;
  const end = data?.bedtime_end ?? 6 * 60;
  if (start === end) return false;
  const mins = manilaClockMinutes(now);
  return start <= end ? mins >= start && mins < end : mins >= start || mins < end;
}

/** Filters student recipients to those with social/chat enabled and not in quiet hours. */
export async function filterSocialRecipients(
  userIds: string[],
  opts: { requireChat?: boolean } = {},
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const { data: controls } = await admin
    .from('guardian_controls')
    .select('student_id, social_enabled, chat_enabled')
    .in('student_id', userIds);
  const ctrlMap = new Map((controls ?? []).map((c) => [c.student_id as string, c]));
  const eligible: string[] = [];
  for (const uid of userIds) {
    const c = ctrlMap.get(uid);
    if (c?.social_enabled === false) continue;
    if (opts.requireChat && c?.chat_enabled === false) continue;
    if (await isQuietHours(uid)) continue;
    eligible.push(uid);
  }
  return eligible;
}

const fmt = (min: number) => {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/** Guardian-facing late-night alert, at most once per student per 6 hours. */
export async function lateNightAlert(studentId: string, clockMin: number, minutes: number) {
  if (!(await rateTake(studentId, 'late-alert', 1, 6 * 3600))) return false;
  const guardians = await guardiansOf(studentId, true);
  const { name } = await nameOf(studentId);
  await pushTo(guardians, {
    title: `${name} is still on the phone`,
    body: `It's ${fmt(clockMin)}. ${minutes} min past bedtime. LearnShift started wind-down.`,
    data: { url: '/guardian' },
  });
  return true;
}
