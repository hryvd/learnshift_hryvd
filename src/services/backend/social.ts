/**
 * Kapuluan social store: friends, friend codes, blocks, moderated chat,
 * archipelagos (barkada streak pacts), Agos tides, and Sagwan nudges.
 * Supports both real Supabase accounts (with AsyncStorage cache + Realtime)
 * and the offline IS_PITCH demo build.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { create } from 'zustand';

import {
  createPitchSocialSeed,
  type Archipelago,
  type ArchipelagoInvite,
  type ChatMessage,
  type ClassmateCandidate,
  type ConversationSummary,
  type FriendProfile,
  type FriendRequest,
  type MessageKind,
} from '@/data/kapuluan';
import { IS_PITCH } from '@/lib/config';
import { checkProfanity } from '@/lib/profanity';
import { supabase } from '@/lib/supabase';
import * as api from '@/services/backend/api';
import { useAppStore } from '@/store/useAppStore';
import { useAuth } from '@/store/useAuth';

export type SocialState = {
  loading: boolean;
  error: string | null;
  myCode: string | null;
  socialEnabled: boolean;
  chatEnabled: boolean;
  friends: FriendProfile[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  classmates: ClassmateCandidate[];
  blockedIds: string[];
  conversations: ConversationSummary[];
  messagesByConv: Record<string, ChatMessage[]>;
  archipelagos: Archipelago[];
  incomingInvites: ArchipelagoInvite[];
  selectedArchipelagoId: string | null;
  sagwanSentToday: number;
  sagwanDailyLimit: number;
  pendingCeremony: { archipelagoId: string; name: string } | null;
  welcomeBackName: string | null;
  selectArchipelago: (id: string) => void;
  consumeCeremony: () => void;
  consumeWelcomeBack: () => void;
};

const emptyState = (): Omit<SocialState, 'selectArchipelago' | 'consumeCeremony' | 'consumeWelcomeBack'> => {
  if (IS_PITCH) {
    const seed = createPitchSocialSeed();
    const g = useAppStore.getState().guardian;
    return {
      loading: false,
      error: null,
      myCode: seed.myCode,
      socialEnabled: g.socialEnabled ?? true,
      chatEnabled: (g.socialEnabled ?? true) && (g.chatEnabled ?? true),
      friends: seed.friends,
      incomingRequests: seed.incomingRequests,
      outgoingRequests: seed.outgoingRequests,
      classmates: seed.classmates,
      blockedIds: [],
      conversations: seed.conversations,
      messagesByConv: seed.messagesByConv,
      archipelagos: seed.archipelagos,
      incomingInvites: seed.incomingInvites,
      selectedArchipelagoId: seed.archipelagos[0]?.id ?? null,
      sagwanSentToday: 1,
      sagwanDailyLimit: 5,
      pendingCeremony: null,
      welcomeBackName: null,
    };
  }
  return {
    loading: false,
    error: null,
    myCode: null,
    socialEnabled: true,
    chatEnabled: true,
    friends: [],
    incomingRequests: [],
    outgoingRequests: [],
    classmates: [],
    blockedIds: [],
    conversations: [],
    messagesByConv: {},
    archipelagos: [],
    incomingInvites: [],
    selectedArchipelagoId: null,
    sagwanSentToday: 0,
    sagwanDailyLimit: 5,
    pendingCeremony: null,
    welcomeBackName: null,
  };
};

export const useSocial = create<SocialState>()((set) => ({
  ...emptyState(),
  selectArchipelago: (selectedArchipelagoId) => set({ selectedArchipelagoId }),
  consumeCeremony: () => set({ pendingCeremony: null }),
  consumeWelcomeBack: () => set({ welcomeBackName: null }),
}));

const cacheKey = (userId: string) => `learnshift-social-${userId}`;

async function saveCache(userId: string) {
  const s = useSocial.getState();
  try {
    await AsyncStorage.setItem(
      cacheKey(userId),
      JSON.stringify({
        myCode: s.myCode,
        socialEnabled: s.socialEnabled,
        chatEnabled: s.chatEnabled,
        friends: s.friends,
        incomingRequests: s.incomingRequests,
        outgoingRequests: s.outgoingRequests,
        classmates: s.classmates,
        blockedIds: s.blockedIds,
        conversations: s.conversations,
        archipelagos: s.archipelagos,
        incomingInvites: s.incomingInvites,
      }),
    );
  } catch {
    // Ignore cache write errors
  }
}

async function restoreCache(userId: string) {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId));
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<SocialState>;
    useSocial.setState((prev) => ({
      ...prev,
      ...parsed,
      selectedArchipelagoId: prev.selectedArchipelagoId ?? parsed.archipelagos?.[0]?.id ?? null,
    }));
  } catch {
    // Ignore corrupt cache
  }
}

export function resetSocial() {
  useSocial.setState(emptyState());
}

/** Syncs guardian social/chat flags in IS_PITCH mode cleanly. */
function syncPitchGuardianFlags() {
  if (!IS_PITCH) return;
  const g = useAppStore.getState().guardian;
  useSocial.setState({
    socialEnabled: g.socialEnabled ?? true,
    chatEnabled: (g.socialEnabled ?? true) && (g.chatEnabled ?? true),
  });
}

