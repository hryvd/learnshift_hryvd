import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { haptic } from '@/design/haptics';
import { spring, useReducedMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';

type Props = {
  value: boolean;
  onChange: (v: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
};

const W = 51;
const H = 31;
const K = 27;

/**
 * Controlled switch. It never keeps its own checked state: the knob always
 * springs toward `value`, so a burst of taps retargets the same spring and
 * the drawn state ends on whatever the setting really is.
 */
export function Toggle({ value, onChange, accessibilityLabel, disabled }: Props) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const p = useSharedValue(value ? 1 : 0);
  const press = useSharedValue(1);
  const off = c.chartIdle;
  const on = c.accent;

  useEffect(() => {
    const target = value ? 1 : 0;
    p.set(reduced ? target : withSpring(target, spring.toggle));
  }, [value, reduced, p]);

  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(p.get(), [0, 1], [off, on]),
  }));
  const knob = useAnimatedStyle(() => ({
    transform: [{ translateX: 2 + p.get() * (W - K - 4) }, { scale: press.get() }],
  }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      hitSlop={8}
      onPressIn={() => {
        if (!reduced) press.set(withSpring(0.9, spring.toggle));
      }}
      onPressOut={() => {
        press.set(reduced ? 1 : withSpring(1, spring.toggle));
      }}
      onPress={() => {
        haptic.toggle(!value);
        onChange(!value);
      }}
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <Animated.View style={[styles.track, track]}>
        <Animated.View style={[styles.knob, knob]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: W, height: H, borderRadius: H / 2, justifyContent: 'center' },
  knob: {
    width: K,
    height: K,
    borderRadius: K / 2,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
});
