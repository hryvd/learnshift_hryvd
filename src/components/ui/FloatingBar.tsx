import { createContext, useContext, useEffect, useRef, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { Platform, Pressable, StyleSheet, Text as RNText, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurTargetView, BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/design/haptics';
import { spring, useReducedMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius } from '@/design/tokens';
import { fontFor } from '@/design/typography';

import type { IconProps } from './icons';
import { PressableScale } from './PressableScale';

/** Height of the floating bar itself, without the raised center button. */
export const BAR_HEIGHT = 64;
const SIDE_GAP = 16;
const ICON = 26;
const LABEL_LINE = 13;
const LABEL_GAP = 2;
/** Inactive icons sit centered; the active one rises to make room for its label. */
const ICON_DROP = (LABEL_LINE + LABEL_GAP) / 2;

/**
 * Where the floating bar sits. `bottom` is its gap from the screen edge (it rides
 * just above the home indicator), `inset` is the scroll padding a screen needs so
 * its last row clears the bar.
 */
export function useFloatingBar(): { bottom: number; inset: number } {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom - 10, 12);
  return { bottom, inset: bottom + BAR_HEIGHT + 28 };
}

/**
 * Glass on every platform, each with its best native tool:
 * - `liquid`: iOS 26+, Apple's Liquid Glass (expo-glass-effect).
 * - `blur`: older iOS and web, live system-material blur.
 * - `android`: live RenderNode blur (Android 12+) of the content wrapped in
 *   `BarBlurTarget`; Android 11 and below get the tinted frost layer only.
 */
const GLASS: 'liquid' | 'blur' | 'android' =
  Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' && isLiquidGlassAvailable() ? 'liquid' : 'blur';

/** Ref to the content behind the bar, so Android's blur knows what to blur. */
const BlurTargetContext = createContext<RefObject<ComponentRef<typeof View> | null> | null>(null);

/** Wraps a screen that shows a floating bar. Put the content in `BarBlurTarget` and the bar beside it. */
export function BarBlurHost({ children }: { children: ReactNode }) {
  const ref = useRef<ComponentRef<typeof View> | null>(null);
  return <BlurTargetContext.Provider value={ref}>{children}</BlurTargetContext.Provider>;
}

/** The content the bar floats over. Must be a sibling of the bar, not its parent. */
export function BarBlurTarget({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const ref = useContext(BlurTargetContext);
  const { c } = useTheme();
  // An opaque canvas, so the blur never samples empty (black) pixels.
  const fill = [styles.fill, { backgroundColor: c.bg }, style];
  if (Platform.OS !== 'android' || !ref) return <View style={fill}>{children}</View>;
  return (
    <BlurTargetView ref={ref} style={fill}>
      {children}
    </BlurTargetView>
  );
}

const TONE = {
  day: {
    wash: 'rgba(255,255,255,0.38)',
    frost: 'rgba(255,255,255,0.88)',
    sheen: ['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)'] as const,
    rim: 'rgba(255,255,255,0.85)',
    outline: 'rgba(0,0,0,0.07)',
  },
  night: {
    wash: 'rgba(22,26,44,0.42)',
    frost: 'rgba(22,26,44,0.9)',
    sheen: ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)'] as const,
    rim: 'rgba(255,255,255,0.16)',
    outline: 'rgba(255,255,255,0.07)',
  },
};

/** The glass card that floats above the content. `inline` renders it in flow (gallery). */
export function FloatingBarShell({ children, inline }: { children: ReactNode; inline?: boolean }) {
  const { c, isNight } = useTheme();
  const { bottom } = useFloatingBar();
  const target = useContext(BlurTargetContext);
  const t = isNight ? TONE.night : TONE.day;

  let surface: ReactNode;
  if (GLASS === 'liquid') {
    surface = (
      <GlassView
        style={[StyleSheet.absoluteFill, styles.round]}
        glassEffectStyle="regular"
        colorScheme={isNight ? 'dark' : 'light'}
      />
    );
  } else {
    const blur =
      GLASS === 'android' ? (
        target && !inline ? (
          <BlurView
            blurTarget={target}
            blurMethod="dimezisBlurViewSdk31Plus"
            intensity={80}
            tint={isNight ? 'systemUltraThinMaterialDark' : 'default'}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: t.frost }]} />
        )
      ) : (
        <BlurView
          intensity={80}
          tint={isNight ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
          style={StyleSheet.absoluteFill}
        />
      );
    surface = (
      <View style={styles.clip} pointerEvents="none">
        {blur}
        {/* Brand-tinted wash keeps icons readable over busy content. */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: t.wash }]} />
        <LinearGradient colors={t.sheen} style={styles.sheen} />
        {/* Bright top edge plus a faint outline: the cue that reads as glass. */}
        <View style={[StyleSheet.absoluteFill, styles.rim, { borderColor: t.rim }]} />
        <View style={[StyleSheet.absoluteFill, styles.outline, { borderColor: t.outline }]} />
      </View>
    );
  }

  return (
    <View
      style={inline ? styles.inline : [styles.pinned, { bottom }]}
      pointerEvents="box-none"
      accessibilityRole="tablist"
    >
      <View
        style={[
          styles.bar,
          // Android elevation shows through translucent fills, so only iOS and web get a drop shadow.
          Platform.OS !== 'android' ? [styles.shadow, { shadowColor: c.shadow }] : null,
        ]}
      >
        {surface}
        {children}
      </View>
    </View>
  );
}

