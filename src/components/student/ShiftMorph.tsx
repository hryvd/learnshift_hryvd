import { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Text } from '@/components/ui';
import type { WindowRect } from '@/components/ui/FloatingBar';
import { haptic } from '@/design/haptics';
import { ease, spring, useReducedMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { FONT_MAIN } from '@/design/typography';
import { useT } from '@/i18n/useT';

import { ShiftSheetContent } from './ShiftSheet';

const BTN = 58;
const MAX_W = 560;
const CLOSE = 36;

/**
 * The center '+' becomes the Shift card as ONE object, in three layers:
 *  1. Shape: a plain rounded rect whose frame, radius and color travel from the
 *     button circle to the card. It has no children, so nothing is ever stretched.
 *  2. Content: header + tiles at their final position; fades/rises in late and
 *     out early, never scaled non-uniformly.
 *  3. Glyph: the '+' itself flies to the close button and turns into '×'.
 * Open is unhurried (~520 ms, no visible bounce); close is quicker (~380 ms).
 * Springs keep velocity, so tapping mid-animation reverses smoothly.
 */
export function ShiftMorph({
  visible,
  origin,
  onClose,
  onPresenceChange,
  progress,
}: {
  visible: boolean;
  origin: WindowRect | null;
  onClose: () => void;
  /** True while the morph is mounted and owns the center button visual. */
  onPresenceChange?: (mounted: boolean) => void;
  /** 0 = closed, 1 = open. Owned by the layout so the screen behind can recede. */
  progress: SharedValue<number>;
}) {
  const { c, isNight } = useTheme();
  // At night the card uses the lifted card tone (not the page bg) plus an edge glow,
  // so its growth stays visible against the dark screen.
  const surface = isNight ? c.card : c.bg;
  const openSpring = isNight ? spring.morphOpenNight : spring.morphOpen;
  const closeSpring = isNight ? spring.morphCloseNight : spring.morphClose;
  const colorEnd = isNight ? 0.85 : 0.65;
  const contentIn: [number, number] = isNight ? [0.22, 0.97] : [0.3, 0.95];
  const t = useT();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { width: winW, height: winH } = useWindowDimensions();

  const [mounted, setMounted] = useState(visible);
  const visibleRef = useRef(visible);
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  const drag = useSharedValue(0);
  const cardH = useSharedValue(Math.min(Math.round(winH * 0.78), 680));
  const rowY = useSharedValue(23);
  const rowH = useSharedValue(CLOSE);

  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    onPresenceChange?.(mounted);
  }, [mounted, onPresenceChange]);

  const finishUnmount = () => {
    if (!visibleRef.current) setMounted(false);
  };

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      drag.set(0);
      haptic.light();
      progress.set(reduced ? withTiming(1, { duration: 180, easing: ease.out }) : withSpring(1, openSpring));
    } else {
      const done = (finished?: boolean) => {
        'worklet';
        if (finished) scheduleOnRN(finishUnmount);
      };
      progress.set(
        reduced ? withTiming(0, { duration: 160, easing: ease.out }, done) : withSpring(0, closeSpring, done),
      );
    }
  }, [visible, mounted, reduced, progress, drag, openSpring, closeSpring]);

  // Android hardware Back closes the open card.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  // Geometry (JS constants captured by worklets).
  const cardW = Math.min(winW, MAX_W);
  const cardX = (winW - cardW) / 2;
  const fromX = origin ? origin.x + (origin.width - BTN) / 2 : winW / 2 - BTN / 2;
  const fromY = origin ? origin.y + (origin.height - BTN) / 2 : winH - Math.max(insets.bottom, 12) - 58;
  const closeCx = cardX + cardW - space.screen - CLOSE / 2;
  const sheetR = radius.sheet;

  const pan = usePanGesture({
    activeOffsetY: [-8, 8],
    onUpdate: (e) => {
      'worklet';
      // Follows the finger down; resists upward drags instead of hitting a wall.
      const y = e.translationY;
      drag.set(y >= 0 ? y : -Math.sqrt(-y) * 2.2);
    },
    onDeactivate: (e) => {
      'worklet';
      if (e.translationY > 110 || e.velocityY > 550) {
        scheduleOnRN(onClose);
      } else {
        drag.set(withSpring(0, spring.ui));
      }
    },
  });

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: 1 - (1 - Math.min(1, Math.max(0, progress.get()))) ** 2, // ease-out
  }));

  // 1. Shape: frame + radius + color, from the button circle to the card.
  const shapeStyle = useAnimatedStyle(() => {
    const p = progress.get();
    const h = cardH.get();
    const toY = winH - h;
    if (reduced) {
      return {
        left: cardX,
        top: toY + drag.get(),
        width: cardW,
        height: h,
        borderTopLeftRadius: sheetR,
        borderTopRightRadius: sheetR,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        opacity: p,
        backgroundColor: surface,
      };
    }
    const q = Math.max(0, p); // springs may dip below 0 on close; never invert the frame
    const top = interpolate(q, [0, 1], [BTN / 2, sheetR], Extrapolation.CLAMP);
    const bottom = interpolate(q, [0, 1], [BTN / 2, 0], Extrapolation.CLAMP);
    return {
      left: interpolate(q, [0, 1], [fromX, cardX]),
      top: interpolate(q, [0, 1], [fromY, toY]) + drag.get(),
      width: interpolate(q, [0, 1], [BTN, cardW]),
      height: interpolate(q, [0, 1], [BTN, h]),
      borderTopLeftRadius: top,
      borderTopRightRadius: top,
      borderBottomLeftRadius: bottom,
      borderBottomRightRadius: bottom,
      opacity: 1,
      backgroundColor: interpolateColor(q, [0, colorEnd], [c.accent, surface]),
    };
  });

  const opening = visible;
  // 2. Content: late in on open, early out on close; uniform scale only.
  const contentStyle = useAnimatedStyle(() => {
    const p = progress.get();
    // Open: content arrives late. Close: it leaves first, before the shape shrinks.
    const cp = opening
      ? interpolate(p, contentIn, [0, 1], Extrapolation.CLAMP)
      : interpolate(p, contentIn, [0, 1], Extrapolation.CLAMP);
    return {
      opacity: reduced ? p : cp,
      transform: [
        { translateY: drag.get() + (reduced ? 0 : (1 - cp) * 10) },
        { scale: reduced ? 1 : 0.97 + 0.03 * cp },
      ],
    };
  });

  // 3. Glyph: the '+' travels to the close button and turns into '×'.
  const glyphStyle = useAnimatedStyle(() => {
    const p = Math.max(0, progress.get());
    const closeCy = winH - cardH.get() + rowY.get() + rowH.get() / 2;
    const cx = interpolate(p, [0, 1], [fromX + BTN / 2, closeCx]);
    const cy = interpolate(p, [0, 1], [fromY + BTN / 2, closeCy]) + drag.get();
    return {
      opacity: reduced ? p : 1,
      transform: [
        { translateX: cx - GLYPH / 2 },
        { translateY: cy - GLYPH / 2 },
        { rotate: `${p * 45}deg` },
        { scale: interpolate(p, [0, 1], [1, 0.7]) },
      ],
    };
  });
  const glyphColor = useAnimatedStyle(() => ({
    color: interpolateColor(Math.max(0, progress.get()), [0, 0.6], [c.onAccent, c.text]),
  }));

  if (!mounted) return null;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityViewIsModal
      accessibilityLabel={t.shift.title}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }, scrimStyle]}>
        <Pressable style={styles.fill} onPress={onClose} accessibilityRole="button" accessibilityLabel={t.common.close} />
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[styles.shape, isNight && styles.shapeNight, shapeStyle]}
      />

      <Animated.View
        onLayout={(e) => {
          const { height } = e.nativeEvent.layout;
          if (height > 0) cardH.set(height);
        }}
        style={[
          styles.content,
          {
            left: cardX,
            width: cardW,
            maxHeight: Math.round(winH * 0.85),
            paddingBottom: Math.max(insets.bottom, 20),
          },
          contentStyle,
        ]}
      >
        <GestureDetector gesture={pan}>
          <View style={styles.header}>
            <View style={[styles.grabber, { backgroundColor: c.textTertiary }]} />
            <View
              style={styles.headerRow}
              onLayout={(e) => {
                rowY.set(e.nativeEvent.layout.y);
                rowH.set(e.nativeEvent.layout.height);
              }}
            >
              <Text variant="title" style={styles.flex}>
                {t.shift.title}
              </Text>
              {/* The visible × is the flying glyph; this is its hit target and disc. */}
              <Pressable
                onPress={() => {
                  haptic.select();
                  onClose();
                }}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t.common.close}
                style={({ pressed }) => [
                  styles.closeBtn,
                  { backgroundColor: c.inset, transform: [{ scale: pressed ? 0.92 : 1 }] },
                ]}
              />
            </View>
          </View>
        </GestureDetector>

        <ScrollView showsVerticalScrollIndicator={false} bounces={false} contentContainerStyle={styles.scrollContent}>
          <ShiftSheetContent onClose={onClose} />
        </ScrollView>
      </Animated.View>

      <Animated.View pointerEvents="none" style={[styles.glyph, glyphStyle]}>
        <Animated.Text allowFontScaling={false} style={[styles.plusGlyph, glyphColor]}>
          +
        </Animated.Text>
      </Animated.View>
    </View>
  );
}

const GLYPH = 40;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  shape: {
    position: 'absolute',
    ...(Platform.OS === 'ios' ? ({ borderCurve: 'continuous' } as const) : null),
    boxShadow: '0 -6px 28px rgba(0,0,0,0.16)',
  },
  shapeNight: {
    boxShadow: '0 -6px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 0 0 0.5px rgba(255,255,255,0.06)',
  },
  content: {
    position: 'absolute',
    bottom: 0,
    paddingHorizontal: space.screen,
  },
  header: { paddingTop: 10, paddingBottom: space.sm, gap: 8 },
  grabber: { width: 36, height: 5, borderRadius: 3, alignSelf: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scrollContent: { paddingBottom: 6 },
  closeBtn: { width: CLOSE, height: CLOSE, borderRadius: CLOSE / 2 },
  glyph: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: GLYPH,
    height: GLYPH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusGlyph: {
    fontFamily: FONT_MAIN,
    fontWeight: 'normal',
    fontSize: 34,
    lineHeight: 40,
    textAlign: 'center',
    includeFontPadding: false,
  },
});