let prevDriftingIds = new Set<string>();

export async function loadSocial(silent = false): Promise<void> {
  if (IS_PITCH) {
    syncPitchGuardianFlags();
    return;
  }
  const profile = useAuth.getState().profile;
  if (!profile || profile.role !== 'student') return;

  if (!silent) useSocial.setState({ loading: true, error: null });
  try {
    const [overview, kap] = await Promise.all([api.getSocialOverview(), api.getMyArchipelagos()]);

    // Detect if a friend who was drifting recovered cleanly -> welcome-back moment!
    let recoveredName: string | null = null;
    const nextDrifting = new Set<string>();
    for (const arch of kap.archipelagos) {
      for (const m of arch.members) {
        if (m.driftLevel >= 0.25) nextDrifting.add(m.studentId);
        else if (!m.isMe && prevDriftingIds.has(m.studentId)) {
          recoveredName = m.displayName.split(' ')[0];
        }
      }
    }
    prevDriftingIds = nextDrifting;

    // Preserve barkada names on archipelago conversations cleanly.
    const archNameById = new Map(kap.archipelagos.map((a) => [a.id, a.name]));
    const conversations = overview.conversations.map((cv) =>
      cv.kind === 'archipelago' && cv.archipelagoId
        ? { ...cv, title: archNameById.get(cv.archipelagoId) ?? cv.title }
        : cv,
    );

    const prevSel = useSocial.getState().selectedArchipelagoId;
    const validSel = kap.archipelagos.some((a) => a.id === prevSel) ? prevSel : (kap.archipelagos[0]?.id ?? null);

    useSocial.setState((s) => ({
      loading: false,
      error: null,
      myCode: overview.myCode,
      socialEnabled: overview.socialEnabled,
      chatEnabled: overview.chatEnabled,
      friends: overview.friends,
      incomingRequests: overview.incomingRequests,
      outgoingRequests: overview.outgoingRequests,
      classmates: overview.classmates,
      blockedIds: overview.blockedIds,
      conversations,
      archipelagos: kap.archipelagos,
      incomingInvites: kap.incomingInvites,
      selectedArchipelagoId: validSel,
      sagwanSentToday: kap.sagwanSentToday,
      sagwanDailyLimit: kap.sagwanDailyLimit,
      welcomeBackName: recoveredName ?? s.welcomeBackName,
    }));
    void saveCache(profile.id);
  } catch (e) {
    useSocial.setState({ loading: false, error: (e as Error).message });
  }
}

export async function regenerateFriendCode(): Promise<string> {
  if (IS_PITCH) {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    useSocial.setState({ myCode: code });
    return code;
  }
  const code = await api.myFriendCode(true);
  useSocial.setState({ myCode: code });
  return code;
}

