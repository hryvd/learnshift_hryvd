import { Platform } from 'react-native';
import {
  Easing,
  FadeIn,
  FadeInDown,
  ReduceMotion,
  useReducedMotion,
  type WithSpringConfig,
} from 'react-native-reanimated';

/** Spring presets. Nothing in the app animates linearly. */
export const spring = {
  snappy: { damping: 18, stiffness: 260, mass: 1, reduceMotion: ReduceMotion.System },
  smooth: { damping: 22, stiffness: 180, mass: 1, reduceMotion: ReduceMotion.System },
  bouncy: { damping: 12, stiffness: 200, mass: 1, reduceMotion: ReduceMotion.System },
  /** Gauges and rings: a slower settle (~700 ms) with no visible overshoot. */
  draw: { damping: 20, stiffness: 120, mass: 1, reduceMotion: ReduceMotion.System },
  /** Switch knob and track: crisp ~200 ms settle, barely any overshoot. */
  toggle: { damping: 20, stiffness: 320, mass: 0.85, reduceMotion: ReduceMotion.System },
  /** Rows a switch reveals or hides: ~250 ms, no bounce. */
  reveal: { damping: 24, stiffness: 260, mass: 0.9, reduceMotion: ReduceMotion.System },
  /** Critically damped UI settle (~280 ms): release, thumbs, toggles. Never wobbles. */
  ui: { duration: 280, dampingRatio: 1, reduceMotion: ReduceMotion.System },
  /** Press release back to rest (~300 ms, no overshoot). */
  release: { duration: 300, dampingRatio: 1, reduceMotion: ReduceMotion.System },
  /** + button → Shift card. Unhurried, near-critical (Apple-style, no visible bounce). */
  morphOpen: { duration: 520, dampingRatio: 0.88, reduceMotion: ReduceMotion.System },
  /** Card → + button. Faster than open, no overshoot. */
  morphClose: { duration: 380, dampingRatio: 1, reduceMotion: ReduceMotion.System },
} as const satisfies Record<string, WithSpringConfig>;

export const pressScale = {
  button: 0.96,
  card: 0.98,
} as const;

export const timing = {
  stagger: 40,
  themeCrossfade: 1200,
  blinkMin: 3000,
  blinkMax: 6000,
  breath: 3000,
  shimmer: 1100,
} as const;

export const ease = {
  inOut: Easing.bezier(0.45, 0, 0.55, 1),
  out: Easing.bezier(0.22, 1, 0.36, 1),
  /** Strong ease-out for press-in and entrances. */
  outStrong: Easing.bezier(0.23, 1, 0.32, 1),
  /** iOS drawer curve. */
  drawer: Easing.bezier(0.32, 0.72, 0, 1),
} as const;

/** Press-in duration: fast enough to feel instant, long enough to be seen. */
export const PRESS_IN_MS = 110;

/**
 * Entry animation for stacked cards: translateY 12 → 0, opacity 0 → 1,
 * 40 ms stagger. Falls back to a plain fade under Reduce Motion.
 */
export function enterAt(index: number, reduced: boolean) {
  const delay = index * timing.stagger;
  // Reanimated's web layout animations leave content hidden (visibility:
  // hidden until a keyframe that never starts), so web renders without them.
  if (Platform.OS === 'web') return undefined;
  if (reduced) return FadeIn.delay(delay).duration(220);
  return FadeInDown.delay(delay)
    .springify()
    .damping(spring.smooth.damping)
    .stiffness(spring.smooth.stiffness)
    .withInitialValues({ opacity: 0, transform: [{ translateY: 12 }] });
}

export { useReducedMotion };

/** Layout animations are native-only; see `enterAt`. */
export function nativeOnly<T>(anim: T): T | undefined {
  return Platform.OS === 'web' ? undefined : anim;
}
