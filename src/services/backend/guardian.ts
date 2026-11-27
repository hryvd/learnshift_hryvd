/**
 * Guardian data: linked children, their habits (never grades) and requests.
 * Live: any change the student's phone or the monitor makes shows up here.
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { create } from 'zustand';

import type { NudgeEntry } from '@/data/seed';
import { SKILL_BY_ID, type SkillId } from '@/data/skills';
import { AUTO_REFRESH_MS, useInterval, useResumeKey } from '@/hooks/useAutoRefresh';
import { supabase } from '@/lib/supabase';
import { todayKey, type AccountRequest, type BedtimeDays, type TimeRequest, type UsageDay } from '@/store/useAppStore';
import { useAuth } from '@/store/useAuth';

export type LearnerStyle =
  'visual_paced' | 'quick_solver' | 'reflective_deep' | 'consistent_builder' | 'getting_started';

export type LearningProfile = {
  learnerStyle: LearnerStyle;
  strongSkills: SkillId[];
  growingSkills: SkillId[];
  bestContext: string | null;
  totalAttempts: number;
};

export type Child = { id: string; name: string; grade: number | null };
export type AppCategory = 'video' | 'social' | 'games' | 'messaging' | 'study' | 'other';
export type AppDay = { day: string; package: string; label: string; category: AppCategory; minutes: number };
export type LiveNow = {
  package: string | null;
  label: string | null;
  category: AppCategory | null;
  sessionMin: number;
  screenOn: boolean;
  updatedAt: string;
};
export type ChildFriend = {
  id: string;
  displayName: string;
  grade: number | null;
  acceptedAt: string | null;
};

export type ChildData = {
  usage: UsageDay[];
  apps: AppDay[];
  live: LiveNow | null;
  learningProfile: LearningProfile | null;
  friends: ChildFriend[];
  nudges: NudgeEntry[];
  requests: TimeRequest[];
  accountRequests: AccountRequest[];
  controls: {
    lockEnabled: boolean;
    lockNow: boolean;
    lockStart: number;
    lockEnd: number;
    lateAlerts: boolean;
    unlockUntil: string | null;
    scrollLimit: number | null;
    gamesLimit: number | null;
    breakIntervalSec: number | null;
    socialEnabled: boolean;
    chatEnabled: boolean;
  };
  settings: { bedtimeStart: number; bedtimeEnd: number; bedtimeDays: BedtimeDays; limitStyle: 'adaptive' | 'fixed' };
};

type GuardianState = {
  loading: boolean;
  error: string | null;
  children: Child[];
  selected: string | null;
  data: Record<string, ChildData>;
  /** Per-child load failure, so one child's error never hides the others. */
  childErrors: Record<string, string>;
  select: (id: string) => void;
};

export const useGuardian = create<GuardianState>()((set) => ({
  loading: true,
  error: null,
  children: [],
  selected: null,
  data: {},
  childErrors: {},
  select: (selected) => set({ selected }),
}));

export function resetGuardian() {
  useGuardian.setState({
    loading: true,
    error: null,
    children: [],
    selected: null,
    data: {},
    childErrors: {},
  });
}

const DAY_MS = 24 * 3600 * 1000;

export async function loadChildren() {
  const me = useAuth.getState().profile?.id;
  if (!me) return;
  const { data, error } = await supabase
    .from('guardian_links')
    .select('student_id, profiles!guardian_links_student_id_fkey(display_name, grade)')
    .eq('guardian_id', me)
    .order('created_at');
  if (error) {
    useGuardian.setState({ loading: false, error: error.message });
    return;
  }
  const children: Child[] = (data ?? []).map((r) => {
    const p = r.profiles as unknown as { display_name: string; grade: number | null } | null;
    return { id: r.student_id, name: p?.display_name ?? 'Student', grade: p?.grade ?? null };
  });
  const sel = useGuardian.getState().selected;
  useGuardian.setState({
    children,
    selected: children.some((c) => c.id === sel) ? sel : (children[0]?.id ?? null),
    loading: false,
    error: null,
  });
  // Warm every other child in the background so switching is instant.
  const loaded = useGuardian.getState().data;
  for (const c of children) {
    if (c.id !== useGuardian.getState().selected && !loaded[c.id]) loadChild(c.id);
  }
}