export async function sendFriendRequestByCode(code: string): Promise<'pending' | 'accepted'> {
  if (IS_PITCH) {
    const clean = code.trim().toUpperCase();
    if (clean.length !== 6) throw new Error('Enter a 6-character friend code.');
    const id = `pitch-code-${clean}`;
    const newReq: FriendRequest = {
      id: `req-${Date.now()}`,
      userId: id,
      displayName: `Friend ${clean.slice(0, 3)}`,
      grade: 8,
      createdAt: new Date().toISOString(),
    };
    useSocial.setState((s) => ({ outgoingRequests: [newReq, ...s.outgoingRequests] }));
    return 'pending';
  }
  const res = await api.sendFriendRequestByCode(code);
  await loadSocial(true);
  return res.status;
}

export async function sendFriendRequestToUser(targetId: string): Promise<'pending' | 'accepted'> {
  if (IS_PITCH) {
    const cm = useSocial.getState().classmates.find((c) => c.id === targetId);
    if (!cm) throw new Error('Classmate not found.');
    useSocial.setState((s) => ({
      classmates: s.classmates.filter((c) => c.id !== targetId),
      outgoingRequests: [
        {
          id: `req-${Date.now()}`,
          userId: cm.id,
          displayName: cm.displayName,
          grade: cm.grade,
          createdAt: new Date().toISOString(),
        },
        ...s.outgoingRequests,
      ],
    }));
    return 'pending';
  }
  const res = await api.sendFriendRequest(targetId);
  await loadSocial(true);
  return res.status;
}

export async function respondFriendRequest(friendshipId: string, accept: boolean): Promise<void> {
  if (IS_PITCH) {
    useSocial.setState((s) => {
      const req = s.incomingRequests.find((r) => r.id === friendshipId);
      const nextIn = s.incomingRequests.filter((r) => r.id !== friendshipId);
      if (!accept || !req) return { incomingRequests: nextIn };
      const convId = `conv-dm-${req.userId}`;
      const friend: FriendProfile = {
        friendshipId,
        id: req.userId,
        displayName: req.displayName,
        grade: req.grade,
        acceptedAt: new Date().toISOString(),
        dmConversationId: convId,
      };
      const conv: ConversationSummary = {
        id: convId,
        kind: 'dm',
        archipelagoId: null,
        otherUserId: req.userId,
        title: req.displayName,
        lastMessage: null,
        lastKind: null,
        lastSender: null,
        lastAt: new Date().toISOString(),
        unread: 0,
      };
      return {
        incomingRequests: nextIn,
        friends: [...s.friends, friend],
        conversations: [conv, ...s.conversations],
      };
    });
    return;
  }
  await api.respondFriendRequest(friendshipId, accept);
  await loadSocial(true);
}

export async function removeFriend(friendId: string): Promise<void> {
  if (IS_PITCH) {
    useSocial.setState((s) => ({ friends: s.friends.filter((f) => f.id !== friendId) }));
    return;
  }
  await api.removeFriend(friendId);
  await loadSocial(true);
}

export async function blockUser(targetId: string): Promise<void> {
  if (IS_PITCH) {
    useSocial.setState((s) => ({
      blockedIds: s.blockedIds.includes(targetId) ? s.blockedIds : [...s.blockedIds, targetId],
      friends: s.friends.filter((f) => f.id !== targetId),
      incomingRequests: s.incomingRequests.filter((r) => r.userId !== targetId),
      conversations: s.conversations.filter((c) => c.otherUserId !== targetId),
      archipelagos: s.archipelagos.map((a) => ({
        ...a,
        members: a.members.filter((m) => m.studentId !== targetId),
      })),
    }));
    return;
  }
  await api.blockUser(targetId);
  await loadSocial(true);
}

export async function unblockUser(targetId: string): Promise<void> {
  if (IS_PITCH) {
    useSocial.setState((s) => ({ blockedIds: s.blockedIds.filter((id) => id !== targetId) }));
    return;
  }
  await api.unblockUser(targetId);
  await loadSocial(true);
}

