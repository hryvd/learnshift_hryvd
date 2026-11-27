/**
 * Every server call the app makes, in one place. Throws Error with a short,
 * user-facing message on failure.
 */
import type {
  Archipelago,
  ArchipelagoInvite,
  ChatMessage,
  ClassmateCandidate,
  ConversationSummary,
  FriendProfile,
  FriendRequest,
  MessageKind,
  SagwanNudge,
  TideBand,
} from '@/data/kapuluan';
import type { BuildingId } from '@/data/seed';
import { Platform } from 'react-native';

import { errorText, functionError, supabase } from '@/lib/supabase';
import type { ClassModule, ModuleFlashcard, ModuleQuestion } from '@/services/ai/moduleGenerator';
import type { Lang, Role } from '@/store/useAppStore';
import { refreshProfile, useAuth } from '@/store/useAuth';
import type { TutorAnswer, TutorVariant } from '@/services/types';

const fail = (e: unknown): never => {
  throw new Error(errorText(e));
};

// ── Accounts ─────────────────────────────────────────────────────────────

export async function signUp(input: {
  email: string;
  password: string;
  name: string;
  role: Role;
  grade?: number | null;
  lang: Lang;
}) {
  if (input.role === 'student' && (!Number.isInteger(input.grade) || input.grade! < 1 || input.grade! > 10)) {
    throw new Error('Choose a grade from 1 to 10.');
  }
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    options: {
      data: { role: input.role, display_name: input.name.trim(), grade: input.grade ?? null, lang: input.lang },
    },
  });
  if (error) fail(error);
  if (!data.session) throw new Error('Check your email to confirm your account, then sign in.');
  return data.session;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) fail(error);
  return data.session;
}

