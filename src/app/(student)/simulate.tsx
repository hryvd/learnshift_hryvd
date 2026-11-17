import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowSquareOut,
  CaretDown,
  CaretUp,
  ChatCircle,
  CheckCircle,
  Cpu,
  FastForward,
  Heart,
  Lightning,
  MoonStars,
  MusicNotes,
  ShareFat,
  ShieldCheck,
  Sparkle,
  ThumbsDown,
  ThumbsUp,
  Timer,
  WarningCircle,
  X,
} from 'phosphor-react-native';

import { FullQuizOverlay } from '@/components/student/FullQuizOverlay';
import { DecelerationDeckView, MicroDeckView } from '@/components/student/MicroDeckView';
import { VerticalPager } from '@/components/student/VerticalPager';
import { Paty, PatyAvatar } from '@/components/mascot/Paty';
import { Chip, IconButton, PillButton, PressableScale, Text } from '@/components/ui';
import { pickMicroDecks } from '@/data/decks';
import { MIRRORED_APPS, mirroredAppByIdOrPkg, type MirroredApp, type MirroredClip } from '@/data/mirroredApps';
import { SHORT } from '@/data/skills';
import { haptic } from '@/design/haptics';
import { ease, spring, useReducedMotion } from '@/design/motion';
import { ThemeProvider } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { useLive } from '@/hooks/useLive';
import { launchProtectedApp, platform } from '@/services/monitor';
import {
  BURST_DURATION_MS,
  checkReceptivity,
  computeFeatures,
  createSwipeWindow,
  DEFAULT_QUIET_MIN,
  recordSwipeEvent,
  type LadderLevel,
  type SentinelFeatures,
  type SentinelState,
} from '@/services/sentinel';
import { DEFAULT_SENTINEL, useAppStore } from '@/store/useAppStore';
import { useSession } from '@/store/useSession';

type Stage = 'feed' | 'nudge' | 'overlay' | 'unlocked';
type OverlayTab = 'fullquiz' | 'microdeck' | 'decel';

const TARGET_MIN = 40;

function initialFeatures(): SentinelFeatures {
  return {
    t_session: 12,
    swipes_per_min: 6,
    dwell_var: 4.2,
    fast_skip_ratio: 0.2,
    since_last_card: 18,
    dismiss_streak: 0,
    in_bedtime: false,
    risk: 0.36,
    ram_mb: 8,
    latency_ms: 0,
  };
}

function nowMs(): number {
  return Date.now();
}

export default function Simulate() {
  return (
    <ThemeProvider mode="day">
      <SimulateDemo />
    </ThemeProvider>
  );
}

