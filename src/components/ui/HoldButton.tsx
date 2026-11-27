import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { haptic } from '@/design/haptics';
import { spring, useReducedMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius } from '@/design/tokens';

import { Text } from './Text';

type Kind = 'primary' | 'secondary' | 'destructive';

type Props = {
  label: string;
  /** Shown while the finger is down. */
  holdingLabel: string;
  durationMs?: number;
  kind?: Kind;
  onComplete: () => void;
  /** A press released before the hold finished (show a hint). */
  onTapShort?: () => void;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
  icon?: ReactNode;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Press-and-hold confirmation. One haptic pulse the moment the hold starts;
 * a fill sweeps across while held. Releasing early, sliding off, a
 * cancelled touch or unmounting all stop it, and `onComplete` fires only
 * once the full duration has passed with the finger still down. Without
 * haptics (web, motors off) the fill and label carry the same feedback.
 * Assistive tech gets a named "activate" action instead of a hold.
 */
export function HoldButton({
  label,
  holdingLabel,
  durationMs = 1500,
  kind = 'destructive',
  onComplete,
  onTapShort,
  disabled,
  busy,
  busyLabel,
  icon,
  accessibilityHint,
  style,
}: Props) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(false);
  const fill = useSharedValue(0);
  const inactive = disabled || busy;

  // The sweep is a translucent wash of the label colour (darkening on the
  // solid primary), so the label keeps its contrast at every point of the hold.
  const palette: Record<Kind, { bg: string; fg: string; fill: string; wash: number }> = {
    primary: { bg: c.accent, fg: c.onAccent, fill: '#000000', wash: 0.2 },
    secondary: { bg: c.accentTint, fg: c.accent, fill: c.accent, wash: 0.16 },
    destructive: { bg: c.accentTint, fg: c.danger, fill: c.danger, wash: 0.16 },
  };
  const p = palette[kind];

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const stop = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    cancelAnimation(fill);
    fill.set(reduced ? 0 : withSpring(0, spring.snappy));
  };

  const start = () => {
    if (inactive || timer.current) return;
    done.current = false;
    haptic.holdStart();
    setHolding(true);
    fill.set(0);
    fill.set(reduced ? 1 : withTiming(1, { duration: durationMs, easing: Easing.linear }));
    timer.current = setTimeout(() => {
      timer.current = null;
      if (done.current) return;
      done.current = true;
      setHolding(false);
      if (kind === 'destructive') haptic.warning();
      else haptic.success();
      onComplete();
    }, durationMs);
  };

  const release = () => {
    const early = timer.current != null;
    stop();
    setHolding(false);
    if (early) onTapShort?.();
  };

  const wash = p.wash;
  const fillStyle = useAnimatedStyle(() =>
    reduced ? { opacity: fill.get() * wash, width: '100%' } : { opacity: wash, width: `${fill.get() * 100}%` },
  );

  const shown = busy ? (busyLabel ?? label) : holding ? holdingLabel : label;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      accessibilityActions={[{ name: 'activate', label }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'activate' && !inactive) onComplete();
      }}
      disabled={inactive}
      onPressIn={start}
      onPressOut={release}
      // Long enough that the hold timer, not Pressable, decides completion.
      delayLongPress={durationMs * 4}
      onLongPress={() => {}}
      style={[
        styles.base,
        Platform.OS === 'ios' && ({ borderCurve: 'continuous' } as const),
        { backgroundColor: p.bg, opacity: inactive ? 0.5 : 1 },
        reduced && holding ? { borderWidth: 2, borderColor: p.fill } : null,
        style,
      ]}
    >
      <Animated.View pointerEvents="none" style={[styles.fill, { backgroundColor: p.fill }, fillStyle]} />
      <View style={styles.row} pointerEvents="none">
        {icon}
        <Text
          variant="headline"
          color={p.fg}
          numberOfLines={1}
          accessibilityLiveRegion="polite"
        >
          {shown}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 54,
    borderRadius: radius.pill,
    overflow: 'hidden',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
