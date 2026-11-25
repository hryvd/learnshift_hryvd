import type { Expression } from '@/components/mascot/Paty';
import type { BuildingId } from '@/data/seed';
import type { LText } from '@/i18n/useT';

export type TideBand = 'riding_high' | 'steady' | 'calm' | 'drifting' | 'far_adrift';
export type BridgeTier = 'rope' | 'bamboo' | 'wood' | 'stone';
export type GroupBuildingId = 'bangka_dock' | 'tambayan' | 'fiesta_plaza' | 'court' | 'grand_parola';
export type MessageKind = 'text' | 'sticker' | 'phrase' | 'study_invite' | 'system';

export type FriendProfile = {
  friendshipId: string;
  id: string;
  displayName: string;
  grade: number | null;
  acceptedAt: string | null;
  dmConversationId: string | null;
};

export type FriendRequest = {
  id: string;
  userId: string;
  displayName: string;
  grade: number | null;
  createdAt: string;
};

export type ClassmateCandidate = {
  id: string;
  displayName: string;
  grade: number | null;
  className: string;
};

export type ArchipelagoMember = {
  studentId: string;
  isMe: boolean;
  role: 'owner' | 'member';
  displayName: string;
  grade: number | null;
  built: BuildingId[];
  goalMetToday: boolean;
  breaks7d: number;
  agos7d: number;
  improvementDelta: number;
  driftLevel: number;
  tideBand: TideBand;
  isLighthouseLeader: boolean;
  isMostImproved: boolean;
};

export type SagwanNudge = {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  message: string;
  createdAt: string;
};

export type Archipelago = {
  id: string;
  name: string;
  createdAt: string;
  streakDays: number;
  bestStreak: number;
  todayComplete: boolean;
  freezeAvailable: boolean;
  freezeUsedThisWeek: boolean;
  freezeUsedDay: string | null;
  conversationId: string | null;
  members: ArchipelagoMember[];
  recentSagwans: SagwanNudge[];
};

export type ArchipelagoInvite = {
  id: string;
  archipelagoId: string;
  archipelagoName: string;
  inviterId: string;
  inviterName: string;
  memberCount: number;
  streakDays: number;
  createdAt: string;
};

export type ConversationSummary = {
  id: string;
  kind: 'dm' | 'archipelago';
  archipelagoId: string | null;
  otherUserId: string | null;
  title: string;
  lastMessage: string | null;
  lastKind: MessageKind | null;
  lastSender: string | null;
  lastAt: string;
  unread: number;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderLabel: string;
  kind: MessageKind;
  body: string;
  meta: Record<string, unknown>;
  createdAt: string;
  pending?: boolean;
};

export type GroupBuilding = {
  id: GroupBuildingId;
  unlockStreak: number;
  name: LText;
  desc: LText;
};

export const GROUP_BUILDINGS: GroupBuilding[] = [
  {
    id: 'bangka_dock',
    unlockStreak: 3,
    name: { en: 'Bangka Dock', fil: 'Pantalan ng Bangka' },
    desc: { en: '3-day Tulay streak', fil: '3 araw na Tulay' },
  },
  {
    id: 'tambayan',
    unlockStreak: 7,
    name: { en: 'Nipa Tambayan', fil: 'Kubong Tambayan' },
    desc: { en: '7-day Tulay streak', fil: '7 araw na Tulay' },
  },
  {
    id: 'fiesta_plaza',
    unlockStreak: 14,
    name: { en: 'Fiesta Plaza', fil: 'Plasa ng Pista' },
    desc: { en: '14-day Tulay streak', fil: '14 araw na Tulay' },
  },
  {
    id: 'court',
    unlockStreak: 30,
    name: { en: 'Barangay Court', fil: 'Basketbolan' },
    desc: { en: '30-day Tulay streak', fil: '30 araw na Tulay' },
  },
  {
    id: 'grand_parola',
    unlockStreak: 100,
    name: { en: 'Grand Parola', fil: 'Malaking Parola' },
    desc: { en: '100-day Tulay streak', fil: '100 araw na Tulay' },
  },
];

