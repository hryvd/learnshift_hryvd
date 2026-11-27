import { useEffect, useRef, useState } from 'react';
import { AppState, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowRight,
  BookOpen,
  CaretLeft,
  Compass,
  DownloadSimple,
  Eye,
  ShieldCheck,
  Sparkle,
  WarningCircle,
} from '@/components/ui/icons';

import {
  Card,
  Chip,
  IconButton,
  ListGroup,
  ListRow,
  NavBar,
  Notice,
  PillButton,
  PressableScale,
  ProgressBar,
  Stagger,
  Text,
  Toggle,
} from '@/components/ui';
import { haptic } from '@/design/haptics';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { fontFor } from '@/design/typography';
import { useT } from '@/i18n/useT';
import {
  openBatterySettings,
  openOverlaySettings,
  openScrollSettings,
  requestAccess,
  status as monitorStatus,
} from '@/services/monitor';
import {
  exportPilotCsv,
  getCatalogByPlatform,
  getMirrorStatus,
  MIRROR_PLATFORMS,
  OFFLINE_DECELERATION_CARDS,
  openLearningSeed,
  openOemAutostartSettings,
  provisionWorkProfile,
  setMirrorAuto,
  setSmartStudyGuard,
  triggerMirrorLearningShift,
  type LearningVideoSeed,
  type MirrorPlatform,
  type MirrorShiftResult,
  type MirrorStatus,
  type PacingMode,
  type VideoDisplayRecord,
} from '@/services/monitor/mirror';
import { isWithinBedtimeWindow } from '@/services/monitor/learningMirrorSelector';
import { useAppStore } from '@/store/useAppStore';

type StrategyMode = 'ANTI_FEED' | 'SENSORY_DECAY' | 'DEJA_VU_LOOP';

const SUBJECT_LABELS: Record<LearningVideoSeed['subjectTag'], string> = {
  GRADE7_MATH: 'Math',
  SCIENCE: 'Science',
  ENGLISH: 'English',
  PH_HISTORY: 'PH History',
  FINLIT: 'FinLit',
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem === 0 ? `${mins}m` : `${mins}m ${rem}s`;
}