function SimulateDemo() {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { auto, app: appParam, start } = useLocalSearchParams<{ auto?: string; app?: string; start?: string }>();

  const sim = useSession((s) => s.simMinutes);
  const setSim = useSession((s) => s.setSimMinutes);
  const focusUntil = useSession((s) => s.focusUntil);
  const paused = useAppStore((s) => s.paused);
  const sentinelSlice = useAppStore((s) => s.sentinel ?? DEFAULT_SENTINEL);
  const live = useLive();
  const reduced = useReducedMotion();

  const [selectedApp, setSelectedApp] = useState<MirroredApp>(() => mirroredAppByIdOrPkg(appParam));
  const [stage, setStage] = useState<Stage>(() =>
    start === 'quiz' ? 'overlay' : start === 'nudge' ? 'nudge' : 'feed',
  );
  const [overlayTab, setOverlayTab] = useState<OverlayTab>('fullquiz');
  const [extraLadder, setExtraLadder] = useState<'softstop' | 'winddown' | null>(null);

  const [page, setPage] = useState(0);
  const [ff, setFf] = useState(start !== 'quiz' && start !== 'nudge');
  const [sentinelState, setSentinelState] = useState<SentinelState>(() =>
    start === 'quiz' ? 'BURST' : start === 'nudge' ? 'ARMED' : 'SENTINEL',
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [features, setFeatures] = useState<SentinelFeatures>(initialFeatures);
  const [deckIndex, setDeckIndex] = useState(0);
  const [timingVoted, setTimingVoted] = useState<'up' | 'down' | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const swipeWinRef = useRef(createSwipeWindow());
  const lastCardAtRef = useRef(0);
  const swipesSinceDismissRef = useRef(0);
  const dismissedOnceRef = useRef(false);

  const decks = pickMicroDecks(live.root, 5);
  const activeDeck = decks[deckIndex % decks.length];

  // Dim & desaturate the mirrored unwanted feed whenever an overlay is active.
  const veilOpacity = useSharedValue(stage === 'overlay' ? 0.84 : stage === 'nudge' ? 0.56 : 0);
  useEffect(() => {
    const target = extraLadder || stage === 'overlay' ? 0.84 : stage === 'nudge' ? 0.56 : 0;
    veilOpacity.set(withTiming(target, { duration: reduced ? 100 : 260, easing: ease.out }));
  }, [stage, extraLadder, reduced, veilOpacity]);
  const veilStyle = useAnimatedStyle(() => ({ opacity: veilOpacity.get() }));

  useEffect(() => {
    const now = Date.now();
    swipeWinRef.current = {
      lastEventAt: now - 4500,
      swipeTimes: [now - 24000, now - 16000, now - 9500, now - 4500],
      totalSwipes: 4,
    };
  }, []);

  const flash = (msg: string, ms = 3200) => {
    setToast(msg);
    setTimeout(() => setToast(null), ms);
  };

  const refreshFeatures = (stateOverride?: SentinelState) => {
    const now = nowMs();
    const curState = stateOverride ?? sentinelState;
    const sinceLastMin = lastCardAtRef.current > 0 ? (now - lastCardAtRef.current) / 60_000 : 25;
    const s = useAppStore.getState();
    const snap = computeFeatures({
      win: swipeWinRef.current,
      now,
      sessionMinutes: Math.max(useSession.getState().simMinutes, 12),
      sinceLastCardMin: sinceLastMin,
      dismissStreak: s.sentinel?.dismissStreak ?? 0,
      inBedtime: live.inBedtime,
      state: curState,
    });
    setFeatures(snap);
    return snap;
  };

  const enterStage = (nextStage: Stage, tab?: OverlayTab) => {
    haptic.light();
    lastCardAtRef.current = nowMs();
    useSession.getState().setLastCardAt(lastCardAtRef.current);
    setExtraLadder(null);
    setStage(nextStage);
    if (tab) setOverlayTab(tab);

    if (nextStage === 'nudge') {
      setTimingVoted(null);
      setSentinelState('ARMED');
      refreshFeatures('ARMED');
    } else if (nextStage === 'overlay') {
      setSentinelState('BURST');
      refreshFeatures('BURST');
    } else if (nextStage === 'unlocked') {
      setSentinelState('LEARN');
      refreshFeatures('LEARN');
    } else {
      setSentinelState('SENTINEL');
      refreshFeatures('SENTINEL');
    }
  };

  const triggerLadder = (lvl: LadderLevel) => {
    if (lvl === 0) enterStage('nudge');
    else if (lvl === 1) enterStage('overlay', 'microdeck');
    else if (lvl === 2) enterStage('overlay', 'decel');
    else if (lvl === 3) {
      setStage('feed');
      setExtraLadder('softstop');
    } else {
      setStage('feed');
      setExtraLadder('winddown');
    }
  };

  const onFastForwardDone = useEffectEvent(() => {
    const now = nowMs();
    const s = useAppStore.getState();
    const sent = s.sentinel ?? DEFAULT_SENTINEL;
    const gate = checkReceptivity({
      now,
      paused: s.paused,
      focusing: useSession.getState().focusUntil != null,
      quietUntil: sent.quietUntil,
      notNowUntil: sent.notNowUntil,
      decksToday: sent.decksToday,
      dismissStreak: sent.dismissStreak,
      sinceLastCardMin: 25,
      sessionMinutes: TARGET_MIN,
    });
    if (gate.receptive && stage === 'feed' && extraLadder == null) {
      if (live.inBedtime) setExtraLadder('winddown');
      else enterStage('nudge');
    } else {
      refreshFeatures();
    }
  });

  const onHeartbeat = useEffectEvent(() => {
    refreshFeatures();
  });

  const onAutoTakeover = useEffectEvent(() => {
    enterStage('overlay', 'fullquiz');
  });

  useEffect(() => {
    if (start === 'quiz' || start === 'nudge') {
      setSim(TARGET_MIN);
      return;
    }
    const startMs = Date.now();
    const from = Math.max(useSession.getState().simMinutes, 12);
    const dur = reduced ? 300 : 7500;
    const id = setInterval(() => {
      const k = Math.min(1, (Date.now() - startMs) / dur);
      const eased = 1 - Math.pow(1 - k, 2);
      setSim(from + (TARGET_MIN - from) * eased);
      if (k >= 1) {
        clearInterval(id);
        setFf(false);
        onFastForwardDone();
      }
    }, 60);
    return () => clearInterval(id);
  }, [setSim, reduced, start]);

  useEffect(() => {
    const id = setInterval(() => onHeartbeat(), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (auto !== '1' || stage !== 'nudge') return;
    const id = setTimeout(() => onAutoTakeover(), 1900);
    return () => clearTimeout(id);
  }, [auto, stage]);

  const handleBeforeSwipe = (dir: 'up' | 'down'): boolean => {
    const now = nowMs();
    const { window: nextWin, counted } = recordSwipeEvent(swipeWinRef.current, now);
    swipeWinRef.current = nextWin;
    if (counted) useAppStore.getState().recordSwipe(1);

    if (dir === 'up' && stage === 'nudge') {
      enterStage('overlay', 'fullquiz');
      return true;
    }
    return false;
  };

  const handleSwipe = (_dir: 'up' | 'down', nextIndex: number) => {
    setPage(nextIndex);
    const snap = refreshFeatures();

    if (dismissedOnceRef.current) {
      swipesSinceDismissRef.current += 1;
      if (swipesSinceDismissRef.current >= 2 && stage === 'feed' && extraLadder == null) {
        dismissedOnceRef.current = false;
        swipesSinceDismissRef.current = 0;
        setExtraLadder('softstop');
        return;
      }
    }

    if (stage === 'feed' && extraLadder == null) {
      const now = nowMs();
      const sent = useAppStore.getState().sentinel ?? DEFAULT_SENTINEL;
      const gate = checkReceptivity({
        now,
        paused,
        focusing: focusUntil != null,
        quietUntil: sent.quietUntil,
        notNowUntil: sent.notNowUntil,
        decksToday: sent.decksToday,
        dismissStreak: sent.dismissStreak,
        sinceLastCardMin: lastCardAtRef.current > 0 ? (now - lastCardAtRef.current) / 60_000 : 25,
        sessionMinutes: Math.max(useSession.getState().simMinutes, snap.t_session),
      });
      if (gate.receptive && snap.risk >= 0.72) {
        enterStage('nudge');
      }
    }
  };

  const dismissOverlay = () => {
    haptic.light();
    useAppStore.getState().recordCardDismiss();
    dismissedOnceRef.current = true;
    swipesSinceDismissRef.current = 0;
    setExtraLadder(null);
    enterStage('feed');
  };

  const snooze5m = () => {
    haptic.light();
    setExtraLadder(null);
    enterStage('feed');
    flash('Snoozed for 5 minutes');
  };

  const snooze1h = () => {
    haptic.light();
    useAppStore.getState().snoozeOneHour();
    setExtraLadder(null);
    enterStage('feed');
    flash('Quiet for 1 hour');
  };

  const unlockApp = () => {
    const s = useAppStore.getState();
    s.logNudge('break', live.risk.reasons, 'took');
    s.reward('break', true);
    setDeckIndex((k) => k + 1);
    dismissedOnceRef.current = false;
    enterStage('unlocked');
    flash(`${selectedApp.name} unlocked · Quiet for ${DEFAULT_QUIET_MIN} min`, 4500);
  };

  const leave = () => {
    setSim(0);
    router.back();
  };

  const overlayActive = stage === 'overlay' || extraLadder != null;
  const reasonLine = `${Math.round(sim)}m on ${selectedApp.shortName} · ${features.swipes_per_min}/min · ${SHORT[activeDeck.skill_id].en}`;

  // Overlay geometry: keep a peek header at top so the mirrored app remains visible behind it.
  const peekTop = insets.top + 8;
  const peekH = insets.top + 62;
  const modeBarH = 48;
  const overlayContentH = Math.max(360, height - peekH - modeBarH);

  return (
    <View style={styles.root}>
      {/* Layer 1: Mirrored Unwanted App Feed */}
      <VerticalPager
        pageHeight={height}
        pageWidth={width}
        index={page}
        enabled={!overlayActive}
        onBeforeSwipe={handleBeforeSwipe}
        onSwipe={handleSwipe}
        mode="burst"
        controlsPosition="bottom-right"
        bottomOffset={insets.bottom + 245}
      >
        {selectedApp.clips.map((clip, i) => (
          <MirroredClipView
            key={`${selectedApp.id}-${clip.id}`}
            app={selectedApp}
            clip={clip}
            index={i}
            height={height}
            width={width}
            topOffset={insets.top + 96}
          />
        ))}
      </VerticalPager>

      {/* Desaturating / Dimming Veil over unwanted content during Nudge or Quiz Overlay */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dimVeil, veilStyle]} />

      {/* Top Controls: Close + App Launcher Switcher + 4-Stage Plain-English Stepper */}
      {!overlayActive ? (
        <View style={[styles.topWrap, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
          <View style={styles.topRow}>
            <IconButton
              tone="glass"
              icon={<X size={18} weight="bold" color="#FFFFFF" />}
              accessibilityLabel="Close overlay view"
              onPress={leave}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.appPills}>
              {MIRRORED_APPS.map((app) => {
                const active = app.id === selectedApp.id;
                return (
                  <PressableScale
                    key={app.id}
                    onPress={() => {
                      haptic.select();
                      setSelectedApp(app);
                      setPage(0);
                    }}
                    style={[styles.appPill, active ? styles.appPillActive : null]}
                    accessibilityLabel={`Mirror ${app.name}`}
                  >
                    <Image source={app.icon} style={styles.appPillIcon} />
                    <Text variant="caption" color={active ? '#121212' : '#FFFFFF'} style={styles.bold}>
                      {app.shortName}
                    </Text>
                  </PressableScale>
                );
              })}
            </ScrollView>
            <PressableScale
              onPress={() => {
                haptic.light();
                const interval = useAppStore.getState().sentinel?.overlayIntervalSec ?? 30;
                launchProtectedApp(selectedApp.packageName, selectedApp.name, interval);
              }}
              accessibilityLabel={`Open real ${selectedApp.shortName} with LearnShift overlay`}
              style={[styles.telemetryPill, sentinelState === 'ARMED' ? styles.telemetryArmed : null]}
            >
              <ArrowSquareOut size={13} weight="bold" color="#F5C46B" />
              <Text variant="caption" color="#FFFFFF" style={styles.bold}>
                Real
              </Text>
            </PressableScale>
            <PressableScale
              onPress={() => setDrawerOpen((v) => !v)}
              accessibilityLabel="Sentinel telemetry"
              style={[styles.telemetryPill, sentinelState === 'ARMED' ? styles.telemetryArmed : null]}
            >
              {ff ? <FastForward size={12} weight="fill" color="#FFFFFF" /> : <Cpu size={12} weight="fill" color="#F5C46B" />}
              <Text variant="caption" color="#FFFFFF" tabular>
                {Math.round(sim)}m
              </Text>
              {drawerOpen ? <CaretUp size={11} weight="bold" color="#FFFFFF" /> : <CaretDown size={11} weight="bold" color="#FFFFFF" />}
            </PressableScale>
          </View>

          {/* 4-Stage Visual Progress Bar (tap any stage to test immediately) */}
          <View style={styles.stepper}>
            {[
              { id: 'feed' as Stage, label: '1. Unwanted' },
              { id: 'nudge' as Stage, label: '2. Nudge' },
              { id: 'overlay' as Stage, label: '3. Quiz' },
              { id: 'unlocked' as Stage, label: '4. Unlocked' },
            ].map((item) => {
              const active = stage === item.id;
              return (
                <PressableScale
                  key={item.id}
                  onPress={() => enterStage(item.id, item.id === 'overlay' ? 'fullquiz' : undefined)}
                  style={[styles.stepTab, active ? styles.stepTabActive : null]}
                >
                  <Text variant="caption" color={active ? '#121212' : 'rgba(255,255,255,0.8)'} style={styles.bold} numberOfLines={1}>
                    {item.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Expandable Blueprint v2 Telemetry + Friction Ladder Drawer */}
      {drawerOpen && !overlayActive ? (
        <View style={[styles.drawer, { top: insets.top + 88 }]}>
          <View style={styles.drawerHead}>
            <View style={styles.drawerBadge}>
              <ShieldCheck size={14} weight="fill" color="#5CC98A" />
              <Text variant="caption" color="#5CC98A" style={styles.bold}>
                canRetrieveWindowContent=&quot;false&quot;
              </Text>
            </View>
            <Text variant="caption" color="rgba(255,255,255,0.72)" tabular>
              {features.ram_mb} MB RAM · {features.latency_ms || 42} ms
            </Text>
          </View>

          <View style={styles.vectorGrid}>
            <MetricCell label="t_session" value={`${Math.round(sim)}m`} />
            <MetricCell label="swipes/min (λ)" value={String(features.swipes_per_min)} />
            <MetricCell label="dwell_var (σ²)" value={`${features.dwell_var}s²`} />
            <MetricCell label="fast_skip" value={`${Math.round(features.fast_skip_ratio * 100)}%`} />
            <MetricCell label="P(doomscroll)" value={features.risk.toFixed(2)} highlight />
            <MetricCell label="swipes today" value={String(sentinelSlice.swipesToday)} />
          </View>

          <Text variant="caption" color="rgba(255,255,255,0.65)">
            Jump to Friction Ladder level:
          </Text>
          <View style={styles.ladderRow}>
            {[
              { lvl: 0 as LadderLevel, label: 'L0 Nudge Overlay' },
              { lvl: 1 as LadderLevel, label: 'L1 3-Card' },
              { lvl: 2 as LadderLevel, label: 'L2 Decel' },
              { lvl: 3 as LadderLevel, label: 'L3 Soft Stop' },
              { lvl: 4 as LadderLevel, label: 'L4 Night' },
            ].map((item) => (
              <PressableScale
                key={item.lvl}
                onPress={() => {
                  setDrawerOpen(false);
                  triggerLadder(item.lvl);
                }}
                style={styles.ladderBtn}
              >
                <Text variant="caption" color="#FFFFFF" style={styles.bold}>
                  {item.label}
                </Text>
              </PressableScale>
            ))}
          </View>
        </View>
      ) : null}

      {/* Quiet / Snooze / Unlocked Banner */}
      {toast ? (
        <View style={[styles.quietToast, { top: insets.top + 92 }]}>
          <CheckCircle size={16} weight="fill" color="#2FBF5B" />
          <Text variant="subhead" color="#111111">
            {toast}
          </Text>
        </View>
      ) : null}

      {/* Stage 4 Unlocked Action Strip */}
      {stage === 'unlocked' && !overlayActive ? (
        <View style={[styles.unlockedBanner, { top: insets.top + 92 }]}>
          <View style={styles.unlockedRow}>
            <CheckCircle size={20} weight="fill" color="#2FBF5B" />
            <View style={styles.flex}>
              <Text variant="headline" color="#111111">
                {selectedApp.name} Unlocked · 20m Quiet
              </Text>
              <Text variant="caption" color="#5C5C62">
                Learn once, scroll free. LearnShift pauses overlays for 20 minutes.
              </Text>
            </View>
          </View>
          <View style={styles.unlockedBtns}>
            {platform === 'android' ? (
              <PillButton
                label={`Open Real ${selectedApp.shortName}`}
                size="sm"
                icon={<ArrowSquareOut size={14} weight="bold" color="#FFFFFF" />}
                onPress={() =>
                  launchProtectedApp(
                    selectedApp.packageName,
                    selectedApp.name,
                    useAppStore.getState().sentinel?.overlayIntervalSec ?? 30,
                  )
                }
              />
            ) : null}
            <PillButton label="Back Home" kind="secondary" size="sm" onPress={leave} />
          </View>
        </View>
      ) : null}

      {/* Stage 2: In-Screen Overlay Nudge Notification over the Mirrored App */}
      {stage === 'nudge' && !extraLadder ? (
        <HeadsUpOverlayNudge
          top={insets.top + 96}
          app={selectedApp}
          minutes={Math.round(sim)}
          voted={timingVoted}
          onFullQuiz={() => enterStage('overlay', 'fullquiz')}
          onMicroDeck={() => enterStage('overlay', 'microdeck')}
          onSnooze5m={snooze5m}
          onNotNow1h={snooze1h}
          onDismiss={dismissOverlay}
          onVote={(good) => {
            setTimingVoted(good ? 'up' : 'down');
            useAppStore.getState().voteTiming(good);
          }}
        />
      ) : null}

      {/* Stage 3: Full Quiz Page / 3-Card Micro-Deck / Deceleration Overlaid on Dimmed Mirrored App */}
      {stage === 'overlay' && !extraLadder ? (
        <TakeoverShell height={height} width={width} duration={overlayTab === 'decel' ? 400 : BURST_DURATION_MS}>
          <View style={styles.overlayWrap}>
            {/* Translucent Peek Header showing the mirrored app paused behind the overlay */}
            <PressableScale
              onPress={dismissOverlay}
              style={[styles.peekHeader, { height: peekH, paddingTop: peekTop }]}
              accessibilityLabel="Mirrored app paused underneath. Tap to peek or dismiss."
            >
              <Image source={selectedApp.icon} style={styles.peekIcon} />
              <View style={styles.flex}>
                <Text variant="caption" color="#F2A65A" style={styles.bold}>
                  OVERLAYING {selectedApp.name.toUpperCase()}
                </Text>
                <Text variant="caption" color="rgba(255,255,255,0.75)" numberOfLines={1}>
                  Unwanted scroll paused behind this screen
                </Text>
              </View>
              <View style={styles.peekClose}>
                <X size={15} weight="bold" color="#FFFFFF" />
              </View>
            </PressableScale>

            {/* Clean White Overlay Sheet containing White Quiz, 3-Card Swipe Feed, or Decel */}
            <View style={styles.overlaySheet}>
              <View style={styles.overlayTabs}>
                {[
                  { id: 'fullquiz' as OverlayTab, label: 'White Quiz (5 Qs)', icon: Lightning },
                  { id: 'microdeck' as OverlayTab, label: '3-Card Swipe', icon: Sparkle },
                  { id: 'decel' as OverlayTab, label: 'Calm Decel', icon: MoonStars },
                ].map((tab) => {
                  const active = overlayTab === tab.id;
                  const Icon = tab.icon;
                  return (
                    <PressableScale
                      key={tab.id}
                      onPress={() => {
                        haptic.select();
                        setOverlayTab(tab.id);
                      }}
                      style={[styles.overlayTabBtn, active ? styles.overlayTabActive : null]}
                    >
                      <Icon size={13} weight="fill" color={active ? '#FFFFFF' : '#5C5C62'} />
                      <Text variant="caption" color={active ? '#FFFFFF' : '#111111'} style={styles.bold}>
                        {tab.label}
                      </Text>
                    </PressableScale>
                  );
                })}
              </View>

              <View style={{ height: overlayContentH, width }}>
                {overlayTab === 'fullquiz' ? (
                  <FullQuizOverlay
                    skillId={live.root}
                    appName={selectedApp.name}
                    onUnlock={unlockApp}
                    onDismiss={dismissOverlay}
                  />
                ) : overlayTab === 'microdeck' ? (
                  <MicroDeckView
                    key={activeDeck.card_id}
                    deck={activeDeck}
                    pageHeight={overlayContentH}
                    pageWidth={width}
                    topOffset={10}
                    reasonLine={reasonLine}
                    scrollCards
                    onComplete={unlockApp}
                    onDismiss={dismissOverlay}
                    onNotNow1h={snooze1h}
                    onWindDown={() => setExtraLadder('winddown')}
                  />
                ) : (
                  <DecelerationDeckView
                    pageHeight={overlayContentH}
                    pageWidth={width}
                    topOffset={10}
                    onCloseApp={leave}
                    onWindDown={() => router.push('/winddown')}
                    onDismiss={dismissOverlay}
                  />
                )}
              </View>
            </View>
          </View>
        </TakeoverShell>
      ) : null}

      {/* Level 3: Soft Stop */}
      {extraLadder === 'softstop' ? (
        <TakeoverShell height={height} width={width}>
          <SoftStopCard
            appName={selectedApp.name}
            minutes={Math.round(sim)}
            onFiveMore={snooze5m}
            onReset={() => enterStage('overlay', 'fullquiz')}
            onCloseApp={leave}
          />
        </TakeoverShell>
      ) : null}

      {/* Level 4: Bedtime Wind-down */}
      {extraLadder === 'winddown' ? (
        <TakeoverShell height={height} width={width} duration={360}>
          <WindDownCard
            appName={selectedApp.name}
            onOpenDecel={() => enterStage('overlay', 'decel')}
            onOpenWindDown={() => router.push('/winddown')}
            onDismiss={dismissOverlay}
          />
        </TakeoverShell>
      ) : null}
    </View>
  );
}

function MetricCell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.metricCell}>
      <Text variant="caption" color="rgba(255,255,255,0.6)">
        {label}
      </Text>
      <Text variant="headline" color={highlight ? '#F2A65A' : '#FFFFFF'} tabular>
        {value}
      </Text>
    </View>
  );
}

function MirroredClipView({
  app,
  clip,
  index,
  height,
  width,
  topOffset,
}: {
  app: MirroredApp;
  clip: MirroredClip;
  index: number;
  height: number;
  width: number;
  topOffset: number;
}) {
  const reduced = useReducedMotion();
  const drift = useSharedValue(0);
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    if (reduced) return;
    drift.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: 3200, easing: ease.inOut }),
          withTiming(0, { duration: 3200, easing: ease.inOut }),
        ),
        -1,
      ),
    );
  }, [reduced, drift]);

  const a = useAnimatedStyle(() => ({
    transform: [
      { translateX: drift.get() * 40 - 20 },
      { translateY: drift.get() * -30 },
      { scale: 1 + drift.get() * 0.12 },
    ],
  }));
  const b = useAnimatedStyle(() => ({
    transform: [{ translateX: drift.get() * -50 + 10 }, { translateY: drift.get() * 40 }],
  }));
  const insets = useSafeAreaInsets();

  return (
    <View style={{ height, width }} accessibilityLabel={`${app.name} mirrored clip by ${clip.user}`}>
      <LinearGradient colors={clip.colors} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      <Animated.View
        style={[styles.blob, { top: height * 0.24, left: width * 0.1, backgroundColor: 'rgba(255,255,255,0.16)' }, a]}
      />
      <Animated.View
        style={[
          styles.blob2,
          { top: height * 0.48, right: width * 0.06, backgroundColor: 'rgba(255,255,255,0.10)' },
          b,
        ]}
      />

      {/* Mirrored App Chrome + Unwanted Content Indicator */}
      <View style={[styles.mirrorChrome, { top: topOffset }]}>
        <View style={styles.mirrorAppRow}>
          <Image source={app.icon} style={styles.mirrorAppIcon} />
          <Text variant="subhead" color="rgba(255,255,255,0.72)">
            {app.feedHeaderLeft}
          </Text>
          <Text variant="headline" color="#FFFFFF">
            {app.feedHeaderRight}
          </Text>
          <View style={[styles.mirrorBadge, { backgroundColor: app.brandColor }]}>
            <Text variant="caption" color="#FFFFFF" style={styles.bold}>
              {app.badgeText}
            </Text>
          </View>
        </View>
        <View style={styles.unwantedChip}>
          <WarningCircle size={14} weight="fill" color="#F5C46B" />
          <Text variant="caption" color="#F5C46B" style={styles.bold}>
            MIRRORED UNWANTED CONTENT · {clip.loopWarning}
          </Text>
        </View>
      </View>

      <View style={[styles.caption, { bottom: insets.bottom + 36 }]}>
        <Text variant="headline" color="#FFFFFF">
          @{clip.user}
        </Text>
        <Text variant="body" color="rgba(255,255,255,0.92)" numberOfLines={2}>
          {clip.caption}
        </Text>
        <View style={styles.music}>
          <MusicNotes size={14} weight="fill" color="#FFFFFF" />
          <Text variant="caption" color="rgba(255,255,255,0.85)">
            {clip.sound} · clip {index + 1}
          </Text>
        </View>
      </View>

      <View style={[styles.actions, { bottom: insets.bottom + 42 }]}>
        <PressableScale
          onPress={() => {
            haptic.light();
            setLiked((v) => !v);
          }}
          accessibilityLabel="Like clip"
          style={styles.action}
        >
          <Heart size={32} weight="fill" color={liked ? '#FF4D6D' : '#FFFFFF'} />
          <Text variant="caption" color="#FFFFFF" tabular>
            {clip.likes}
          </Text>
        </PressableScale>
        <View style={styles.action}>
          <ChatCircle size={32} weight="fill" color="#FFFFFF" />
          <Text variant="caption" color="#FFFFFF" tabular>
            {clip.comments}
          </Text>
        </View>
        <View style={styles.action}>
          <ShareFat size={30} weight="fill" color="#FFFFFF" />
          <Text variant="caption" color="#FFFFFF" tabular>
            {clip.shares}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** In-Screen Overlay Nudge Notification rendered directly over the mirrored app. */
function HeadsUpOverlayNudge({
  top,
  app,
  minutes,
  voted,
  onFullQuiz,
  onMicroDeck,
  onSnooze5m,
  onNotNow1h,
  onDismiss,
  onVote,
}: {
  top: number;
  app: MirroredApp;
  minutes: number;
  voted: 'up' | 'down' | null;
  onFullQuiz: () => void;
  onMicroDeck: () => void;
  onSnooze5m: () => void;
  onNotNow1h: () => void;
  onDismiss: () => void;
  onVote: (good: boolean) => void;
}) {
  const reduced = useReducedMotion();
  const y = useSharedValue(reduced ? 0 : -60);

  useEffect(() => {
    y.set(withSpring(0, spring.smooth));
  }, [y]);

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));

  return (
    <Animated.View style={[styles.pillCard, { top }, cardStyle]} accessibilityLiveRegion="polite">
      <View style={styles.pillTop}>
        <Image source={app.icon} style={styles.nudgeAppIcon} />
        <PatyAvatar size={36} background="#FFF3E6" />
        <View style={styles.flex}>
          <Text variant="overline" color="#C8400F">
            PATY OVERLAY · OVER {app.shortName.toUpperCase()}
          </Text>
          <Text variant="headline" color="#111111">
            {minutes} min of continuous scrolling
          </Text>
          <Text variant="caption" color="#5C5C62">
            Swipe through a quick white overlay card to unlock 20m free time.
          </Text>
        </View>
        <PressableScale onPress={onDismiss} accessibilityLabel="Dismiss overlay nudge" style={styles.pillClose}>
          <X size={14} weight="bold" color="#111111" />
        </PressableScale>
      </View>

      <View style={styles.pillActions}>
        <PressableScale onPress={onFullQuiz} style={styles.pillPrimary} accessibilityLabel="Open White Quiz Overlay">
          <Lightning size={15} weight="fill" color="#FFFFFF" />
          <Text variant="subhead" color="#FFFFFF" style={styles.bold}>
            Open White Quiz
          </Text>
        </PressableScale>
        <PressableScale onPress={onMicroDeck} style={styles.pillSecondary} accessibilityLabel="3-Card Swipe Feed">
          <Sparkle size={14} weight="fill" color="#C8400F" />
          <Text variant="caption" color="#111111" style={styles.bold}>
            3-Card Swipe
          </Text>
        </PressableScale>
      </View>

      <View style={styles.timingRow}>
        <View style={styles.snoozeRow}>
          <PressableScale onPress={onSnooze5m} style={styles.miniChip}>
            <Text variant="caption" color="#111111">
              Snooze 5m
            </Text>
          </PressableScale>
          <PressableScale onPress={onNotNow1h} style={styles.miniChip}>
            <Text variant="caption" color="#5C5C62">
              1h quiet
            </Text>
          </PressableScale>
        </View>
        <View style={styles.voteBtns}>
          <Text variant="caption" color="#5C5C62">
            Good timing?
          </Text>
          <PressableScale
            onPress={() => onVote(true)}
            accessibilityLabel="Good timing yes"
            style={[styles.voteBtn, voted === 'up' ? styles.voteBtnOn : null]}
          >
            <ThumbsUp size={12} weight="fill" color={voted === 'up' ? '#FFFFFF' : '#111111'} />
          </PressableScale>
          <PressableScale
            onPress={() => onVote(false)}
            accessibilityLabel="Good timing no"
            style={[styles.voteBtn, voted === 'down' ? styles.voteBtnOn : null]}
          >
            <ThumbsDown size={12} weight="fill" color={voted === 'down' ? '#FFFFFF' : '#111111'} />
          </PressableScale>
        </View>
      </View>
    </Animated.View>
  );
}

