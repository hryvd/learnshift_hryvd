import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useSegments } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { ShiftSheet } from '@/components/student/ShiftSheet';
import { TabBar, type TabKey } from '@/components/ui';
import { BarBlurHost, BarBlurTarget } from '@/components/ui/FloatingBar';
import { useT } from '@/i18n/useT';
import { useSession } from '@/store/useSession';

const TAB_KEYS: readonly TabKey[] = ['home', 'learn', 'insights', 'profile'];
const isTab = (s: string | undefined): s is TabKey => !!s && (TAB_KEYS as readonly string[]).includes(s);

/**
 * Four tabs plus the raised Shift button. The bar renders beside the navigator
 * (not inside it) so Android's live blur can sample the screens and the Shift
 * sheet underneath it.
 */
export default function TabsLayout() {
  const t = useT();
  const open = useSession((s) => s.shiftOpen);
  const setOpen = useSession((s) => s.setShiftOpen);

  // While a stack screen is pushed over the tabs, the last segment isn't a tab;
  // keep highlighting the tab the user came from.
  const last = useSegments().at(-1);
  const [active, setActive] = useState<TabKey>(isTab(last) ? last : 'home');
  if (isTab(last) && last !== active) setActive(last);

  return (
    <BarBlurHost>
      <View style={styles.root}>
        <BarBlurTarget style={styles.root}>
          <Tabs screenOptions={{ headerShown: false, animation: 'shift' }} tabBar={() => null}>
            <Tabs.Screen name="home" />
            <Tabs.Screen name="learn" />
            <Tabs.Screen name="insights" />
            <Tabs.Screen name="profile" />
          </Tabs>
          <ShiftSheet visible={open} onClose={() => setOpen(false)} />
        </BarBlurTarget>
        <TabBar
          active={active}
          onTab={(k) => {
            setOpen(false);
            if (k !== active) router.navigate(`/${k}`);
          }}
          onShift={() => setOpen(!open)}
          shiftOpen={open}
          labels={t.tabs}
        />
      </View>
    </BarBlurHost>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
