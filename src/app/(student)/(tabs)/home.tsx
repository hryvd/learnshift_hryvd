import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import {
  ArrowRight,
  ChatsCircle,
  CheckCircle,
  Clock,
  Lightning,
  ListChecks,
  MonitorPlay,
  MoonStars,
  Play,
  Question,
  ShieldCheck,
  Sparkle,
  Timer,
  UserCircle,
} from 'phosphor-react-native';

import { IslaScene } from '@/components/isla/IslaScene';
import { Paty, PatyAvatar } from '@/components/mascot/Paty';
import { AppLaunchSheet, LauncherDock } from '@/components/student/LauncherDock';
import { Screen, useTabInset } from '@/components/student/Screen';
import {
  AnimatedNumber,
  Card,
  Chip,
  DevChip,
  InsetCard,
  PillButton,
  PressableScale,
  RiskChip,
  Ring,
  SparkCount,
  Stagger,
  StreakRow,
  Text,
  TickGauge,
} from '@/components/ui';
import { type MirroredApp } from '@/data/mirroredApps';
import { SHORT } from '@/data/skills';
import { haptic } from '@/design/haptics';
import { pressScale } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { fontFor } from '@/design/typography';
import { useLive } from '@/hooks/useLive';
import { splitDuration, useWeek } from '@/hooks/useWeek';
import { formatClock, formatDuration, useL, useT } from '@/i18n/useT';
import { IS_PITCH } from '@/lib/config';
import { openOverlaySettings, platform, requestAccess, showOverlayNow, status as monitorStatus } from '@/services/monitor';
import { useDevice } from '@/services/monitor/bridge';
import { DEFAULT_SENTINEL, useAppStore } from '@/store/useAppStore';

const FREQ_OPTIONS = [
  { sec: 15, label: '15s' },
  { sec: 30, label: '30s' },
  { sec: 60, label: '1m' },
  { sec: 180, label: '3m' },
  { sec: 300, label: '5m' },
  { sec: 600, label: '10m' },
  { sec: 900, label: '15m' },
] as const;

