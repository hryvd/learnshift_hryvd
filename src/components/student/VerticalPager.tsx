import { Children, useEffect, useEffectEvent, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { CaretDown, CaretUp } from 'phosphor-react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { haptic } from '@/design/haptics';
import { ease, spring, useReducedMotion } from '@/design/motion';
import { BURST_DURATION_MS, DECEL_DURATION_MS } from '@/services/sentinel';

type Props = {
  children: ReactNode;
  pageHeight: number;
  pageWidth: number;
  /** Optional controlled active page index. */
  index?: number;
  onIndexChange?: (nextIndex: number, dir: 'up' | 'down') => void;
  /**
   * Return `true` to intercept a swipe before advancing (e.g., Sentinel ARMED
   * hijacking the next upward swipe to show the takeover overlay).
   */
  onBeforeSwipe?: (dir: 'up' | 'down', currentIndex: number) => boolean;
  /** Fired whenever a user-initiated swipe changes the page. */
  onSwipe?: (dir: 'up' | 'down', nextIndex: number) => void;
  /** Fired when the user flicks down while already on page 0 (e.g. dismiss overlay). */
  onFlickDownAtTop?: () => void;
  /** 'burst' = 220 ms GPU slide, 'decelerate' = 420 ms calm transition. */
  mode?: 'burst' | 'decelerate';
  enabled?: boolean;
  controlsPosition?: 'bottom-right' | 'bottom-left' | 'none';
  bottomOffset?: number;
};

const WHEEL_DEBOUNCE_MS = 320;
const DRAG_THRESHOLD_PX = 56;
const VELOCITY_THRESHOLD = 480;

export function VerticalPager({
  children,
  pageHeight,
  pageWidth,
  index,
  onIndexChange,
  onBeforeSwipe,
  onSwipe,
  onFlickDownAtTop,
  mode = 'burst',
  enabled = true,
  controlsPosition = 'bottom-right',
  bottomOffset = 24,
}: Props) {
  const pages = Children.toArray(children);
  const count = pages.length;
  const [internalIndex, setInternalIndex] = useState(0);
  const currentIndex = Math.max(0, Math.min(count - 1, index ?? internalIndex));

  const reduced = useReducedMotion();
  const trackY = useSharedValue(-currentIndex * pageHeight);
  const startY = useSharedValue(0);
  const dragging = useSharedValue(false);
  const hostRef = useRef<ComponentRef<typeof View>>(null);
  const lastWheelRef = useRef(0);

  const duration = reduced ? 120 : mode === 'decelerate' ? DECEL_DURATION_MS : BURST_DURATION_MS;
  const curve = mode === 'decelerate' ? ease.inOut : ease.out;

  useEffect(() => {
    trackY.set(withTiming(-currentIndex * pageHeight, { duration, easing: curve }));
  }, [currentIndex, pageHeight, duration, curve, trackY]);

  const snapBack = () => {
    trackY.set(withSpring(-currentIndex * pageHeight, spring.snappy));
  };

  const commitStep = (dir: 'up' | 'down') => {
    if (!enabled || count === 0) {
      snapBack();
      return;
    }
    if (onBeforeSwipe?.(dir, currentIndex)) {
      snapBack();
      return;
    }
    if (dir === 'up') {
      if (currentIndex >= count - 1) {
        snapBack();
        return;
      }
      const next = currentIndex + 1;
      haptic.select();
      if (index == null) setInternalIndex(next);
      onIndexChange?.(next, 'up');
      onSwipe?.('up', next);
      return;
    }
    // dir === 'down' (finger drags down -> go to previous page, or dismiss at top)
    if (currentIndex <= 0) {
      if (onFlickDownAtTop) {
        haptic.light();
        onFlickDownAtTop();
      } else {
        snapBack();
      }
      return;
    }
    const prev = currentIndex - 1;
    haptic.select();
    if (index == null) setInternalIndex(prev);
    onIndexChange?.(prev, 'down');
    onSwipe?.('down', prev);
  };

  const handleGestureEnd = (translationY: number, velocityY: number) => {
    if (translationY < -DRAG_THRESHOLD_PX || velocityY < -VELOCITY_THRESHOLD) {
      commitStep('up');
    } else if (translationY > DRAG_THRESHOLD_PX || velocityY > VELOCITY_THRESHOLD) {
      commitStep('down');
    } else {
      snapBack();
    }
  };

  const onWebStep = useEffectEvent((dir: 'up' | 'down') => {
    commitStep(dir);
  });

  // Web mouse wheel / trackpad with 320 ms quiet-gap debounce (1 wheel flick = 1 card).
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return;
    const node = hostRef.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== 'function') return;

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 12) return;
      e.preventDefault();
      const now = Date.now();
      if (now - lastWheelRef.current < WHEEL_DEBOUNCE_MS) return;
      lastWheelRef.current = now;
      onWebStep(e.deltaY > 0 ? 'up' : 'down');
    };

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        onWebStep('up');
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        onWebStep('down');
      }
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      node.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [enabled]);

  const pan = usePanGesture({
    enabled: enabled && count > 0,
    activeOffsetY: [-10, 10],
    failOffsetX: [-24, 24],
    onActivate: () => {
      'worklet';
      dragging.set(true);
      startY.set(trackY.get());
    },
    onUpdate: (e) => {
      'worklet';
      let dy = e.translationY;
      // Rubber-band damping at edges (unless top flick-to-dismiss is active)
      if ((currentIndex === 0 && dy > 0 && !onFlickDownAtTop) || (currentIndex >= count - 1 && dy < 0)) {
        dy = dy * 0.28;
      }
      trackY.set(startY.get() + dy);
    },
    onDeactivate: (e) => {
      'worklet';
      dragging.set(false);
      scheduleOnRN(handleGestureEnd, e.translationY, e.velocityY);
    },
    onFinalize: () => {
      'worklet';
      if (dragging.get()) {
        dragging.set(false);
        trackY.set(withSpring(-currentIndex * pageHeight, spring.snappy));
      }
    },
  });

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: trackY.get() }],
  }));

  if (count === 0 || pageHeight <= 0 || pageWidth <= 0) {
    return <View style={styles.root} />;
  }

  return (
    <View ref={hostRef} style={[styles.root, { height: pageHeight, width: pageWidth }]}>
      <GestureDetector gesture={pan}>
        <View style={[styles.viewport, { height: pageHeight, width: pageWidth }]}>
          <Animated.View style={[styles.track, { height: pageHeight * count, width: pageWidth }, trackStyle]}>
            {pages.map((page, i) => (
              <View key={i} style={{ height: pageHeight, width: pageWidth, overflow: 'hidden' }}>
                {page}
              </View>
            ))}
          </Animated.View>
        </View>
      </GestureDetector>

      {controlsPosition !== 'none' && count > 1 ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.controls,
            controlsPosition === 'bottom-left' ? styles.controlsLeft : styles.controlsRight,
            { bottom: bottomOffset },
          ]}
        >
          <View style={styles.dots} accessible={false}>
            {pages.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === currentIndex ? styles.dotActive : styles.dotIdle,
                ]}
              />
            ))}
          </View>
          <View style={styles.arrows}>
            <PressableScale
              onPress={() => commitStep('down')}
              disabled={currentIndex === 0 && !onFlickDownAtTop}
              accessibilityLabel={currentIndex === 0 && onFlickDownAtTop ? 'Dismiss' : 'Previous card'}
              hitSlop={6}
              style={[
                styles.arrowBtn,
                currentIndex === 0 && !onFlickDownAtTop ? styles.arrowDisabled : null,
              ]}
            >
              <CaretUp size={16} weight="bold" color="#FFFFFF" />
            </PressableScale>
            <PressableScale
              onPress={() => commitStep('up')}
              disabled={currentIndex >= count - 1}
              accessibilityLabel="Next card"
              hitSlop={6}
              style={[
                styles.arrowBtn,
                currentIndex >= count - 1 ? styles.arrowDisabled : null,
              ]}
            >
              <CaretDown size={16} weight="bold" color="#FFFFFF" />
            </PressableScale>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden', position: 'relative' },
  viewport: { overflow: 'hidden' },
  track: { flexDirection: 'column' },
  controls: {
    position: 'absolute',
    alignItems: 'center',
    gap: 8,
    zIndex: 20,
  },
  controlsRight: { right: 14 },
  controlsLeft: { left: 16 },
  dots: {
    gap: 5,
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(18, 18, 18, 0.45)',
  },
  dot: { width: 5, borderRadius: 3 },
  dotIdle: { height: 5, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotActive: { height: 14, backgroundColor: '#F5C46B' },
  arrows: {
    gap: 6,
  },
  arrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(18, 18, 18, 0.68)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowDisabled: { opacity: 0.3 },
});