function TakeoverShell({
  height,
  width,
  duration = BURST_DURATION_MS,
  children,
}: {
  height: number;
  width: number;
  duration?: number;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const y = useSharedValue(reduced ? 0 : height);

  useEffect(() => {
    const dur = reduced ? 120 : duration;
    y.set(withTiming(0, { duration: dur, easing: ease.out }));
  }, [duration, reduced, y]);

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[{ height, width }, cardStyle]}>{children}</Animated.View>
    </View>
  );
}

function SoftStopCard({
  appName,
  minutes,
  onFiveMore,
  onReset,
  onCloseApp,
}: {
  appName: string;
  minutes: number;
  onFiveMore: () => void;
  onReset: () => void;
  onCloseApp: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.ladderFull, { paddingTop: insets.top + 32, paddingBottom: Math.max(insets.bottom, 20) + 20 }]}>
      <View style={styles.ladderContent}>
        <Chip label="Level 3 · Soft Stop" tint={{ bg: 'rgba(200,64,15,0.12)', fg: '#C8400F' }} />
        <Paty expression="curious" size={140} />
        <Text variant="largeTitle" color="#111111" align="center">
          Take 5 from {appName}?
        </Text>
        <Text variant="body" color="#5C5C62" align="center">
          You’ve been scrolling for {minutes} min and already dismissed the last nudge. Take 5 more minutes or unlock 20m with a quick quiz.
        </Text>
        <View style={styles.ladderActions}>
          <PillButton
            label="5 more minutes"
            size="lg"
            block
            icon={<Timer size={18} weight="fill" color="#FFFFFF" />}
            onPress={onFiveMore}
          />
          <PillButton label="Open White Quiz Feed" kind="secondary" size="lg" block onPress={onReset} />
          <PillButton label={`Close ${appName}`} kind="neutral" size="md" block onPress={onCloseApp} />
        </View>
      </View>
    </View>
  );
}