type BarTabProps = {
  label: string;
  Icon: React.ComponentType<IconProps>;
  active: boolean;
  tint: string;
  onPress: () => void;
  /** Small overlay on the icon, e.g. a count badge. */
  badge?: ReactNode;
  accessibilityHint?: string;
};

/** One tab: icon only while idle; the active tab tints its icon and shows its name. */
export function BarTab({ label, Icon, active, tint, onPress, badge, accessibilityHint }: BarTabProps) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const on = useSharedValue(active ? 1 : 0);
  const pop = useSharedValue(1);

  useEffect(() => {
    on.set(withSpring(active ? 1 : 0, spring.snappy));
    if (active && !reduced) {
      pop.set(withSequence(withSpring(1.14, spring.snappy), withSpring(1, spring.bouncy)));
    }
  }, [active, reduced, on, pop]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(on.get(), [0, 1], [ICON_DROP, 0]) }, { scale: pop.get() }],
  }));
  const tintStyle = useAnimatedStyle(() => ({ opacity: on.get() }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: on.get(),
    transform: [{ translateY: interpolate(on.get(), [0, 1], [4, 0]) }],
  }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={() => {
        if (!active) haptic.select();
        onPress();
      }}
      style={styles.slot}
    >
      <Animated.View style={[styles.icon, iconStyle]}>
        <Icon size={ICON} color={c.tabIdle} />
        <Animated.View style={[StyleSheet.absoluteFill, tintStyle]}>
          <Icon size={ICON} color={tint} />
        </Animated.View>
        {badge}
      </Animated.View>
      <Animated.Text
        maxFontSizeMultiplier={1.2}
        numberOfLines={1}
        importantForAccessibility="no"
        accessibilityElementsHidden
        style={[styles.label, labelFont, { color: tint }, labelStyle]}
      >
        {label}
      </Animated.Text>
    </Pressable>
  );
}

/** The raised accent circle with a Bungee "+"; it turns into × while its sheet is open. */
export function CenterPlusButton({
  open,
  onPress,
  label,
  openLabel,
}: {
  open: boolean;
  onPress: () => void;
  label: string;
  openLabel?: string;
}) {
  const { c } = useTheme();
  const r = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    r.set(withSpring(open ? 1 : 0, spring.snappy));
  }, [open, r]);
  const plusStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${r.get() * 45}deg` }, { scale: 1 + r.get() * 0.06 }],
  }));

  return (
    <View style={styles.slot}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={open ? (openLabel ?? label) : label}
        accessibilityState={{ expanded: open }}
        style={[styles.center, { backgroundColor: c.accent, shadowColor: c.accent }]}
      >
        <Animated.View style={[styles.plusBox, plusStyle]}>
          <RNText allowFontScaling={false} style={[styles.plus, { color: c.onAccent }]}>
            +
          </RNText>
        </Animated.View>
      </PressableScale>
    </View>
  );
}

const labelFont = fontFor(600);

const styles = StyleSheet.create({
  pinned: { position: 'absolute', left: SIDE_GAP, right: SIDE_GAP },
  inline: { paddingHorizontal: SIDE_GAP, paddingTop: 28, paddingBottom: 8 },
  bar: {
    height: BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderRadius: radius.card,
  },
  shadow: {
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
  },
  fill: { flex: 1 },
  round: { borderRadius: radius.card },
  clip: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: radius.card, overflow: 'hidden' },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: '55%' },
  rim: { borderRadius: radius.card, borderTopWidth: 1, borderLeftWidth: 0.5, borderRightWidth: 0.5 },
  outline: { borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth },
  slot: { flex: 1, height: BAR_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: LABEL_GAP },
  icon: { width: ICON, height: ICON },
  label: { fontSize: 10, lineHeight: LABEL_LINE },
  center: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    // Rises out of the bar's top edge.
    transform: [{ translateY: -18 }],
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  plusBox: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center' },
  plus: {
    fontFamily: 'Bungee_400Regular',
    fontSize: 34,
    lineHeight: 40,
    textAlign: 'center',
    includeFontPadding: false,
  },
});