export const MAX_ISLANDS = 5;

export function bridgeTier(streakDays: number): BridgeTier {
  if (streakDays >= 30) return 'stone';
  if (streakDays >= 14) return 'wood';
  if (streakDays >= 7) return 'bamboo';
  return 'rope';
}

export function unlockedGroupBuildings(streakDays: number): GroupBuilding[] {
  return GROUP_BUILDINGS.filter((b) => streakDays >= b.unlockStreak);
}

export type PatySticker = {
  id: string;
  expression: Expression;
  label: LText;
};

export const PATY_STICKERS: PatySticker[] = [
  { id: 'cheer', expression: 'cheering', label: { en: "Kaya natin 'to!", fil: "Kaya natin 'to!" } },
  { id: 'study', expression: 'studying', label: { en: 'Lock in time', fil: 'Lock in na!' } },
  { id: 'proud', expression: 'proud', label: { en: 'Ace work!', fil: 'Ang galing!' } },
  { id: 'wave', expression: 'waving', label: { en: 'Study break?', fil: 'Tara, break!' } },
  { id: 'happy', expression: 'happy', label: { en: 'Tulay strong', fil: 'Matibay ang Tulay' } },
  { id: 'curious', expression: 'curious', label: { en: 'Help with math?', fil: 'Patulong sa math?' } },
];

export const QUICK_PHRASES: LText[] = [
  { en: "Kaya mo 'yan! One 45s break?", fil: "Kaya mo 'yan! Isang 45s break?" },
  { en: 'Nice job on today’s streak!', fil: 'Ang galing mo sa streak ngayon!' },
  { en: 'Paddle incoming — swim back!', fil: 'Sagwan papunta sa’yo — balik na!' },
  { en: 'Just finished my break!', fil: 'Katatapos ko lang ng break!' },
];

export const SAGWAN_CHEERS: LText[] = [
  { en: "Kaya mo 'yan!", fil: "Kaya mo 'yan!" },
  { en: 'Tara, 45s break!', fil: 'Tara, 45s break!' },
  { en: 'Lock in with us!', fil: 'Sabay tayo mag-lock in!' },
  { en: 'One break keeps the Tulay up!', fil: 'Isang break lang para sa Tulay!' },
];

