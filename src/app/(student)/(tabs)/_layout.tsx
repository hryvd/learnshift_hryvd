import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { router, useSegments } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { ShiftMorph } from '@/components/student/ShiftMorph';
import { TabBar, type TabKey } from '@/components/ui';
import { BarBlurHost, BarBlurTarget, type WindowRect } from '@/components/ui/FloatingBar';
import { useReducedMotion } from '@/design/motion';
import { tabTransition } from '@/design/navigation';
import { useT } from '@/i18n/useT';
import { useSession } from '@/store/useSession';

const TAB_KEYS: readonly TabKey[] = ['home', 'learn', 'insights', 'profile'];
const isTab = (s: string | undefined): s is TabKey => !!s && (TAB_KEYS as readonly string[]).includes(s);

/**
 * Four tabs plus the raised Shift button. The Shift morph card renders AFTER
 * the floating bar so it covers the bar cleanly when expanded.
 */
export default function TabsLayout() {
  const t = useT();
  const open = useSession((s) => s.shiftOpen);
  const setOpen = useSession((s) => s.setShiftOpen);
  const [origin, setOrigin] = useState<WindowRect | null>(null);
  const [morphMounted, setMorphMounted] = useState(false);
  const reduced = useReducedMotion();
  const shiftProgress = useSharedValue(0);
  const recede = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, shiftProgress.get()));
    if (reduced || p === 0) return { transform: [] as { scale: number }[], borderRadius: 0 };
    return {
      transform: [{ translateY: p * 6 }, { scale: 1 - p * 0.03 }],
      borderRadius: p * 28,
      overflow: 'hidden' as const,
    };
  });

  // While a stack screen is pushed over the tabs, the last segment isn't a tab;
  // keep highlighting the tab the user came from.
  const last = useSegments().at(-1);
  const [active, setActive] = useState<TabKey>(isTab(last) ? last : 'home');
  if (isTab(last) && last !== active) setActive(last);

  return (
    <BarBlurHost>
      <View style={styles.root}>
        <BarBlurTarget style={styles.root}>
          {/* The screen recedes slightly behind the open Shift card (iOS sheet depth). */}
          <Animated.View style={[styles.root, recede]}>
            <Tabs screenOptions={{ headerShown: false, ...tabTransition }} tabBar={() => null}>
              <Tabs.Screen name="home" />
              <Tabs.Screen name="learn" />
              <Tabs.Screen name="insights" />
              <Tabs.Screen name="profile" />
            </Tabs>
          </Animated.View>
        </BarBlurTarget>
        <TabBar
          active={active}
          onTab={(k) => {
            setOpen(false);
            if (k !== active) router.navigate(`/${k}`);
          }}
          onShift={() => setOpen(!open)}
          onMeasureShift={setOrigin}
          shiftOpen={open}
          shiftHidden={open || morphMounted}
          labels={t.tabs}
        />
        <ShiftMorph
          visible={open}
          origin={origin}
          onClose={() => setOpen(false)}
          onPresenceChange={setMorphMounted}
          progress={shiftProgress}
        />
      </View>
    </BarBlurHost>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