function setChildError(id: string, message: string) {
  useGuardian.setState((s) => ({ childErrors: { ...s.childErrors, [id]: message } }));
}

const LEARNER_STYLES = new Set<LearnerStyle>([
  'visual_paced',
  'quick_solver',
  'reflective_deep',
  'consistent_builder',
  'getting_started',
]);

function parseSkillList(raw: unknown): SkillId[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is SkillId => typeof s === 'string' && s in SKILL_BY_ID);
}

function parseLearningProfile(raw: unknown): LearningProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const style =
    typeof r.learner_style === 'string' && LEARNER_STYLES.has(r.learner_style as LearnerStyle)
      ? (r.learner_style as LearnerStyle)
      : 'getting_started';
  return {
    learnerStyle: style,
    strongSkills: parseSkillList(r.strong_skills),
    growingSkills: parseSkillList(r.growing_skills),
    bestContext: typeof r.best_context === 'string' ? r.best_context : null,
    totalAttempts: typeof r.total_attempts === 'number' ? r.total_attempts : 0,
  };
}

/** Loads one child. Never throws: failures land in `childErrors[id]`. */
export async function loadChild(id: string) {
  try {
    await fetchChild(id);
  } catch (e) {
    setChildError(id, e instanceof Error ? e.message : 'Could not load this child.');
  }
}

