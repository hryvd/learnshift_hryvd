import { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Text } from '@/components/ui';
import type { WindowRect } from '@/components/ui/FloatingBar';
import { haptic } from '@/design/haptics';
import { spring, useReducedMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { FONT_MAIN } from '@/design/typography';
import { useT } from '@/i18n/useT';

import { ShiftSheetContent } from './ShiftSheet';

const BTN_SIZE = 58;

/**
 * Morphs the center '+' button directly into the full Shift card, covering the
 * floating tab bar so all taps stay inside the open card. Animates transform
 * and opacity only (compositor-friendly 60fps on Android and web).
 */
export function ShiftMorph({
  visible,
  origin,
  onClose,
  onPresenceChange,
}: {
  visible: boolean;
  origin: WindowRect | null;
  onClose: () => void;
  /** True while the morph card is mounted and owns the center button visual. */
  onPresenceChange?: (mounted: boolean) => void;
}) {
  const { c } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { width: winW, height: winH } = useWindowDimensions();

  const [mounted, setMounted] = useState(visible);
  const visibleRef = useRef(visible);
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  const progress = useSharedValue(visible ? 1 : 0);
  const drag = useSharedValue(0);
  const cardW = useSharedValue(Math.min(winW, 560));
  const cardH = useSharedValue(Math.min(Math.round(winH * 0.78), 640));

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
      progress.set(reduced ? withTiming(1, { duration: 150 }) : withSpring(1, spring.smooth));
    } else {
      progress.set(
        reduced
          ? withTiming(0, { duration: 150 }, (finished) => {
              if (finished) scheduleOnRN(finishUnmount);
            })
          : withSpring(0, { ...spring.snappy, overshootClamping: true }, (finished) => {
              if (finished) scheduleOnRN(finishUnmount);
            }),
      );
    }
  }, [visible, mounted, reduced, progress, drag]);

  // Android hardware Back closes the open card.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  // Fallback button center when measureInWindow hasn't fired yet.
  const btnCx = origin ? origin.x + origin.width / 2 : winW / 2;
  const btnCy = origin ? origin.y + origin.height / 2 : winH - Math.max(insets.bottom - 10, 12) - 32 - 18;

  const pan = usePanGesture({
    activeOffsetY: [-8, 8],
    onUpdate: (e) => {
      'worklet';
      drag.set(Math.max(0, e.translationY));
    },
    onDeactivate: (e) => {
      'worklet';
      if (e.translationY > 110 || e.velocityY > 900) {
        scheduleOnRN(onClose);
      } else {
        drag.set(withSpring(0, spring.snappy));
      }
    },
  });

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
  }));

  // Compositor-only transform morph from the button rect to the anchored bottom card.
  const cardStyle = useAnimatedStyle(() => {
    const p = progress.get();
    if (reduced) {
      return {
        opacity: p,
        transform: [{ translateY: drag.get() }],
      };
    }
    const w = Math.max(BTN_SIZE, cardW.get());
    const h = Math.max(BTN_SIZE, cardH.get());
    const targetCx = winW / 2;
    const targetCy = winH - h / 2;
    const startDx = btnCx - targetCx;
    const startDy = btnCy - targetCy;
    const sx = BTN_SIZE / w;
    const sy = BTN_SIZE / h;
    return {
      opacity: interpolate(p, [0, 0.06], [0.9, 1], Extrapolation.CLAMP),
      transform: [
        { translateX: interpolate(p, [0, 1], [startDx, 0], Extrapolation.CLAMP) },
        { translateY: interpolate(p, [0, 1], [startDy, 0], Extrapolation.CLAMP) + drag.get() },
        { scaleX: interpolate(p, [0, 1], [sx, 1], Extrapolation.CLAMP) },
        { scaleY: interpolate(p, [0, 1], [sy, 1], Extrapolation.CLAMP) },
      ],
    };
  });

  // Accent shell fades out quickly as the button morphs into the card surface.
  const accentShellStyle = useAnimatedStyle(() => ({
    opacity: reduced ? 0 : interpolate(progress.get(), [0, 0.42], [1, 0], Extrapolation.CLAMP),
  }));

  // Tile grid fades and rises in from progress 0.55 to 1.
  const contentStyle = useAnimatedStyle(() => {
    const p = progress.get();
    const cp = interpolate(p, [0.55, 1], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: reduced ? p : cp,
      transform: [{ translateY: reduced ? 0 : (1 - cp) * 18 }],
    };
  });

  // '+' rotates 45° into '×' and rides smoothly to the top-right close button.
  const closeGlyphStyle = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      transform: [{ rotate: `${p * 45}deg` }],
    };
  });

  const maxCardHeight = Math.round(winH * 0.85);

  if (!mounted) return null;

  return (
    <View
      style={styles.overlay}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityViewIsModal
      accessibilityLabel={t.shift.title}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }, scrimStyle]}>
        <Pressable
          style={styles.fill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t.common.close}
        />
      </Animated.View>

      <Animated.View
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (width > 0) cardW.set(width);
          if (height > 0) cardH.set(height);
        }}
        style={[
          styles.card,
          {
            backgroundColor: c.bg,
            maxHeight: maxCardHeight,
            paddingBottom: Math.max(insets.bottom, 20),
          },
          cardStyle,
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.accentFill, { backgroundColor: c.accent }, accentShellStyle]}
        />

        <GestureDetector gesture={pan}>
          <View style={styles.header}>
            <View style={[styles.grabber, { backgroundColor: c.textTertiary }]} />
            <View style={styles.headerRow}>
              <Text variant="title" style={styles.flex}>
                {t.shift.title}
              </Text>
              <Pressable
                onPress={() => {
                  haptic.select();
                  onClose();
                }}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t.common.close}
                style={[styles.closeBtn, { backgroundColor: c.inset }]}
              >
                <Animated.View style={closeGlyphStyle}>
                  <RNText allowFontScaling={false} style={[styles.plusGlyph, { color: c.text }]}>
                    +
                  </RNText>
                </Animated.View>
              </Pressable>
            </View>
          </View>
        </GestureDetector>

        <Animated.View style={[styles.bodyWrap, contentStyle]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={styles.scrollContent}
          >
            <ShiftSheetContent onClose={onClose} />
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 50,
    elevation: 50,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  fill: { flex: 1 },
  flex: { flex: 1 },
  card: {
    width: '100%',
    maxWidth: 560,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    ...(Platform.OS === 'ios' ? ({ borderCurve: 'continuous' } as const) : null),
    overflow: 'hidden',
    paddingHorizontal: space.screen,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: -6 },
    elevation: 24,
  },
  accentFill: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  header: {
    paddingTop: 10,
    paddingBottom: space.sm,
    gap: 8,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusGlyph: {
    fontFamily: FONT_MAIN,
    fontSize: 24,
    lineHeight: 28,
    textAlign: 'center',
    includeFontPadding: false,
  },
  bodyWrap: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: 6,
  },
});
