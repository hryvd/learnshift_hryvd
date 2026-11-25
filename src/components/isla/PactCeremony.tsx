import { useEffect } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Ellipse, Polygon, Rect } from 'react-native-svg';

import { Paty } from '@/components/mascot/Paty';
import { Card, PillButton, Text } from '@/components/ui';
import { haptic } from '@/design/haptics';
import { spring, useReducedMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { useT } from '@/i18n/useT';

function MiniIslandPreview({ night }: { night: boolean }) {
  return (
    <Svg width={68} height={54} viewBox="0 0 68 54">
      <Ellipse cx={34} cy={42} rx={30} ry={10} fill={night ? '#1E3C5C' : '#73C2D6'} opacity={0.7} />
      <Polygon points="8,34 34,24 60,34 34,44" fill={night ? '#3C6E47' : '#5FB262'} />
      <Rect x={24} y={14} width={20} height={14} rx={2} fill="#E6C79C" />
      <Polygon points="21,15 34,5 47,15" fill="#C8400F" />
    </Svg>
  );
}

function Plank({ idx, night, reduced }: { idx: number; night: boolean; reduced: boolean }) {
  const s = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    s.set(0);
    s.set(withDelay(280 + idx * 75, withSpring(1, spring.bouncy)));
  }, [idx, reduced, s]);
  const style = useAnimatedStyle(() => ({
    opacity: s.get(),
    transform: [{ scale: s.get() }],
  }));
  return <Animated.View style={[styles.plank, { backgroundColor: night ? '#F2A65A' : '#B97843' }, style]} />;
}

export function PactCeremony({
  visible,
  archipelagoName,
  onDone,
}: {
  visible: boolean;
  archipelagoName: string;
  onDone: () => void;
}) {
  const { c, isNight } = useTheme();
  const t = useT();
  const reduced = useReducedMotion();
  const slide = useSharedValue(reduced ? 0 : 44);
  const cheer = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (!visible) return;
    haptic.success();
    if (reduced) {
      slide.set(0);
      cheer.set(1);
      return;
    }
    slide.set(44);
    cheer.set(0);
    slide.set(withSpring(0, spring.smooth));
    cheer.set(withDelay(640, withTiming(1, { duration: 280 })));
  }, [visible, reduced, slide, cheer]);

  const leftIsland = useAnimatedStyle(() => ({ transform: [{ translateX: -slide.get() }] }));
  const rightIsland = useAnimatedStyle(() => ({ transform: [{ translateX: slide.get() }] }));
  const cheerStyle = useAnimatedStyle(() => ({ opacity: cheer.get() }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDone}>
      <View style={[styles.backdrop, { backgroundColor: c.scrim }]}>
        <Card style={[styles.card, { backgroundColor: c.card }]}>
          <View style={[styles.stage, { backgroundColor: isNight ? '#101D38' : '#BCE8F2' }]}>
            <Animated.View style={leftIsland}>
              <MiniIslandPreview night={isNight} />
            </Animated.View>
            <View style={styles.bridgeRow}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Plank key={i} idx={i} night={isNight} reduced={reduced} />
              ))}
            </View>
            <Animated.View style={rightIsland}>
              <MiniIslandPreview night={isNight} />
            </Animated.View>
          </View>

          <Animated.View style={[styles.patyRow, cheerStyle]}>
            <Paty expression="cheering" size={84} alive={!reduced} />
          </Animated.View>

          <Text variant="title" align="center">
            {t.isla.ceremonyTitle(archipelagoName)}
          </Text>
          <Text variant="subhead" align="center">
            {t.isla.ceremonySub}
          </Text>

          <PillButton label={t.isla.ceremonyBtn} kind="primary" block size="lg" onPress={onDone} />
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.screen,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    gap: 14,
    alignItems: 'center',
  },
  stage: {
    width: '100%',
    borderRadius: radius.inset,
    paddingVertical: 22,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  bridgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 14,
  },
  plank: {
    width: 10,
    height: 16,
    borderRadius: 3,
  },
  patyRow: {
    marginTop: -6,
  },
});