export async function reportUser(
  targetId: string | null,
  reason: 'bullying' | 'profanity' | 'spam' | 'inappropriate' | 'other',
  details = '',
  messageId: string | null = null,
): Promise<void> {
  if (IS_PITCH) return;
  await api.reportUser(targetId, reason, details, messageId);
}

export async function openDmWithFriend(friendId: string): Promise<string> {
  if (IS_PITCH) {
    const s = useSocial.getState();
    const existing = s.conversations.find((c) => c.kind === 'dm' && c.otherUserId === friendId);
    if (existing) return existing.id;
    const friend = s.friends.find((f) => f.id === friendId);
    const id = `conv-dm-${friendId}`;
    useSocial.setState({
      conversations: [
        {
          id,
          kind: 'dm',
          archipelagoId: null,
          otherUserId: friendId,
          title: friend?.displayName ?? 'Friend',
          lastMessage: null,
          lastKind: null,
          lastSender: null,
          lastAt: new Date().toISOString(),
          unread: 0,
        },
        ...s.conversations,
      ],
    });
    return id;
  }
  const convId = await api.openDmConversation(friendId);
  await loadSocial(true);
  return convId;
}

export async function loadConversationMessages(conversationId: string): Promise<void> {
  if (IS_PITCH) {
    useSocial.setState((s) => ({
      conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c)),
    }));
    return;
  }
  const msgs = await api.fetchMessages(conversationId);
  useSocial.setState((s) => ({
    messagesByConv: { ...s.messagesByConv, [conversationId]: msgs },
    conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c)),
  }));
  void api.markConversationRead(conversationId).catch(() => {});
}

export async function sendConversationMessage(
  conversationId: string,
  body: string,
  kind: Exclude<MessageKind, 'system'> = 'text',
  meta: Record<string, unknown> = {},
): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error('Message cannot be empty.');
  if (kind === 'text' && !checkProfanity(trimmed).ok) {
    throw new Error('Please keep messages kind and respectful.');
  }

  const meId = IS_PITCH ? 'pitch-me' : (useAuth.getState().profile?.id ?? 'me');
  const myName = IS_PITCH ? 'Mika' : (useAuth.getState().profile?.display_name?.split(' ')[0] ?? 'You');
  const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const optimistic: ChatMessage = {
    id: tempId,
    conversationId,
    senderId: meId,
    senderLabel: myName,
    kind,
    body: trimmed,
    meta,
    createdAt: new Date().toISOString(),
    pending: !IS_PITCH,
  };

  useSocial.setState((s) => ({
    messagesByConv: {
      ...s.messagesByConv,
      [conversationId]: [...(s.messagesByConv[conversationId] ?? []), optimistic],
    },
    conversations: s.conversations.map((c) =>
      c.id === conversationId
        ? { ...c, lastMessage: trimmed, lastKind: kind, lastSender: myName, lastAt: optimistic.createdAt }
        : c,
    ),
  }));

  if (IS_PITCH) return;

  try {
    const saved = await api.sendChatMessage(conversationId, trimmed, kind, meta);
    useSocial.setState((s) => ({
      messagesByConv: {
        ...s.messagesByConv,
        [conversationId]: (s.messagesByConv[conversationId] ?? []).map((m) => (m.id === tempId ? saved : m)),
      },
    }));
  } catch (e) {
    // Roll back optimistic bubble cleanly when server rejects or network fails.
    useSocial.setState((s) => ({
      messagesByConv: {
        ...s.messagesByConv,
        [conversationId]: (s.messagesByConv[conversationId] ?? []).filter((m) => m.id !== tempId),
      },
    }));
    throw e;
  }
}

