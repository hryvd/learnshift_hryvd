/**
 * Teacher data: classes, rosters, mastery (never screen time) and the tutor
 * review queue. Live: a student's answer updates the heatmap in seconds.
 */
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { create } from 'zustand';

import type { Section, Student } from '@/data/class';
import { SKILLS, type SkillId } from '@/data/skills';
import { AUTO_REFRESH_MS, useInterval, useResumeKey } from '@/hooks/useAutoRefresh';
import { IS_PITCH } from '@/lib/config';
import { supabase } from '@/lib/supabase';
import type { ClassModule, ModuleFlashcard, ModuleQuestion } from '@/services/ai/moduleGenerator';
import * as api from '@/services/backend/api';
import { isSharedLaptop } from '@/services/teacher/sharedLaptop';
import {
  broadcastClassModules,
  loadTeacherLocalModules,
  persistTeacherLocalModules,
  shutdownTeacherPeerHost,
  startTeacherPeerHost,
} from '@/services/backend/peerModuleSync';
import { PRIOR_MASTERY, todayKey } from '@/store/useAppStore';
import { useAuth } from '@/store/useAuth';

export type TeacherClass = { id: string; name: string; grade: number; join_code: string };
export type LiveStudent = Student & { answered: number; lastActive: string | null };
export type ReviewRow = {
  id: string;
  studentId: string;
  student: string;
  questionId: string;
  wrongIndex: number;
  confidence: number;
  lang: 'en' | 'fil';
  content: { what?: string; steps?: string[]; example?: string; problems?: string[] };
  source: 'bank' | 'generated';
  status: 'needs_review' | 'approved' | 'edited' | 'auto';
  teacherNote: string | null;
  at: string;
};

type TeacherState = {
  loading: boolean;
  error: string | null;
  classes: TeacherClass[];
  selected: string | null;
  uploadOpen: boolean;
  students: Record<string, LiveStudent[]>;
  modules: Record<string, ClassModule[]>;
  review: ReviewRow[];
  reviewError: string | null;
  /** When the data on screen was last loaded from the server (ISO, UTC). */
  syncedAt: string | null;
  /** True when the screen shows the saved copy because the server can't be reached. */
  fromCache: boolean;
  select: (id: string) => void;
  setUploadOpen: (open: boolean) => void;
};

export const useTeacher = create<TeacherState>()((set) => ({
  loading: true,
  error: null,
  classes: [],
  selected: null,
  uploadOpen: false,
  students: {},
  modules: {},
  review: [],
  reviewError: null,
  syncedAt: null,
  fromCache: false,
  select: (selected) => set({ selected }),
  setUploadOpen: (uploadOpen) => set({ uploadOpen }),
}));

export function resetTeacher(opts?: { signedOut?: boolean }) {
  if (opts?.signedOut) clearTeacherCache();
  shutdownTeacherPeerHost();
  useTeacher.setState({
    loading: true,
    error: null,
    classes: [],
    selected: null,
    uploadOpen: false,
    students: {},
    modules: {},
    review: [],
    reviewError: null,
    syncedAt: null,
    fromCache: false,
  });
}

// ── Offline copy (laptop web) ────────────────────────────────────────────
// A read-only snapshot of the last good load, scoped to one teacher, so a
// dropped connection still shows classes, rosters, modules and the queue.
// Sign out deletes it, so a shared school laptop keeps no student data.
const CACHE_KEY = 'learnshift:teacher-cache:v1';

type Snapshot = Pick<TeacherState, 'classes' | 'selected' | 'students' | 'modules' | 'review' | 'syncedAt'> & {
  userId: string;
};

