import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, usePathname } from 'expo-router';

import { PatyAvatar } from '@/components/mascot/Paty';
import { Text } from '@/components/ui';
import {
  ArrowsClockwise,
  BookOpenText,
  ChalkboardTeacher,
  ChatTeardropText,
  GearSix,
  Moon,
  Plus,
  SignOut,
  Sparkle,
  WifiSlash,
  type IconProps,
} from '@/components/ui/icons';
import { useTheme } from '@/design/theme';
import { useOnline } from '@/hooks/useDesktop';
import { useNow } from '@/hooks/useNow';
import { teacherStrings as T } from '@/i18n/staff';
import { IS_PITCH } from '@/lib/config';
import { useShortcut } from '@/lib/shortcuts';
import * as api from '@/services/backend/api';
import { clearTeacherCache, refreshTeacher, useTeacher } from '@/services/backend/teacher';
import { useAppStore } from '@/store/useAppStore';
import { useAuth } from '@/store/useAuth';

type Href = '/teacher' | '/teacher/modules' | '/teacher/review' | '/teacher/settings';
const NAV: { href: Href; label: string; Icon: React.ComponentType<IconProps> }[] = [
  { href: '/teacher', label: T.tabClasses, Icon: ChalkboardTeacher },
  { href: '/teacher/modules', label: T.tabModules, Icon: BookOpenText },
  { href: '/teacher/review', label: 'Review queue', Icon: ChatTeardropText },
  { href: '/teacher/settings', label: T.tabSettings, Icon: GearSix },
];