export async function createArchipelago(name: string, friendIds: string[]): Promise<string> {
  const clean = name.trim();
  if (!clean) throw new Error('Give your barkada pact a name.');
  if (!checkProfanity(clean).ok) throw new Error('Choose a friendly barkada name.');

  if (IS_PITCH) {
    const id = `arch-${Date.now()}`;
    const convId = `conv-${id}`;
    const selectedFriends = useSocial
      .getState()
      .friends.filter((f) => friendIds.includes(f.id))
      .slice(0, 4);
    const built = useAppStore.getState().built;
    const members: Archipelago['members'] = [
      {
        studentId: 'pitch-me',
        isMe: true,
        role: 'owner',
        displayName: 'Mika',
        grade: 8,
        built,
        goalMetToday: true,
        breaks7d: 7,
        agos7d: 82,
        improvementDelta: 8,
        driftLevel: 0,
        tideBand: 'riding_high',
        isLighthouseLeader: true,
        isMostImproved: false,
      },
      ...selectedFriends.map((f) => ({
        studentId: f.id,
        isMe: false,
        role: 'member' as const,
        displayName: f.displayName,
        grade: f.grade,
        built: ['bahay', 'mango', 'sarisari'] as Archipelago['members'][number]['built'],
        goalMetToday: true,
        breaks7d: 5,
        agos7d: 72,
        improvementDelta: 4,
        driftLevel: 0,
        tideBand: 'steady' as const,
        isLighthouseLeader: false,
        isMostImproved: false,
      })),
    ];
    const newArch: Archipelago = {
      id,
      name: clean,
      createdAt: new Date().toISOString(),
      streakDays: 1,
      bestStreak: 1,
      todayComplete: true,
      freezeAvailable: true,
      freezeUsedThisWeek: false,
      freezeUsedDay: null,
      conversationId: convId,
      members,
      recentSagwans: [],
    };
    useSocial.setState((s) => ({
      archipelagos: [...s.archipelagos, newArch],
      selectedArchipelagoId: id,
      pendingCeremony: { archipelagoId: id, name: clean },
      conversations: [
        {
          id: convId,
          kind: 'archipelago',
          archipelagoId: id,
          otherUserId: null,
          title: clean,
          lastMessage: null,
          lastKind: null,
          lastSender: null,
          lastAt: new Date().toISOString(),
          unread: 0,
        },
        ...s.conversations,
      ],
    }));
    return id;
  }

  const res = await api.createArchipelago(clean, friendIds);
  await loadSocial(true);
  useSocial.setState({
    selectedArchipelagoId: res.id,
    pendingCeremony: { archipelagoId: res.id, name: res.name },
  });
  return res.id;
}

export async function inviteFriendToArchipelago(archipelagoId: string, friendId: string): Promise<void> {
  if (IS_PITCH) {
    const f = useSocial.getState().friends.find((x) => x.id === friendId);
    if (!f) return;
    useSocial.setState((s) => ({
      archipelagos: s.archipelagos.map((a) =>
        a.id === archipelagoId && a.members.length < 5 && !a.members.some((m) => m.studentId === friendId)
          ? {
              ...a,
              members: [
                ...a.members,
                {
                  studentId: f.id,
                  isMe: false,
                  role: 'member',
                  displayName: f.displayName,
                  grade: f.grade,
                  built: ['bahay', 'mango'],
                  goalMetToday: false,
                  breaks7d: 4,
                  agos7d: 58,
                  improvementDelta: 2,
                  driftLevel: 0.12,
                  tideBand: 'steady',
                  isLighthouseLeader: false,
                  isMostImproved: false,
                },
              ],
            }
          : a,
      ),
    }));
    return;
  }
  await api.inviteToArchipelago(archipelagoId, friendId);
  await loadSocial(true);
}

