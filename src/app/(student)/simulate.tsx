import { useEffect, useReducer, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowUp, CheckCircle, Heart, Pause, Play, Timer, X } from 'phosphor-react-native';

import { FullQuizOverlay } from '@/components/student/FullQuizOverlay';
import { VerticalPager } from '@/components/student/VerticalPager';
import { Text } from '@/components/ui';
import { mirroredAppByIdOrPkg, type MirroredClip } from '@/data/mirroredApps';
import { ease, useReducedMotion } from '@/design/motion';
import { DEFAULT_SENTINEL, useAppStore } from '@/store/useAppStore';

import { breakTransition, type BreakState } from '@/services/learningBreak';

/** A clearly labelled local preview; never reads or imitates real third-party content. */
export default function Simulate() {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { app: appParam, start } = useLocalSearchParams<{ app?: string; start?: string }>();
  const [app] = useState(() => mirroredAppByIdOrPkg(appParam));
  const interval = useAppStore((s) => s.sentinel?.overlayIntervalSec ?? DEFAULT_SENTINEL.overlayIntervalSec);
  const [{ remaining, stage }, dispatch] = useReducer(breakTransition, {
    stage: start === 'quiz' ? 'overlay' : start === 'nudge' ? 'ready' : 'feed',
    remaining: start === 'nudge' ? 0 : interval,
  } as BreakState);
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
    }, 1000);
    return () => clearInterval(timer);
  }, [stage, active]);
  const dismiss = () => dispatch({ type: 'dismiss', interval });
  const onSwipe = (direction: 'up' | 'down') => {
    useAppStore.getState().recordSwipe(1);
    if (direction === 'up' && stage === 'ready') {
      dispatch({ type: 'swipe', direction });
      return true;
    }
    if (direction === 'up' && page === app.clips.length - 1) {
      setPage(0);
      return true;
    }
    return false;
  };

  return (
    <View style={styles.root}>
      <View
        style={styles.fill}
        accessibilityElementsHidden={stage === 'overlay'}
        importantForAccessibility={stage === 'overlay' ? 'no-hide-descendants' : 'auto'}
      >
        <VerticalPager
          pageHeight={height}
          pageWidth={width}
          index={page}
          onIndexChange={setPage}
          onBeforeSwipe={onSwipe}
          enabled={stage === 'feed' || stage === 'ready'}
          bottomOffset={insets.bottom + 190}
        >
          {app.clips.map((clip, index) => (
            <PreviewClip
              key={clip.id}
              clip={clip}
              height={height}
              width={width}
              paused={!active || stage === 'overlay' || index !== page}
            />
          ))}
        </VerticalPager>
        <View style={[styles.header, { top: insets.top + 12 }]}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close preview"
            style={styles.iconButton}
          >
            <X size={24} color="#FFFFFF" />
          </Pressable>
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
          {stage === 'ready' ? <CheckCircle size={18} color="#B9F1D1" /> : <Timer size={18} color="#FFFFFF" />}
          <Text variant="subhead" color={stage === 'ready' ? '#B9F1D1' : '#FFFFFF'}>
            {stage === 'ready'
              ? 'Break ready. Your next swipe starts it.'
              : `Next break · ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`}
          </Text>
        </View>
        <View style={[styles.bottom, { bottom: insets.bottom + 20 }]}>
          <Text variant="headline" color="#FFFFFF">
            @learnshift · a practice feed
          </Text>
          <Text color="#FFFFFF">
            {stage === 'ready'
              ? 'Swipe up when you’re ready to learn something new.'
              : 'Keep scrolling. The timer is just an indicator.'}
          </Text>
          {stage === 'ready' ? (
            <Pressable onPress={() => dispatch({ type: 'start' })} accessibilityRole="button" style={styles.start}>
              <ArrowUp size={20} color="#163C2C" weight="bold" />
              <Text variant="headline" color="#163C2C">
                Start learning break
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {stage === 'overlay' ? (
        <Takeover height={height}>
          <FullQuizOverlay appName={app.name} onUnlock={dismiss} onDismiss={dismiss} />
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
  const [liked, setLiked] = useState(false);
  useEffect(() => {
    if (paused || reduced) {
      cancelAnimation(drift);
      return;
    }
    drift.set(withRepeat(withSequence(withTiming(1, { duration: 3200 }), withTiming(0, { duration: 3200 })), -1));
    return () => cancelAnimation(drift);
  }, [paused, reduced, drift]);
  const motion = useAnimatedStyle(() => ({
    transform: [{ translateY: drift.get() * -25 }, { scale: 1 + drift.get() * 0.08 }],
  }));
  return (
    <View style={{ width, height }}>
      <LinearGradient colors={clip.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill} />
      <Animated.View style={[styles.art, motion]}>
        <Text color="#FFFFFF" style={styles.artText}>
          Make room{'\n'}for a new idea.
        </Text>
      </Animated.View>
      <View style={styles.playState}>
        {paused ? <Pause size={24} color="#FFFFFF" /> : <Play size={24} color="#FFFFFF" />}
        <Text color="#FFFFFF">{paused ? 'Preview paused' : 'Practice scrolling'}</Text>
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
    </View>
  );
}
function Takeover({ height, children }: { height: number; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const y = useSharedValue(reduced ? 0 : height);
  useEffect(() => {
    y.set(withTiming(0, { duration: reduced ? 0 : 280, easing: ease.out }));
  }, [reduced, y]);
  const motion = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  return <Animated.View style={[styles.fill, { backgroundColor: '#F3F8F3' }, motion]}>{children}</Animated.View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#122C25' },
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
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
  start: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#D0F1DC',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
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
  playState: { position: 'absolute', top: '58%', left: 40, flexDirection: 'row', gap: 10, alignItems: 'center' },
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