function webStorage(): Storage | null {
  try {
    return Platform.OS === 'web' && typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function saveSnapshot() {
  const store = webStorage();
  const userId = useAuth.getState().profile?.id;
  if (!store || !userId || IS_PITCH || isSharedLaptop()) return;
  const s = useTeacher.getState();
  if (s.fromCache) return;
  const snap: Snapshot = {
    userId,
    classes: s.classes,
    selected: s.selected,
    students: s.students,
    modules: s.modules,
    review: s.review,
    syncedAt: s.syncedAt,
  };
  try {
    store.setItem(CACHE_KEY, JSON.stringify(snap));
  } catch {
    // quota or private mode: the live view still works
  }
}

/** Shows the saved copy for this teacher, if any. Returns whether it did. */
function restoreSnapshot(): boolean {
  const store = webStorage();
  const userId = useAuth.getState().profile?.id;
  if (!store || !userId) return false;
  try {
    const raw = store.getItem(CACHE_KEY);
    if (!raw) return false;
    const snap = JSON.parse(raw) as Snapshot;
    if (snap.userId !== userId) {
      store.removeItem(CACHE_KEY);
      return false;
    }
    useTeacher.setState({
      classes: snap.classes,
      selected: snap.selected,
      students: snap.students,
      modules: snap.modules,
      review: snap.review,
      syncedAt: snap.syncedAt,
      fromCache: true,
      loading: false,
      error: null,
    });
    return true;
  } catch {
    return false;
  }
}

/** Removes the offline copy. Call on sign out and account deletion. */
export function clearTeacherCache() {
  try {
    webStorage()?.removeItem(CACHE_KEY);
    // Module decks kept for phone-to-phone sharing; not needed on a laptop after sign out.
    webStorage()?.removeItem('learnshift:teacher-local-modules:v1');
  } catch {
    // nothing stored
  }
}

let snapTimer: ReturnType<typeof setTimeout> | null = null;
function markSynced() {
  useTeacher.setState({ syncedAt: new Date().toISOString(), fromCache: false });
  if (snapTimer) clearTimeout(snapTimer);
  snapTimer = setTimeout(saveSnapshot, 500);
}

function isOffline() {
  return Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.onLine === false;
}

const DAY_MS = 24 * 3600 * 1000;

export async function loadClasses() {
  const me = useAuth.getState().profile?.id;
  if (!me) return;
  const { data, error } = await supabase
    .from('classes')
    .select('id, name, grade, join_code')
    .eq('teacher_id', me)
    .order('created_at');
  if (error) {
    if (useTeacher.getState().classes.length > 0) return; // keep what's on screen
    if (restoreSnapshot()) return;
    useTeacher.setState({
      loading: false,
      error: isOffline() ? 'You are offline. Connect to the internet to load your classes.' : error.message,
    });
    return;
  }
  const classes = (data ?? []) as TeacherClass[];
  const sel = useTeacher.getState().selected;
  useTeacher.setState({
    classes,
    selected: classes.some((c) => c.id === sel) ? sel : (classes[0]?.id ?? null),
    loading: false,
    error: null,
  });
  markSynced();
}

export async function loadRoster(classId: string) {
  const { data: members, error } = await supabase
    .from('class_members')
    .select('student_id, profiles(display_name)')
    .eq('class_id', classId);
  if (error) {
    if (useTeacher.getState().students[classId]) return; // keep the last good roster
    useTeacher.setState({ error: error.message });
    return;
  }
  const ids = (members ?? []).map((m) => m.student_id as string);
  const [mastery, daily, attempts] = ids.length
    ? await Promise.all([
      supabase.from('mastery').select('student_id, skill_id, p, updated_at').in('student_id', ids),
      supabase
        .from('mastery_daily')
        .select('student_id, day, skill_id, p')
        .in('student_id', ids)
        .gte('day', todayKey(new Date(Date.now() - 35 * DAY_MS))),
      supabase
        .from('attempts')
        .select('student_id, created_at')
        .in('student_id', ids)
        .gte('created_at', new Date(Date.now() - 30 * DAY_MS).toISOString())
        .limit(10000),
    ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const students: LiveStudent[] = (members ?? []).map((m) => {
    const id = m.student_id as string;
    const rows = (mastery.data ?? []).filter((r) => r.student_id === id);
    const map = { ...PRIOR_MASTERY };
    for (const r of rows) map[r.skill_id as SkillId] = r.p;
    // Weekly class-average points from daily snapshots, oldest first.
    const snaps = (daily.data ?? []).filter((r) => r.student_id === id);
    const history: number[] = [];
    for (let w = 4; w >= 0; w--) {
      const cutoff = todayKey(new Date(Date.now() - w * 7 * DAY_MS));
      const latest = { ...PRIOR_MASTERY };
      let any = false;
      for (const r of snaps)
        if (r.day <= cutoff) {
          latest[r.skill_id as SkillId] = r.p;
          any = true;
        }
      if (any) history.push(SKILLS.reduce((a, k) => a + latest[k.id], 0) / SKILLS.length);
    }
    const trend = history.length >= 2 ? (history[history.length - 1] - history[0]) / (history.length - 1) : 0;
    const mine = (attempts.data ?? []).filter((a) => a.student_id === id);
    const lastActive = mine.reduce<string | null>((x, a) => (!x || a.created_at > x ? a.created_at : x), null);
    return {
      id,
      name: (m.profiles as unknown as { display_name: string } | null)?.display_name ?? 'Student',
      mastery: map,
      trend,
      history,
      answered: mine.length,
      lastActive,
    };
  });
  students.sort((a, b) => a.name.localeCompare(b.name));
  useTeacher.setState((s) => ({ students: { ...s.students, [classId]: students }, error: null }));
  markSynced();
}

/** Loads every class roster. Used when a student page is opened directly. */
export async function loadAllRosters() {
  if (useTeacher.getState().classes.length === 0) await loadClasses();
  await Promise.all(useTeacher.getState().classes.map((c) => loadRoster(c.id)));
}

export async function loadReview() {
  const { data, error } = await supabase
    .from('tutor_answers')
    .select('id, student_id, question_id, wrong_index, confidence, lang, content, source, status, teacher_note, created_at, profiles!tutor_answers_student_id_fkey(display_name)')
    .in('status', ['needs_review', 'approved', 'edited'])
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) {
    useTeacher.setState({
      reviewError: isOffline() ? 'You are offline. Showing the last saved queue.' : 'Could not load the review queue.',
    });
    return;
  }
  useTeacher.setState({
    reviewError: null,
    review: (data ?? []).map((r) => ({
      id: r.id,
      studentId: r.student_id,
      student: (r.profiles as unknown as { display_name: string } | null)?.display_name ?? 'Student',
      questionId: r.question_id,
      wrongIndex: r.wrong_index,
      confidence: r.confidence,
      lang: r.lang,
      content: r.content ?? {},
      source: r.source,
      status: r.status,
      teacherNote: r.teacher_note,
      at: r.created_at,
    })),
  });
  markSynced();
}

export async function loadModules(classId: string) {
  const localMap = await loadTeacherLocalModules();
  const localRows = localMap[classId] ?? [];
  const { data, error } = await supabase
    .from('class_modules')
    .select('id, class_id, title, subject, source_name, summary, flashcards, questions, published, created_at')
    .eq('class_id', classId)
    .order('created_at', { ascending: false })
    .limit(40);
  const remoteRows: ClassModule[] = !error
    ? (data ?? []).map((m) => ({
      id: m.id,
      classId: m.class_id,
      title: m.title,
      subject: m.subject,
      sourceName: m.source_name,
      summary: m.summary ?? '',
      flashcards: (m.flashcards ?? []) as ModuleFlashcard[],
      questions: (m.questions ?? []) as ModuleQuestion[],
      published: !!m.published,
      createdAt: m.created_at,
    }))
    : [];
  // The server is the source of truth: a module deleted elsewhere must not come back.
  // Only phone-only drafts (`local-*`, Android fallback) are kept from the local copy;
  // when the server can't be reached, show the last local copy unchanged.
  const byId = new Map<string, ClassModule>();
  if (error) for (const l of localRows) byId.set(l.id, l);
  else {
    for (const r of remoteRows) byId.set(r.id, r);
    for (const l of localRows) if (l.id.startsWith('local-')) byId.set(l.id, l);
  }
  const merged = [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  useTeacher.setState((s) => ({ modules: { ...s.modules, [classId]: merged } }));
  if (!error) void persistTeacherLocalModules({ ...useTeacher.getState().modules, [classId]: merged });
}

export function addLocalModule(mod: ClassModule) {
  useTeacher.setState((s) => {
    const nextModules = {
      ...s.modules,
      [mod.classId]: [mod, ...(s.modules[mod.classId] ?? []).filter((x) => x.id !== mod.id)],
    };
    void persistTeacherLocalModules(nextModules);
    return { modules: nextModules };
  });
}

export function removeLocalModule(classId: string, id: string) {
  useTeacher.setState((s) => {
    const nextModules = {
      ...s.modules,
      [classId]: (s.modules[classId] ?? []).filter((x) => x.id !== id),
    };
    void persistTeacherLocalModules(nextModules);
    return { modules: nextModules };
  });
}

async function findRecentDuplicate(classId: string, title: string): Promise<ClassModule | null> {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('class_modules')
    .select('id, class_id, title, subject, source_name, summary, flashcards, questions, published, created_at')
    .eq('class_id', classId)
    .eq('title', title.trim().slice(0, 120))
    .gte('created_at', since)
    .limit(1);
  const m = data?.[0];
  if (!m) return null;
  return {
    id: m.id,
    classId: m.class_id,
    title: m.title,
    subject: m.subject,
    sourceName: m.source_name,
    summary: m.summary ?? '',
    flashcards: (m.flashcards ?? []) as ModuleFlashcard[],
    questions: (m.questions ?? []) as ModuleQuestion[],
    published: !!m.published,
    createdAt: m.created_at,
  };
}

/** Saves teacher edits to a published module; students get the new version on their next sync. */
export async function updateModule(mod: ClassModule) {
  if (!IS_PITCH && !mod.id.startsWith('local-')) await api.updateClassModule(mod);
  addLocalModule(mod);
}

/** Publishes a copy of a module to other classes. */
export async function copyModuleToClasses(mod: ClassModule, classIds: string[]) {
  return publishModulesToClasses(classIds, {
    title: mod.title,
    subject: mod.subject,
    sourceName: mod.sourceName,
    summary: mod.summary,
    flashcards: mod.flashcards,
    questions: mod.questions,
  });
}

/**
 * Approves a generated module deck, saves full content locally on the teacher's phone,
 * serves it over LAN HTTP + P2P broadcast to every chosen class, and stores only lightweight
 * metadata in the database.
 */
export async function publishModulesToClasses(
  classIds: string[],
  input: {
    title: string;
    subject: string;
    sourceName: string | null;
    summary: string;
    flashcards: ModuleFlashcard[];
    questions: ModuleQuestion[];
  },
): Promise<{ saved: ClassModule[]; lanUrl: string }> {
  const uniqueIds = Array.from(new Set(classIds.filter(Boolean)));
  const saved: ClassModule[] = [];
  for (const classId of uniqueIds) {
    let mod: ClassModule;
    // Retry after a partial failure: don't create a second copy in classes that already got it.
    const already = !IS_PITCH ? await findRecentDuplicate(classId, input.title) : null;
    if (already) {
      addLocalModule(already);
      saved.push(already);
      continue;
    }
    if (IS_PITCH) {
      mod = {
        id: `mod-${Date.now().toString(36)}-${classId.slice(0, 4)}`,
        classId,
        title: input.title.trim(),
        subject: input.subject,
        sourceName: input.sourceName,
        summary: input.summary,
        flashcards: input.flashcards,
        questions: input.questions,
        published: true,
        createdAt: new Date().toISOString(),
      };
    } else {
      try {
        mod = await api.saveClassModule({
          classId,
          title: input.title,
          subject: input.subject,
          sourceName: input.sourceName,
          sourceExcerpt: input.summary,
          summary: input.summary,
          flashcards: input.flashcards,
          questions: input.questions,
        });
      } catch (e) {
        // Laptops have no phone-to-phone path, so a failed save must say so.
        if (Platform.OS !== 'android') {
          throw new Error(
            saved.length
              ? `Published to ${saved.length} of ${uniqueIds.length} classes, then failed: ${(e as Error).message}`
              : isOffline()
                ? 'You are offline. Reconnect to publish; your draft stays open.'
                : (e as Error).message,
          );
        }
        mod = {
          id: `local-${Date.now().toString(36)}-${classId.slice(0, 4)}`,
          classId,
          title: input.title.trim(),
          subject: input.subject,
          sourceName: input.sourceName,
          summary: input.summary,
          flashcards: input.flashcards,
          questions: input.questions,
          published: true,
          createdAt: new Date().toISOString(),
        };
      }
    }
    addLocalModule(mod);
    saved.push(mod);
  }
  const lanUrl = await persistTeacherLocalModules(useTeacher.getState().modules);
  await Promise.all(
    saved.map((mod) => broadcastClassModules(mod.classId, useTeacher.getState().modules[mod.classId] ?? [mod], lanUrl)),
  );
  return { saved, lanUrl };
}

export async function reviewAnswer(id: string, status: 'approved' | 'edited', note?: string) {
  const me = useAuth.getState().profile?.id;
  useTeacher.setState((s) => ({
    review: s.review.map((r) => (r.id === id ? { ...r, status, teacherNote: note ?? r.teacherNote } : r)),
  }));
  const { error } = await supabase
    .from('tutor_answers')
    .update({ status, teacher_note: note ?? null, reviewed_by: me, reviewed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    await loadReview();
    throw new Error(error.message);
  }
}

/** As a `Section` for the existing heatmap and support-list helpers. */
export function asSection(c: TeacherClass, students: LiveStudent[]): Section {
  return { id: c.id, name: c.name, grade: c.grade, students };
}

/** Reloads classes, the review queue and the open roster now (pull-to-refresh, polling). */
export async function refreshTeacher() {
  await Promise.all([loadClasses(), loadReview()]);
  const id = useTeacher.getState().selected;
  if (id) await Promise.all([loadRoster(id), loadModules(id)]);
}

/** Loads and keeps the teacher view live. Mount once in the teacher layout. */
export function useTeacherLive(enabled = true) {
  const me = useAuth((s) => s.profile?.id);
  const selected = useTeacher((s) => s.selected);
  const activeId = enabled ? me : undefined;
  // Rebuild realtime channels after a long sleep; poll as a safety net while open.
  const resume = useResumeKey();
  useInterval(() => {
    if (!activeId) return;
    refreshTeacher().catch(() => { });
  }, AUTO_REFRESH_MS, !!activeId);

  useEffect(() => {
    if (!activeId) return;
    loadClasses();
    loadReview();
    const ch = supabase
      .channel(`teacher-${activeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tutor_answers' }, () => loadReview())
      .subscribe();
    const app = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        loadClasses();
        loadReview();
      }
    });
    return () => {
      supabase.removeChannel(ch);
      app.remove();
    };
  }, [activeId, resume]);

  const classes = useTeacher((s) => s.classes);
  const classIdsKey = classes.map((c) => c.id).join(',');

  useEffect(() => {
    if (!enabled || !classIdsKey) return;
    const ids = classIdsKey.split(',').filter(Boolean);
    return startTeacherPeerHost(ids, (cid) => useTeacher.getState().modules[cid] ?? []);
  }, [enabled, classIdsKey]);

  useEffect(() => {
    if (!enabled || !selected) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    // Mastery events arrive per skill; batch them into one reload.
    const reload = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => loadRoster(selected), 400);
    };
    loadRoster(selected);
    loadModules(selected);
    const ch = supabase
      .channel(`teacher-class-${selected}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_members', filter: `class_id=eq.${selected}` }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_modules', filter: `class_id=eq.${selected}` }, () =>
        loadModules(selected),
      )
      // RLS sends mastery for every class this teacher has; reload only for this roster.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mastery' }, (p) => {
        const sid = ((p.new ?? p.old) as { student_id?: string } | null)?.student_id;
        const roster = useTeacher.getState().students[selected];
        if (!sid || !roster || roster.some((x) => x.id === sid)) reload();
      })
      .subscribe();
    return () => {
      if (t) clearTimeout(t);
      supabase.removeChannel(ch);
    };
  }, [enabled, selected, resume]);
}