export async function respondArchipelagoInvite(inviteId: string, accept: boolean): Promise<void> {
  if (IS_PITCH) {
    const inv = useSocial.getState().incomingInvites.find((i) => i.id === inviteId);
    useSocial.setState((s) => ({
      incomingInvites: s.incomingInvites.filter((i) => i.id !== inviteId),
    }));
    if (!accept || !inv) return;
    const convId = `conv-${inv.archipelagoId}`;
    const newArch: Archipelago = {
      id: inv.archipelagoId,
      name: inv.archipelagoName,
      createdAt: new Date().toISOString(),
      streakDays: inv.streakDays,
      bestStreak: inv.streakDays,
      todayComplete: true,
      freezeAvailable: true,
      freezeUsedThisWeek: false,
      freezeUsedDay: null,
      conversationId: convId,
      members: [
        {
          studentId: 'pitch-me',
          isMe: true,
          role: 'member',
          displayName: 'Mika',
          grade: 8,
          built: useAppStore.getState().built,
          goalMetToday: true,
          breaks7d: 9,
          agos7d: 84,
          improvementDelta: 11,
          driftLevel: 0,
          tideBand: 'riding_high',
          isLighthouseLeader: false,
          isMostImproved: true,
        },
        {
          studentId: inv.inviterId,
          isMe: false,
          role: 'owner',
          displayName: inv.inviterName,
          grade: 8,
          built: ['bahay', 'mango', 'sarisari', 'school'],
          goalMetToday: true,
          breaks7d: 10,
          agos7d: 88,
          improvementDelta: 5,
          driftLevel: 0,
          tideBand: 'riding_high',
          isLighthouseLeader: true,
          isMostImproved: false,
        },
      ],
      recentSagwans: [],
    };
    useSocial.setState((s) => ({
      archipelagos: [...s.archipelagos, newArch],
      selectedArchipelagoId: newArch.id,
      pendingCeremony: { archipelagoId: newArch.id, name: newArch.name },
      conversations: [
        {
          id: convId,
          kind: 'archipelago',
          archipelagoId: newArch.id,
          otherUserId: null,
          title: newArch.name,
          lastMessage: 'Tulay bridge connected!',
          lastKind: 'system',
          lastSender: 'Mika',
          lastAt: new Date().toISOString(),
          unread: 0,
        },
        ...s.conversations,
      ],
    }));
    return;
  }

  const inv = useSocial.getState().incomingInvites.find((i) => i.id === inviteId);
  const res = await api.respondArchipelagoInvite(inviteId, accept);
  await loadSocial(true);
  if (accept && res.archipelago_id) {
    useSocial.setState({
      selectedArchipelagoId: res.archipelago_id,
      pendingCeremony: {
        archipelagoId: res.archipelago_id,
        name: inv?.archipelagoName ?? 'Kapuluan',
      },
    });
  }
}

export async function leaveArchipelago(archipelagoId: string): Promise<void> {
  if (IS_PITCH) {
    useSocial.setState((s) => {
      const next = s.archipelagos.filter((a) => a.id !== archipelagoId);
      return {
        archipelagos: next,
        selectedArchipelagoId: next[0]?.id ?? null,
      };
    });
    return;
  }
  await api.leaveArchipelago(archipelagoId);
  await loadSocial(true);
}

export async function throwSagwan(
  archipelagoId: string,
  recipientId: string,
  message = "Kaya mo 'yan!",
): Promise<void> {
  if (!checkProfanity(message).ok) throw new Error('Keep Sagwan cheers encouraging.');
  const state = useSocial.getState();
  if (state.sagwanSentToday >= state.sagwanDailyLimit) {
    throw new Error('You already sent 5 paddles today. More tomorrow!');
  }

  const arch = state.archipelagos.find((a) => a.id === archipelagoId);
  const recipient = arch?.members.find((m) => m.studentId === recipientId);
  const optimistic = {
    id: `sag-opt-${Date.now()}`,
    senderId: IS_PITCH ? 'pitch-me' : (useAuth.getState().profile?.id ?? 'me'),
    senderName: IS_PITCH ? 'Mika' : (useAuth.getState().profile?.display_name?.split(' ')[0] ?? 'You'),
    recipientId,
    recipientName: recipient?.displayName.split(' ')[0] ?? 'Friend',
    message,
    createdAt: new Date().toISOString(),
  };

  useSocial.setState((s) => ({
    sagwanSentToday: s.sagwanSentToday + 1,
    archipelagos: s.archipelagos.map((a) =>
      a.id === archipelagoId ? { ...a, recentSagwans: [optimistic, ...a.recentSagwans].slice(0, 12) } : a,
    ),
  }));

  if (IS_PITCH) return;
  try {
    await api.sendSagwan(archipelagoId, recipientId, message);
    await loadSocial(true);
  } catch (e) {
    useSocial.setState((s) => ({
      sagwanSentToday: Math.max(0, s.sagwanSentToday - 1),
      archipelagos: s.archipelagos.map((a) =>
        a.id === archipelagoId ? { ...a, recentSagwans: a.recentSagwans.filter((x) => x.id !== optimistic.id) } : a,
      ),
    }));
    throw e;
  }
}

