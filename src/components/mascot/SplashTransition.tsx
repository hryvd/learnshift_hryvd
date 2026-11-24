import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
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
const BRAND_INK = '#1E2420';
const SUB_INK = '#6A635B';

/**
 * Seamless mascot launch transition bridging the native #FDF1E2 splash screen
 * (centered Paty with no circle clipping) directly into the live app screen.
 */
export function SplashTransition({ ready }: { ready: boolean }) {
  const reduced = useReducedMotion();
  const [done, setDone] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);
  const hidNative = useRef(false);
  const exiting = useRef(false);

  const mascotScale = useSharedValue(1);
  const mascotY = useSharedValue(0);
  const bgOpacity = useSharedValue(1);
  const wordOpacity = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (!reduced) {
      wordOpacity.set(withDelay(90, withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) })));
    }
    const minId = setTimeout(() => setMinElapsed(true), reduced ? 200 : 520);
    return () => clearTimeout(minId);
  }, [reduced, wordOpacity]);

  useEffect(() => {
    if (!ready || !minElapsed || exiting.current) return;
    exiting.current = true;
    if (reduced) {
      bgOpacity.set(withTiming(0, { duration: 150 }));
      const id = setTimeout(() => setDone(true), 160);
      return () => clearTimeout(id);
    }
    mascotY.set(withTiming(-36, { duration: 360, easing: Easing.inOut(Easing.cubic) }));
    mascotScale.set(withTiming(0.9, { duration: 360, easing: Easing.inOut(Easing.cubic) }));
    wordOpacity.set(withTiming(0, { duration: 180 }));
    bgOpacity.set(withDelay(80, withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) })));
    const id = setTimeout(() => setDone(true), 420);
    return () => clearTimeout(id);
  }, [ready, minElapsed, reduced, bgOpacity, mascotScale, mascotY, wordOpacity]);

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
        SplashScreen.hideAsync().catch(() => {});
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
