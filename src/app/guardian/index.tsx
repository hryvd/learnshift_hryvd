import { useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BellRinging,
  CaretRight,
  CheckCircle,
  Clock,
  EyeSlash,
  GameController,
  GraduationCap,
  Lightning,
  LockSimple,
  Moon,
  Play,
  SignOut,
  Sparkle,
  Trash,
  UserPlus,
  WarningCircle,
  X,
} from 'phosphor-react-native';

import { AppsCard, isLearnShiftApp, NowCard } from '@/components/guardian/AppUsage';
import { Paty } from '@/components/mascot/Paty';
import {
  BarChart,
  BottomSheet,
  Card,
  Chip,
  DevChip,
  EmptyState,
  ListGroup,
  ListRow,
  Notice,
  PillButton,
  PressableScale,
  Ring,
  SegmentedControl,
  Stagger,
  StatTile,
  Text,
  TextField,
  Toggle,
  WheelGroup,
  WheelPicker,
} from '@/components/ui';
import type { NudgeEntry } from '@/data/seed';
import { SHORT, SKILL_BY_ID, type SkillId } from '@/data/skills';
import { haptic } from '@/design/haptics';
import { pressScale } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { fontFor } from '@/design/typography';
import { usePullRefresh } from '@/hooks/useAutoRefresh';
import { useNow } from '@/hooks/useNow';
import { habitGrade, realWeek, useWeek } from '@/hooks/useWeek';
import { useGuardianT } from '@/i18n/staff';
import { formatClock, formatDuration, useL, useT } from '@/i18n/useT';
import { IS_PITCH, PITCH_NAMES } from '@/lib/config';
import type { DaySummary } from '@/services/types';
import * as api from '@/services/backend/api';
import {
  loadChild,
  loadChildren,
  patchChild,
  useGuardian,
  refreshGuardian,
  useGuardianLive,
  type AppDay,
  type LearnerStyle,
  type LearningProfile,
  type LiveNow,
} from '@/services/backend/guardian';
import { todayKey, useAppStore, type AccountRequest, type TimeRequest } from '@/store/useAppStore';
import { useAuth } from '@/store/useAuth';

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
const AMPM = ['AM', 'PM'];
const DURATION_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 40, 45, 60, 90, 120] as const;
const BREAK_INTERVAL_OPTIONS = [0, 15, 30, 60, 120, 180, 300, 600, 900, 1200, 1800] as const;

function formatBreakInterval(sec: number | null, offLabel: string): string {
  if (!sec || sec <= 0) return offLabel;
  if (sec < 60) return `${sec}s`;
  return `${Math.round(sec / 60)}m`;
}

const toParts = (m: number) => {
  const norm = ((m % 1440) + 1440) % 1440;
  const h24 = Math.floor(norm / 60);
  return { h: (h24 % 12 || 12) - 1, min: Math.round((norm % 60) / 5) % 12, pm: h24 >= 12 ? 1 : 0 };
};
const fromParts = (h: number, min: number, pm: number) => (((h + 1) % 12) + pm * 12) * 60 + min * 5;

