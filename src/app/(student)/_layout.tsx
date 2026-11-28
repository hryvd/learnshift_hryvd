import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';

import { pushTransition, sheetTransition } from '@/design/navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { useTheme } from '@/design/theme';
import { radius } from '@/design/tokens';
import { useRoleGate } from '@/hooks/useRoleGate';
import { useSession } from '@/store/useSession';

/** Student stack: tabs at the root, everything else pushed or presented over them. */
export default function StudentLayout() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useSession((s) => s.toast);
  const showToast = useSession((s) => s.showToast);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => showToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast, showToast]);

  const gate = useRoleGate('student');
  if (gate) return gate;
  const sheet = { ...sheetTransition, contentStyle: { backgroundColor: c.bg } };
  const full = { presentation: 'fullScreenModal' as const, animation: 'fade' as const };
  return (
    <View style={styles.root}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, ...pushTransition }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="simulate" options={{ animation: 'fade', contentStyle: { backgroundColor: '#000' } }} />
        <Stack.Screen name="break/[id]" options={sheet} />
        <Stack.Screen name="module/[id]" />
        <Stack.Screen name="quiz/[skillId]" />
        <Stack.Screen name="tutor" options={sheet} />
        <Stack.Screen name="skill/[id]" options={sheet} />
        <Stack.Screen name="feed" options={{ ...full, contentStyle: { backgroundColor: '#0B0D14' } }} />
        <Stack.Screen name="isla" />
        <Stack.Screen name="isla-how" options={sheet} />
        <Stack.Screen name="friends" />
        <Stack.Screen name="chat/[id]" />
        <Stack.Screen name="focus" />
        <Stack.Screen name="mirror" />
        <Stack.Screen name="winddown" options={full} />
        <Stack.Screen name="lock" options={{ ...full, gestureEnabled: false }} />
        <Stack.Screen name="privacy" />
        <Stack.Screen name="nudges" />
        <Stack.Screen name="offline" />
        <Stack.Screen name="personalization" />
        <Stack.Screen name="advanced" />
        <Stack.Screen name="bedtime" options={sheet} />
        <Stack.Screen name="share" options={sheet} />
      </Stack>
      {toast ? (
        <View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[styles.toastWrap, { top: insets.top + 14 }]}
        >
          <View style={[styles.toast, { backgroundColor: c.tileDark }]}>
            <Text variant="subhead" color="#FFFFFF" align="center">
              {toast}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  toastWrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 100,
  },
  toast: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
    maxWidth: 420,
  },
});