export default function MirrorAppScreen() {
  const { c } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const learningSubject = useAppStore((s) => s.learningSubject);
  const bedtimeStart = useAppStore((s) => s.bedtime.start);
  const bedtimeEnd = useAppStore((s) => s.bedtime.end);

  const [status, setStatus] = useState<MirrorStatus>(() => getMirrorStatus());
  const [perms, setPerms] = useState(() => monitorStatus());
  const [notice, setNotice] = useState<string | null>(null);
  const guardReq = useRef(0);

  const [selectedPlatform, setSelectedPlatform] = useState<MirrorPlatform>('YOUTUBE');
  const [expandedCatalog, setExpandedCatalog] = useState(false);
  const [previewHistory, setPreviewHistory] = useState<Record<string, VideoDisplayRecord>>({});
  const [lastShift, setLastShift] = useState<MirrorShiftResult | null>(null);

  const [deckVisible, setDeckVisible] = useState(false);
  const [deckMode, setDeckMode] = useState<StrategyMode>('SENSORY_DECAY');
  const [cardIdx, setCardIdx] = useState(0);

  const refresh = () => {
    setStatus(getMirrorStatus());
    setPerms(monitorStatus());
  };

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    const timer = setInterval(refresh, 3000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, []);

  const wpLabel =
    status.workProfileStatus === 'ACTIVE_AND_READY'
      ? t.mirror.wpReady
      : status.workProfileStatus === 'CAN_PROVISION'
        ? t.mirror.wpCanProvision
        : t.mirror.wpFallback;

  const tierText = status.tierAReady ? t.mirror.tierA : t.mirror.tierC;
  const activePlatformInfo =
    MIRROR_PLATFORMS.find((p) => p.platform === selectedPlatform) ?? MIRROR_PLATFORMS[0];
  const platformSeeds = getCatalogByPlatform(selectedPlatform);
  const visibleSeeds = expandedCatalog ? platformSeeds : platformSeeds.slice(0, 5);

  const pacingLabel = (mode: PacingMode): string => {
    if (mode === 'LOW_STIM_DECELERATION') return t.mirror.modeCalm;
    if (mode === 'DEEP_LESSON') return t.mirror.modeDeep;
    return t.mirror.modeHook;
  };

  const deckCards =
    deckMode === 'DEJA_VU_LOOP'
      ? [...OFFLINE_DECELERATION_CARDS.slice(0, 2), ...OFFLINE_DECELERATION_CARDS.slice(0, 2)]
      : [...OFFLINE_DECELERATION_CARDS];

  const handleSeedOpen = (seed: LearningVideoSeed) => {
    haptic.select();
    openLearningSeed(seed, lang);
    setNotice(t.mirror.seedOpened(seed.creatorName, activePlatformInfo.label));
  };

  const handleTestShift = () => {
    haptic.select();
    const now = new Date();
    const minuteOfDay = now.getHours() * 60 + now.getMinutes();
    const inBedtime = isWithinBedtimeWindow(minuteOfDay, bedtimeStart, bedtimeEnd);

    void triggerMirrorLearningShift(activePlatformInfo.canonicalPackage, {
      preferredSubject: learningSubject,
      lang,
      inBedtime,
      sessionMinutes: 25,
      history: previewHistory,
    }).then((result) => {
      setLastShift(result);
      if (result.video) {
        const videoId = result.video.id;
        const shownAt = Date.now();
        setPreviewHistory((prev) => ({
          ...prev,
          [videoId]: {
            timesShown: (prev[videoId]?.timesShown ?? 0) + 1,
            lastShownMs: shownAt,
          },
        }));
        setNotice(
          t.mirror.dispatchedNotice(activePlatformInfo.label, result.video.titleOrTopic, result.badge),
        );
      } else {
        setNotice(t.mirror.dispatchedFallback(result.tier));
      }
      if (result.dispatchedNatively) {
        refresh();
      }
    });
  };

  const lastVideoTitle = status.lastVideoTitle || lastShift?.video?.titleOrTopic || '';

  return (
    <View style={[styles.root, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      <NavBar
        onBack={() => router.back()}
        backIcon={<CaretLeft size={20} weight="bold" color={c.text} />}
        title={t.mirror.title}
        right={<Chip label={status.tierAReady ? 'Tier A' : 'Tier C'} kind="tinted" />}
      />

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 36 }]}>
        <Stagger index={0}>
          <Card style={styles.heroCard}>
            <View style={styles.rowBetween}>
              <View style={[styles.badge, { backgroundColor: c.accentTint }]}>
                <Eye size={24} weight="fill" color={c.accent} />
              </View>
              <View style={styles.flex}>
                <Text variant="title">{t.mirror.heroTitle}</Text>
                <Text variant="subhead">{t.mirror.heroSub}</Text>
              </View>
            </View>
            <View style={[styles.tierPill, { backgroundColor: c.inset }]}>
              <Text variant="caption" color="accent" style={fontFor(700)}>
                {tierText}
              </Text>
              <Text variant="caption" color="textSecondary">
                {t.mirror.catalogStat(status.catalogCount)}
              </Text>
            </View>
            <View style={styles.metricsRow}>
              <View style={[styles.metricBox, { backgroundColor: c.inset }]}>
                <Text variant="overline">{t.mirror.cadence}</Text>
                <Text variant="title">{status.swipesPerMin}/m</Text>
              </View>
              <View style={[styles.metricBox, { backgroundColor: c.inset }]}>
                <Text variant="overline">{t.mirror.risk}</Text>
                <Text variant="title">{Math.round(status.riskScore * 100)}%</Text>
              </View>
              <View style={[styles.metricBox, { backgroundColor: c.inset }]}>
                <Text variant="overline">{t.mirror.workProfile}</Text>
                <Text variant="subhead" color="text" numberOfLines={1}>
                  {wpLabel}
                </Text>
              </View>
            </View>
            <ProgressBar
              progress={status.riskScore}
              color={status.riskScore >= 0.75 ? c.danger : c.accent}
            />
            {lastVideoTitle ? (
              <View style={[styles.lastShiftBox, { backgroundColor: c.inset }]}>
                <BookOpen size={15} weight="fill" color={c.accent} />
                <Text variant="caption" color="text" numberOfLines={1} style={styles.flex}>
                  {t.mirror.lastShiftLabel(lastVideoTitle)}
                </Text>
              </View>
            ) : null}
          </Card>
        </Stagger>

        {notice ? <Notice text={notice} tone="success" /> : null}

        <Stagger index={1}>
          <Card style={styles.gap}>
            <View style={styles.rowBetween}>
              <View style={styles.flex}>
                <Text variant="headline">{t.mirror.autoTitle}</Text>
                <Text variant="caption">{t.mirror.autoSub}</Text>
              </View>
              <Toggle
                value={status.mirrorAutoEnabled}
                onChange={(v) => {
                  haptic.select();
                  setMirrorAuto(v);
                  setStatus((s) => ({ ...s, mirrorAutoEnabled: v }));
                }}
                accessibilityLabel={t.mirror.autoTitle}
              />
            </View>

            <View style={styles.rowBetween}>
              <View style={styles.flex}>
                <Text variant="headline">{t.mirror.guardTitle}</Text>
                <Text variant="caption">{t.mirror.guardSub}</Text>
              </View>
              <Toggle
                value={status.studyGuardEnabled}
                onChange={(v) => {
                  // Optimistic: the switch follows the tap now. Only the latest
                  // request may settle it, so a burst of taps can't land on a
                  // stale answer.
                  const id = ++guardReq.current;
                  setStatus((s) => ({ ...s, studyGuardEnabled: v }));
                  void setSmartStudyGuard(v).then((ok) => {
                    if (id !== guardReq.current) return;
                    setNotice(ok ? t.mirror.guardOn : t.mirror.guardOff);
                    refresh();
                  });
                }}
                accessibilityLabel={t.mirror.guardTitle}
              />
            </View>
          </Card>
        </Stagger>

        <Stagger index={2}>
          <Card style={styles.gap}>
            <Text variant="title">{t.mirror.seedTitle}</Text>
            <Text variant="subhead">{t.mirror.seedSub}</Text>

            <View style={styles.platformRow}>
              {MIRROR_PLATFORMS.map((p) => {
                const active = p.platform === selectedPlatform;
                const count = getCatalogByPlatform(p.platform).length;
                return (
                  <PressableScale
                    key={p.platform}
                    accessibilityRole="button"
                    accessibilityLabel={`${p.label} (${count})`}
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      haptic.select();
                      setSelectedPlatform(p.platform);
                      setExpandedCatalog(false);
                    }}
                    style={[
                      styles.platformPill,
                      { backgroundColor: active ? c.accent : c.inset },
                    ]}
                  >
                    <Text
                      variant="caption"
                      color={active ? c.onAccent : c.text}
                      style={fontFor(700)}
                    >
                      {p.label} · {count}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>

            <View style={styles.seedList}>
              {visibleSeeds.map((seed) => (
                <PressableScale
                  key={seed.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${seed.creatorName}: ${seed.titleOrTopic}`}
                  onPress={() => handleSeedOpen(seed)}
                  style={[styles.seedRow, { backgroundColor: c.inset }]}
                >
                  <View style={styles.flex}>
                    <View style={styles.seedMetaRow}>
                      <Text variant="caption" color="accent" style={fontFor(700)} numberOfLines={1}>
                        {seed.creatorName}
                      </Text>
                      <Text variant="caption" color="textSecondary">
                        · {SUBJECT_LABELS[seed.subjectTag]} · {formatDuration(seed.durationSeconds)}
                      </Text>
                    </View>
                    <Text variant="subhead" color="text" numberOfLines={2}>
                      {seed.titleOrTopic}
                    </Text>
                    <Text variant="caption" color="textSecondary" numberOfLines={1}>
                      {pacingLabel(seed.pacingMode)} · {seed.language} · {seed.depedCompetency}
                    </Text>
                  </View>
                  <View style={[styles.openIconBox, { backgroundColor: c.accentTint }]}>
                    <ArrowRight size={16} weight="bold" color={c.accent} />
                  </View>
                </PressableScale>
              ))}
            </View>

            {platformSeeds.length > 5 ? (
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={
                  expandedCatalog ? t.mirror.showLess : t.mirror.showAll(platformSeeds.length)
                }
                onPress={() => {
                  haptic.select();
                  setExpandedCatalog((v) => !v);
                }}
                style={[styles.expandBtn, { backgroundColor: c.inset }]}
              >
                <Compass size={15} weight="fill" color={c.accent} />
                <Text variant="caption" color="accent" style={fontFor(700)}>
                  {expandedCatalog ? t.mirror.showLess : t.mirror.showAll(platformSeeds.length)}
                </Text>
              </PressableScale>
            ) : null}
          </Card>
        </Stagger>

        <Stagger index={3}>
          <Card style={styles.gap}>
            <Text variant="title">{t.mirror.testTitle}</Text>
            <Text variant="subhead">{t.mirror.testSub}</Text>

            {lastShift?.video && !lastShift.dispatchedNatively ? (
              <View style={[styles.previewBanner, { backgroundColor: c.inset }]}>
                <Text variant="caption" color="accent" style={fontFor(700)}>
                  {lastShift.badge}
                </Text>
                <Text variant="headline">{lastShift.video.titleOrTopic}</Text>
                <Text variant="caption" color="textSecondary">
                  {lastShift.video.creatorName} · {lastShift.video.depedCompetency}
                </Text>
                <PillButton
                  label={t.mirror.openVideoButton}
                  kind="secondary"
                  block
                  onPress={() => {
                    if (lastShift.video) handleSeedOpen(lastShift.video);
                  }}
                />
              </View>
            ) : null}

            <View style={styles.actionsGap}>
              <PillButton
                label={t.mirror.testButton(activePlatformInfo.label)}
                icon={<Sparkle size={18} weight="fill" color={c.onAccent} />}
                block
                size="lg"
                onPress={handleTestShift}
              />
              <PillButton
                label={t.mirror.previewDeckButton}
                kind="secondary"
                block
                onPress={() => {
                  setCardIdx(0);
                  setDeckVisible(true);
                }}
              />
              {status.nativeSupported ? (
                <PillButton
                  label={t.mirror.exportCsvButton}
                  kind="neutral"
                  icon={<DownloadSimple size={18} weight="bold" color={c.text} />}
                  block
                  onPress={() => {
                    void exportPilotCsv().then((path) => {
                      if (path) setNotice(t.mirror.csvExported(path));
                    });
                  }}
                />
              ) : null}
            </View>
          </Card>
        </Stagger>

        <Stagger index={4}>
          <Card style={styles.gap}>
            <Text variant="title">{t.mirror.setupTitle}</Text>
            <ListGroup>
              <ListRow
                title={t.mirror.step1}
                value={wpLabel}
                icon={
                  <ShieldCheck
                    size={20}
                    weight="fill"
                    color={status.workProfileStatus === 'ACTIVE_AND_READY' ? c.success : c.accent}
                  />
                }
                onPress={() => {
                  if (status.workProfileStatus === 'ACTIVE_AND_READY') {
                    setNotice(t.mirror.wpAlreadyActive);
                    return;
                  }
                  const started = provisionWorkProfile();
                  if (!started) {
                    setNotice(t.mirror.wpUnavailable);
                  }
                }}
              />
              <ListRow
                title={t.mirror.step2}
                value={perms.access ? t.common.on : t.acct.fix}
                icon={
                  <ShieldCheck
                    size={20}
                    weight="fill"
                    color={perms.access ? c.success : c.accent}
                  />
                }
                onPress={() => void requestAccess()}
              />
              <ListRow
                title={t.mirror.step3}
                value={perms.scrollAccess ? t.common.on : t.acct.fix}
                icon={<ShieldCheck size={20} color={perms.scrollAccess ? c.success : c.accent} />}
                onPress={openScrollSettings}
              />
              <ListRow
                title={t.mirror.step4}
                value={perms.overlay ? t.common.on : t.acct.fix}
                icon={<ShieldCheck size={20} color={perms.overlay ? c.success : c.accent} />}
                onPress={openOverlaySettings}
              />
              <ListRow
                title={t.mirror.step5}
                value={status.batteryExempt ? t.common.on : t.acct.fix}
                icon={
                  <WarningCircle
                    size={20}
                    color={status.batteryExempt ? c.success : c.warning}
                  />
                }
                onPress={() => {
                  openBatterySettings();
                  openOemAutostartSettings();
                }}
              />
            </ListGroup>
          </Card>
        </Stagger>
      </ScrollView>

      <Modal visible={deckVisible} animationType="slide" onRequestClose={() => setDeckVisible(false)}>
        <View
          style={[
            styles.deckRoot,
            {
              paddingTop: insets.top + 14,
              paddingBottom: insets.bottom + 24,
              opacity: deckMode === 'SENSORY_DECAY' ? Math.max(0.62, 1 - cardIdx * 0.12) : 1,
            },
          ]}
        >
          <View style={styles.deckTop}>
            <View style={styles.pillBar}>
              <Text variant="caption" color="#E0E0E0">
                {t.mirror.deckTitle(cardIdx + 1, deckCards.length)}
              </Text>
            </View>
            <IconButton
              kind="close"
              tone="glass"
              size={36}
              accessibilityLabel={t.common.close}
              onPress={() => setDeckVisible(false)}
            />
          </View>

          <View style={styles.modeRow}>
            {(['SENSORY_DECAY', 'ANTI_FEED', 'DEJA_VU_LOOP'] as StrategyMode[]).map((m) => (
              <Chip
                key={m}
                label={
                  m === 'SENSORY_DECAY'
                    ? 'Sensory Decay'
                    : m === 'ANTI_FEED'
                      ? 'Anti-Feed'
                      : 'Deja Vu Loop'
                }
                kind={deckMode === m ? 'accent' : 'outline'}
                onPress={() => {
                  setDeckMode(m);
                  setCardIdx(0);
                }}
              />
            ))}
          </View>

          <View style={styles.cardCenter}>
            <Text variant="caption" color="#9E9E9E">
              {deckCards[cardIdx]?.badge}
            </Text>
            <Text variant="largeTitle" color="#F5F5F5" align="center">
              {deckCards[cardIdx]?.title}
            </Text>
            <Text variant="body" color="#C8C8C8" align="center">
              {deckCards[cardIdx]?.body}
            </Text>
          </View>

          <View style={styles.deckFoot}>
            {cardIdx + 1 < deckCards.length ? (
              <PillButton
                label={t.mirror.nextCard}
                block
                size="lg"
                onPress={() => setCardIdx((n) => n + 1)}
              />
            ) : (
              <PillButton
                label={t.mirror.restExit}
                block
                size="lg"
                onPress={() => setDeckVisible(false)}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  body: {
    paddingHorizontal: space.screen,
    gap: space.gap,
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
  },
  heroCard: { gap: 14 },
  badge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gap: { gap: 12 },
  actionsGap: { gap: 10 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  tierPill: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.inset,
    gap: 2,
  },
  metricsRow: { flexDirection: 'row', gap: 8 },
  metricBox: { flex: 1, padding: 10, borderRadius: radius.inset, gap: 4 },
  lastShiftBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.inset,
  },
  platformRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  platformPill: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  seedList: { gap: 8 },
  seedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radius.inset,
    minHeight: 64,
  },
  seedMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  openIconBox: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
  },
  previewBanner: {
    padding: 14,
    borderRadius: radius.inset,
    gap: 8,
  },
  deckRoot: {
    flex: 1,
    backgroundColor: '#121212',
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  deckTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  pillBar: {
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  modeRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap' },
  cardCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 18,
    paddingHorizontal: 8,
  },
  deckFoot: { paddingTop: 12 },
});