export default function Home() {
  const { c } = useTheme();
  const t = useT();
  const L = useL();
  const live = useLive();
  const week = useWeek();
  const coins = useAppStore((s) => s.coins);
  const built = useAppStore((s) => s.built);
  const bedtime = useAppStore((s) => s.bedtime);
  const mastery = useAppStore((s) => s.mastery);
  const { width } = useWindowDimensions();
  const inset = useTabInset();
  const cardW = Math.min(width, 560) - space.screen * 2;
  const gaugeW = Math.min(320, cardW - space.card * 2);

  const [num, unit] = splitDuration(live.usedMinutes);
  const cap = formatDuration(live.capMinutes);
  // Algebra slips are what Mika notices first; fall back to the weakest blocked skill.
  const blocked = live.blocked.includes('algebraic') ? 'algebraic' : (live.blocked[0] ?? 'algebraic');
  const openDemo = () => router.push('/demo');
  // Guardrail: no quizzes or learning breaks inside the bedtime window.
  const night = live.risk.lateNight;
  const devStatus = useDevice((s) => s.status);
  const overlayIntervalSec = useAppStore((s) => s.sentinel?.overlayIntervalSec ?? DEFAULT_SENTINEL.overlayIntervalSec);
  const [launchApp, setLaunchApp] = useState<MirroredApp | null>(null);
  const [shieldNote, setShieldNote] = useState<string | null>(null);

  const testOverlay = () => {
    haptic.light();
    if (platform === 'android') {
      const s = monitorStatus();
      if (!s.overlay) {
        setShieldNote('Tap "Display over other apps" below so the white swipe-up feed floats over real opened apps.');
        openOverlaySettings();
        return;
      }
      if (showOverlayNow('Opened App', 'quiz', 3000)) {
        setShieldNote('White Swipe Feed armed (3s) — open TikTok, YouTube, or any app to see it float over.');
        return;
      }
    }
    router.push('/feed');
  };

  const pickInterval = (sec: number, label: string) => {
    haptic.select();
    useAppStore.getState().setOverlayInterval(sec);
    setShieldNote(`Overlay will pop up every ${label} while using another app.`);
  };

  let i = 0;
  return (
    <Screen
      tabs
      overlay={
        <>
          <View style={[styles.demo, { bottom: inset - 6 }]} pointerEvents="box-none">
            {IS_PITCH ? <DevChip label={t.demo.title} onPress={openDemo} /> : null}
          </View>
          <AppLaunchSheet app={launchApp} onClose={() => setLaunchApp(null)} />
        </>
      }
    >
      <Stagger index={i++} style={styles.header}>
        <Pressable
          onLongPress={() => {
            haptic.medium();
            if (IS_PITCH) openDemo();
          }}
          delayLongPress={450}
          accessibilityRole="header"
          accessibilityLabel="LearnShift"
          style={styles.brand}
        >
          <PatyAvatar size={30} />
          <Text variant="title" style={styles.wordmark}>
            LearnShift
          </Text>
        </Pressable>
        <SparkCount value={week.streakCount} />
      </Stagger>

      <Stagger index={i++} style={styles.streak}>
        <StreakRow days={week.streak} />
      </Stagger>

      <Stagger index={i++}>
        <Card style={styles.scrollCard}>
          <View style={styles.shieldHeader}>
            <View style={[styles.shieldIcon, { backgroundColor: c.accentTint }]}>
              <ShieldCheck size={20} weight="fill" color={c.accent} />
            </View>
            <View style={styles.flexGap}>
              <Text variant="headline">{t.home.shieldActive}</Text>
              <Text variant="subhead">{shieldNote ?? t.home.shieldSetup}</Text>
            </View>
          </View>

          {platform === 'android' ? (
            <View style={styles.permRow}>
              <Chip
                label={devStatus.access ? 'Usage Access: On' : 'Grant Usage Access'}
                icon={<CheckCircle size={12} weight="fill" color={devStatus.access ? c.success : c.accent} />}
                tint={devStatus.access ? { bg: c.inset, fg: c.success } : { bg: c.accentTint, fg: c.accent }}
                onPress={() => {
                  haptic.select();
                  void requestAccess();
                }}
              />
              <Chip
                label={devStatus.overlay ? 'Overlay: On' : 'Allow Overlay Over Apps'}
                icon={<ShieldCheck size={12} weight="fill" color={devStatus.overlay ? c.success : c.accent} />}
                tint={devStatus.overlay ? { bg: c.inset, fg: c.success } : { bg: c.accentTint, fg: c.accent }}
                onPress={() => {
                  haptic.select();
                  openOverlaySettings();
                }}
              />
            </View>
          ) : null}

          <View style={styles.freqWrap}>
            <View style={styles.freqLabel}>
              <Clock size={14} weight="bold" color={c.textSecondary} />
              <Text variant="caption" color="textSecondary">
                Show overlay while using other apps every:
              </Text>
            </View>
            <View style={styles.freqRow}>
              {FREQ_OPTIONS.map((opt) => {
                const active = overlayIntervalSec === opt.sec;
                return (
                  <PressableScale
                    key={opt.sec}
                    onPress={() => pickInterval(opt.sec, opt.label)}
                    style={[styles.freqPill, { backgroundColor: active ? c.accent : c.inset }]}
                  >
                    <Text variant="caption" color={active ? c.onAccent : c.text} style={fontFor(700)}>
                      {opt.label}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
          </View>

          <View style={styles.scrollBtns}>
            <PillButton
              label={t.home.testOverlayNow}
              size="sm"
              icon={<Play size={13} weight="fill" color={c.onAccent} />}
              onPress={testOverlay}
            />
            <PillButton
              label={t.shift.overlayQuizTitle}
              kind="secondary"
              size="sm"
              icon={<MonitorPlay size={13} weight="fill" color={c.accent} />}
              onPress={() => router.push('/feed')}
            />
          </View>
        </Card>
      </Stagger>

      <Stagger index={i++}>
        <LauncherDock onSelectApp={setLaunchApp} onStatusMessage={setShieldNote} />
      </Stagger>

      <Stagger index={i++}>
        <Card style={styles.howCard}>
          <Text variant="headline">{t.home.howTitle}</Text>
          <View style={styles.stepRow}>
            <View style={[styles.stepNum, { backgroundColor: c.accentTint }]}>
              <Text variant="caption" color="accent" style={fontFor(700)}>
                1
              </Text>
            </View>
            <Text variant="subhead" style={styles.flex}>
              {t.home.howStep1}
            </Text>
          </View>
          <View style={styles.stepRow}>
            <View style={[styles.stepNum, { backgroundColor: c.accentTint }]}>
              <Text variant="caption" color="accent" style={fontFor(700)}>
                2
              </Text>
            </View>
            <Text variant="subhead" style={styles.flex}>
              {t.home.howStep2}
            </Text>
          </View>
          <View style={styles.stepRow}>
            <View style={[styles.stepNum, { backgroundColor: c.accentTint }]}>
              <Text variant="caption" color="accent" style={fontFor(700)}>
                3
              </Text>
            </View>
            <Text variant="subhead" style={styles.flex}>
              {t.home.howStep3}
            </Text>
          </View>
        </Card>
      </Stagger>

      <Stagger index={i++}>
        <Text variant="title" style={styles.section}>
          {t.home.today}
        </Text>
      </Stagger>

      <Stagger index={i++}>
        <Card style={styles.hero}>
          <View style={styles.chipRow}>
            <RiskChip level={live.risk.level} />
          </View>
          <View style={styles.center}>
            <TickGauge
              progress={Math.min(1, live.usedMinutes / live.capMinutes)}
              width={gaugeW}
              color={live.risk.level === 'calm' ? c.accent : live.risk.level === 'winddown' ? c.indigo : c.accent}
              accessibilityLabel={t.home.gaugeLabel(formatDuration(live.usedMinutes), cap)}
            >
              <View style={styles.heroNum}>
                <AnimatedNumber value={num} variant="display" fromZero={false} />
                <Text variant="displayUnit" style={styles.unit}>
                  {unit}
                </Text>
              </View>
              <Text variant="subhead">{live.schoolDay ? t.home.ofCap(cap) : t.home.ofCapWeekend(cap)}</Text>
            </TickGauge>
          </View>
          <View style={styles.row}>
            {night ? (
              <InsetCard
                label={t.risk.winddown}
                value={t.home.windDown}
                chevron
                style={styles.flex}
                onPress={() => router.push('/winddown')}
              />
            ) : (
              <InsetCard
                label={t.home.nextBreak}
                value={L(SHORT[live.root])}
                chevron
                style={styles.flex}
                onPress={() => router.push({ pathname: '/break/[id]', params: { id: live.root } })}
              />
            )}
            <InsetCard
              label={t.home.bedtime}
              value={formatClock(bedtime.start)}
              chevron
              style={styles.flex}
              onPress={() => router.push('/bedtime')}
            />
          </View>
        </Card>
      </Stagger>

      <Stagger index={i++}>
        <Card style={styles.breakCard}>
          {night ? (
            <View style={styles.breakText}>
              <Text variant="headline">{t.home.nightTitle}</Text>
              <Text variant="subhead">{t.home.nightSub}</Text>
              <PillButton label={t.home.nightBtn} style={styles.mt} onPress={() => router.push('/winddown')} />
            </View>
          ) : (
            <View style={styles.breakText}>
              <Text variant="headline">{t.home.readyTitle}</Text>
              <Text variant="subhead">{t.home.readySub(L(SHORT[live.root]))}</Text>
              <PillButton
                label={t.home.startBreak}
                style={styles.mt}
                onPress={() => router.push({ pathname: '/break/[id]', params: { id: live.root } })}
              />
            </View>
          )}
          <Paty expression={night ? 'sleepy' : 'happy'} prop={night ? 'none' : 'pencil'} size={112} />
        </Card>
      </Stagger>

      <Stagger index={i++}>
        <Card
          onPress={() => router.push({ pathname: '/learn', params: { seg: 'skills' } })}
          style={styles.gapCard}
          accessibilityLabel={t.home.gapTitle(L(SHORT[blocked]), L(SHORT[live.root]))}
        >
          <View style={styles.flexGap}>
            <Text variant="headline" numberOfLines={1}>
              {t.home.gapTitle(L(SHORT[blocked]), L(SHORT[live.root]))}
            </Text>
            <Text variant="subhead" numberOfLines={1}>
              {t.home.gapSub}
            </Text>
          </View>
          <View style={styles.mini}>
            <Ring progress={mastery[blocked]} size={40} stroke={5} color={c.textTertiary}>
              <Text variant="caption" color="text" style={styles.ringTxt}>
                {L(SHORT[blocked]).slice(0, 3)}
              </Text>
            </Ring>
            <ArrowRight size={16} weight="bold" color={c.textSecondary} />
            <Ring progress={mastery[live.root]} size={40} stroke={5} color={c.accent}>
              <Text variant="caption" color="accent" style={styles.ringTxt}>
                {L(SHORT[live.root]).slice(0, 3)}
              </Text>
            </Ring>
          </View>
        </Card>
      </Stagger>

      <Stagger index={i++}>
        <Card
          style={styles.islaCard}
          padded={false}
          onPress={() => router.push('/isla')}
          accessibilityLabel={t.home.islaTitle}
        >
          <View style={styles.islaArt}>
            <IslaScene built={built} width={Math.min(cardW, 360)} />
          </View>
          <View style={styles.islaText}>
            <View style={styles.flexGap}>
              <Text variant="headline">{t.home.islaTitle}</Text>
              <Text variant="subhead" numberOfLines={1}>
                {t.home.islaSub(coins.toLocaleString('en-US'))}
              </Text>
            </View>
            <View style={[styles.softPill, { backgroundColor: c.accentFaded }]} importantForAccessibility="no">
              <Text variant="subhead" color="onAccent" style={fontFor(700)}>
                {t.home.openIsla}
              </Text>
            </View>
          </View>
        </Card>
      </Stagger>

      <Stagger index={i++}>
        <Text variant="title" style={styles.section}>
          All Features & Pages
        </Text>
      </Stagger>

      <Stagger index={i++}>
        <View style={styles.featuresGrid}>
          {(
            [
              {
                title: 'White Swipe Feed',
                sub: '3-card reset decks',
                icon: <Sparkle size={18} weight="fill" color={c.accent} />,
                href: '/feed',
              },
              {
                title: 'App Guard View',
                sub: 'Launch + overlay feed',
                icon: <MonitorPlay size={18} weight="fill" color={c.accent} />,
                href: { pathname: '/simulate', params: { app: 'tiktok' } },
              },
              {
                title: 'Adaptive Quiz',
                sub: L(SHORT[live.root]),
                icon: <Question size={18} weight="fill" color={c.tabLearn} />,
                href: { pathname: '/quiz/[skillId]', params: { skillId: live.root } },
              },
              {
                title: '45s Break',
                sub: 'Guided mini lesson',
                icon: <Lightning size={18} weight="fill" color={c.spark} />,
                href: { pathname: '/break/[id]', params: { id: live.root } },
              },
              {
                title: 'AI Tutor',
                sub: 'EN · FIL step-by-step',
                icon: <ChatsCircle size={18} weight="fill" color={c.tabInsights} />,
                href: '/tutor',
              },
              {
                title: 'Focus Timer',
                sub: 'Pause overlays',
                icon: <Timer size={18} weight="fill" color={c.tabProfile} />,
                href: '/focus',
              },
              {
                title: 'Wind-down',
                sub: 'Calm night tools',
                icon: <MoonStars size={18} weight="fill" color={c.indigo} />,
                href: '/winddown',
              },
              {
                title: 'Nudge History',
                sub: 'Recent overlay log',
                icon: <ListChecks size={18} weight="fill" color={c.accent} />,
                href: '/nudges',
              },
              {
                title: 'Offline Packs',
                sub: 'Saved lessons',
                icon: <CheckCircle size={18} weight="fill" color={c.success} />,
                href: '/offline',
              },
              {
                title: 'Privacy & Bedtime',
                sub: 'Audit & schedule',
                icon: <ShieldCheck size={18} weight="fill" color={c.success} />,
                href: '/privacy',
              },
              {
                title: 'Account & Link',
                sub: 'Guardian · Class · Setup',
                icon: <UserCircle size={18} weight="fill" color={c.accent} />,
                href: '/account',
              },
              {
                title: 'Bedtime Hours',
                sub: formatClock(bedtime.start),
                icon: <Clock size={18} weight="fill" color={c.indigo} />,
                href: '/bedtime',
              },
            ] as const
          ).map((item) => (
            <PressableScale
              key={item.title}
              scaleTo={pressScale.card}
              onPress={() => {
                haptic.select();
                router.push(item.href as Parameters<typeof router.push>[0]);
              }}
              style={[styles.featureTile, { backgroundColor: c.card }]}
            >
              <View style={[styles.featureIcon, { backgroundColor: c.inset }]}>{item.icon}</View>
              <Text variant="headline" numberOfLines={1}>
                {item.title}
              </Text>
              <Text variant="caption" numberOfLines={1}>
                {item.sub}
              </Text>
            </PressableScale>
          ))}
        </View>
      </Stagger>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  wordmark: { fontSize: 24, letterSpacing: -0.8, ...fontFor(800) },
  streak: { paddingTop: 30, marginBottom: 4 },
  section: { marginTop: 14, marginLeft: 2 },
  hero: { gap: 14, paddingTop: 14 },
  chipRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: -26, zIndex: 1 },
  center: { alignItems: 'center' },
  heroNum: { flexDirection: 'row', alignItems: 'flex-end' },
  unit: { marginBottom: 8, marginLeft: 2 },
  row: { flexDirection: 'row', gap: space.gap },
  flex: { flex: 1 },
  flexGap: { flex: 1, gap: 2 },
  breakCard: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden', paddingRight: 8 },
  breakText: { flex: 1, gap: 2 },
  scrollCard: { gap: 12 },
  scrollBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  permRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  freqWrap: { gap: 8 },
  freqLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  freqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  freqPill: { paddingHorizontal: 12, height: 32, borderRadius: radius.pill, justifyContent: 'center', alignItems: 'center' },
  shieldHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shieldIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  howCard: { gap: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepNum: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  mt: { marginTop: 12, alignSelf: 'flex-start' },
  gapCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mini: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ringTxt: { fontSize: 10, ...fontFor(700) },
  islaCard: { overflow: 'hidden' },
  islaArt: { alignItems: 'center', paddingTop: 8 },
  islaText: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: space.card, paddingTop: 4 },
  featuresGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  featureTile: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: radius.card,
    padding: 14,
    gap: 4,
  },
  featureIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  demo: { position: 'absolute', right: space.screen },
  softPill: { height: 32, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center' },
});
