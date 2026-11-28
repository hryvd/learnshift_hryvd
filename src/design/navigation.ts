import { Animated, Easing, Platform } from 'react-native';

/**
 * One navigation motion system for every navigator.
 *
 * - Push: iOS keeps its native interactive slide. Android uses the iOS-style
 *   slide with parallax ('ios_from_right') instead of the platform default,
 *   so both phones feel the same.
 * - Sheets: native modal on iOS; Android slides up from the bottom.
 * - Web: no route animation (instant, like a website).
 */
const isAndroid = Platform.OS === 'android';
const isWeb = Platform.OS === 'web';

export const pushTransition = isWeb
  ? ({ animation: 'none' } as const)
  : isAndroid
    ? ({ animation: 'ios_from_right', gestureEnabled: true } as const)
    : ({ animation: 'default', gestureEnabled: true, fullScreenGestureEnabled: true } as const);

export const sheetTransition = isAndroid
  ? ({ presentation: 'modal', animation: 'slide_from_bottom' } as const)
  : ({ presentation: 'modal' } as const);

/**
 * Tab switch: a 220 ms strong ease-out crossfade with a 6 px drift. The stock
 * 'shift' (150 ms, 50 px, both screens fully visible mid-way) read as rough.
 * Tabs change 100+ times a day, so this stays short and quiet.
 */
type Progress = Animated.AnimatedInterpolation<number>;

export const tabTransition = {
  transitionSpec: {
    animation: 'timing' as const,
    config: { duration: 220, easing: Easing.bezier(0.23, 1, 0.32, 1) },
  },
  sceneStyleInterpolator: ({ current }: { current: { progress: Progress } }) => ({
    sceneStyle: {
      // Outgoing screen leaves in the first ~40%; incoming arrives over the rest.
      opacity: current.progress.interpolate({ inputRange: [-1, -0.6, 0, 0.6, 1], outputRange: [0, 0, 1, 0, 0] }),
      transform: [
        { translateX: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [-6, 0, 6] }) },
      ],
    },
  }),
};