function WindDownCard({
  appName,
  onOpenDecel,
  onOpenWindDown,
  onDismiss,
}: {
  appName: string;
  onOpenDecel: () => void;
  onOpenWindDown: () => void;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.ladderFull, { paddingTop: insets.top + 32, paddingBottom: Math.max(insets.bottom, 20) + 20 }]}>
      <View style={styles.ladderContent}>
        <Chip
          label="Level 4 · Wind-down"
          icon={<MoonStars size={13} weight="fill" color="#5B57D6" />}
          tint={{ bg: 'rgba(91,87,214,0.12)', fg: '#5B57D6' }}
        />
        <Paty expression="sleepy" size={145} />
        <Text variant="largeTitle" color="#111111" align="center">
          Goodnight mode
        </Text>
        <Text variant="body" color="#5C5C62" align="center">
          Past bedtime on {appName} — quizzes step aside for slow deceleration cards and rest.
        </Text>
        <View style={styles.ladderActions}>
          <PillButton label="Open Deceleration Deck" size="lg" block onPress={onOpenDecel} />
          <PillButton label="Full Wind-down tools" kind="secondary" size="lg" block onPress={onOpenWindDown} />
          <PillButton label="Dismiss" kind="neutral" size="md" block onPress={onDismiss} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  dimVeil: { backgroundColor: '#0D0E12' },
  topWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: space.screen,
    gap: 8,
    zIndex: 20,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  appPills: { gap: 6, paddingVertical: 2 },
  appPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(18,18,18,0.68)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 9,
    height: 30,
    borderRadius: radius.pill,
  },
  appPillActive: {
    backgroundColor: '#F2A65A',
    borderColor: '#F2A65A',
  },
  appPillIcon: { width: 16, height: 16, borderRadius: 4 },
  telemetryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(18,18,18,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 9,
    height: 30,
    borderRadius: radius.pill,
  },
  telemetryArmed: {
    backgroundColor: 'rgba(200,64,15,0.92)',
    borderColor: '#F5C46B',
  },
  stepper: {
    flexDirection: 'row',
    gap: 5,
    backgroundColor: 'rgba(18,18,18,0.62)',
    borderRadius: radius.pill,
    padding: 3,
  },
  stepTab: {
    flex: 1,
    height: 26,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  stepTabActive: { backgroundColor: '#F2A65A' },
  mirrorChrome: {
    position: 'absolute',
    left: space.screen,
    right: space.screen,
    gap: 6,
  },
  mirrorAppRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mirrorAppIcon: { width: 22, height: 22, borderRadius: 6 },
  mirrorBadge: {
    marginLeft: 'auto',
    paddingHorizontal: 8,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unwantedChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(18,18,18,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(245,196,107,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  drawer: {
    position: 'absolute',
    left: 14,
    right: 14,
    maxWidth: 460,
    alignSelf: 'center',
    backgroundColor: 'rgba(18,18,18,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.card,
    padding: 14,
    gap: 10,
    zIndex: 35,
  },
  drawerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  drawerBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  vectorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricCell: {
    flexBasis: '30%',
    flexGrow: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.sm,
    paddingVertical: 7,
    paddingHorizontal: 9,
    gap: 2,
  },
  ladderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ladderBtn: {
    paddingHorizontal: 10,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quietToast: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#2FBF5B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    zIndex: 30,
  },
  unlockedBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    maxWidth: 460,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#2FBF5B',
    borderRadius: radius.card,
    padding: 12,
    gap: 10,
    zIndex: 28,
  },
  unlockedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  unlockedBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  blob: { position: 'absolute', width: 220, height: 220, borderRadius: 110 },
  blob2: { position: 'absolute', width: 160, height: 160, borderRadius: 80 },
  caption: { position: 'absolute', left: space.screen, right: 88, gap: 4 },
  music: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  actions: { position: 'absolute', right: 14, gap: 16, alignItems: 'center' },
  action: { alignItems: 'center', gap: 2, minWidth: 48, minHeight: 44, justifyContent: 'center' },
  pillCard: {
    position: 'absolute',
    left: 14,
    right: 14,
    maxWidth: 460,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#C8400F',
    borderRadius: radius.card,
    padding: 14,
    gap: 10,
    zIndex: 25,
  },
  pillTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nudgeAppIcon: { width: 30, height: 30, borderRadius: 8 },
  pillClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(17,17,17,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pillPrimary: {
    flex: 1,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: '#C8400F',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  pillSecondary: {
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(17,17,17,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 14,
  },
  timingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  snoozeRow: { flexDirection: 'row', gap: 6 },
  miniChip: {
    paddingHorizontal: 10,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(17,17,17,0.06)',
    justifyContent: 'center',
  },
  voteBtns: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  voteBtn: {
    width: 26,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(17,17,17,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voteBtnOn: { backgroundColor: '#2FBF5B' },
  overlayWrap: { flex: 1 },
  peekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: space.screen,
    backgroundColor: 'rgba(10,12,18,0.45)',
  },
  peekIcon: { width: 26, height: 26, borderRadius: 7 },
  peekClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlaySheet: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: '#E5E0D8',
    overflow: 'hidden',
  },
  overlayTabs: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: space.screen,
    paddingVertical: 8,
    backgroundColor: '#F6F5F2',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(17,17,17,0.08)',
    height: 48,
  },
  overlayTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(17,17,17,0.06)',
    paddingHorizontal: 6,
  },
  overlayTabActive: { backgroundColor: '#C8400F' },
  ladderFull: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: space.screen,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ladderContent: {
    width: '100%',
    maxWidth: 440,
    alignItems: 'center',
    gap: 14,
  },
  ladderActions: {
    width: '100%',
    gap: 10,
    marginTop: 10,
  },
});
