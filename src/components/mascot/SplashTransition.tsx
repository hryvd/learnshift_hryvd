import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { Paty } from '@/components/mascot/Paty';
import { Text } from '@/components/ui';
import { useReducedMotion } from '@/design/motion';

const SPLASH_BG = '#FDF1E2';
const BRAND_INK = '#C2410C'; // accent: 4.65:1 on the splash cream
const SUB_INK = '#575C63'; // 6.05:1

/**
 * Timing comes from Paty's wave: frames swap every 300 ms, so one full wave
 * is 600 ms. A cold launch holds for two waves (1200 ms) before exiting.
 */
const HOLD_MS = 1200;
const HOLD_REDUCED_MS = 350;
/** Never keep the greeting up longer than this, even if startup stalls. */
const CEILING_MS = 4500;
/** Native splash is hidden on first layout; this is the backstop. */
const NATIVE_HIDE_MS = 300;

/** Once greeted, remounts (and warm resumes) skip the greeting entirely. */
let greeted = false;

function hideNative() {
  SplashScreen.hideAsync().catch(() => {});
}

/**
 * Seamless mascot launch transition bridging the native #FDF1E2 splash screen
 * (centered Paty with no circle clipping) directly into the live app screen.
 * Cold launch only.
 */
export function SplashTransition({ ready }: { ready: boolean }) {
  const reduced = useReducedMotion();
  const [done, setDone] = useState(() => greeted);
  const [minElapsed, setMinElapsed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const hidNative = useRef(false);
  const exiting = useRef(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mascotScale = useSharedValue(1);
  const mascotY = useSharedValue(0);
  const bgOpacity = useSharedValue(1);
  const wordOpacity = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (done) return;
    if (!reduced) {
      wordOpacity.set(withDelay(90, withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) })));
    }
    const minId = setTimeout(() => setMinElapsed(true), reduced ? HOLD_REDUCED_MS : HOLD_MS);
    const ceilingId = setTimeout(() => setTimedOut(true), CEILING_MS);
    const nativeId = setTimeout(hideNative, NATIVE_HIDE_MS);
    return () => {
      clearTimeout(minId);
      clearTimeout(ceilingId);
      clearTimeout(nativeId);
    };
    // Runs once per cold launch; `done` only flips to true afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, wordOpacity]);

  // Backgrounded mid-greeting: on return, finish at once instead of
  // resuming a half-played exit.
  useEffect(() => {
    if (done) return;
    let wentAway = false;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        wentAway = true;
        return;
      }
      if (!wentAway) return;
      greeted = true;
      hideNative();
      setDone(true);
    });
    return () => sub.remove();
  }, [done]);

  useEffect(() => {
    if (done) greeted = true;
  }, [done]);

  useEffect(
    () => () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (done || exiting.current) return;
    if (!timedOut && (!ready || !minElapsed)) return;
    exiting.current = true;
    if (reduced) {
      bgOpacity.set(withTiming(0, { duration: 150 }));
      exitTimer.current = setTimeout(() => setDone(true), 160);
      return;
    }
    mascotY.set(withTiming(-36, { duration: 360, easing: Easing.inOut(Easing.cubic) }));
    mascotScale.set(withTiming(0.9, { duration: 360, easing: Easing.inOut(Easing.cubic) }));
    wordOpacity.set(withTiming(0, { duration: 180 }));
    bgOpacity.set(withDelay(80, withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) })));
    // Not cleared when deps change: once the exit starts it must finish.
    exitTimer.current = setTimeout(() => setDone(true), 420);
  }, [ready, minElapsed, timedOut, done, reduced, bgOpacity, mascotScale, mascotY, wordOpacity]);

  const rootStyle = useAnimatedStyle(() => ({ opacity: bgOpacity.get() }));
  const patyStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: mascotY.get() }, { scale: mascotScale.get() }],
  }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: wordOpacity.get() }));

  if (done) return null;

  return (
    <Animated.View
      pointerEvents="none"
      onLayout={() => {
        if (hidNative.current) return;
        hidNative.current = true;
        hideNative();
      }}
      style={[styles.overlay, rootStyle]}
    >
      <View style={styles.center}>
        <Animated.View style={patyStyle}>
          <Paty expression="waving" size={142} alive />
        </Animated.View>
        <Animated.View style={[styles.brand, labelStyle]}>
          <Text variant="largeTitle" color={BRAND_INK} align="center">
            LearnShift
          </Text>
          <Text variant="subhead" color={SUB_INK} align="center">
            Scrolling better minutes
          </Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: SPLASH_BG,
    zIndex: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    position: 'absolute',
    top: '50%',
    marginTop: 82,
    gap: 4,
    alignItems: 'center',
  },
});
