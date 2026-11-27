import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, Stack, useSegments } from 'expo-router';

import { TeacherTabBar, type TeacherTab } from '@/components/teacher/TeacherTabBar';
import { BarBlurHost, BarBlurTarget } from '@/components/ui/FloatingBar';
import { TeacherSidebar } from '@/components/teacher/TeacherSidebar';
import { TeacherTopBar } from '@/components/teacher/TeacherTopBar';
import { TeacherUploadDialog } from '@/components/teacher/TeacherUploadDialog';
import { TeacherUploadSheet } from '@/components/teacher/TeacherUploadSheet';
import { DesktopDialog } from '@/components/teacher/DesktopOverlay';
import { PillButton, Text } from '@/components/ui';
import { WifiSlash } from '@/components/ui/icons';
import { useTheme } from '@/design/theme';
import { useDesktop, useOnline } from '@/hooks/useDesktop';
import { useRoleGate } from '@/hooks/useRoleGate';
import { IS_PITCH } from '@/lib/config';
import * as api from '@/services/backend/api';
import { clearTeacherCache, useTeacher, useTeacherLive } from '@/services/backend/teacher';
import { useIdleTimer, useSharedLaptop } from '@/services/teacher/sharedLaptop';

export default function TeacherLayout() {
  const gate = useRoleGate('teacher');
  if (gate) return gate;
  return <TeacherStack />;
}

function TeacherStack() {
  const { c } = useTheme();
  const { isDesktop, sidebar } = useDesktop();
  const segments = useSegments() as string[];
  useTeacherLive(!IS_PITCH);
  const stack = (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Screen name="index" options={{ animation: 'none' }} />
      <Stack.Screen name="modules" options={{ animation: 'none' }} />
      <Stack.Screen name="review" options={{ animation: 'none' }} />
      <Stack.Screen name="settings" options={{ animation: 'none' }} />
      <Stack.Screen name="student/[id]" options={isDesktop ? { animation: 'none' } : undefined} />
    </Stack>
  );
  if (!isDesktop) {
    return (
      // One bar for the whole teacher area: it (and its Android blur) stays mounted
      // across tab switches instead of being rebuilt per screen, which flashed black.
      <BarBlurHost>
        <View style={{ flex: 1, backgroundColor: c.bg }}>
          <BarBlurTarget>{stack}</BarBlurTarget>
          {segments.includes('student') ? null : <TeacherTabBar active={activeTab(segments)} />}
          <TeacherUploadSheet />
        </View>
      </BarBlurHost>
    );
  }
  // Laptop: persistent sidebar + workspace. The phone tab bar hides itself.
  return (
    <View style={[styles.row, { backgroundColor: c.bg }]}>
      <SkipLink />
      <TeacherSidebar width={sidebar} />
      <View style={styles.main} role="main" nativeID="main" {...({ tabIndex: -1 } as object)}>
        <TeacherTopBar />
        <OfflineBanner />
        <View style={styles.main}>{stack}</View>
        <TeacherUploadDialog />
        <IdleGuard />
      </View>
    </View>
  );
}

function activeTab(segments: string[]): TeacherTab {
  const last = segments.at(-1);
  return last === 'modules' || last === 'review' || last === 'settings' ? last : 'classes';
}

/** Shared laptop mode: warn after inactivity, then sign out and wipe local data. */
function IdleGuard() {
  const shared = useSharedLaptop();
  const [warning, setWarning] = useState(false);
  useIdleTimer(
    shared && !IS_PITCH,
    () => setWarning(true),
    () => setWarning(false),
    async () => {
      clearTeacherCache();
      await api.signOut();
      router.replace('/onboarding');
    },
  );
  return (
    <DesktopDialog
      visible={warning}
      onClose={() => setWarning(false)}
      title="Still there?"
      maxWidth={420}
      footer={<PillButton label="Keep me signed in" onPress={() => setWarning(false)} />}
    >
      <Text variant="body">
        This is a shared laptop. You&apos;ll be signed out in one minute to protect your students&apos; data.
      </Text>
    </DesktopDialog>
  );
}

/** First Tab stop: jumps past the sidebar (WCAG 2.4.1). */
function SkipLink() {
  const { c } = useTheme();
  const [on, setOn] = useState(false);
  return (
    <Pressable
      accessibilityRole="link"
      onFocus={() => setOn(true)}
      onBlur={() => setOn(false)}
      onPress={() => (document.getElementById('main') as HTMLElement | null)?.focus()}
      style={[styles.skip, { backgroundColor: c.accent }, on ? styles.skipOn : null]}
    >
      <Text variant="subhead" color="onAccent">
        Skip to main content
      </Text>
    </Pressable>
  );
}

function OfflineBanner() {
  const { c } = useTheme();
  const online = useOnline();
  const fromCache = useTeacher((s) => s.fromCache);
  const syncedAt = useTeacher((s) => s.syncedAt);
  if (IS_PITCH || (online && !fromCache)) return null;
  const when = syncedAt
    ? new Date(syncedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;
  return (
    <View style={[styles.banner, { backgroundColor: c.accentTint }]} accessibilityLiveRegion="polite" role="status">
      <WifiSlash size={16} weight="bold" color={c.warning} />
      <Text variant="subhead" color="text" style={styles.main}>
        You’re offline{when ? ` — showing data saved ${when}` : ''}. Creating classes, publishing and reviewing need
        internet.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', height: '100%' },
  main: { flex: 1, minWidth: 0 },
  skip: { position: 'absolute', left: 12, top: -100, zIndex: 100, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  skipOn: { top: 12 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 10 },
});