export type PitchSeedData = {
  myCode: string;
  friends: FriendProfile[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  classmates: ClassmateCandidate[];
  archipelagos: Archipelago[];
  incomingInvites: ArchipelagoInvite[];
  conversations: ConversationSummary[];
  messagesByConv: Record<string, ChatMessage[]>;
};

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export function createPitchSocialSeed(): PitchSeedData {
  return {
    myCode: 'MK8SMP',
    friends: [
      {
        friendshipId: 'fr-tala',
        id: 'pitch-tala',
        displayName: 'Tala Reyes',
        grade: 8,
        acceptedAt: minsAgo(60 * 24 * 8),
        dmConversationId: 'conv-dm-tala',
      },
      {
        friendshipId: 'fr-carlo',
        id: 'pitch-carlo',
        displayName: 'Carlo Santos',
        grade: 8,
        acceptedAt: minsAgo(60 * 24 * 6),
        dmConversationId: 'conv-dm-carlo',
      },
      {
        friendshipId: 'fr-lia',
        id: 'pitch-lia',
        displayName: 'Lia Bautista',
        grade: 8,
        acceptedAt: minsAgo(60 * 24 * 16),
        dmConversationId: 'conv-dm-lia',
      },
    ],
    incomingRequests: [
      {
        id: 'req-marco',
        userId: 'pitch-marco',
        displayName: 'Marco Cruz',
        grade: 8,
        createdAt: minsAgo(42),
      },
    ],
    outgoingRequests: [],
    classmates: [
      { id: 'pitch-bea', displayName: 'Bea Mendoza', grade: 8, className: 'Grade 8 – Sampaguita' },
      { id: 'pitch-juan', displayName: 'Juan Dela Rosa', grade: 8, className: 'Grade 8 – Sampaguita' },
    ],
    archipelagos: [
      {
        id: 'arch-sampaguita',
        name: 'Sampaguita Barkada',
        createdAt: minsAgo(60 * 24 * 7),
        streakDays: 6,
        bestStreak: 6,
        todayComplete: false,
        freezeAvailable: true,
        freezeUsedThisWeek: false,
        freezeUsedDay: null,
        conversationId: 'conv-arch-sampaguita',
        members: [
          {
            studentId: 'pitch-me',
            isMe: true,
            role: 'owner',
            displayName: 'Mika',
            grade: 8,
            built: ['bahay', 'mango', 'sarisari', 'school', 'garden'],
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
            studentId: 'pitch-tala',
            isMe: false,
            role: 'member',
            displayName: 'Tala Reyes',
            grade: 8,
            built: ['bahay', 'mango', 'sarisari', 'school', 'garden', 'carabao', 'jeepney'],
            goalMetToday: true,
            breaks7d: 12,
            agos7d: 95,
            improvementDelta: 4,
            driftLevel: 0,
            tideBand: 'riding_high',
            isLighthouseLeader: true,
            isMostImproved: false,
          },
          {
            studentId: 'pitch-carlo',
            isMe: false,
            role: 'member',
            displayName: 'Carlo Santos',
            grade: 8,
            built: ['bahay', 'mango', 'sarisari'],
            goalMetToday: false,
            breaks7d: 2,
            agos7d: 24,
            improvementDelta: -8,
            driftLevel: 0.72,
            tideBand: 'far_adrift',
            isLighthouseLeader: false,
            isMostImproved: false,
          },
        ],
        recentSagwans: [
          {
            id: 'sag-1',
            senderId: 'pitch-tala',
            senderName: 'Tala',
            recipientId: 'pitch-carlo',
            recipientName: 'Carlo',
            message: "Kaya mo 'yan! 1 break keeps day 7 alive!",
            createdAt: minsAgo(25),
          },
        ],
      },
      {
        id: 'arch-math-duo',
        name: 'Math Duo',
        createdAt: minsAgo(60 * 24 * 16),
        streakDays: 15,
        bestStreak: 15,
        todayComplete: true,
        freezeAvailable: true,
        freezeUsedThisWeek: false,
        freezeUsedDay: null,
        conversationId: 'conv-arch-math',
        members: [
          {
            studentId: 'pitch-me',
            isMe: true,
            role: 'member',
            displayName: 'Mika',
            grade: 8,
            built: ['bahay', 'mango', 'sarisari', 'school', 'garden'],
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
            studentId: 'pitch-lia',
            isMe: false,
            role: 'owner',
            displayName: 'Lia Bautista',
            grade: 8,
            built: ['bahay', 'mango', 'sarisari', 'school', 'garden', 'carabao', 'library'],
            goalMetToday: true,
            breaks7d: 11,
            agos7d: 89,
            improvementDelta: 3,
            driftLevel: 0,
            tideBand: 'riding_high',
            isLighthouseLeader: true,
            isMostImproved: false,
          },
        ],
        recentSagwans: [],
      },
    ],
    incomingInvites: [
      {
        id: 'inv-weekend',
        archipelagoId: 'arch-weekend',
        archipelagoName: 'Weekend Reviewers',
        inviterId: 'pitch-lia',
        inviterName: 'Lia Bautista',
        memberCount: 2,
        streakDays: 4,
        createdAt: minsAgo(18),
      },
    ],
    conversations: [
      {
        id: 'conv-arch-sampaguita',
        kind: 'archipelago',
        archipelagoId: 'arch-sampaguita',
        otherUserId: null,
        title: 'Sampaguita Barkada',
        lastMessage: 'Carlo is drifting — throw him a Sagwan!',
        lastKind: 'text',
        lastSender: 'Tala',
        lastAt: minsAgo(14),
        unread: 1,
      },
      {
        id: 'conv-dm-tala',
        kind: 'dm',
        archipelagoId: null,
        otherUserId: 'pitch-tala',
        title: 'Tala Reyes',
        lastMessage: 'Almost at our 7-day Bamboo bridge!',
        lastKind: 'text',
        lastSender: 'Tala',
        lastAt: minsAgo(36),
        unread: 0,
      },
      {
        id: 'conv-dm-carlo',
        kind: 'dm',
        archipelagoId: null,
        otherUserId: 'pitch-carlo',
        title: 'Carlo Santos',
        lastMessage: 'Wait lang haha opening fractions break now',
        lastKind: 'text',
        lastSender: 'Carlo',
        lastAt: minsAgo(90),
        unread: 0,
      },
      {
        id: 'conv-arch-math',
        kind: 'archipelago',
        archipelagoId: 'arch-math-duo',
        otherUserId: null,
        title: 'Math Duo',
        lastMessage: 'Fiesta Plaza unlocked!!',
        lastKind: 'text',
        lastSender: 'Lia',
        lastAt: minsAgo(240),
        unread: 0,
      },
    ],
    messagesByConv: {
      'conv-arch-sampaguita': [
        {
          id: 'm1',
          conversationId: 'conv-arch-sampaguita',
          senderId: 'pitch-tala',
          senderLabel: 'Tala',
          kind: 'sticker',
          body: "Kaya natin 'to!",
          meta: { stickerId: 'cheer', expression: 'cheering' },
          createdAt: minsAgo(60),
        },
        {
          id: 'm2',
          conversationId: 'conv-arch-sampaguita',
          senderId: 'pitch-me',
          senderLabel: 'Mika',
          kind: 'text',
          body: 'Finished my Fractions break na! 1 day left before our bamboo Tulay.',
          meta: {},
          createdAt: minsAgo(32),
        },
        {
          id: 'm3',
          conversationId: 'conv-arch-sampaguita',
          senderId: 'pitch-tala',
          senderLabel: 'Tala',
          kind: 'text',
          body: 'Carlo is drifting — throw him a Sagwan!',
          meta: {},
          createdAt: minsAgo(14),
        },
      ],
      'conv-dm-tala': [
        {
          id: 'm4',
          conversationId: 'conv-dm-tala',
          senderId: 'pitch-tala',
          senderLabel: 'Tala',
          kind: 'study_invite',
          body: 'Study break together? 45s Fractions reset!',
          meta: { skillId: 'fractions' },
          createdAt: minsAgo(48),
        },
        {
          id: 'm5',
          conversationId: 'conv-dm-tala',
          senderId: 'pitch-tala',
          senderLabel: 'Tala',
          kind: 'text',
          body: 'Almost at our 7-day Bamboo bridge!',
          meta: {},
          createdAt: minsAgo(36),
        },
      ],
      'conv-dm-carlo': [
        {
          id: 'm6',
          conversationId: 'conv-dm-carlo',
          senderId: 'pitch-me',
          senderLabel: 'Mika',
          kind: 'phrase',
          body: "Kaya mo 'yan! One 45s break?",
          meta: {},
          createdAt: minsAgo(110),
        },
        {
          id: 'm7',
          conversationId: 'conv-dm-carlo',
          senderId: 'pitch-carlo',
          senderLabel: 'Carlo',
          kind: 'text',
          body: 'Wait lang haha opening fractions break now',
          meta: {},
          createdAt: minsAgo(90),
        },
      ],
      'conv-arch-math': [
        {
          id: 'm8',
          conversationId: 'conv-arch-math',
          senderId: 'pitch-lia',
          senderLabel: 'Lia',
          kind: 'text',
          body: 'Fiesta Plaza unlocked!!',
          meta: {},
          createdAt: minsAgo(240),
        },
      ],
    },
  };
}
