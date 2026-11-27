import { useCallback, useEffect, useReducer, useState } from 'react';
import { AppState, Image, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Heart, Pause, Play, Timer } from '@/components/ui/icons';

import { FullQuizOverlay } from '@/components/student/FullQuizOverlay';
import { VerticalPager } from '@/components/student/VerticalPager';
import { IconButton, Text } from '@/components/ui';
import { mirroredAppByIdOrPkg, type MirroredClip } from '@/data/mirroredApps';
import { ease, useReducedMotion } from '@/design/motion';
import { IS_PITCH } from '@/lib/config';
import { DEFAULT_SENTINEL, useAppStore } from '@/store/useAppStore';

import { breakTransition, type BreakState } from '@/services/learningBreak';

/** A clearly labelled local preview; never reads or imitates real third-party content. */
export default function Simulate() {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { app: appParam, start } = useLocalSearchParams<{ app?: string; start?: string }>();
  const [app] = useState(() => mirroredAppByIdOrPkg(appParam));
  const storedInterval = useAppStore((s) => s.sentinel?.overlayIntervalSec ?? DEFAULT_SENTINEL.overlayIntervalSec);
  // Pitch demo: a short countdown so the break appears quickly on stage.
  const interval = IS_PITCH ? 10 : storedInterval;
  const [{ remaining, stage }, dispatch] = useReducer(breakTransition, {
    stage: start === 'quiz' ? 'overlay' : start === 'nudge' ? 'ready' : 'feed',
    remaining: start === 'quiz' || start === 'nudge' ? 0 : interval,
  } as BreakState);
  const [closing, setClosing] = useState(false);
  const [page, setPage] = useState(0);
  const [active, setActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (stage !== 'feed' || !active) return;
    const timer = setInterval(() => {
      if (Platform.OS === 'web' && typeof document !== 'undefined' && document.hidden) return;
      dispatch({ type: 'tick' });
      // Pitch demo: open the learning card automatically when the timer ends.
      if (IS_PITCH) dispatch({ type: 'start' });
    }, 1000);
    return () => clearInterval(timer);
  }, [stage, active]);

  const requestDismiss = useCallback(() => {
    setClosing(true);
  }, []);

  const finishDismiss = useCallback(() => {
    setClosing(false);
    dispatch({ type: 'dismiss', interval });
  }, [interval]);

  const onSwipe = (direction: 'up' | 'down') => {
    useAppStore.getState().recordSwipe(1);
    if (direction === 'up' && stage === 'ready') {
      dispatch({ type: 'swipe', direction: 'up' });
      return true;
    }
    if (direction === 'up' && page === app.clips.length - 1) {
      setPage(0);
      return true;
    }
    return false;
  };

  const overlayActive = stage === 'overlay';
  const mediaPaused = !active || (overlayActive && !closing);

  return (
    <View style={styles.root}>
      <View
        style={styles.fill}
        accessibilityElementsHidden={overlayActive}
        importantForAccessibility={overlayActive ? 'no-hide-descendants' : 'auto'}
      >
        <VerticalPager
          pageHeight={height}
          pageWidth={width}
          index={page}
          onIndexChange={setPage}
          onBeforeSwipe={onSwipe}
          enabled={stage === 'feed' || stage === 'ready'}
          bottomOffset={insets.bottom + 150}
        >
          {app.clips.map((clip, index) => (
            <PreviewClip
              key={clip.id}
              clip={clip}
              height={height}
              width={width}
              paused={mediaPaused || index !== page}
            />
          ))}
        </VerticalPager>
        <View style={[styles.header, { top: insets.top + 12 }]}>
          <IconButton
            kind="close"
            tone="glass"
            size={44}
            accessibilityLabel="Close preview"
            onPress={() => router.back()}
          />
          <View style={styles.headerText}>
            <Text variant="headline" color="#FFFFFF">
              Try a learning break
            </Text>
            <Text variant="caption" color="#FFFFFF">
              Local preview · no real videos
            </Text>
          </View>
          <Image source={app.icon} style={styles.appIcon} />
        </View>
        <View style={[styles.indicator, { top: insets.top + 88 }]} accessibilityLiveRegion="polite">
          <Timer size={18} color={stage === 'ready' ? '#B9F1D1' : '#FFFFFF'} />
          <Text variant="subhead" color={stage === 'ready' ? '#B9F1D1' : '#FFFFFF'}>
            {overlayActive
              ? 'Media paused · Complete break to resume'
              : stage === 'ready'
                ? 'Timer done · Swipe up for learning break'
                : `Next break · ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`}
          </Text>
        </View>
        <View style={[styles.bottom, { bottom: insets.bottom + 20 }]}>
          <Text variant="headline" color="#FFFFFF">
            @learnshift · {app.shortName} preview feed
          </Text>
          <Text color="#FFFFFF">
            {stage === 'ready'
              ? 'Timer finished — your next swipe up slides in the learning card.'
              : 'Keep scrolling. When the timer ends, your next swipe up starts the break.'}
          </Text>
        </View>
      </View>
      {overlayActive ? (
        <Takeover height={height} closing={closing} onClosed={finishDismiss}>
          <FullQuizOverlay appName={app.name} onUnlock={requestDismiss} onDismiss={requestDismiss} />
        </Takeover>
      ) : null}
    </View>
  );
}

