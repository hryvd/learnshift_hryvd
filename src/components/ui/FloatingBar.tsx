import { createContext, useContext, useEffect, useRef, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { Platform, Pressable, StyleSheet, Text as RNText, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurTargetView, BlurView } from 'expo-blur';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/design/haptics';
import { spring, useReducedMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius } from '@/design/tokens';
import { FONT_MAIN, fontFor } from '@/design/typography';

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
type GlassModule = typeof import('expo-glass-effect');

/**
 * expo-glass-effect is iOS-only and its native module is not linked in every iOS
 * build (the CI sideload build leaves it out). A missing module must never crash
 * the app at launch, so it is loaded defensively and the blur bar is the fallback.
 */
function loadGlass(): GlassModule | null {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-glass-effect') as GlassModule;
  } catch {
    return null;
  }
}
const glassModule = loadGlass();
const GlassView = glassModule?.GlassView ?? null;

function liquidGlassAvailable(): boolean {
  try {
    return !!glassModule && !!glassModule.isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

const GLASS: 'liquid' | 'blur' | 'android' =
  Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' && GlassView && liquidGlassAvailable() ? 'liquid' : 'blur';

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

/**
 * Near-clear glass: ~5% blur, a light tint for icon legibility, no sheen or
 * strokes. The edge "light wrap" is an inset glow (boxShadow), not a line.
 */
const TONE = {
  day: {
    wash: 'rgba(255,255,255,0.62)',
    /** Shown only until the live blur samples, so the bar never flashes black. */
    frost: 'rgba(246,245,241,0.92)',
    wrap: 'inset 0 0 0 0.5px rgba(255,255,255,0.55), inset 0 1px 10px rgba(255,255,255,0.75), inset 0 -1px 8px rgba(255,255,255,0.35)',
    drop: '0 10px 26px -8px rgba(28,25,20,0.22)',
  },
  night: {
    wash: 'rgba(22,26,44,0.55)',
    frost: 'rgba(22,26,44,0.92)',
    wrap: 'inset 0 0 0 0.5px rgba(255,255,255,0.14), inset 0 1px 10px rgba(255,255,255,0.18), inset 0 -1px 8px rgba(255,255,255,0.08)',
    drop: '0 10px 26px -8px rgba(0,0,0,0.5)',
  },
};

/** ~5% blur strength (expo-blur intensity is 0–100). */
const BLUR = 5;

/** The glass card that floats above the content. `inline` renders it in flow (gallery). */
export function FloatingBarShell({
  children,
  inline,
  blocked = false,
}: {
  children: ReactNode;
  inline?: boolean;
  /** Disables pointer and screen-reader interaction while a modal card covers the bar. */
  blocked?: boolean;
}) {
  const { isNight } = useTheme();
  const { bottom } = useFloatingBar();
  const target = useContext(BlurTargetContext);
  const t = isNight ? TONE.night : TONE.day;

  let surface: ReactNode;
  if (GLASS === 'liquid' && GlassView) {
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
            intensity={BLUR}
            tint={isNight ? 'systemUltraThinMaterialDark' : 'default'}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: t.frost }]} />
        )
      ) : (
        <BlurView
          intensity={BLUR}
          tint={isNight ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
          style={StyleSheet.absoluteFill}
        />
      );
    surface = (
      <View style={styles.clip} pointerEvents="none">
        {/* Opaque frost under the live blur: if the blur hasn't sampled yet (or
            can't), the bar shows frosted glass, never black. */}
        {GLASS === 'android' ? <View style={[StyleSheet.absoluteFill, { backgroundColor: t.frost }]} /> : null}
        {blur}
        {/* Brand-tinted wash keeps icons readable over busy content. */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: t.wash }]} />
        {/* Edge light wrap: an inward glow along every edge, no stroke or sheen. */}
        <View style={[StyleSheet.absoluteFill, styles.round, { boxShadow: t.wrap }]} />
      </View>
    );
  }

  return (
    <View
      style={inline ? styles.inline : [styles.pinned, { bottom }]}
      pointerEvents={blocked ? 'none' : 'box-none'}
      importantForAccessibility={blocked ? 'no-hide-descendants' : 'auto'}
      accessibilityElementsHidden={blocked}
      accessibilityRole="tablist"
    >
      <View
        style={[
          styles.bar,
          // CSS-style boxShadow draws only outside the bar, so it works over translucent glass on every platform.
          { boxShadow: t.drop },
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

  useEffect(() => {
    // Tabs are switched 100+ times a day: a calm critically damped lift, no bounce or pop.
    on.set(reduced ? (active ? 1 : 0) : withSpring(active ? 1 : 0, spring.ui));
  }, [active, reduced, on]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(on.get(), [0, 1], [ICON_DROP, 0]) }],
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

export type WindowRect = { x: number; y: number; width: number; height: number };

/** The raised accent circle with a Bungee "+"; reports its window rect so its card can morph out of it. */
export function CenterPlusButton({
  open,
  hidden = false,
  onPress,
  onMeasure,
  label,
  openLabel,
}: {
  open: boolean;
  /** Hides the real button while its morphed card owns the surface. */
  hidden?: boolean;
  onPress: () => void;
  onMeasure?: (rect: WindowRect) => void;
  label: string;
  openLabel?: string;
}) {
  const { c } = useTheme();
  const btnRef = useRef<ComponentRef<typeof View> | null>(null);
  const r = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    r.set(withSpring(open ? 1 : 0, spring.ui));
  }, [open, r]);
  const plusStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${r.get() * 45}deg` }, { scale: 1 + r.get() * 0.06 }],
  }));

  const handlePress = () => {
    if (onMeasure && btnRef.current) {
      btnRef.current.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) onMeasure({ x, y, width, height });
        onPress();
      });
      return;
    }
    onPress();
  };

  return (
    <View style={styles.slot} pointerEvents={hidden ? 'none' : 'box-none'}>
      <View ref={btnRef} collapsable={false} style={hidden ? styles.hiddenCenter : undefined}>
        <PressableScale
          onPress={handlePress}
          disabled={hidden}
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
  fill: { flex: 1 },
  round: { borderRadius: radius.card },
  clip: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: radius.card, overflow: 'hidden' },
  slot: { flex: 1, height: BAR_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: LABEL_GAP },
  hiddenCenter: { opacity: 0 },
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
    fontFamily: FONT_MAIN,
    fontWeight: 'normal',
    fontSize: 34,
    lineHeight: 40,
    textAlign: 'center',
    includeFontPadding: false,
  },
});