function ago(iso: string | null, now: number) {
  if (!iso) return 'Not synced yet';
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'Synced just now';
  if (m < 60) return `Synced ${m} min ago`;
  return `Synced ${new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

/** Laptop navigation: always-visible sections, class switcher and upload action. */
export function TeacherSidebar({ width }: { width: number }) {
  const { c, isNight } = useTheme();
  const path = usePathname();
  const online = useOnline();
  const now = useNow(30_000);
  const me = useAuth((s) => s.profile);
  const classes = useTeacher((s) => s.classes);
  const selected = useTeacher((s) => s.selected);
  const review = useTeacher((s) => s.review);
  const syncedAt = useTeacher((s) => s.syncedAt);
  const fromCache = useTeacher((s) => s.fromCache);
  const setUploadOpen = useTeacher((s) => s.setUploadOpen);
  const pitchReview = useAppStore((s) => s.review);
  const pitchReviewed = useAppStore((s) => s.reviewed);
  const pending = IS_PITCH
    ? pitchReview.filter((r) => !pitchReviewed[r.id]).length
    : review.filter((r) => r.status === 'needs_review').length;
  const [refreshing, setRefreshing] = useState(false);

  // "U" (outside text fields) opens upload. Ctrl/⌘+U is the browser's View Source.
  useShortcut('u', () => setUploadOpen(true));

  const active = (href: Href) => (href === '/teacher' ? path === '/teacher' || path.startsWith('/teacher/student') : path.startsWith(href));

  const refresh = async () => {
    if (refreshing || IS_PITCH) return;
    setRefreshing(true);
    await refreshTeacher().catch(() => {});
    setRefreshing(false);
  };

  const signOut = async () => {
    clearTeacherCache();
    try {
      window.localStorage.removeItem('ls-staff');
    } catch {
      // storage blocked
    }
    await api.signOut();
    router.replace('/onboarding');
  };

  const toggleTheme = () => {
    const s = useAppStore.getState();
    s.setThemePref(isNight ? 'day' : 'night');
  };

  return (
    <View
      style={[styles.root, { width, backgroundColor: isNight ? '#121628' : '#EFECE6', borderRightColor: c.hairline }]}
      role="navigation"
      aria-label="Teacher workspace"
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.brand}>
          <PatyAvatar size={32} background={c.accentTint} />
          <Text variant="headline" style={styles.flex}>
            LearnShift
          </Text>
          <View style={[styles.pill, { backgroundColor: c.tabInsights }]}>
            <Text variant="caption" color="#FFFFFF" style={styles.pillText}>
              Teacher
            </Text>
          </View>
        </View>

        <Pressable
          onPress={() => setUploadOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Upload module (shortcut U)"
          style={({ pressed, hovered }) => [
            styles.cta,
            { backgroundColor: c.accent, opacity: pressed ? 0.85 : hovered ? 0.94 : 1 },
          ]}
        >
          <Plus size={16} weight="bold" color={c.onAccent} />
          <Text variant="headline" color="onAccent" style={styles.flex}>
            Upload module
          </Text>
          <Text variant="caption" color="onAccent" style={styles.kbd}>
            U
          </Text>
        </Pressable>

        <View style={styles.group}>
          {NAV.map(({ href, label, Icon }) => {
            const on = active(href);
            return (
              <Pressable
                key={href}
                onPress={() => router.replace(href)}
                accessibilityRole="link"
                accessibilityState={{ selected: on }}
                aria-current={on ? 'page' : undefined}
                style={({ hovered }) => [
                  styles.navItem,
                  on ? { backgroundColor: c.card } : hovered ? { backgroundColor: c.hairline } : null,
                ]}
              >
                <Icon size={18} weight={on ? 'fill' : 'bold'} color={on ? c.accent : c.textSecondary} />
                <Text variant="subhead" color={on ? 'text' : 'textSecondary'} style={[styles.flex, on && styles.bold]}>
                  {label}
                </Text>
                {href === '/teacher/review' && pending > 0 ? (
                  <View style={[styles.badge, { backgroundColor: c.accent }]}>
                    <Text variant="caption" color="onAccent" style={styles.badgeText}>
                      {pending > 99 ? '99+' : pending}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {!IS_PITCH && classes.length > 0 ? (
          <View style={styles.group}>
            <Text variant="overline" style={styles.label}>
              {T.classes}
            </Text>
            {classes.map((cl) => {
              const on = cl.id === selected;
              return (
                <Pressable
                  key={cl.id}
                  onPress={() => useTeacher.getState().select(cl.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${cl.name}, grade ${cl.grade}`}
                  style={({ hovered }) => [
                    styles.classItem,
                    on ? { backgroundColor: c.accentTint } : hovered ? { backgroundColor: c.hairline } : null,
                  ]}
                >
                  <View style={[styles.dot, { backgroundColor: on ? c.accent : c.textTertiary }]} />
                  <Text variant="subhead" color={on ? 'text' : 'textSecondary'} numberOfLines={1} style={styles.flex}>
                    {cl.name}
                  </Text>
                  <Text variant="caption">G{cl.grade}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: c.hairline }]}>
        {!IS_PITCH ? (
          <View style={styles.syncRow} accessibilityLiveRegion="polite">
            {online && !fromCache ? (
              <View style={[styles.dot, { backgroundColor: c.success }]} />
            ) : (
              <WifiSlash size={14} weight="bold" color={c.warning} />
            )}
            <Text variant="caption" style={styles.flex} numberOfLines={1}>
              {online && !fromCache ? ago(syncedAt, now) : 'Offline · saved copy'}
            </Text>
            <Pressable
              onPress={refresh}
              accessibilityRole="button"
              accessibilityLabel="Refresh"
              disabled={refreshing}
              style={({ hovered }) => [styles.iconBtn, hovered && { backgroundColor: c.hairline }]}
            >
              <ArrowsClockwise size={16} weight="bold" color={refreshing ? c.textTertiary : c.textSecondary} />
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => router.push('/demo')} style={styles.syncRow} accessibilityRole="button">
            <Sparkle size={14} weight="fill" color={c.accent} />
            <Text variant="caption">Demo panel</Text>
          </Pressable>
        )}
        <View style={styles.me}>
          <View style={styles.flex}>
            <Text variant="subhead" color="text" numberOfLines={1}>
              {me?.display_name ?? T.teacher}
            </Text>
            {me?.email ? (
              <Text variant="caption" numberOfLines={1}>
                {me.email}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={toggleTheme}
            accessibilityRole="button"
            accessibilityLabel={isNight ? 'Switch to Day theme' : 'Switch to Night theme'}
            style={({ hovered }) => [styles.iconBtn, hovered && { backgroundColor: c.hairline }]}
          >
            <Moon size={16} weight={isNight ? 'fill' : 'bold'} color={c.textSecondary} />
          </Pressable>
          {!IS_PITCH ? (
            <Pressable
              onPress={signOut}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              style={({ hovered }) => [styles.iconBtn, hovered && { backgroundColor: c.hairline }]}
            >
              <SignOut size={16} weight="bold" color={c.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { height: '100%', borderRightWidth: 1 },
  scroll: { padding: 16, gap: 18 },
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4, paddingTop: 4 },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 11, fontWeight: '700' },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, borderRadius: 12, paddingHorizontal: 14 },
  kbd: { opacity: 0.8, fontSize: 11 },
  group: { gap: 2 },
  label: { paddingHorizontal: 10, marginBottom: 6 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 40, paddingHorizontal: 10, borderRadius: 10 },
  classItem: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 36, paddingHorizontal: 10, borderRadius: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  badge: { minWidth: 22, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 11, fontWeight: '700', lineHeight: 14 },
  footer: { borderTopWidth: 1, padding: 12, gap: 10 },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  me: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  iconBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