async function fetchChild(id: string) {
  const since = todayKey(new Date(Date.now() - 13 * DAY_MS));
  const [usage, nudges, requests, accountReqs, controls, settings, apps, live, profileRes, friendsRes] =
    await Promise.all([
      supabase.from('usage_daily').select('*').eq('student_id', id).gte('day', since).order('day'),
      supabase.from('nudge_events').select('*').eq('student_id', id).order('at', { ascending: false }).limit(40),
      supabase
        .from('time_requests')
        .select('*')
        .eq('student_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('account_requests')
        .select('*')
        .eq('student_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('guardian_controls').select('*').eq('student_id', id).maybeSingle(),
      supabase.from('student_settings').select('*').eq('student_id', id).maybeSingle(),
      supabase
        .from('app_usage')
        .select('day, package, label, category, minutes')
        .eq('student_id', id)
        .gte('day', todayKey(new Date(Date.now() - 6 * DAY_MS)))
        .order('minutes', { ascending: false })
        .limit(400),
      supabase.from('live_status').select('*').eq('student_id', id).maybeSingle(),
      supabase.rpc('guardian_learning_profile', { p_student_id: id }),
      supabase.rpc('guardian_child_friends', { p_student_id: id }),
    ]);
  const err = [usage, nudges, requests, controls, settings, apps, live].find((r) => r.error)?.error;
  if (err) {
    setChildError(id, err.message);
    return;
  }
  const c = controls.data;
  const st = settings.data;
  const d: ChildData = {
    usage: (usage.data ?? []).map((u) => ({
      day: u.day,
      total: u.total_min,
      video: u.video_min,
      social: u.social_min,
      games: u.games_min,
      late: u.late_min,
      offAt: u.off_at,
      breaks: u.breaks,
      learning: u.learning_min,
      sessions: u.sessions,
      unlocks: u.unlocks,
    })),
    apps: (apps.data ?? []) as AppDay[],
    live: live.data
      ? {
          package: live.data.package,
          label: live.data.label,
          category: live.data.category,
          sessionMin: live.data.session_min,
          screenOn: live.data.screen_on,
          updatedAt: live.data.updated_at,
        }
      : null,
    learningProfile: profileRes.error ? null : parseLearningProfile(profileRes.data),
    friends:
      friendsRes.error || !Array.isArray(friendsRes.data)
        ? []
        : (
            friendsRes.data as { id: string; display_name: string; grade: number | null; accepted_at: string | null }[]
          ).map((f) => ({
            id: f.id,
            displayName: f.display_name,
            grade: f.grade,
            acceptedAt: f.accepted_at,
          })),
    nudges: (nudges.data ?? []).map((n) => ({
      id: n.client_id,
      at: n.at,
      level: n.level,
      reasons: n.reasons ?? [],
      response: n.response,
    })),
    requests: (requests.data ?? []).map((r) => ({ id: r.id, at: r.created_at, minutes: r.minutes, status: r.status })),
    accountRequests: (accountReqs.data ?? []).map((r) => ({
      id: r.id,
      at: r.created_at,
      kind: r.kind,
      status: r.status,
    })),
    controls: {
      lockEnabled: c?.lock_enabled ?? false,
      lockNow: c?.lock_now ?? false,
      lockStart: c?.lock_start ?? st?.bedtime_start ?? 1320,
      lockEnd: c?.lock_end ?? st?.bedtime_end ?? 360,
      lateAlerts: c?.late_alerts ?? true,
      unlockUntil: c?.unlock_until ?? null,
      scrollLimit: c?.scroll_limit ?? null,
      gamesLimit: c?.games_limit ?? null,
      breakIntervalSec: c?.break_interval_sec ?? null,
      socialEnabled: c?.social_enabled ?? true,
      chatEnabled: c?.chat_enabled ?? true,
    },
    settings: {
      bedtimeStart: st?.bedtime_start ?? 1320,
      bedtimeEnd: st?.bedtime_end ?? 360,
      bedtimeDays: (st?.bedtime_days ?? 'school') as BedtimeDays,
      limitStyle: (st?.limit_style ?? 'adaptive') as 'adaptive' | 'fixed',
    },
  };
  useGuardian.setState((s) => {
    const { [id]: _gone, ...childErrors } = s.childErrors;
    return { data: { ...s.data, [id]: d }, childErrors, error: null };
  });
}

/** Optimistic local edit while a write is in flight. */
export function patchChild(id: string, fn: (d: ChildData) => ChildData) {
  useGuardian.setState((s) => (s.data[id] ? { data: { ...s.data, [id]: fn(s.data[id]) } } : s));
}

/** Reloads the child list and the selected child now (pull-to-refresh, polling). */
export async function refreshGuardian() {
  await loadChildren();
  const id = useGuardian.getState().selected;
  if (id) await loadChild(id);
}

/** Loads and keeps the guardian view live. Mount once on the guardian screen. */
export function useGuardianLive() {
  const me = useAuth((s) => s.profile?.id);
  const selected = useGuardian((s) => s.selected);
  // Rebuild realtime channels after a long sleep; poll as a safety net while open.
  const resume = useResumeKey();
  useInterval(
    () => {
      if (!me) return;
      refreshGuardian().catch(() => {});
    },
    AUTO_REFRESH_MS,
    !!me,
  );

  useEffect(() => {
    if (!me) return;
    loadChildren();
    const ch = supabase
      .channel(`guardian-links-${me}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'guardian_links', filter: `guardian_id=eq.${me}` },
        () => loadChildren(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [me, resume]);

  useEffect(() => {
    if (!selected) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    // A report updates many rows at once; reload once per burst.
    const reload = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => loadChild(selected), 400);
    };
    loadChild(selected);
    const f = `student_id=eq.${selected}`;
    const ch = supabase
      .channel(`guardian-child-${selected}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_requests', filter: f }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'account_requests', filter: f }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'usage_daily', filter: f }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nudge_events', filter: f }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guardian_controls', filter: f }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_settings', filter: f }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_usage', filter: f }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_status', filter: f }, reload)
      .subscribe();
    const app = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        loadChildren();
        reload();
      }
    });
    return () => {
      if (t) clearTimeout(t);
      supabase.removeChannel(ch);
      app.remove();
    };
  }, [selected, resume]);
}
