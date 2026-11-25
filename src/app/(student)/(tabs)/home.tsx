import { useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import {
  ArrowRight,
  BookOpen,
  CheckCircle,
  Clock,
  Flame,
  GearSix,
  MonitorPlay,
  MoonStars,
  ShieldCheck,
  UsersThree,
  WarningCircle,
} from '@/components/ui/icons';

import { IslaScene } from '@/components/isla/IslaScene';
import { SagwanIcon } from '@/components/isla/SagwanIcon';
import { Paty } from '@/components/mascot/Paty';
import { Screen } from '@/components/student/Screen';
import {
  AnimatedNumber,
  Card,
  Chip,
  PillButton,
  PressableScale,
  ProgressBar,
  Stagger,
  Text,
  TickGauge,
} from '@/components/ui';
import { SUBJECTS } from '@/data/localQuestions';
import { haptic } from '@/design/haptics';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { fontFor } from '@/design/typography';
import { useLive } from '@/hooks/useLive';
import { splitDuration } from '@/hooks/useWeek';
import { formatDuration, useT } from '@/i18n/useT';
import { IS_PITCH } from '@/lib/config';
import { throwSagwan, useSocial } from '@/services/backend/social';
import { pullStudent } from '@/services/backend/sync';
import { platform, reportNow } from '@/services/monitor';
import { useDevice } from '@/services/monitor/bridge';
import { todayKey, useAppStore } from '@/store/useAppStore';
import { useAuth } from '@/store/useAuth';

/** Pull-to-refresh: fresh on-device minutes, a usage report, then the latest server state. */
async function refreshHome() {
  await useDevice.getState().refresh();
  const id = useAuth.getState().profile?.id;
  if (IS_PITCH || !id) return;
  await reportNow().catch(() => {});
  await pullStudent(id);
}

export default function Home() {
  const { c } = useTheme();
  const t = useT();
  const { width } = useWindowDimensions();
  const name = useAppStore((s) => s.studentName);
  const grade = useAppStore((s) => s.learningGrade);
  const subject = useAppStore((s) => s.learningSubject);
  const paused = useAppStore((s) => s.paused);
  const lang = useAppStore((s) => s.lang);
  const usage = useAppStore((s) => s.usage);
  const breaksToday = useAppStore((s) => s.breaksToday);
  const built = useAppStore((s) => s.built);
  const coins = useAppStore((s) => s.coins);
  const archipelagos = useSocial((s) => s.archipelagos);
  const selectedArchipelagoId = useSocial((s) => s.selectedArchipelagoId);
  const socialEnabled = useSocial((s) => s.socialEnabled);
  const [sagwanBanner, setSagwanBanner] = useState<string | null>(null);
  const fil = lang === 'fil';
  const dev = useDevice((s) => s.status);
  const live = useLive();
  const protectedApps = platform === 'android' && dev.access && dev.overlay && dev.running && !paused;

  const cardW = Math.min(width, 560) - space.screen * 2;
  const gaugeW = Math.min(300, cardW - space.card * 2);
  const islaW = Math.min(340, Math.max(220, cardW - space.card * 2));

  const summary = useMemo(() => {
    const todayRow = usage.find((u) => u.day === todayKey());
    const videoMin = todayRow?.video ?? 0;
    const socialMin = todayRow?.social ?? 0;
    const gamesMin = todayRow?.games ?? 0;
    const trackedLeisure = videoMin + socialMin + gamesMin;
    const hasTrackedUsage =
      todayRow != null && (todayRow.total > 0 || trackedLeisure > 0 || (todayRow.learning ?? 0) > 0);
    const entertainmentMinutes = hasTrackedUsage ? trackedLeisure : live.usedMinutes;
    const learningMinutes = Math.max(todayRow?.learning ?? 0, breaksToday * 2);
    const nonLeisureTotal = Math.max(0, live.usedMinutes - entertainmentMinutes);
    const otherMinutes = Math.max(nonLeisureTotal, learningMinutes);
    const [num, unit] = splitDuration(entertainmentMinutes);
    const cap = formatDuration(live.capMinutes);
    const leisureProgress = live.capMinutes > 0 ? Math.min(1, entertainmentMinutes / live.capMinutes) : 0;
    const totalActive = entertainmentMinutes + otherMinutes;
    const leisureShare = totalActive > 0 ? Math.round((entertainmentMinutes / totalActive) * 100) : 0;
    const otherShare = totalActive > 0 ? Math.max(0, 100 - leisureShare) : 0;
    const tooMuchLeisure =
      leisureProgress >= 0.7 || (entertainmentMinutes >= 30 && entertainmentMinutes > otherMinutes * 2);
    return {
      videoMin,
      socialMin,
      gamesMin,
      learningMinutes,
      entertainmentMinutes,
      otherMinutes,
      num,
      unit,
      cap,
      leisureProgress,
      totalActive,
      leisureShare,
      otherShare,
      tooMuchLeisure,
    };
  }, [usage, breaksToday, live.usedMinutes, live.capMinutes]);

  const entText = formatDuration(summary.entertainmentMinutes);

  return (
    <Screen tabs onRefresh={refreshHome}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text variant="overline">LEARN SHIFT</Text>
          <Text variant="largeTitle">
            {fil ? 'Kumusta' : 'Hey'}
            {name ? `, ${name.split(' ')[0]}` : ''}!
          </Text>
        </View>
        <PressableScale
          accessibilityLabel="Open settings"
          onPress={() => router.push('/profile')}
          style={[styles.icon, { backgroundColor: c.card }]}
        >
          <GearSix size={24} color={c.text} />
        </PressableScale>
      </View>

      <Stagger index={0}>
        <Card style={styles.leisureCard}>
          <View style={styles.leisureTop}>
            <View style={styles.leisureTitleRow}>
              <MonitorPlay size={16} weight="fill" color={summary.tooMuchLeisure ? c.accent : c.textSecondary} />
              <Text variant="overline" color={summary.tooMuchLeisure ? 'accent' : 'textSecondary'}>
                {fil ? 'ORAS SA LIBANGAN · NGAYON' : 'ENTERTAINMENT SCREEN TIME · TODAY'}
              </Text>
            </View>
            <Chip
              label={
                summary.tooMuchLeisure
                  ? fil
                    ? 'Sobra sa libangan'
                    : 'Too much leisure'
                  : fil
                    ? `Sakop: 0m – ${summary.cap}`
                    : `Range: 0m – ${summary.cap}`
              }
              icon={
                summary.tooMuchLeisure ? (
                  <WarningCircle size={12} weight="fill" color={c.accent} />
                ) : (
                  <CheckCircle size={12} weight="fill" color={c.success} />
                )
              }
              tint={summary.tooMuchLeisure ? { bg: c.accentTint, fg: c.accent } : { bg: c.inset, fg: c.success }}
            />
          </View>

          <View style={styles.center}>
            <TickGauge
              progress={summary.leisureProgress}
              width={gaugeW}
              color={summary.tooMuchLeisure ? c.accent : live.risk.level === 'winddown' ? c.indigo : c.accent}
              accessibilityLabel={`${entText} of ${summary.cap} entertainment range`}
            >
              <View style={styles.heroNum}>
                <AnimatedNumber value={summary.num} variant="display" fromZero={false} />
                <Text variant="displayUnit" style={styles.unit}>
                  {summary.unit}
                </Text>
              </View>
              <Text variant="subhead">
                {fil ? `Range sa libangan · 0m – ${summary.cap}` : `Entertainment range · 0m – ${summary.cap}`}
              </Text>
              <Text variant="caption" color="textSecondary">
                {fil ? 'Video, social at games lang' : 'Videos, social & games only'}
              </Text>
            </TickGauge>
          </View>

          {summary.totalActive > 0 ? (
            <ProgressBar
              height={10}
              segments={[
                {
                  value: Math.max(0.02, summary.entertainmentMinutes),
                  color: summary.tooMuchLeisure ? c.accent : c.warning,
                },
                { value: Math.max(0.02, summary.otherMinutes), color: c.success },
              ]}
              accessibilityLabel={`${summary.leisureShare}% entertainment vs ${summary.otherShare}% learning and other`}
            />
          ) : null}

          <View style={styles.row}>
            <View style={[styles.compareBox, { backgroundColor: c.inset }]}>
              <Text variant="caption" color={summary.tooMuchLeisure ? 'accent' : 'textSecondary'} style={fontFor(700)}>
                {fil ? `Libangan (${summary.leisureShare}%)` : `Entertainment (${summary.leisureShare}%)`}
              </Text>
              <Text variant="title">{entText}</Text>
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                Video {summary.videoMin}m · Social {summary.socialMin}m · Games {summary.gamesMin}m
              </Text>
            </View>
            <View style={[styles.compareBox, { backgroundColor: c.inset }]}>
              <Text variant="caption" color="success" style={fontFor(700)}>
                {fil ? `Pag-aaral at Iba (${summary.otherShare}%)` : `Learning & Other (${summary.otherShare}%)`}
              </Text>
              <Text variant="title">{formatDuration(summary.otherMinutes)}</Text>
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                {summary.learningMinutes > 0
                  ? `${formatDuration(summary.learningMinutes)} ${fil ? 'pag-aaral' : 'study'} · ${breaksToday} ${fil ? 'pahinga' : 'breaks'}`
                  : `${breaksToday} ${fil ? 'pahingang aral' : 'learning breaks'}`}
              </Text>
            </View>
          </View>

          <View style={[styles.insightBox, { backgroundColor: summary.tooMuchLeisure ? c.accentTint : c.inset }]}>
            <Text variant="subhead" color={summary.tooMuchLeisure ? 'accent' : 'textSecondary'}>
              {summary.tooMuchLeisure
                ? fil
                  ? `Karamihan sa oras mo sa screen (${entText} sa 0m – ${summary.cap}) ay napupunta sa libangan kaysa sa pag-aaral o ibang gawain.`
                  : `Most of your screen time (${entText} of 0m – ${summary.cap}) is going to entertainment rather than learning or other things.`
                : fil
                  ? `Nagamit mo ang ${entText} sa 0m – ${summary.cap} mong range sa libangan ngayon, at may oras pa para sa pag-aaral at pahinga.`
                  : `You’ve used ${entText} of your 0m – ${summary.cap} entertainment range today, leaving room for learning and rest.`}
            </Text>
          </View>
        </Card>
      </Stagger>

      <Stagger index={1}>
        <Card style={styles.hero}>
          <View style={styles.heroHead}>
            <View style={styles.flex}>
              <Text variant="overline" color="accent">
                {fil ? 'MALIIT NA HAKBANG, BAGONG KAALAMAN' : 'A LITTLE BREAK. A NEW IDEA.'}
              </Text>
              <Text variant="largeTitle" style={styles.headline}>
                {'Scrolling\nbetter minutes.'}
              </Text>
            </View>
            <Paty size={88} expression="happy" prop="pencil" />
          </View>
          <Text variant="body" color="textSecondary">
            {fil
              ? 'Pumili ng sagot. Alamin kung bakit. Mag-swipe kapag handa ka na.'
              : 'Pick an answer. Find out why. Swipe when you’re ready.'}
          </Text>
          <View style={[styles.tag, { backgroundColor: c.inset }]}>
            <BookOpen size={18} color={c.accent} />
            <Text variant="subhead">
              Grade {grade} ·{' '}
              {SUBJECTS.find((s) => s.id === subject)?.label ?? (fil ? 'Lahat ng paksa' : 'All subjects')} · Offline
            </Text>
          </View>
          <PillButton
            label={fil ? 'Tara, matuto!' : 'Let’s learn'}
            block
            size="lg"
            icon={<ArrowRight size={20} color={c.onAccent} />}
            onPress={() => router.push('/feed')}
          />
        </Card>
      </Stagger>

      <Stagger index={2}>
        <Card style={[styles.gap, styles.islaCard]} padded={false}>
          <PressableScale
            onPress={() => router.push('/isla')}
            accessibilityLabel={t.home.islaTitle}
            style={styles.islaArt}
          >
            <IslaScene built={built} width={islaW} interactive={false} />
          </PressableScale>
          <View style={styles.islaBody}>
            {(() => {
              const activeArch = archipelagos.find((a) => a.id === selectedArchipelagoId) ?? archipelagos[0] ?? null;
              const driftingMate = activeArch?.members.find((m) => !m.isMe && m.driftLevel >= 0.25) ?? null;
              const mateFirst = driftingMate?.displayName.split(' ')[0] ?? '';
              return (
                <>
                  <View style={styles.islaHead}>
                    <View style={styles.flex}>
                      <Text variant="headline">{t.home.islaTitle}</Text>
                      <Text variant="subhead" numberOfLines={1}>
                        {t.home.islaSub(coins.toLocaleString('en-US'))}
                      </Text>
                    </View>
                    {socialEnabled && activeArch ? (
                      <Chip
                        label={t.home.kapuluanStreak(activeArch.streakDays)}
                        kind="tinted"
                        icon={<Flame size={13} weight="fill" color={c.accent} />}
                      />
                    ) : null}
                  </View>

                  {socialEnabled && activeArch ? (
                    <Text variant="caption" color={driftingMate ? 'warning' : 'textSecondary'} numberOfLines={1}>
                      {sagwanBanner ??
                        (driftingMate
                          ? t.home.kapuluanDrift(mateFirst)
                          : t.home.kapuluanAllGood(activeArch.members.length))}
                    </Text>
                  ) : null}

                  <View style={styles.islaActions}>
                    <PillButton
                      label={t.home.openIsla}
                      size="sm"
                      kind="primary"
                      soft
                      onPress={() => router.push('/isla')}
                    />
                    {socialEnabled ? (
                      <PillButton
                        label={t.home.friendsBtn}
                        size="sm"
                        kind="neutral"
                        icon={<UsersThree size={14} weight="bold" color={c.text} />}
                        onPress={() => router.push('/friends')}
                      />
                    ) : null}
                    {socialEnabled && activeArch && driftingMate ? (
                      <PillButton
                        label={t.home.throwSagwan}
                        size="sm"
                        kind="secondary"
                        icon={<SagwanIcon size={14} color={c.accent} />}
                        onPress={() => {
                          haptic.success();
                          void throwSagwan(activeArch.id, driftingMate.studentId).then(() => {
                            setSagwanBanner(t.home.sagwanSent(mateFirst));
                          });
                        }}
                      />
                    ) : null}
                  </View>
                </>
              );
            })()}
          </View>
        </Card>
      </Stagger>

      <Stagger index={3} style={styles.row}>
        <Card style={styles.flex} onPress={() => router.push('/focus')} accessibilityLabel="Start a focus break">
          <Clock size={25} color={c.accent} />
          <Text variant="title" style={styles.mt}>
            {fil ? 'Oras para tumutok' : 'Time to focus'}
          </Text>
          <Text variant="subhead">{fil ? 'Magpahinga sa pag-scroll.' : 'Take a break from scrolling.'}</Text>
        </Card>
        <Card style={styles.flex} onPress={() => router.push('/insights')} accessibilityLabel="Total screen time">
          <MoonStars size={25} color={c.indigo} />
          <Text variant="title" style={styles.mt}>
            {formatDuration(live.usedMinutes)}
          </Text>
          <Text variant="subhead">{fil ? 'Kabuuang oras sa screen' : 'Total screen time today'}</Text>
        </Card>
      </Stagger>

      <Stagger index={4}>
        <Card style={styles.gap}>
          <View style={styles.row}>
            <ShieldCheck size={24} color={protectedApps ? c.success : c.accent} />
            <Text variant="headline" style={styles.flex}>
              {protectedApps
                ? fil
                  ? 'Handa ang learning breaks'
                  : 'Learning breaks are ready'
                : fil
                  ? 'Ikaw ang may kontrol'
                  : 'You’re in control'}
            </Text>
          </View>
          <Text variant="body" color="textSecondary">
            {fil
              ? 'Pagkatapos ng timer, lalabas ang learning card sa susunod mong pag-swipe pataas.'
              : 'When your timer ends, the learning card slides up on your next upward swipe.'}
          </Text>
          <PillButton
            label={fil ? 'Mga setting ng pahinga' : 'Break settings'}
            kind="secondary"
            onPress={() => router.push('/profile')}
          />
        </Card>
      </Stagger>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  leisureCard: { gap: 14 },
  leisureTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  leisureTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  center: { alignItems: 'center' },
  islaHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  islaCard: { overflow: 'hidden' },
  islaArt: { alignItems: 'center', paddingTop: 8 },
  islaBody: { gap: 10, padding: space.card, paddingTop: 4 },
  islaActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 2 },
  islaText: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: space.card, paddingTop: 4 },
  islaPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  heroNum: { flexDirection: 'row', alignItems: 'flex-end' },
  unit: { marginBottom: 8, marginLeft: 2 },
  compareBox: { flex: 1, borderRadius: radius.inset, padding: 12, gap: 4 },
  insightBox: { borderRadius: radius.inset, padding: 12 },
  hero: { gap: 20, paddingVertical: 24 },
  heroHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headline: { marginTop: 12, fontSize: 30, lineHeight: 36 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14 },
  row: { flexDirection: 'row', gap: space.gap },
  mt: { marginTop: 12, marginBottom: 6 },
  gap: { gap: 14 },
});
