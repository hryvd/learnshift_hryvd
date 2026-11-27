import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { spring, useReducedMotion } from '@/design/motion';

type Props = {
  visible: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** The parent's flex `gap`; pulled back while collapsed so no empty slot remains. */
  gap?: number;
};

/**
 * Expands and collapses content that a switch (or any control) reveals.
 * Measures its children, then springs height, opacity and a small lift.
 * Works on iOS, Android and web (no layout animations). Under Reduce Motion
 * it switches instantly. Hidden content takes no touches and is skipped by
 * screen readers.
 */
export function AnimatedReveal({ visible, children, style, gap = 0 }: Props) {
  const reduced = useReducedMotion();
  const [h, setH] = useState(0);
  const p = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    const target = visible ? 1 : 0;
    p.set(reduced ? target : withSpring(target, spring.reveal));
  }, [visible, reduced, p]);

  const outer = useAnimatedStyle(() => {
    const v = Math.min(Math.max(p.get(), 0), 1);
    return { height: h * v, opacity: v, marginTop: -(1 - v) * gap };
  });
  const inner = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - Math.min(Math.max(p.get(), 0), 1)) * -6 }],
  }));

  return (
    <Animated.View
      style={[styles.clip, outer, style]}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      aria-hidden={!visible}
    >
      <Animated.View style={[styles.measure, inner]}>
        <View onLayout={(e) => setH(Math.ceil(e.nativeEvent.layout.height))}>{children}</View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  measure: { position: 'absolute', left: 0, right: 0, top: 0 },
});