function nearestOptionIndex(val: number | null, options: readonly number[]): number {
  const target = val ?? 0;
  let bestIdx = 0;
  let bestDiff = Infinity;
  options.forEach((opt, i) => {
    const diff = Math.abs(opt - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  });
  return bestIdx;
}

/** Sample per-app day for the pitch build. */
const PITCH_APPS: AppDay[] = [
  ['com.zhiliaoapp.musically', 'TikTok', 'video', 62],
  ['com.google.android.youtube', 'YouTube', 'video', 41],
  ['com.instagram.android', 'Instagram', 'social', 24],
  ['com.learnshift.app', 'LearnShift', 'study', 18],
  ['com.facebook.katana', 'Facebook', 'social', 18],
  ['com.facebook.orca', 'Messenger', 'messaging', 12],
  ['com.mobile.legends', 'Mobile Legends', 'games', 9],
  ['com.google.android.apps.classroom', 'Classroom', 'study', 4],
].map(([p, label, category, minutes]) => ({
  day: todayKey(),
  package: p as string,
  label: label as string,
  category: category as AppDay['category'],
  minutes: minutes as number,
}));

/** Everything the guardian screen shows, from the demo store or the server. */
type GView = {
  childName: string;
  childSub: string;
  days: DaySummary[];
  breaks: number;
  breaksToday: number;
  breakTarget: number;
  lateMinutes: number;
  dropMinutes: number;
  learningMin: number;
  requests: TimeRequest[];
  accountRequests: AccountRequest[];
  nudges: NudgeEntry[];
  bedtimeStart: number;
  bedtimeEnd: number;
  lockEnabled: boolean;
  lockNow: boolean;
  lateAlerts: boolean;
  limitStyle: 'adaptive' | 'fixed';
  unlockUntil: string | null;
  scrollLimit: number | null;
  gamesLimit: number | null;
  breakIntervalSec: number | null;
  apps: AppDay[];
  live: LiveNow | null;
  learningProfile: LearningProfile | null;
  hasData: boolean;
  approve: (id: string) => void;
  decline: (id: string) => void;
  approveSignOut: (id: string) => void;
  declineAccountReq: (id: string) => void;
  setBedtime: (start: number, end: number) => void;
  setAlerts: (v: boolean) => void;
  setLock: (v: boolean) => void;
  setLockNow: (v: boolean) => void;
  setLimit: (v: 'adaptive' | 'fixed') => void;
  setScrollLimit: (m: number | null) => void;
  setGamesLimit: (m: number | null) => void;
  setBreakInterval: (sec: number | null) => void;
};

type DangerReq = {
  kind: 'unlink' | 'delete' | 'removeStudentAccount';
  targetId: string;
  requestId?: string;
  childName: string;
  match: string;
  altMatch: string;
};

function usePitchView(): GView {
  const week = useWeek();
  const guardian = useAppStore((s) => s.guardian);
  const bedtime = useAppStore((s) => s.bedtime);
  const requests = useAppStore((s) => s.requests);
  const accountRequests = useAppStore((s) => s.accountRequests);
  const nudges = useAppStore((s) => s.nudges);
  const limits = useAppStore((s) => s.limits);
  const mastery = useAppStore((s) => s.mastery);
  const breaksToday = useAppStore((s) => (s.breaksDay === todayKey() ? s.breaksToday : 0));
  const [pitchUpdatedAt] = useState(() => new Date().toISOString());
  const s = useAppStore.getState;

  const ranked = (Object.entries(mastery) as [SkillId, number][]).sort((a, b) => b[1] - a[1]);
  const strongSkills = ranked
    .filter(([, p]) => p >= 0.65)
    .slice(0, 3)
    .map(([id]) => id);
  const growingSkills = ranked
    .filter(([, p]) => p < 0.65)
    .slice(-2)
    .reverse()
    .map(([id]) => id);

  return {
    childName: PITCH_NAMES.student,
    childSub: `Grade 8 · ${PITCH_NAMES.section}`,
    days: week.days,
    breaks: week.breaks,
    breaksToday,
    breakTarget: week.breakTarget,
    lateMinutes: week.lateMinutes,
    dropMinutes: week.dropMinutes,
    learningMin: week.breaks * 3 + 42,
    requests,
    accountRequests,
    nudges,
    bedtimeStart: bedtime.start,
    bedtimeEnd: bedtime.end,
    lockEnabled: guardian.lockEnabled,
    lockNow: guardian.lockNow,
    lateAlerts: guardian.lateNightAlerts,
    limitStyle: guardian.limitStyle,
    unlockUntil: null,
    scrollLimit: limits.scroll,
    gamesLimit: limits.games,
    breakIntervalSec: limits.breakIntervalSec,
    apps: PITCH_APPS,
    live: {
      package: 'com.zhiliaoapp.musically',
      label: 'TikTok',
      category: 'video',
      sessionMin: 12,
      screenOn: true,
      updatedAt: pitchUpdatedAt,
    },
    learningProfile: {
      learnerStyle: 'visual_paced',
      strongSkills,
      growingSkills,
      bestContext: 'break',
      totalAttempts: 18,
    },
    hasData: true,
    approve: (id) => s().resolveRequest(id, 'approved'),
    decline: (id) => s().resolveRequest(id, 'declined'),
    approveSignOut: (id) => s().resolveAccountRequest(id, 'approved'),
    declineAccountReq: (id) => s().resolveAccountRequest(id, 'declined'),
    setBedtime: (start, end) => s().setBedtime({ start, end }),
    setAlerts: (v) => s().setGuardian({ lateNightAlerts: v }),
    setLock: (v) => s().setGuardian({ lockEnabled: v }),
    setLockNow: (v) => s().setGuardian({ lockNow: v }),
    setLimit: (v) => s().setGuardian({ limitStyle: v }),
    setScrollLimit: (m) => s().hydrate({ limits: { ...s().limits, scroll: m } }),
    setGamesLimit: (m) => s().hydrate({ limits: { ...s().limits, games: m } }),
    setBreakInterval: (sec) => s().hydrate({ limits: { ...s().limits, breakIntervalSec: sec } }),
  };
}

function useRealView(onError: (m: string) => void): GView | null {
  const selected = useGuardian((s) => s.selected);
  const child = useGuardian((s) => s.children.find((c) => c.id === s.selected) ?? null);
  const d = useGuardian((s) => (s.selected ? s.data[s.selected] : undefined));
  if (!selected || !child || !d) return null;
  const now = new Date();
  const days = realWeek(d.usage, now, 0);
  const weekStart = todayKey(new Date(now.getTime() - 6 * 24 * 3600 * 1000));
  const prev = d.usage.filter((u) => u.day < weekStart && u.total > 0);
  const avg = Math.round(days.reduce((a, x) => a + x.minutes, 0) / 7);
  const prevAvg = prev.length >= 3 ? Math.round(prev.reduce((a, u) => a + u.total, 0) / prev.length) : null;
  const guard = (p: Promise<unknown>) =>
    p
      .then(() => loadChild(selected))
      .catch((e: Error) => {
        onError(e.message);
        loadChild(selected);
      });
  return {
    childName: child.name.split(' ')[0],
    childSub: child.grade ? `Grade ${child.grade}` : '',
    days,
    breaks: days.reduce((a, x) => a + x.breaks, 0),
    breaksToday: days[6]?.breaks ?? 0,
    breakTarget: 12,
    lateMinutes: days.reduce((a, x) => a + x.lateMinutes, 0),
    dropMinutes: prevAvg == null ? 0 : Math.max(0, prevAvg - avg),
    learningMin: d.usage.slice(-7).reduce((a, u) => a + u.learning, 0),
    requests: d.requests,
    accountRequests: d.accountRequests,
    nudges: d.nudges,
    bedtimeStart: d.settings.bedtimeStart,
    bedtimeEnd: d.settings.bedtimeEnd,
    lockEnabled: d.controls.lockEnabled,
    lockNow: d.controls.lockNow,
    lateAlerts: d.controls.lateAlerts,
    limitStyle: d.settings.limitStyle,
    unlockUntil: d.controls.unlockUntil,
    scrollLimit: d.controls.scrollLimit,
    gamesLimit: d.controls.gamesLimit,
    breakIntervalSec: d.controls.breakIntervalSec,
    apps: d.apps,
    live: d.live,
    learningProfile: d.learningProfile,
    hasData: d.usage.some((u) => u.total > 0 || u.breaks > 0) || d.nudges.length > 0,
    approve: (id) => {
      patchChild(selected, (x) => ({ ...x, requests: x.requests.map((r) => (r.id === id ? { ...r, status: 'approved' } : r)) }));
      guard(api.decideRequest(id, true));
    },
    decline: (id) => {
      patchChild(selected, (x) => ({ ...x, requests: x.requests.map((r) => (r.id === id ? { ...r, status: 'declined' } : r)) }));
      guard(api.decideRequest(id, false));
    },
    approveSignOut: (id) => {
      patchChild(selected, (x) => ({
        ...x,
        accountRequests: x.accountRequests.map((r) => (r.id === id ? { ...r, status: 'approved' } : r)),
      }));
      guard(api.decideAccountRequest(id, true));
    },
    declineAccountReq: (id) => {
      patchChild(selected, (x) => ({
        ...x,
        accountRequests: x.accountRequests.map((r) => (r.id === id ? { ...r, status: 'declined' } : r)),
      }));
      guard(api.decideAccountRequest(id, false));
    },
    setBedtime: (start, end) => {
      patchChild(selected, (x) => ({
        ...x,
        settings: { ...x.settings, bedtimeStart: start, bedtimeEnd: end },
        controls: { ...x.controls, lockStart: start, lockEnd: end },
      }));
      guard(
        Promise.all([
          api.setStudentSettings(selected, { bedtime_start: start, bedtime_end: end }),
          api.setControls(selected, { lock_start: start, lock_end: end }),
        ]),
      );
    },
    setAlerts: (v) => {
      patchChild(selected, (x) => ({ ...x, controls: { ...x.controls, lateAlerts: v } }));
      guard(api.setControls(selected, { late_alerts: v }));
    },
    setLock: (v) => {
      patchChild(selected, (x) => ({ ...x, controls: { ...x.controls, lockEnabled: v } }));
      guard(
        api.setControls(selected, {
          lock_enabled: v,
          lock_start: d.settings.bedtimeStart,
          lock_end: d.settings.bedtimeEnd,
        }),
      );
    },
    setLockNow: (v) => {
      patchChild(selected, (x) => ({
        ...x,
        controls: { ...x.controls, lockNow: v, unlockUntil: v ? null : x.controls.unlockUntil },
      }));
      guard(api.setControls(selected, v ? { lock_now: true, unlock_until: null } : { lock_now: false }));
    },
    setLimit: (v) => {
      patchChild(selected, (x) => ({ ...x, settings: { ...x.settings, limitStyle: v } }));
      guard(api.setStudentSettings(selected, { limit_style: v }));
    },
    setScrollLimit: (m) => {
      patchChild(selected, (x) => ({ ...x, controls: { ...x.controls, scrollLimit: m } }));
      guard(api.setControls(selected, { scroll_limit: m }));
    },
    setGamesLimit: (m) => {
      patchChild(selected, (x) => ({ ...x, controls: { ...x.controls, gamesLimit: m } }));
      guard(api.setControls(selected, { games_limit: m }));
    },
    setBreakInterval: (sec) => {
      patchChild(selected, (x) => ({ ...x, controls: { ...x.controls, breakIntervalSec: sec } }));
      guard(api.setControls(selected, { break_interval_sec: sec }));
    },
  };
}

/** Guardian view: habits only — a one-minute weekly summary, learning snapshot, controls and requests. */
export default function Guardian() {
  return IS_PITCH ? <GuardianPitch /> : <GuardianReal />;
}

function GuardianPitch() {
  const v = usePitchView();
  return <Layout v={v} />;
}

function GuardianReal() {
  useGuardianLive();
  const [error, setError] = useState<string | null>(null);
  const v = useRealView(setError);
  const loading = useGuardian((s) => s.loading);
  const children = useGuardian((s) => s.children);
  if (!loading && children.length === 0) return <Layout v={null} error={error} />;
  return <Layout v={v} error={error} />;
}

function Layout({ v, error }: { v: GView | null; error?: string | null }) {
  const { c } = useTheme();
  const g = useGuardianT();
  const t = useT();
  const insets = useSafeAreaInsets();
  const pull = usePullRefresh(refreshGuardian);
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const children = useGuardian((s) => s.children);
  const selected = useGuardian((s) => s.selected);
  const me = useAuth((s) => s.profile);

  const [bedtimeSheet, setBedtimeSheet] = useState({ open: false, start: 22 * 60, end: 6 * 60, key: 0 });
  const [durationSheet, setDurationSheet] = useState<{
    open: boolean;
    target: 'scroll' | 'games' | 'breakSec';
    value: number;
    key: number;
  }>({ open: false, target: 'scroll', value: 0, key: 0 });
  const [dangerSheet, setDangerSheet] = useState<DangerReq & { open: boolean; key: number }>({
    open: false,
    kind: 'unlink',
    targetId: '',
    childName: '',
    match: '',
    altMatch: '',
    key: 0,
  });

  const openBedtime = () => {
    if (!v) return;
    haptic.select();
    setBedtimeSheet((prev) => ({ open: true, start: v.bedtimeStart, end: v.bedtimeEnd, key: prev.key + 1 }));
  };

  const openDuration = (target: 'scroll' | 'games' | 'breakSec') => {
    if (!v) return;
    haptic.select();
    const value =
      target === 'scroll'
        ? (v.scrollLimit ?? 0)
        : target === 'games'
          ? (v.gamesLimit ?? 0)
          : (v.breakIntervalSec ?? 0);
    setDurationSheet((prev) => ({ open: true, target, value, key: prev.key + 1 }));
  };

  const askDanger = (req: DangerReq) => {
    haptic.light();
    setDangerSheet((prev) => ({ ...req, open: true, key: prev.key + 1 }));
  };

  const header = (
    <Stagger index={0} style={styles.header}>
      <View style={styles.flex}>
        <Text variant="overline" color="accent">
          {g.roleLabel}
        </Text>
        <Text variant="largeTitle" numberOfLines={1}>
          {v ? g.hello(v.childName) : g.linkTitle}
        </Text>
        <Text variant="subhead">{v ? v.childSub || ' ' : me?.display_name}</Text>
      </View>
      {IS_PITCH ? <DevChip label={t.demo.title} onPress={() => router.push('/demo')} /> : null}
    </Stagger>
  );

  const body = !v ? (
    <View style={styles.col}>
      <LinkChild first />
      <AccountCard onAskDanger={askDanger} />
    </View>
  ) : (
    <Content
      v={v}
      wide={wide}
      onEditBedtime={openBedtime}
      onEditLimit={openDuration}
      onAskDanger={askDanger}
    />
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { backgroundColor: c.bg, paddingTop: insets.top }]}
    >
      <ScrollView
        contentContainerStyle={[styles.body, { maxWidth: wide ? 1100 : 560, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          IS_PITCH ? undefined : (
            <RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={c.accent} colors={[c.accent]} />
          )
        }
      >
        {header}
        {!IS_PITCH && children.length > 1 ? (
          <SegmentedControl
            options={children.map((k) => ({ value: k.id, label: k.name.split(' ')[0] }))}
            value={selected ?? children[0].id}
            onChange={(id) => useGuardian.getState().select(id)}
          />
        ) : null}
        {error ? <Notice text={error} /> : null}
        {body}
      </ScrollView>

      <BedtimeWheelSheet
        sheet={bedtimeSheet}
        onClose={() => setBedtimeSheet((prev) => ({ ...prev, open: false }))}
        onSave={(start, end) => {
          v?.setBedtime(start, end);
          setBedtimeSheet((prev) => ({ ...prev, open: false }));
        }}
      />

      <DurationWheelSheet
        sheet={durationSheet}
        onClose={() => setDurationSheet((prev) => ({ ...prev, open: false }))}
        onSave={(value) => {
          const nextVal = value === 0 ? null : value;
          if (durationSheet.target === 'scroll') v?.setScrollLimit(nextVal);
          else if (durationSheet.target === 'games') v?.setGamesLimit(nextVal);
          else v?.setBreakInterval(nextVal);
          setDurationSheet((prev) => ({ ...prev, open: false }));
        }}
      />

      <ConfirmDangerSheet
        sheet={dangerSheet}
        onClose={() => setDangerSheet((prev) => ({ ...prev, open: false }))}
      />
    </KeyboardAvoidingView>
  );
}

function Content({
  v,
  wide,
  onEditBedtime,
  onEditLimit,
  onAskDanger,
}: {
  v: GView;
  wide: boolean;
  onEditBedtime: () => void;
  onEditLimit: (target: 'scroll' | 'games' | 'breakSec') => void;
  onAskDanger: (req: DangerReq) => void;
}) {
  const { c } = useTheme();
  const g = useGuardianT();
  const t = useT();
  const { score, grade } = habitGrade(v.breaks, v.breakTarget, v.lateMinutes);
  const lateNights = v.days.filter((d) => d.lateMinutes > 0).length;
  const now = useNow();
  const unlocked = v.unlockUntil && Date.parse(v.unlockUntil) > now ? new Date(v.unlockUntil) : null;

  const summary = (
    <View style={styles.col}>
      <NowCard live={v.live} apps={v.apps} childName={v.childName} scrollLimit={v.scrollLimit} gamesLimit={v.gamesLimit} />

      <Card style={styles.gap}>
        <View style={styles.rowTop}>
          <View style={styles.flexGap}>
            <Text variant="overline">{g.title}</Text>
            <Text variant="title">{g.summary(v.dropMinutes, lateNights, v.breaks)}</Text>
          </View>
          <Paty expression="proud" size={84} />
        </View>
        <View style={[styles.report, { backgroundColor: c.inset }]}>
          <Ring progress={score} size={64} stroke={7}>
            <Text variant="headline">{grade}</Text>
          </Ring>
          <View style={styles.flex}>
            <Text variant="overline">{g.report}</Text>
            <Text variant="headline">{t.insights.reportTitle}</Text>
          </View>
        </View>
      </Card>

      <LearningSummaryCard v={v} lateNights={lateNights} />

      <Card style={styles.gap}>
        <Text variant="headline">{g.perDay}</Text>
        {v.hasData ? (
          <BarChart
            values={v.days.map((d) => d.minutes)}
            labels={v.days.map((d) => t.days.long[d.weekday])}
            highlight={6}
            height={110}
            accessibilityLabel={g.perDay}
          />
        ) : (
          <EmptyState title={g.noData} subtitle={g.noDataSub(v.childName)} expression="curious" />
        )}
      </Card>
      <AppsCard apps={v.apps} childName={v.childName} />
      <View style={styles.row}>
        <StatTile
          label={g.breaks}
          value={v.breaks}
          caption={g.breaksToday(v.breaksToday)}
          icon={<Lightning size={16} weight="fill" color={c.accent} />}
          style={styles.flex}
        />
        <StatTile
          label={g.learning}
          value={v.learningMin}
          unit="m"
          icon={<Sparkle size={16} weight="fill" color={c.success} />}
          style={styles.flex}
        />
      </View>
      <StatTile
        label={g.lateNight}
        value={v.lateMinutes}
        unit="m"
        icon={<Moon size={16} weight="fill" color={c.indigo} />}
      />
      <Card style={styles.gap}>
        <Text variant="headline">{g.recent}</Text>
        {v.nudges.length === 0 ? (
          <Text variant="subhead">{g.noNudges}</Text>
        ) : (
          v.nudges.slice(0, 6).map((n) => {
            const d = new Date(n.at);
            return (
              <View key={n.id} style={styles.nudgeRow}>
                <Text variant="subhead" color="text" style={styles.flex} numberOfLines={1}>
                  {g.nudgeLevel[n.level] ?? n.level} · {g.nudgeResponse[n.response] ?? n.response}
                </Text>
                <Text variant="caption">
                  {t.days.long[d.getDay()]} {formatClock(d.getHours() * 60 + d.getMinutes())}
                </Text>
              </View>
            );
          })
        )}
      </Card>
    </View>
  );

  const selectedChildId = useGuardian((s) => s.selected) ?? '';
  const selectedChildName = useGuardian((s) => s.children.find((ch) => ch.id === s.selected)?.name ?? v.childName);
  const visibleAccountReqs = v.accountRequests.filter((r) => r.status !== 'completed');

  const side = (
    <View style={styles.col}>
      <Card style={styles.gap}>
        <Text variant="title">{g.requests}</Text>
        {visibleAccountReqs.length === 0 && v.requests.length === 0 ? (
          <EmptyState title={g.none} subtitle={g.noneSub(v.childName)} expression="happy" />
        ) : null}
        {visibleAccountReqs.slice(0, 4).map((ar) => {
          const d = new Date(ar.at);
          const when = `${t.days.long[d.getDay()]} · ${formatClock(d.getHours() * 60 + d.getMinutes())}`;
          const isDelete = ar.kind === 'delete_account';
          return (
            <View key={ar.id} style={[styles.request, { backgroundColor: c.inset }]}>
              <View style={styles.reqHead}>
                <View style={[styles.reqIcon, { backgroundColor: c.accentTint }]}>
                  {isDelete ? (
                    <Trash size={18} weight="fill" color={c.danger} />
                  ) : (
                    <SignOut size={18} weight="fill" color={c.accent} />
                  )}
                </View>
                <View style={styles.flex}>
                  <Text variant="headline">{isDelete ? g.deleteReqTitle : g.signOutReqTitle}</Text>
                  <Text variant="caption">{g.requestSub(v.childName, when)}</Text>
                </View>
                {ar.status !== 'pending' ? (
                  <Chip
                    label={ar.status === 'approved' ? g.approved : g.declined}
                    kind={ar.status === 'approved' ? 'accent' : 'neutral'}
                  />
                ) : null}
              </View>
              {isDelete && ar.status === 'pending' ? (
                <Text variant="caption" color="danger">
                  {g.deleteReqWarn}
                </Text>
              ) : null}
              {ar.status === 'pending' ? (
                <View style={styles.row}>
                  <PillButton
                    label={isDelete ? g.approveRemove : g.approve}
                    kind={isDelete ? 'destructive' : 'primary'}
                    style={styles.flex}
                    block
                    onPress={() => {
                      if (isDelete) {
                        onAskDanger({
                          kind: 'removeStudentAccount',
                          targetId: selectedChildId,
                          requestId: ar.id,
                          childName: selectedChildName,
                          match: selectedChildName.trim(),
                          altMatch: '',
                        });
                      } else {
                        v.approveSignOut(ar.id);
                      }
                    }}
                  />
                  <PillButton label={g.decline} kind="secondary" style={styles.flex} block onPress={() => v.declineAccountReq(ar.id)} />
                </View>
              ) : null}
            </View>
          );
        })}
        {v.requests.slice(0, 4).map((r) => {
          const d = new Date(r.at);
          const when = `${t.days.long[d.getDay()]} · ${formatClock(d.getHours() * 60 + d.getMinutes())}`;
          return (
            <View key={r.id} style={[styles.request, { backgroundColor: c.inset }]}>
              <View style={styles.reqHead}>
                <View style={[styles.reqIcon, { backgroundColor: c.accentTint }]}>
                  <Clock size={18} weight="fill" color={c.accent} />
                </View>
                <View style={styles.flex}>
                  <Text variant="headline">{g.requestTitle(r.minutes)}</Text>
                  <Text variant="caption">{g.requestSub(v.childName, when)}</Text>
                </View>
                {r.status !== 'pending' ? (
                  <Chip
                    label={r.status === 'approved' ? g.approved : g.declined}
                    kind={r.status === 'approved' ? 'accent' : 'neutral'}
                  />
                ) : null}
              </View>
              {r.status === 'pending' ? (
                <View style={styles.row}>
                  <PillButton label={g.approve} style={styles.flex} block onPress={() => v.approve(r.id)} />
                  <PillButton label={g.decline} kind="secondary" style={styles.flex} block onPress={() => v.decline(r.id)} />
                </View>
              ) : null}
            </View>
          );
        })}
      </Card>

      <Card style={styles.gapLg}>
        <Text variant="title">{g.controls}</Text>

        <PressableScale
          scaleTo={pressScale.card}
          onPress={onEditBedtime}
          accessibilityRole="button"
          accessibilityLabel={`${g.bedtime}, ${formatClock(v.bedtimeStart)} to ${formatClock(v.bedtimeEnd)}`}
          style={styles.controlSelectRow}
        >
          <View style={[styles.ctlBadge, { backgroundColor: c.accentTint }]}>
            <Moon size={18} weight="fill" color={c.accent} />
          </View>
          <View style={styles.flex}>
            <Text variant="headline">{g.bedtime}</Text>
            <Text variant="caption">{g.bedtimeSub}</Text>
          </View>
          <View style={[styles.valuePill, { backgroundColor: c.inset }]}>
            <Text variant="subhead" color="accent" style={fontFor(700)}>
              {`${formatClock(v.bedtimeStart)} – ${formatClock(v.bedtimeEnd)}`}
            </Text>
          </View>
          <CaretRight size={16} weight="bold" color={c.textTertiary} />
        </PressableScale>

        <View style={[styles.gap, styles.toggleRow, styles.column, { borderColor: c.hairline }]}>
          <Text variant="headline">{g.limitsTitle}</Text>
          <Text variant="caption">{g.limitsSub}</Text>

          <PressableScale
            scaleTo={pressScale.card}
            onPress={() => onEditLimit('scroll')}
            accessibilityRole="button"
            accessibilityLabel={`${g.scrollLimitShort}, ${v.scrollLimit ? formatDuration(v.scrollLimit) : g.off}`}
            style={[styles.subControlRow, { backgroundColor: c.inset }]}
          >
            <View style={[styles.ctlBadge, { backgroundColor: c.card }]}>
              <Play size={16} weight="fill" color={c.accent} />
            </View>
            <View style={styles.flex}>
              <Text variant="subhead" color="text" style={fontFor(600)}>
                {g.scrollLimitShort}
              </Text>
              <Text variant="caption" numberOfLines={1}>
                {g.scrollLimitSub}
              </Text>
            </View>
            <View style={[styles.valuePill, { backgroundColor: c.card }]}>
              <Text variant="subhead" color={v.scrollLimit ? 'accent' : 'textSecondary'} style={fontFor(700)}>
                {v.scrollLimit ? formatDuration(v.scrollLimit) : g.off}
              </Text>
            </View>
            <CaretRight size={15} weight="bold" color={c.textTertiary} />
          </PressableScale>

          <PressableScale
            scaleTo={pressScale.card}
            onPress={() => onEditLimit('games')}
            accessibilityRole="button"
            accessibilityLabel={`${g.gamesLimit}, ${v.gamesLimit ? formatDuration(v.gamesLimit) : g.off}`}
            style={[styles.subControlRow, { backgroundColor: c.inset }]}
          >
            <View style={[styles.ctlBadge, { backgroundColor: c.card }]}>
              <GameController size={16} weight="fill" color={c.tabInsights} />
            </View>
            <View style={styles.flex}>
              <Text variant="subhead" color="text" style={fontFor(600)}>
                {g.gamesLimit}
              </Text>
              <Text variant="caption" numberOfLines={1}>
                {g.gamesLimitSub}
              </Text>
            </View>
            <View style={[styles.valuePill, { backgroundColor: c.card }]}>
              <Text variant="subhead" color={v.gamesLimit ? 'accent' : 'textSecondary'} style={fontFor(700)}>
                {v.gamesLimit ? formatDuration(v.gamesLimit) : g.off}
              </Text>
            </View>
            <CaretRight size={15} weight="bold" color={c.textTertiary} />
          </PressableScale>

          <PressableScale
            scaleTo={pressScale.card}
            onPress={() => onEditLimit('breakSec')}
            accessibilityRole="button"
            accessibilityLabel={`${g.breakTimer}, ${formatBreakInterval(v.breakIntervalSec, g.off)}`}
            style={[styles.subControlRow, { backgroundColor: c.inset }]}
          >
            <View style={[styles.ctlBadge, { backgroundColor: c.card }]}>
              <Clock size={16} weight="fill" color={c.accent} />
            </View>
            <View style={styles.flex}>
              <Text variant="subhead" color="text" style={fontFor(600)}>
                {g.breakTimer}
              </Text>
              <Text variant="caption" numberOfLines={2}>
                {g.breakTimerSub}
              </Text>
            </View>
            <View style={[styles.valuePill, { backgroundColor: c.card }]}>
              <Text variant="subhead" color={v.breakIntervalSec ? 'accent' : 'textSecondary'} style={fontFor(700)}>
                {formatBreakInterval(v.breakIntervalSec, g.off)}
              </Text>
            </View>
            <CaretRight size={15} weight="bold" color={c.textTertiary} />
          </PressableScale>
        </View>

        <View style={[styles.toggleRow, { borderColor: c.hairline }]}>
          <View style={[styles.ctlBadge, { backgroundColor: c.inset }]}>
            <BellRinging size={18} weight="fill" color={c.accent} />
          </View>
          <Text variant="headline" style={styles.flex}>
            {g.alerts}
          </Text>
          <Toggle value={v.lateAlerts} onChange={v.setAlerts} accessibilityLabel={g.alerts} />
        </View>

        <View style={[styles.toggleRow, { borderColor: c.hairline }]}>
          <View style={[styles.ctlBadge, { backgroundColor: c.inset }]}>
            <LockSimple size={18} weight="fill" color={c.indigo} />
          </View>
          <View style={styles.flex}>
            <Text variant="headline">{g.lock}</Text>
            <Text variant="caption">
              {unlocked ? g.unlockedUntil(formatClock(unlocked.getHours() * 60 + unlocked.getMinutes())) : g.lockSub}
            </Text>
          </View>
          <Toggle value={v.lockEnabled} onChange={v.setLock} accessibilityLabel={g.lock} />
        </View>

        <View style={[styles.toggleRow, { borderColor: c.hairline }]}>
          <View style={[styles.ctlBadge, { backgroundColor: v.lockNow ? c.accentTint : c.inset }]}>
            <LockSimple size={18} weight="fill" color={v.lockNow ? c.danger : c.indigo} />
          </View>
          <View style={styles.flex}>
            <View style={styles.dangerHead}>
              <Text variant="headline">{g.lockNow}</Text>
              {v.lockNow ? <Chip label={g.lockNowActive} kind="accent" /> : null}
            </View>
            <Text variant="caption">{g.lockNowSub}</Text>
          </View>
          <Toggle value={v.lockNow} onChange={v.setLockNow} accessibilityLabel={g.lockNow} />
        </View>

        <View style={[styles.gap, styles.toggleRow, styles.column, { borderColor: c.hairline }]}>
          <View>
            <Text variant="headline">{g.limit}</Text>
            <Text variant="caption">{g.limitSub}</Text>
          </View>
          <SegmentedControl<'adaptive' | 'fixed'>
            options={[
              { value: 'adaptive', label: g.adaptive },
              { value: 'fixed', label: g.fixed },
            ]}
            value={v.limitStyle}
            onChange={v.setLimit}
          />
        </View>
      </Card>
      {!IS_PITCH ? (
        <>
          <LinkChild />
          <AccountCard onAskDanger={onAskDanger} />
        </>
      ) : null}
    </View>
  );

  return wide ? (
    <View style={styles.columns}>
      <View style={styles.flex}>{summary}</View>
      <View style={styles.flex}>{side}</View>
    </View>
  ) : (
    <>
      {summary}
      {side}
    </>
  );
}

/** Qualitative learning summary: learner style and topics understood very well. */
function LearningSummaryCard({ v, lateNights }: { v: GView; lateNights: number }) {
  const { c } = useTheme();
  const g = useGuardianT();
  const L = useL();

  const fallbackStyle: LearnerStyle = v.breaks >= 2 || v.learningMin >= 15 ? 'visual_paced' : 'getting_started';
  const styleKey = v.learningProfile?.learnerStyle ?? fallbackStyle;
  const styleTitle = g.learningStyleTitle[styleKey] ?? g.learningStyleTitle.getting_started;
  const styleDescFn = g.learningStyleDesc[styleKey as keyof typeof g.learningStyleDesc] ?? g.learningStyleDesc.getting_started;
  const styleDesc = styleDescFn(v.childName, v.breaks, v.learningMin);

  const strong = v.learningProfile?.strongSkills ?? [];
  const growing = v.learningProfile?.growingSkills ?? [];
  const strongNames = strong.map((id) => L(SKILL_BY_ID[id].name));
  const growingNames = growing.map((id) => L(SHORT[id]));

  const hasLearnShiftStudy = v.apps.some((a) => isLearnShiftApp(a.package, a.label) && a.minutes > 0);
  const hasOtherStudyApp = v.apps.some((a) => a.category === 'study' && !isLearnShiftApp(a.package, a.label) && a.minutes > 0);
  const habitSignals: string[] = [];
  if (hasLearnShiftStudy) habitSignals.push(g.habitLearnShift);
  if (v.breaks > 0) habitSignals.push(g.habitBreaks);
  if (v.hasData && lateNights <= 1) habitSignals.push(g.habitCalmNights);
  if (hasOtherStudyApp) habitSignals.push(g.habitStudyApps);

  return (
    <Card style={styles.gap}>
      <View style={styles.rowBetween}>
        <Text variant="overline">{g.learningProfileTitle}</Text>
        <Chip label={g.learnerTypeLabel} kind="tinted" />
      </View>

      <View style={[styles.learnerBanner, { backgroundColor: c.inset }]}>
        <View style={[styles.ctlBadge, { backgroundColor: c.accentTint }]}>
          <GraduationCap size={20} weight="fill" color={c.accent} />
        </View>
        <View style={styles.flex}>
          <Text variant="headline">{styleTitle}</Text>
          <Text variant="subhead">{styleDesc}</Text>
        </View>
      </View>

      {strongNames.length > 0 ? (
        <View style={styles.gap}>
          <Text variant="subhead" color="text" style={fontFor(700)}>
            {g.understandsWell}
          </Text>
          <View style={styles.chipWrap}>
            {strongNames.map((label) => (
              <Chip
                key={label}
                label={label}
                icon={<CheckCircle size={13} weight="fill" color={c.success} />}
                tint={{ bg: c.success + '1A', fg: c.success }}
              />
            ))}
          </View>
          <Text variant="caption">
            {g.strongSummary(v.childName, strongNames.join(', '))}
            {growingNames.length > 0 ? ` ${g.buildingNote(growingNames.join(', '))}` : ''}
          </Text>
        </View>
      ) : (
        <View style={styles.gap}>
          {habitSignals.length > 0 ? (
            <>
              <Text variant="subhead" color="text" style={fontFor(700)}>
                {g.habitStrengths}
              </Text>
              <View style={styles.chipWrap}>
                {habitSignals.map((sig) => (
                  <Chip
                    key={sig}
                    label={sig}
                    icon={<Sparkle size={12} weight="fill" color={c.success} />}
                    tint={{ bg: c.inset, fg: c.success }}
                  />
                ))}
              </View>
            </>
          ) : null}
          <Text variant="caption">{g.noSkillsYet(v.childName)}</Text>
        </View>
      )}
    </Card>
  );
}

function BedtimeWheelSheet({
  sheet,
  onClose,
  onSave,
}: {
  sheet: { open: boolean; start: number; end: number; key: number };
  onClose: () => void;
  onSave: (start: number, end: number) => void;
}) {
  const g = useGuardianT();
  return (
    <BottomSheet visible={sheet.open} onClose={onClose} accessibilityLabel={g.bedtime}>
      <BedtimeWheelBody key={sheet.key} initialStart={sheet.start} initialEnd={sheet.end} onClose={onClose} onSave={onSave} />
    </BottomSheet>
  );
}

function BedtimeWheelBody({
  initialStart,
  initialEnd,
  onClose,
  onSave,
}: {
  initialStart: number;
  initialEnd: number;
  onClose: () => void;
  onSave: (start: number, end: number) => void;
}) {
  const { c } = useTheme();
  const g = useGuardianT();
  const t = useT();
  const [which, setWhich] = useState<'start' | 'end'>('start');
  const [times, setTimes] = useState({ start: initialStart, end: initialEnd });
  const parts = toParts(times[which]);
  const updatePart = (p: Partial<typeof parts>) => {
    const next = { ...parts, ...p };
    setTimes((prev) => ({ ...prev, [which]: fromParts(next.h, next.min, next.pm) }));
  };

  return (
    <View style={styles.sheetBody}>
      <Text variant="title">{g.bedtime}</Text>
      <Text variant="subhead">{g.bedtimeSub}</Text>

      <View style={[styles.timeReadout, { backgroundColor: c.inset }]}>
        <Text variant="title" tabular color={which === 'start' ? 'accent' : 'text'}>
          {formatClock(times.start)}
        </Text>
        <Text variant="title" color="textTertiary">
          →
        </Text>
        <Text variant="title" tabular color={which === 'end' ? 'accent' : 'text'}>
          {formatClock(times.end)}
        </Text>
      </View>

      <SegmentedControl<'start' | 'end'>
        options={[
          { value: 'start', label: g.bedtimeStart },
          { value: 'end', label: g.bedtimeEnd },
        ]}
        value={which}
        onChange={setWhich}
      />

      <WheelGroup key={which}>
        <WheelPicker items={HOURS} index={parts.h} onChange={(h) => updatePart({ h })} accessibilityLabel="Hour" />
        <WheelPicker items={MINUTES} index={parts.min} onChange={(min) => updatePart({ min })} accessibilityLabel="Minute" />
        <WheelPicker items={AMPM} index={parts.pm} onChange={(pm) => updatePart({ pm })} accessibilityLabel="AM or PM" />
      </WheelGroup>

      <View style={styles.sheetActions}>
        <PillButton label={t.common.cancel} kind="neutral" style={styles.flex} block onPress={onClose} />
        <PillButton label={t.common.save} style={styles.flex} block onPress={() => onSave(times.start, times.end)} />
      </View>
    </View>
  );
}

function DurationWheelSheet({
  sheet,
  onClose,
  onSave,
}: {
  sheet: { open: boolean; target: 'scroll' | 'games' | 'breakSec'; value: number; key: number };
  onClose: () => void;
  onSave: (value: number) => void;
}) {
  const g = useGuardianT();
  const isBreakSec = sheet.target === 'breakSec';
  const title = isBreakSec ? g.breakTimer : sheet.target === 'scroll' ? g.scrollLimitShort : g.gamesLimit;
  const subtitle = isBreakSec ? g.breakTimerSub : sheet.target === 'scroll' ? g.scrollLimitSub : g.gamesLimitSub;
  const options = isBreakSec ? BREAK_INTERVAL_OPTIONS : DURATION_OPTIONS;
  const formatOption = isBreakSec
    ? (v: number) => formatBreakInterval(v, g.off)
    : (v: number) => (v === 0 ? g.off : formatDuration(v));
  const hint = isBreakSec ? g.breakTimerAdaptiveHint : g.durationHint;
  return (
    <BottomSheet visible={sheet.open} onClose={onClose} accessibilityLabel={title}>
      <DurationWheelBody
        key={sheet.key}
        title={title}
        subtitle={subtitle}
        options={options}
        formatOption={formatOption}
        hint={hint}
        initialValue={sheet.value}
        onClose={onClose}
        onSave={onSave}
      />
    </BottomSheet>
  );
}

function DurationWheelBody({
  title,
  subtitle,
  options,
  formatOption,
  hint,
  initialValue,
  onClose,
  onSave,
}: {
  title: string;
  subtitle: string;
  options: readonly number[];
  formatOption: (v: number) => string;
  hint: string;
  initialValue: number;
  onClose: () => void;
  onSave: (value: number) => void;
}) {
  const { c } = useTheme();
  const t = useT();
  const [idx, setIdx] = useState(() => nearestOptionIndex(initialValue, options));
  const selectedVal = options[idx] ?? 0;
  const labels = options.map(formatOption);

  return (
    <View style={styles.sheetBody}>
      <Text variant="title">{title}</Text>
      <Text variant="subhead">{subtitle}</Text>

      <View style={[styles.timeReadout, { backgroundColor: c.inset }]}>
        <Text variant="title" tabular color={selectedVal > 0 ? 'accent' : 'text'}>
          {formatOption(selectedVal)}
        </Text>
      </View>

      <WheelGroup>
        <WheelPicker items={labels} index={idx} onChange={setIdx} width={160} accessibilityLabel={title} />
      </WheelGroup>

      <Text variant="caption" align="center">
        {hint}
      </Text>

      <View style={styles.sheetActions}>
        <PillButton label={t.common.cancel} kind="neutral" style={styles.flex} block onPress={onClose} />
        <PillButton label={t.common.save} style={styles.flex} block onPress={() => onSave(selectedVal)} />
      </View>
    </View>
  );
}

function ConfirmDangerSheet({
  sheet,
  onClose,
}: {
  sheet: DangerReq & { open: boolean; key: number };
  onClose: () => void;
}) {
  const g = useGuardianT();
  const label =
    sheet.kind === 'unlink'
      ? g.unlink
      : sheet.kind === 'removeStudentAccount'
        ? g.confirmRemoveChildTitle(sheet.childName)
        : g.confirmDeleteTitle;
  return (
    <BottomSheet visible={sheet.open} onClose={onClose} accessibilityLabel={label}>
      <ConfirmDangerBody key={sheet.key} sheet={sheet} onClose={onClose} />
    </BottomSheet>
  );
}

function ConfirmDangerBody({
  sheet,
  onClose,
}: {
  sheet: DangerReq;
  onClose: () => void;
}) {
  const { c } = useTheme();
  const g = useGuardianT();
  const t = useT();
  const me = useAuth((s) => s.profile);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = typed.trim().toLowerCase();
  const targetNorm = sheet.match.trim().toLowerCase();
  const altNorm = sheet.altMatch.trim().toLowerCase();
  const matches = !!targetNorm && (normalized === targetNorm || (!!altNorm && normalized === altNorm));

  const title =
    sheet.kind === 'unlink'
      ? g.confirmUnlinkTitle(sheet.childName)
      : sheet.kind === 'removeStudentAccount'
        ? g.confirmRemoveChildTitle(sheet.childName)
        : g.confirmDeleteTitle;
  const subtitle =
    sheet.kind === 'unlink'
      ? g.confirmUnlinkSub(sheet.childName)
      : sheet.kind === 'removeStudentAccount'
        ? g.confirmRemoveChildSub(sheet.childName)
        : g.confirmDeleteSub;
  const confirmLabel =
    sheet.kind === 'unlink'
      ? g.unlinkAction
      : sheet.kind === 'removeStudentAccount'
        ? g.removeChildAction
        : g.deleteAction;

  const confirm = async () => {
    if (!matches || busy) return;
    setError(null);
    setBusy(true);
    try {
      if (sheet.kind === 'unlink') {
        if (!me) return;
        await api.unlink(me.id, sheet.targetId);
        await loadChildren();
        onClose();
      } else if (sheet.kind === 'removeStudentAccount') {
        if (IS_PITCH) {
          if (sheet.requestId) useAppStore.getState().resolveAccountRequest(sheet.requestId, 'approved');
          onClose();
          return;
        }
        await api.approveDeleteStudentAccount(sheet.requestId!);
        await loadChildren();
        onClose();
      } else {
        await api.deleteAccount();
        onClose();
        router.replace('/onboarding');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.sheetBody}>
      <View style={styles.dangerHead}>
        <View style={[styles.ctlBadge, { backgroundColor: c.accentTint }]}>
          <WarningCircle size={20} weight="fill" color={c.danger} />
        </View>
        <Text variant="title" style={styles.flex}>
          {title}
        </Text>
      </View>
      <Text variant="subhead">{subtitle}</Text>
      {error ? <Notice text={error} /> : null}
      <TextField
        label={g.typeToConfirm(sheet.match)}
        placeholder={g.usernamePlaceholder}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="none"
      />
      <View style={styles.sheetActions}>
        <PillButton label={t.common.cancel} kind="neutral" style={styles.flex} block onPress={onClose} />
        <PillButton
          label={busy ? '…' : confirmLabel}
          kind="destructive"
          style={styles.flex}
          block
          disabled={busy || !matches}
          onPress={confirm}
        />
      </View>
    </View>
  );
}

/** Enter the child's 6-digit code and give consent. */
function LinkChild({ first }: { first?: boolean }) {
  const { c } = useTheme();
  const g = useGuardianT();
  const t = useT();
  const [open, setOpen] = useState(!!first);
  const [holdHint, setHoldHint] = useState(false);
  const [code, setCode] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setCode('');
    setConsent(false);
    setError(null);
    setHoldHint(false);
  };

  if (!open)
    return (
      <View style={styles.addChildWrap}>
        <PillButton
          label={g.addChild}
          kind="secondary"
          icon={<UserPlus size={18} weight="bold" color={c.accent} />}
          block
          delayLongPress={600}
          onPress={() => setHoldHint(true)}
          onLongPress={() => {
            haptic.light();
            setHoldHint(false);
            setOpen(true);
          }}
          accessibilityHint={g.addChildHoldPrompt}
        />
        <Text variant="caption" color={holdHint ? 'accent' : 'textTertiary'} align="center">
          {holdHint ? g.addChildHoldPrompt : g.addChildHoldHint}
        </Text>
      </View>
    );

  const link = async () => {
    setError(null);
    if (!consent) return setError(g.needConsent);
    setBusy(true);
    try {
      const r = await api.linkStudent(code);
      useGuardian.getState().select(r.student_id);
      setCode('');
      setConsent(false);
      if (!first) setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={styles.gap}>
      {first ? (
        <Paty expression="waving" size={110} />
      ) : (
        <View style={styles.rowBetween}>
          <Text variant="title">{g.linkTitle}</Text>
          <PressableScale
            onPress={close}
            accessibilityLabel={t.common.close}
            hitSlop={8}
            style={[styles.closeBtn, { backgroundColor: c.inset }]}
          >
            <X size={16} weight="bold" color={c.textSecondary} />
          </PressableScale>
        </View>
      )}
      <Text variant="subhead">{g.linkSub}</Text>
      {first ? (
        <View style={[styles.privacyStrip, { backgroundColor: c.inset, borderColor: c.hairline }]}>
          <EyeSlash size={15} weight="fill" color={c.success} />
          <Text variant="caption" color="textSecondary" style={styles.flex}>
            {g.note}
          </Text>
        </View>
      ) : null}
      {error ? <Notice text={error} /> : null}
      <TextField
        label={g.codeLabel}
        placeholder="123456"
        value={code}
        onChangeText={(x) => setCode(x.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        code
      />
      <View style={styles.consentRow}>
        <Toggle value={consent} onChange={setConsent} accessibilityLabel={g.consent} />
        <Text variant="caption" style={styles.flex}>
          {g.consent}
        </Text>
      </View>
      {first ? (
        <PillButton label={busy ? '…' : g.link} block disabled={busy || code.length < 6} onPress={link} />
      ) : (
        <View style={styles.row}>
          <PillButton label={t.common.close} kind="neutral" style={styles.flex} block onPress={close} />
          <PillButton label={busy ? '…' : g.link} style={styles.flex} block disabled={busy || code.length < 6} onPress={link} />
        </View>
      )}
    </Card>
  );
}

function AccountCard({ onAskDanger }: { onAskDanger: (req: DangerReq) => void }) {
  const g = useGuardianT();
  const t = useT();
  const me = useAuth((s) => s.profile);
  const selected = useGuardian((s) => s.selected);
  const child = useGuardian((s) => s.children.find((c) => c.id === s.selected));
  if (!me) return null;

  const accountLabel = me.display_name.trim() ? `${me.display_name.trim()} · ${me.email}` : me.email;
  const deleteUsername = (me.display_name.trim() || me.email.split('@')[0] || me.email).trim();

  return (
    <View style={styles.gap}>
      <Text variant="overline" style={styles.label}>
        {g.account} · {accountLabel}
      </Text>
      <ListGroup>
        {child && selected ? (
          <ListRow
            title={`${g.unlink} (${child.name.split(' ')[0]})`}
            destructive
            chevron={false}
            onPress={() =>
              onAskDanger({
                kind: 'unlink',
                targetId: selected,
                childName: child.name,
                match: child.name.trim(),
                altMatch: '',
              })
            }
          />
        ) : null}
        <ListRow
          title={t.acct.signOut}
          chevron={false}
          onPress={async () => {
            await api.signOut();
            router.replace('/onboarding');
          }}
        />
        <ListRow
          title={t.profile.del}
          destructive
          chevron={false}
          onPress={() =>
            onAskDanger({
              kind: 'delete',
              targetId: me.id,
              childName: '',
              match: deleteUsername,
              altMatch: me.email.trim(),
            })
          }
        />
      </ListGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  flexGap: { flex: 1, gap: 6 },
  body: { paddingHorizontal: space.screen, gap: space.gap, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8 },
  columns: { flexDirection: 'row', gap: space.gap, alignItems: 'flex-start' },
  col: { gap: space.gap },
  gap: { gap: 10 },
  gapLg: { gap: 16 },
  row: { flexDirection: 'row', gap: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  report: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: radius.inset },
  learnerBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, borderRadius: radius.inset },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  request: { borderRadius: radius.inset, padding: 14, gap: 12 },
  reqHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reqIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  controlSelectRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  subControlRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.inset },
  ctlBadge: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  valuePill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
  },
  column: { flexDirection: 'column', alignItems: 'stretch' },
  nudgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { paddingHorizontal: 4, marginTop: 8 },
  sheetBody: { gap: 12, paddingBottom: 8 },
  timeReadout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.inset,
  },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  dangerHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  addChildWrap: { gap: 6 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  privacyStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