function PreviewClip({
  clip,
  height,
  width,
  paused,
}: {
  clip: MirroredClip;
  height: number;
  width: number;
  paused: boolean;
}) {
  const reduced = useReducedMotion();
  const drift = useSharedValue(0);
  const settle = useSharedValue(paused ? 1 : 0);
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    settle.set(withTiming(paused ? 1 : 0, { duration: reduced ? 0 : 420, easing: ease.out }));
  }, [paused, reduced, settle]);

  useEffect(() => {
    if (paused || reduced) {
      cancelAnimation(drift);
      return;
    }
    drift.set(withRepeat(withSequence(withTiming(1, { duration: 3200 }), withTiming(0, { duration: 3200 })), -1));
    return () => cancelAnimation(drift);
  }, [paused, reduced, drift]);

  const clipReaction = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - settle.get() * 0.06 }],
    opacity: 1 - settle.get() * 0.35,
  }));

  const motion = useAnimatedStyle(() => ({
    transform: [{ translateY: drift.get() * -25 }, { scale: 1 + drift.get() * 0.08 }],
  }));

  return (
    <Animated.View style={[{ width, height }, clipReaction]}>
      <LinearGradient colors={clip.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill} />
      <Animated.View style={[styles.art, motion]}>
        <Text color="#FFFFFF" style={styles.artText}>
          Make room{'\n'}for a new idea.
        </Text>
      </Animated.View>
      <View style={[styles.playPill, paused ? styles.playPillPaused : null]}>
        {paused ? <Pause size={18} weight="fill" color="#FFFFFF" /> : <Play size={18} weight="fill" color="#FFFFFF" />}
        <Text variant="subhead" color="#FFFFFF">
          {paused ? 'Media paused · Learning break active' : 'Playing preview feed'}
        </Text>
      </View>
      <Pressable
        onPress={() => setLiked((value) => !value)}
        accessibilityRole="button"
        accessibilityLabel={liked ? 'Unlike preview' : 'Like preview'}
        accessibilityState={{ selected: liked }}
        style={styles.like}
      >
        <Heart size={30} color={liked ? '#FFCFD3' : '#FFFFFF'} weight={liked ? 'fill' : 'regular'} />
        <Text variant="caption" color="#FFFFFF">
          Like
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function Takeover({
  height,
  closing,
  onClosed,
  children,
}: {
  height: number;
  closing: boolean;
  onClosed: () => void;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const y = useSharedValue(reduced ? 0 : height);
  const scrim = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (!closing) {
      y.set(withTiming(0, { duration: reduced ? 0 : 480, easing: ease.out }));
      scrim.set(withTiming(1, { duration: reduced ? 0 : 360, easing: ease.out }));
      return;
    }
    if (reduced) {
      onClosed();
      return;
    }
    scrim.set(withTiming(0, { duration: 280, easing: ease.inOut }));
    y.set(
      withTiming(height, { duration: 360, easing: ease.inOut }, (finished) => {
        if (finished) scheduleOnRN(onClosed);
      }),
    );
  }, [closing, reduced, height, y, scrim, onClosed]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: scrim.get(),
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.get() }],
  }));

  return (
    <View style={styles.fill}>
      <Animated.View pointerEvents="none" style={[styles.backdrop, backdropStyle]} />
      <Animated.View style={[styles.sheet, sheetStyle]}>{children}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#122C25' },
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(6, 18, 15, 0.55)' },
  sheet: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#F3F8F3',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  header: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, gap: 4 },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#18342FCC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIcon: { width: 40, height: 40, borderRadius: 12 },
  indicator: {
    position: 'absolute',
    left: 20,
    right: 20,
    borderRadius: 18,
    padding: 14,
    gap: 8,
    backgroundColor: '#102D26EE',
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottom: {
    position: 'absolute',
    left: 20,
    right: 20,
    gap: 10,
    padding: 16,
    borderRadius: 22,
    backgroundColor: '#102D26EE',
  },
  art: {
    position: 'absolute',
    top: '30%',
    left: 24,
    right: 80,
    padding: 20,
    borderRadius: 28,
    backgroundColor: '#FFFFFF15',
  },
  artText: { fontSize: 38, lineHeight: 48, fontWeight: '700' },
  playPill: {
    position: 'absolute',
    top: '57%',
    left: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 99,
    backgroundColor: '#102D26CC',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  playPillPaused: { backgroundColor: '#102D26F0' },
  like: {
    position: 'absolute',
    top: '44%',
    right: 14,
    width: 54,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
});
