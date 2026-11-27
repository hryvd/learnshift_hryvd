import { useEffect, type ReactNode } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/design/motion';

const OUT = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * Enters once: rises 14px and fades in after `delay` ms. Re-runs when `k`
 * changes (a view swap). Under reduced motion it simply appears.
 */
export function Rise({
  children,
  delay = 0,
  k,
  y = 14,
  style,
}: {
  children: ReactNode;
  delay?: number;
  k?: string | number;
  y?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      p.set(1);
      return;
    }
    p.set(0);
    p.set(withDelay(delay, withTiming(1, { duration: 520, easing: OUT })));
  }, [k, delay, reduced, p, y]);
  const s = useAnimatedStyle(() => ({
    opacity: p.get(),
    transform: [{ translateY: (1 - p.get()) * y }],
  }));
  return <Animated.View style={[style, s]}>{children}</Animated.View>;
}

/** A short horizontal shake each time `trigger` changes (form errors). */
export function Shake({ trigger, children, style }: { trigger: unknown; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  useEffect(() => {
    if (!trigger || reduced) return;
    x.set(
      withSequence(
        withTiming(-6, { duration: 50 }),
        withTiming(6, { duration: 60 }),
        withTiming(-4, { duration: 60 }),
        withTiming(3, { duration: 60 }),
        withSpring(0, { damping: 14, stiffness: 260 }),
      ),
    );
  }, [trigger, reduced, x]);
  const s = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  return <Animated.View style={[style, s]}>{children}</Animated.View>;
}

/** Pops in with a small overshoot (a new student joining, a code tile). */
export function Pop({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    p.set(withDelay(delay, withSpring(1, { damping: 13, stiffness: 220, mass: 0.8 })));
  }, [delay, reduced, p]);
  const s = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.get() * 1.4),
    transform: [{ scale: 0.6 + 0.4 * p.get() }],
  }));
  return <Animated.View style={[style, s]}>{children}</Animated.View>;
}