/** Pitch-only helper: simulates Carlo completing his breaks and gliding back from drift. */
export function pitchSimulateCarloReturn() {
  if (!IS_PITCH) return;
  useSocial.setState((s) => ({
    welcomeBackName: 'Carlo',
    archipelagos: s.archipelagos.map((a) =>
      a.id !== 'arch-sampaguita'
        ? a
        : {
            ...a,
            streakDays: 7,
            bestStreak: 7,
            todayComplete: true,
            members: a.members.map((m) =>
              m.studentId !== 'pitch-carlo'
                ? m
                : {
                    ...m,
                    goalMetToday: true,
                    breaks7d: 6,
                    agos7d: 78,
                    improvementDelta: 18,
                    driftLevel: 0,
                    tideBand: 'riding_high',
                    isMostImproved: true,
                  },
            ),
          },
    ),
  }));
}

/** Starts social data loading and Supabase Realtime subscriptions for a signed-in student. */
export function startSocialSync(userId: string): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debouncedReload = () => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (!stopped) void loadSocial(true);
    }, 350);
  };

  void restoreCache(userId).then(() => {
    if (!stopped) void loadSocial(false);
  });

  const subscribe = () =>
    supabase
      .channel(`social-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'archipelagos' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'archipelago_members' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'archipelago_invites' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sagwan_nudges' }, debouncedReload)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'guardian_controls', filter: `student_id=eq.${userId}` },
        debouncedReload,
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const row = payload.new as {
          id: string;
          conversation_id: string;
          sender_id: string | null;
          sender_label: string;
          kind: MessageKind;
          body: string;
          meta: Record<string, unknown>;
          created_at: string;
        };
        if (!row?.id || !row.conversation_id) return;
        if (row.sender_id && useSocial.getState().blockedIds.includes(row.sender_id)) return;
        const msg: ChatMessage = {
          id: row.id,
          conversationId: row.conversation_id,
          senderId: row.sender_id,
          senderLabel: row.sender_label,
          kind: row.kind,
          body: row.body,
          meta: row.meta ?? {},
          createdAt: row.created_at,
        };
        useSocial.setState((s) => {
          const list = s.messagesByConv[row.conversation_id] ?? [];
          if (list.some((m) => m.id === msg.id)) return s;
          return {
            messagesByConv: { ...s.messagesByConv, [row.conversation_id]: [...list, msg] },
            conversations: s.conversations.map((c) =>
              c.id === row.conversation_id
                ? {
                    ...c,
                    lastMessage: msg.body,
                    lastKind: msg.kind,
                    lastSender: msg.senderLabel,
                    lastAt: msg.createdAt,
                    unread: msg.senderId === userId ? c.unread : c.unread + 1,
                  }
                : c,
            ),
          };
        });
      })
      .subscribe();

  let channel = subscribe();
  let hiddenAt: number | null = null;
  const appState = AppState.addEventListener('change', (st) => {
    if (st !== 'active') {
      hiddenAt ??= Date.now();
      return;
    }
    if (hiddenAt != null && Date.now() - hiddenAt > 5_000) {
      supabase.removeChannel(channel);
      channel = subscribe();
    }
    hiddenAt = null;
    debouncedReload();
  });

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    appState.remove();
    supabase.removeChannel(channel);
  };
}