/** Google sign-in (web). Returns to /auth/callback, which finishes the session. */
export async function signInWithGoogle() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    throw new Error('Google sign-in is available in the teacher app on a computer.');
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback`, queryParams: { prompt: 'select_account' } },
  });
  if (error) {
    if (/provider is not enabled|unsupported provider/i.test(error.message)) {
      throw new Error('Google sign-in isn’t switched on yet. Use your email for now.');
    }
    fail(error);
  }
}

/** First Google sign-in from the teacher app: make this new account a teacher. */
export async function claimTeacherRole() {
  const { data, error } = await supabase.rpc('claim_teacher_role');
  if (error) fail(error);
  if (data?.error) throw new Error(data.error);
  await refreshProfile();
}

export async function signOut() {
  await supabase.auth.signOut().catch(() => {});
}

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo:
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? `${window.location.origin}/reset-password`
        : 'learnshift://reset',
  });
  if (error) fail(error);
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) fail(error);
}

export async function deleteAccount() {
  const { error } = await supabase.functions.invoke('delete-account', { body: {} });
  if (error) throw new Error(await functionError(error));
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
}

export async function updateProfile(patch: { display_name?: string; grade?: number | null; lang?: Lang }) {
  const id = useAuth.getState().profile?.id;
  if (!id) return;
  const { error } = await supabase.from('profiles').update(patch).eq('id', id);
  if (error) fail(error);
  await refreshProfile();
}

// ── Family and class links ───────────────────────────────────────────────

export async function myLinkCode(regenerate = false): Promise<string> {
  const { data, error } = await supabase.rpc('my_link_code', { regenerate });
  if (error) fail(error);
  return data as string;
}

export async function linkStudent(code: string): Promise<{ student_id: string; name: string }> {
  const { data, error } = await supabase.rpc('link_student', { p_code: code });
  if (error) fail(error);
  if (data?.error) fail(data.error);
  return data as { student_id: string; name: string };
}

export async function unlink(guardianId: string, studentId: string) {
  const { error } = await supabase
    .from('guardian_links')
    .delete()
    .eq('guardian_id', guardianId)
    .eq('student_id', studentId);
  if (error) fail(error);
}

export async function joinClass(code: string): Promise<{ class_id: string; name: string; grade: number }> {
  const { data, error } = await supabase.rpc('join_class', { p_code: code });
  if (error) fail(error);
  if (data?.error) fail(data.error);
  return data as { class_id: string; name: string; grade: number };
}

export async function leaveClass(classId: string) {
  const id = useAuth.getState().profile?.id;
  const { error } = await supabase.from('class_members').delete().eq('class_id', classId).eq('student_id', id!);
  if (error) fail(error);
}

export async function createClass(name: string, grade: number) {
  const { data, error } = await supabase
    .from('classes')
    .insert({ name: name.trim(), grade })
    .select('id, name, grade, join_code')
    .single();
  if (error) fail(error);
  return data as { id: string; name: string; grade: number; join_code: string };
}

export async function deleteClass(id: string) {
  const { error } = await supabase.from('classes').delete().eq('id', id);
  if (error) fail(error);
}

export async function removeStudent(classId: string, studentId: string) {
  const { error } = await supabase.from('class_members').delete().eq('class_id', classId).eq('student_id', studentId);
  if (error) fail(error);
}

export async function saveClassModule(input: {
  classId: string;
  title: string;
  subject: string;
  sourceName: string | null;
  sourceExcerpt?: string;
  summary: string;
  flashcards: ModuleFlashcard[];
  questions: ModuleQuestion[];
}): Promise<ClassModule> {
  const { data, error } = await supabase
    .from('class_modules')
    .insert({
      class_id: input.classId,
      title: input.title.trim().slice(0, 120),
      subject: input.subject.trim().slice(0, 40) || 'general',
      source_name: input.sourceName,
      // The column requires 1+ chars. Store a short excerpt only, never the full lesson file.
      source_excerpt:
        (input.sourceExcerpt?.trim() || input.summary.trim() || input.title.trim() || 'Lesson module').slice(0, 600),
      summary: input.summary,
      flashcards: input.flashcards,
      questions: input.questions,
      published: true,
    })
    .select('id, class_id, title, subject, source_name, summary, flashcards, questions, published, created_at')
    .single();
  if (error) fail(error);
  if (!data) throw new Error('Failed to save module.');
  return {
    id: data.id,
    classId: data.class_id,
    title: data.title,
    subject: data.subject,
    sourceName: data.source_name,
    summary: data.summary ?? '',
    flashcards: (data.flashcards ?? []) as ModuleFlashcard[],
    questions: (data.questions ?? []) as ModuleQuestion[],
    published: !!data.published,
    createdAt: data.created_at,
  };
}

export async function updateClassModule(mod: ClassModule) {
  const { error } = await supabase
    .from('class_modules')
    .update({
      title: mod.title.trim().slice(0, 120),
      subject: mod.subject.trim().slice(0, 40) || 'general',
      summary: mod.summary,
      flashcards: mod.flashcards,
      questions: mod.questions,
      updated_at: new Date().toISOString(),
    })
    .eq('id', mod.id);
  if (error) fail(error);
}

export async function updateClass(id: string, patch: { name?: string; grade?: number }) {
  if (patch.grade !== undefined && (!Number.isInteger(patch.grade) || patch.grade < 1 || patch.grade > 10)) {
    throw new Error('Choose a grade from 1 to 10.');
  }
  if (patch.name !== undefined && !patch.name.trim()) throw new Error('Class name is required.');
  const { error } = await supabase
    .from('classes')
    .update({ ...patch, ...(patch.name ? { name: patch.name.trim().slice(0, 60) } : {}) })
    .eq('id', id);
  if (error) fail(error);
}

export async function deleteClassModule(id: string) {
  const { error } = await supabase.from('class_modules').delete().eq('id', id);
  if (error) fail(error);
}

// ── Time requests and controls ───────────────────────────────────────────

export async function requestTime(minutes = 15) {
  const { data, error } = await supabase.from('time_requests').insert({ minutes }).select().single();
  if (error) fail(error);
  notify({ type: 'time_request', id: data.id });
  return data as { id: string; created_at: string; minutes: number; status: 'pending' };
}

export async function decideRequest(id: string, approve: boolean) {
  const { data, error } = await supabase.rpc('decide_request', { p_id: id, p_approve: approve });
  if (error) fail(error);
  notify({ type: 'request_decided', id });
  return data;
}

export async function requestAccountAction(kind: 'sign_out' | 'delete_account') {
  const { data, error } = await supabase.from('account_requests').insert({ kind }).select().single();
  if (error) fail(error);
  notify({ type: 'account_request', id: data.id });
  return data as { id: string; created_at: string; kind: 'sign_out' | 'delete_account'; status: 'pending' };
}

export async function decideAccountRequest(id: string, approve: boolean) {
  const { data, error } = await supabase.rpc('decide_account_request', { p_id: id, p_approve: approve });
  if (error) fail(error);
  notify({ type: 'account_request_decided', id });
  return data;
}

export async function completeAccountRequest(id: string) {
  const { data, error } = await supabase.rpc('complete_account_request', { p_id: id });
  if (error) fail(error);
  return data;
}

export async function approveDeleteStudentAccount(requestId: string) {
  const { data, error } = await supabase.functions.invoke('delete-account', { body: { requestId } });
  if (error) throw new Error(await functionError(error));
  return data as { deleted: boolean; studentId: string };
}

export async function setControls(
  studentId: string,
  patch: Partial<{
    lock_enabled: boolean;
    lock_now: boolean;
    lock_start: number;
    lock_end: number;
    unlock_until: string | null;
    late_alerts: boolean;
    scroll_limit: number | null;
    games_limit: number | null;
    break_interval_sec: number | null;
    social_enabled: boolean;
    chat_enabled: boolean;
  }>,
) {
  const me = useAuth.getState().profile?.id;
  const { error } = await supabase
    .from('guardian_controls')
    .upsert({ student_id: studentId, ...patch, updated_by: me, updated_at: new Date().toISOString() });
  if (error) fail(error);
  if ('lock_enabled' in patch || 'lock_now' in patch) notify({ type: 'lock_changed', studentId });
}

export async function setStudentSettings(
  studentId: string,
  patch: Partial<{
    bedtime_start: number;
    bedtime_end: number;
    bedtime_days: string;
    limit_style: string;
    paused: boolean;
  }>,
) {
  const { error } = await supabase
    .from('student_settings')
    .upsert({ student_id: studentId, ...patch, updated_at: new Date().toISOString() });
  if (error) fail(error);
}

// ── Notifications ────────────────────────────────────────────────────────

/** Fire-and-forget: a missed push never blocks the action that caused it. */
export function notify(body: Record<string, unknown>) {
  supabase.functions.invoke('notify', { body }).catch(() => {});
}

export async function registerPushToken(token: string, platform: 'ios' | 'android' | 'web') {
  const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: platform });
  if (error) fail(error);
}

export async function createDeviceToken(platform: 'ios' | 'android') {
  const { data, error } = await supabase.rpc('create_device_token', { p_platform: platform });
  if (error) fail(error);
  return data as string;
}

// ── Tutor ────────────────────────────────────────────────────────────────

export async function tutorExplain(
  questionId: string,
  wrongIndex: number,
  lang: Lang,
  variant: TutorVariant,
): Promise<TutorAnswer & { review: boolean }> {
  const { data, error } = await supabase.functions.invoke('tutor', {
    body: { mode: 'explain', questionId, wrongIndex, lang, variant },
  });
  if (error) throw new Error(await functionError(error));
  return data;
}

export async function tutorChat(
  questionId: string | null,
  lang: Lang,
  history: { me: string; reply: string }[],
  message: string,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('tutor', {
    body: { mode: 'chat', questionId, lang, history, message },
  });
  if (error) throw new Error(await functionError(error));
  return data.reply as string;
}

/** Records how the student answered a nudge the phone's monitor sent. */
export function respondToNudge(clientId: string, response: 'took' | 'snoozed' | 'followed' | 'requested') {
  const id = useAuth.getState().profile?.id;
  if (!id || !clientId) return;
  supabase
    .from('nudge_events')
    .update({ response })
    .eq('student_id', id)
    .eq('client_id', clientId)
    .then(
      () => {},
      () => {},
    );
}

/** Everything the server holds about the signed-in student, for "Download my data". */
export async function exportMyData() {
  const p = useAuth.getState().profile;
  if (!p) return {};
  const id = p.id;
  const q = <T>(r: PromiseLike<{ data: T | null }>) => Promise.resolve(r).then((x) => x.data);
  const [progress, mastery, attempts, usage, nudges, requests, tutor, links, classes, apps] = await Promise.all([
    q(supabase.from('progress').select('*').eq('student_id', id).maybeSingle()),
    q(supabase.from('mastery').select('skill_id, p, updated_at').eq('student_id', id)),
    q(
      supabase
        .from('attempts')
        .select('question_id, chosen, correct, seconds, context, created_at')
        .eq('student_id', id),
    ),
    q(supabase.from('usage_daily').select('*').eq('student_id', id)),
    q(supabase.from('nudge_events').select('at, level, reasons, response, source').eq('student_id', id)),
    q(supabase.from('time_requests').select('minutes, status, created_at, decided_at').eq('student_id', id)),
    q(
      supabase
        .from('tutor_answers')
        .select('question_id, lang, content, confidence, status, created_at')
        .eq('student_id', id),
    ),
    q(supabase.from('guardian_links').select('guardian_id, consent_at').eq('student_id', id)),
    q(supabase.from('class_members').select('class_id, joined_at').eq('student_id', id)),
    q(supabase.from('app_usage').select('day, label, category, minutes').eq('student_id', id)),
  ]);
  return {
    profile: { name: p.display_name, email: p.email, grade: p.grade, language: p.lang },
    progress,
    mastery,
    attempts,
    usage_daily: usage,
    minutes_per_app: apps,
    nudges,
    time_requests: requests,
    tutor_answers: tutor,
    guardians: links,
    classes,
    note: 'Stored: daily totals and minutes per app (shared with your linked guardians). Never collected: browsing, screens or what you type outside LearnShift chats.',
  };
}

// ── Kapuluan social, friends & chat ──────────────────────────────────────

export type SocialOverviewPayload = {
  myCode: string | null;
  socialEnabled: boolean;
  chatEnabled: boolean;
  friends: FriendProfile[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  classmates: ClassmateCandidate[];
  blockedIds: string[];
  conversations: ConversationSummary[];
};

type RawOverview = {
  my_code: string | null;
  social_enabled: boolean;
  chat_enabled: boolean;
  friends: {
    friendship_id: string;
    id: string;
    display_name: string;
    grade: number | null;
    accepted_at: string | null;
    dm_conversation_id: string | null;
  }[];
  incoming_requests: { id: string; user_id: string; display_name: string; grade: number | null; created_at: string }[];
  outgoing_requests: { id: string; user_id: string; display_name: string; grade: number | null; created_at: string }[];
  classmates: { id: string; display_name: string; grade: number | null; class_name: string }[];
  blocked_ids: string[];
  conversations: {
    id: string;
    kind: 'dm' | 'archipelago';
    archipelago_id: string | null;
    other_user_id: string | null;
    title: string;
    last_message: string | null;
    last_kind: MessageKind | null;
    last_sender: string | null;
    last_at: string;
    unread: number;
  }[];
};

export async function myFriendCode(regenerate = false): Promise<string> {
  const { data, error } = await supabase.rpc('my_friend_code', { regenerate });
  if (error) fail(error);
  return data as string;
}

export async function getSocialOverview(): Promise<SocialOverviewPayload> {
  const { data, error } = await supabase.rpc('get_social_overview');
  if (error) fail(error);
  const raw = data as RawOverview;
  return {
    myCode: raw.my_code,
    socialEnabled: raw.social_enabled,
    chatEnabled: raw.chat_enabled,
    friends: (raw.friends ?? []).map((f) => ({
      friendshipId: f.friendship_id,
      id: f.id,
      displayName: f.display_name,
      grade: f.grade,
      acceptedAt: f.accepted_at,
      dmConversationId: f.dm_conversation_id,
    })),
    incomingRequests: (raw.incoming_requests ?? []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      displayName: r.display_name,
      grade: r.grade,
      createdAt: r.created_at,
    })),
    outgoingRequests: (raw.outgoing_requests ?? []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      displayName: r.display_name,
      grade: r.grade,
      createdAt: r.created_at,
    })),
    classmates: (raw.classmates ?? []).map((c) => ({
      id: c.id,
      displayName: c.display_name,
      grade: c.grade,
      className: c.class_name,
    })),
    blockedIds: raw.blocked_ids ?? [],
    conversations: (raw.conversations ?? []).map((cv) => ({
      id: cv.id,
      kind: cv.kind,
      archipelagoId: cv.archipelago_id,
      otherUserId: cv.other_user_id,
      title: cv.title,
      lastMessage: cv.last_message,
      lastKind: cv.last_kind,
      lastSender: cv.last_sender,
      lastAt: cv.last_at,
      unread: cv.unread ?? 0,
    })),
  };
}

export async function sendFriendRequestByCode(code: string) {
  const { data, error } = await supabase.rpc('send_friend_request_by_code', { p_code: code });
  if (error) fail(error);
  const res = data as { id: string; status: 'pending' | 'accepted'; friend_id: string; display_name: string };
  if (res.status === 'pending') notify({ type: 'friend_request', id: res.id });
  else if (res.status === 'accepted') notify({ type: 'friend_accepted', id: res.id });
  return res;
}

export async function sendFriendRequest(targetId: string) {
  const { data, error } = await supabase.rpc('send_friend_request', { p_target_id: targetId });
  if (error) fail(error);
  const res = data as { id: string; status: 'pending' | 'accepted'; friend_id: string; display_name: string };
  if (res.status === 'pending') notify({ type: 'friend_request', id: res.id });
  else if (res.status === 'accepted') notify({ type: 'friend_accepted', id: res.id });
  return res;
}

export async function respondFriendRequest(friendshipId: string, accept: boolean) {
  const { data, error } = await supabase.rpc('respond_friend_request', {
    p_friendship_id: friendshipId,
    p_accept: accept,
  });
  if (error) fail(error);
  const res = data as { id: string; status: string; conversation_id: string | null };
  if (accept) notify({ type: 'friend_accepted', id: friendshipId });
  return res;
}

export async function removeFriend(friendId: string) {
  const { error } = await supabase.rpc('remove_friend', { p_friend_id: friendId });
  if (error) fail(error);
}

export async function blockUser(targetId: string) {
  const { error } = await supabase.rpc('block_user', { p_target_id: targetId });
  if (error) fail(error);
}

export async function unblockUser(targetId: string) {
  const { error } = await supabase.rpc('unblock_user', { p_target_id: targetId });
  if (error) fail(error);
}

export async function reportUser(
  targetId: string | null,
  reason: 'bullying' | 'profanity' | 'spam' | 'inappropriate' | 'other',
  details = '',
  messageId: string | null = null,
) {
  const { data, error } = await supabase.rpc('report_user', {
    p_target_id: targetId,
    p_reason: reason,
    p_details: details,
    p_message_id: messageId,
  });
  if (error) fail(error);
  return data as string;
}

export async function openDmConversation(friendId: string): Promise<string> {
  const { data, error } = await supabase.rpc('open_dm_conversation', { p_friend_id: friendId });
  if (error) fail(error);
  return data as string;
}

export async function fetchMessages(conversationId: string, limit = 60): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, sender_label, kind, body, meta, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) fail(error);
  return (data ?? []).reverse().map((m) => ({
    id: m.id as string,
    conversationId: m.conversation_id as string,
    senderId: (m.sender_id as string | null) ?? null,
    senderLabel: m.sender_label as string,
    kind: m.kind as MessageKind,
    body: m.body as string,
    meta: (m.meta as Record<string, unknown>) ?? {},
    createdAt: m.created_at as string,
  }));
}

export async function sendChatMessage(
  conversationId: string,
  body: string,
  kind: Exclude<MessageKind, 'system'> = 'text',
  meta: Record<string, unknown> = {},
): Promise<ChatMessage> {
  const { data, error } = await supabase.rpc('send_message', {
    p_conversation_id: conversationId,
    p_body: body,
    p_kind: kind,
    p_meta: meta,
  });
  if (error) fail(error);
  const m = data as {
    id: string;
    conversation_id: string;
    sender_id: string | null;
    sender_label: string;
    kind: MessageKind;
    body: string;
    meta: Record<string, unknown>;
    created_at: string;
  };
  notify({ type: 'chat_message', id: m.id });
  return {
    id: m.id,
    conversationId: m.conversation_id,
    senderId: m.sender_id,
    senderLabel: m.sender_label,
    kind: m.kind,
    body: m.body,
    meta: m.meta ?? {},
    createdAt: m.created_at,
  };
}

export async function markConversationRead(conversationId: string) {
  await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
}

type RawArchPayload = {
  archipelagos: {
    id: string;
    name: string;
    created_at: string;
    streak_days: number;
    best_streak: number;
    today_complete: boolean;
    freeze_available: boolean;
    freeze_used_this_week: boolean;
    freeze_used_day: string | null;
    conversation_id: string | null;
    members: {
      student_id: string;
      is_me: boolean;
      role: 'owner' | 'member';
      display_name: string;
      grade: number | null;
      built: BuildingId[];
      goal_met_today: boolean;
      breaks_7d: number;
      agos_7d: number;
      improvement_delta: number;
      drift_level: number;
      tide_band: TideBand;
      is_lighthouse_leader: boolean;
      is_most_improved: boolean;
    }[];
    recent_sagwans: {
      id: string;
      sender_id: string;
      sender_name: string;
      recipient_id: string;
      recipient_name: string;
      message: string;
      created_at: string;
    }[];
  }[];
  incoming_invites: {
    id: string;
    archipelago_id: string;
    archipelago_name: string;
    inviter_id: string;
    inviter_name: string;
    member_count: number;
    streak_days: number;
    created_at: string;
  }[];
  sagwan_sent_today: number;
  sagwan_daily_limit: number;
};

export async function getMyArchipelagos(): Promise<{
  archipelagos: Archipelago[];
  incomingInvites: ArchipelagoInvite[];
  sagwanSentToday: number;
  sagwanDailyLimit: number;
}> {
  const { data, error } = await supabase.rpc('get_my_archipelagos');
  if (error) fail(error);
  const raw = data as RawArchPayload;
  return {
    archipelagos: (raw.archipelagos ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      createdAt: a.created_at,
      streakDays: a.streak_days ?? 0,
      bestStreak: a.best_streak ?? 0,
      todayComplete: !!a.today_complete,
      freezeAvailable: !!a.freeze_available,
      freezeUsedThisWeek: !!a.freeze_used_this_week,
      freezeUsedDay: a.freeze_used_day ?? null,
      conversationId: a.conversation_id ?? null,
      members: (a.members ?? []).map((m) => ({
        studentId: m.student_id,
        isMe: !!m.is_me,
        role: m.role,
        displayName: m.display_name,
        grade: m.grade,
        built: (m.built?.length ? m.built : ['bahay']) as BuildingId[],
        goalMetToday: !!m.goal_met_today,
        breaks7d: m.breaks_7d ?? 0,
        agos7d: Number(m.agos_7d ?? 0),
        improvementDelta: Number(m.improvement_delta ?? 0),
        driftLevel: Number(m.drift_level ?? 0),
        tideBand: m.tide_band ?? 'calm',
        isLighthouseLeader: !!m.is_lighthouse_leader,
        isMostImproved: !!m.is_most_improved,
      })),
      recentSagwans: (a.recent_sagwans ?? []).map((s): SagwanNudge => ({
        id: s.id,
        senderId: s.sender_id,
        senderName: s.sender_name,
        recipientId: s.recipient_id,
        recipientName: s.recipient_name,
        message: s.message,
        createdAt: s.created_at,
      })),
    })),
    incomingInvites: (raw.incoming_invites ?? []).map((inv) => ({
      id: inv.id,
      archipelagoId: inv.archipelago_id,
      archipelagoName: inv.archipelago_name,
      inviterId: inv.inviter_id,
      inviterName: inv.inviter_name,
      memberCount: inv.member_count ?? 1,
      streakDays: inv.streak_days ?? 0,
      createdAt: inv.created_at,
    })),
    sagwanSentToday: raw.sagwan_sent_today ?? 0,
    sagwanDailyLimit: raw.sagwan_daily_limit ?? 5,
  };
}

export async function createArchipelago(name: string, friendIds: string[] = []) {
  const { data, error } = await supabase.rpc('create_archipelago', {
    p_name: name,
    p_friend_ids: friendIds,
  });
  if (error) fail(error);
  const created = data as { id: string; name: string; conversation_id: string; invited_count: number };
  if (created.invited_count > 0) {
    const { data: invites } = await supabase
      .from('archipelago_invites')
      .select('id')
      .eq('archipelago_id', created.id)
      .eq('status', 'pending');
    for (const inv of invites ?? []) notify({ type: 'archipelago_invite', id: inv.id });
  }
  return created;
}

export async function inviteToArchipelago(archipelagoId: string, friendId: string) {
  const { data, error } = await supabase.rpc('invite_to_archipelago', {
    p_archipelago_id: archipelagoId,
    p_friend_id: friendId,
  });
  if (error) fail(error);
  const res = data as { id: string; archipelago_id: string; invitee_id: string; status: string };
  notify({ type: 'archipelago_invite', id: res.id });
  return res;
}

export async function respondArchipelagoInvite(inviteId: string, accept: boolean) {
  const { data, error } = await supabase.rpc('respond_archipelago_invite', {
    p_invite_id: inviteId,
    p_accept: accept,
  });
  if (error) fail(error);
  const res = data as { id: string; archipelago_id: string; status: string; conversation_id?: string | null };
  if (accept) notify({ type: 'archipelago_accepted', archipelagoId: res.archipelago_id });
  return res;
}

export async function leaveArchipelago(archipelagoId: string) {
  const { error } = await supabase.rpc('leave_archipelago', { p_archipelago_id: archipelagoId });
  if (error) fail(error);
}

export async function sendSagwan(archipelagoId: string, recipientId: string, message = "Kaya mo 'yan!") {
  const { data, error } = await supabase.rpc('send_sagwan', {
    p_archipelago_id: archipelagoId,
    p_recipient_id: recipientId,
    p_message: message,
  });
  if (error) fail(error);
  const res = data as {
    id: string;
    archipelago_id: string;
    sender_id: string;
    recipient_id: string;
    message: string;
    created_at: string;
  };
  notify({ type: 'sagwan', id: res.id });
  return res;
}

export async function guardianChildFriends(studentId: string) {
  const { data, error } = await supabase.rpc('guardian_child_friends', { p_student_id: studentId });
  if (error) fail(error);
  return (data ?? []) as { id: string; display_name: string; grade: number | null; accepted_at: string | null }[];
}
