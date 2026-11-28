import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { haptic } from '@/design/haptics';
import { ease, PRESS_IN_MS, pressScale, spring } from '@/design/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** 0.96 for buttons (default), 0.98 for cards. */
  scaleTo?: number;
  haptics?: boolean;
};

/**
 * The one pressable in the app. Press-in is a quick strong ease-out (feels
 * instant); release is a critically damped spring, so nothing wobbles.
 */
export function PressableScale({
  style,
  scaleTo = pressScale.button,
  haptics = true,
  onPressIn,
  onPressOut,
  onPress,
  disabled,
  children,
  accessibilityRole = 'button',
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <AnimatedPressable
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPressIn={(e) => {
        scale.set(withTiming(scaleTo, { duration: PRESS_IN_MS, easing: ease.outStrong }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withSpring(1, spring.release));
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptics) haptic.select();
        onPress?.(e);
      }}
      style={[style, animated]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
