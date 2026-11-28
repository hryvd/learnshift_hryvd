import { useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { ChatsCircle, DeviceMobile, EyeSlash, GameController, GraduationCap, Play, Sparkle, UsersThree } from '@/components/ui/icons';

import { Card, Chip, EmptyState, SegmentedControl, Text } from '@/components/ui';
import { useTheme } from '@/design/theme';
import { radius } from '@/design/tokens';
import { useNow } from '@/hooks/useNow';
import { useGuardianT } from '@/i18n/staff';
import { formatClock, formatDuration } from '@/i18n/useT';
import type { AppCategory, AppDay, LiveNow } from '@/services/backend/guardian';
import { todayKey } from '@/store/useAppStore';

import { appIcon } from './appIcons';

const DAY_MS = 24 * 3600 * 1000;

export function isLearnShiftApp(pkg?: string | null, label?: string | null): boolean {
  if (pkg === 'com.learnshift.app' || pkg === 'com.learnshift.pitch') return true;
  return label?.trim().toLowerCase() === 'learnshift';
}

function useCatColor() {
  const { c, isNight } = useTheme();
  return (cat: AppCategory | null): string =>
    cat === 'video'
      ? c.accent
      : cat === 'social'
        ? c.indigo
        : cat === 'games'
          ? c.tabInsights
          : cat === 'messaging'
            ? isNight ? '#56C2C0' : '#0EA5A4'
            : cat === 'study'
              ? c.success
              : c.textTertiary;
}

function CatIcon({ cat, size = 18, color }: { cat: AppCategory | null; size?: number; color: string }) {
  const p = { size, weight: 'fill' as const, color };
  if (cat === 'video') return <Play {...p} />;
  if (cat === 'social') return <UsersThree {...p} />;
  if (cat === 'games') return <GameController {...p} />;
  if (cat === 'messaging') return <ChatsCircle {...p} />;
  if (cat === 'study') return <GraduationCap {...p} />;
  if (cat === 'other') return <Sparkle {...p} />;
  return <DeviceMobile {...p} />;
}

/** What the child has open right now, how long it is active, and when the next break is due. */
export function NowCard({
  live,
  apps = [],
  childName,
  scrollLimit,
  gamesLimit,
}: {
  live: LiveNow | null;
  apps?: AppDay[];
  childName: string;
  scrollLimit: number | null;
  gamesLimit: number | null;
}) {
  const { c } = useTheme();
  const g = useGuardianT();
  const color = useCatColor();
  const now = useNow(10_000);
  const updated = live ? Date.parse(live.updatedAt) : 0;
  // The phone reports a new app within seconds and active sessions every minute.
  const fresh = !!live && live.screenOn && !!live.label && now - updated < 4 * 60_000;
  const isVisibleLive = fresh && live!.confidence === 'visible';
  const isInferredRecent = fresh && live!.confidence === 'inferred';
  const inferredMinsAgo = Math.max(1, Math.round((now - updated) / 60_000));
  const sessionMin = isVisibleLive ? live!.sessionMin + Math.max(0, Math.floor((now - updated) / 60_000)) : 0;
  const today = todayKey(new Date(now));
  const recordedTodayMin =
    isVisibleLive && live!.package
      ? apps.reduce((sum, a) => (a.day === today && a.package === live!.package ? sum + a.minutes : sum), 0)
      : 0;
  const appTodayMin = isVisibleLive ? Math.max(sessionMin, recordedTodayMin) : 0;
  const isStudying = isVisibleLive && live!.category === 'study';
  const isLearnShiftLive = isVisibleLive && isLearnShiftApp(live!.package, live!.label);
  const learnShiftRecordedToday = apps.reduce(
    (sum, a) => (a.day === today && isLearnShiftApp(a.package, a.label) ? sum + a.minutes : sum),
    0,
  );
  const learnShiftTodayMin = Math.max(learnShiftRecordedToday, isLearnShiftLive ? sessionMin : 0);
  const learnShiftIcon = appIcon('com.learnshift.app', 'LearnShift', 'study');
  const limit =
    isVisibleLive && (live!.category === 'video' || live!.category === 'social')
      ? scrollLimit
      : isVisibleLive && live!.category === 'games'
        ? gamesLimit
        : null;
  const d = new Date(updated);

  return (
    <Card style={styles.gap}>
      <View style={styles.rowBetween}>
        <Text variant="overline">{g.nowTitle}</Text>
        {isStudying ? (
          <View style={[styles.liveBadge, { backgroundColor: c.success + '1F' }]}>
            <GraduationCap size={12} weight="fill" color={c.success} />
            <Text variant="caption" color="success" style={styles.badgeLabel}>
              {g.liveStudying}
            </Text>
          </View>
        ) : isVisibleLive ? (
          <View style={[styles.liveBadge, { backgroundColor: c.success + '1F' }]}>
            <View style={[styles.dot, { backgroundColor: c.success }]} />
            <Text variant="caption" color="success" style={styles.badgeLabel}>
              LIVE
            </Text>
          </View>
        ) : (
          <View style={[styles.liveBadge, { backgroundColor: c.inset }]}>
            <View style={[styles.dot, { backgroundColor: c.textTertiary }]} />
            <Text variant="caption" color="textTertiary" style={styles.badgeLabel}>
              {g.liveIdle}
            </Text>
          </View>
        )}
      </View>
      {isVisibleLive ? (
        <View style={styles.nowRow}>
          {appIcon(live!.package, live!.label, live!.category) ? (
            <Image source={appIcon(live!.package, live!.label, live!.category)!} style={styles.appIcon} accessibilityIgnoresInvertColors />
          ) : (
            <View style={[styles.appIcon, { backgroundColor: color(live!.category) }]}>
              <CatIcon cat={live!.category} size={24} color="#FFFFFF" />
            </View>
          )}
          <View style={styles.flex}>
            <Text variant="title" numberOfLines={1}>
              {live!.label}
            </Text>
            <Text variant="subhead">
              {isStudying ? g.studyingIn(live!.label!) : g.cats[live!.category ?? 'other']} ·{' '}
              {sessionMin === 0 ? g.justStarted : g.activeFor(formatDuration(sessionMin))}
            </Text>
          </View>
          <View style={styles.nowPills}>
            {appTodayMin > 0 ? <Chip label={g.appToday(formatDuration(appTodayMin))} kind="neutral" /> : null}
            {limit ? <Chip label={g.breakIn(limit - sessionMin)} kind={limit - sessionMin <= 2 ? 'accent' : 'tinted'} /> : null}
          </View>
        </View>
      ) : (
        <View style={styles.nowRow}>
          <View style={[styles.appIcon, { backgroundColor: c.inset }]}>
            <DeviceMobile size={24} weight="fill" color={c.textTertiary} />
          </View>
          <View style={styles.flex}>
            <Text variant="headline">{g.nowIdle}</Text>
            <Text variant="subhead">
              {isInferredRecent
                ? g.recentlyUsed(live!.label!, inferredMinsAgo)
                : live
                  ? g.lastSeen(formatClock(d.getHours() * 60 + d.getMinutes()))
                  : childName}
            </Text>
          </View>
        </View>
      )}
      <View
        style={[
          styles.studyStrip,
          {
            backgroundColor: isLearnShiftLive ? c.success + '14' : c.inset,
            borderColor: isLearnShiftLive ? c.success + '44' : c.hairline,
          },
        ]}
      >
        {learnShiftIcon ? (
          <Image source={learnShiftIcon} style={styles.studyMiniIcon} accessibilityIgnoresInvertColors />
        ) : (
          <GraduationCap
            size={16}
            weight="fill"
            color={isLearnShiftLive || learnShiftTodayMin > 0 ? c.success : c.textTertiary}
          />
        )}
        <Text variant="caption" color={isLearnShiftLive || learnShiftTodayMin > 0 ? 'text' : 'textSecondary'} style={styles.flex}>
          {isLearnShiftLive
            ? g.learnShiftStudyingNow
            : learnShiftTodayMin > 0
              ? g.learnShiftStudyToday(formatDuration(learnShiftTodayMin))
              : g.learnShiftNotUsedToday}
        </Text>
        {isLearnShiftLive ? (
          <View style={[styles.studyTimePill, { backgroundColor: c.success + '1F' }]}>
            <Text variant="caption" color="success" style={styles.studyTimeLabel}>
              {learnShiftTodayMin > 0 ? formatDuration(learnShiftTodayMin) : '< 1m'}
            </Text>
          </View>
        ) : learnShiftTodayMin > 0 ? (
          <GraduationCap size={15} weight="fill" color={c.success} />
        ) : null}
      </View>
      <View style={[styles.privacyStrip, { backgroundColor: c.inset, borderColor: c.hairline }]}>
        <EyeSlash size={15} weight="fill" color={c.success} />
        <Text variant="caption" color="textSecondary" style={styles.flex}>
          {g.note}
        </Text>
      </View>
    </Card>
  );
}

type Range = 'today' | 'yesterday' | 'week';
type Row = { key: string; label: string; category: AppCategory; minutes: number };

/** Minutes per app as horizontal bars, colored by kind of app. */
export function AppsCard({ apps, childName }: { apps: AppDay[]; childName: string }) {
  const { c } = useTheme();
  const g = useGuardianT();
  const color = useCatColor();
  const [range, setRange] = useState<Range>('today');
  const now = useNow(60_000);

  const rows = useMemo(() => {
    const today = todayKey(new Date(now));
    const yesterday = todayKey(new Date(now - DAY_MS));
    const pick = apps.filter((a) => (range === 'today' ? a.day === today : range === 'yesterday' ? a.day === yesterday : true));
    const byApp = new Map<string, Row>();
    for (const a of pick) {
      const r = byApp.get(a.package) ?? { key: a.package, label: a.label, category: a.category, minutes: 0 };
      r.minutes += a.minutes;
      byApp.set(a.package, r);
    }
    const sorted = [...byApp.values()].sort((a, b) => b.minutes - a.minutes);
    const top = sorted.slice(0, 7);
    const rest = sorted.slice(7).reduce((s, r) => s + r.minutes, 0);
    if (rest > 0) top.push({ key: 'other', label: g.otherApps, category: 'other', minutes: rest });
    return top;
  }, [apps, range, now, g.otherApps]);

  const total = rows.reduce((s, r) => s + r.minutes, 0);
  const max = Math.max(1, ...rows.map((r) => r.minutes));
  const byCat = (['video', 'social', 'games', 'messaging', 'study', 'other'] as AppCategory[])
    .map((cat) => ({ cat, minutes: rows.filter((r) => r.category === cat).reduce((s, r) => s + r.minutes, 0) }))
    .filter((x) => x.minutes > 0);

  return (
    <Card style={styles.gap}>
      <View style={styles.rowBetween}>
        <Text variant="headline">{g.appsTitle}</Text>
        {total > 0 ? <Text variant="headline">{formatDuration(total)}</Text> : null}
      </View>
      <SegmentedControl<Range>
        options={[
          { value: 'today', label: g.today },
          { value: 'yesterday', label: g.yesterday },
          { value: 'week', label: g.week },
        ]}
        value={range}
        onChange={setRange}
        compact
      />
      {rows.length === 0 ? (
        <EmptyState title={g.noApps} subtitle={g.noAppsSub(childName)} expression="curious" />
      ) : (
        <>
          {/* Share of time by kind of app. */}
          <View style={[styles.stack, { backgroundColor: c.inset }]} accessibilityLabel={g.appsTitle}>
            {byCat.map((x) => (
              <View key={x.cat} style={{ flex: x.minutes, backgroundColor: color(x.cat) }} />
            ))}
          </View>
          <View style={styles.legend}>
            {byCat.map((x) => (
              <View key={x.cat} style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: color(x.cat) }]} />
                <Text variant="caption">
                  {g.cats[x.cat]} {formatDuration(x.minutes)}
                </Text>
              </View>
            ))}
          </View>
          {rows.map((r) => (
            <View
              key={r.key}
              style={styles.appRow}
              accessible
              accessibilityLabel={`${r.label}, ${formatDuration(r.minutes)}`}
            >
              {appIcon(r.key, r.label, r.category) ? (
                <Image source={appIcon(r.key, r.label, r.category)!} style={styles.smallIcon} accessibilityIgnoresInvertColors />
              ) : (
                <View style={[styles.smallIcon, { backgroundColor: color(r.category) }]}>
                  <CatIcon cat={r.category} size={14} color="#FFFFFF" />
                </View>
              )}
              <View style={styles.flex}>
                <View style={styles.rowBetween}>
                  <Text variant="subhead" color="text" numberOfLines={1} style={styles.flex}>
                    {r.label}
                  </Text>
                  <Text variant="subhead" color="text">
                    {formatDuration(r.minutes)}
                  </Text>
                </View>
                <View style={[styles.track, { backgroundColor: c.inset }]}>
                  <View
                    style={[styles.bar, { width: `${Math.max(3, (r.minutes / max) * 100)}%`, backgroundColor: color(r.category) }]}
                  />
                </View>
              </View>
            </View>
          ))}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  badgeLabel: { fontSize: 11, letterSpacing: 0.6, fontWeight: '700' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  privacyStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  studyStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  studyMiniIcon: { width: 18, height: 18, borderRadius: 5 },
  studyTimePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  studyTimeLabel: { fontSize: 11, fontWeight: '700' },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nowPills: { alignItems: 'flex-end', gap: 6 },
  appIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  smallIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  stack: { flexDirection: 'row', height: 12, borderRadius: radius.sm, overflow: 'hidden' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  appRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  track: { height: 8, borderRadius: 4, marginTop: 6, overflow: 'hidden' },
  bar: { height: 8, borderRadius: 4 },
});
