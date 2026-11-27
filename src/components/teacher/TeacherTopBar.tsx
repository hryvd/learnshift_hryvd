import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, usePathname } from 'expo-router';

import { InviteDialog } from '@/components/teacher/InviteDialog';
import { Text } from '@/components/ui';
import { ArrowsClockwise, CaretLeft, LockKey, Monitor } from '@/components/ui/icons';
import { useTheme } from '@/design/theme';
import { IS_PITCH, PITCH_NAMES } from '@/lib/config';
import { refreshTeacher, useTeacher } from '@/services/backend/teacher';

const TITLES: Record<string, string> = {
  '/teacher': 'Classes',
  '/teacher/modules': 'Module studio',
  '/teacher/review': 'Review queue',
  '/teacher/settings': 'Settings',
};

/** Laptop page header: where you are, the active class, and its join code. */
export function TeacherTopBar() {
  const { c } = useTheme();
  const path = usePathname();
  const classes = useTeacher((s) => s.classes);
  const selected = useTeacher((s) => s.selected);
  const studentId = path.startsWith('/teacher/student/') ? path.split('/').pop() : null;
  const studentName = useTeacher((s) =>
    studentId ? Object.values(s.students).flat().find((x) => x.id === studentId)?.name : undefined,
  );
  const [projecting, setProjecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const cls = IS_PITCH
    ? { name: `Grade 8 – ${PITCH_NAMES.section}`, grade: 8, join_code: 'SAMP8' }
    : classes.find((x) => x.id === selected);

  const refresh = async () => {
    if (refreshing || IS_PITCH) return;
    setRefreshing(true);
    await refreshTeacher().catch(() => {});
    setRefreshing(false);
  };

  return (
    <View style={[styles.bar, { borderBottomColor: c.hairline, backgroundColor: c.bg }]} role="banner">
      {studentId ? (
        <View style={styles.crumbs}>
          <Pressable
            onPress={() => router.replace('/teacher')}
            accessibilityRole="link"
            style={({ hovered }) => [styles.crumbBtn, hovered && { backgroundColor: c.inset }]}
          >
            <CaretLeft size={16} weight="bold" color={c.textSecondary} />
            <Text variant="subhead">Classes</Text>
          </Pressable>
          <Text variant="subhead">›</Text>
          <Text variant="headline" numberOfLines={1} style={styles.title} role="heading" aria-level={1}>
            {studentName ?? 'Student'}
          </Text>
        </View>
      ) : (
        <Text variant="headline" style={styles.title} role="heading" aria-level={1}>
          {TITLES[path] ?? 'Teacher'}
        </Text>
      )}

      {cls ? (
        <View style={[styles.pill, { backgroundColor: c.inset }]}>
          <Text variant="caption" color="text" numberOfLines={1}>
            {cls.name} · Grade {cls.grade}
          </Text>
        </View>
      ) : null}

      <View style={styles.spacer} />

      <View style={[styles.pill, styles.row, { backgroundColor: c.inset }]} accessibilityLabel="Learning data only. Never screen time.">
        <LockKey size={12} weight="fill" color={c.textSecondary} />
        <Text variant="caption">Learning data only</Text>
      </View>

      {cls ? (
        <Pressable
          onPress={() => setProjecting(true)}
          accessibilityRole="button"
          accessibilityLabel={`Invite students with code ${cls.join_code}`}
          style={({ hovered }) => [styles.action, { borderColor: c.hairline }, hovered && { backgroundColor: c.inset }]}
        >
          <Monitor size={15} weight="bold" color={c.accent} />
          <Text variant="subhead" color="text" style={styles.code}>
            {cls.join_code}
          </Text>
        </Pressable>
      ) : null}

      {!IS_PITCH ? (
        <Pressable
          onPress={refresh}
          disabled={refreshing}
          accessibilityRole="button"
          accessibilityLabel={refreshing ? 'Refreshing' : 'Refresh'}
          style={({ hovered }) => [styles.icon, hovered && { backgroundColor: c.inset }]}
        >
          <ArrowsClockwise size={17} weight="bold" color={refreshing ? c.textTertiary : c.textSecondary} />
        </Pressable>
      ) : null}

      {cls ? (
        <InviteDialog
          visible={projecting}
          classId={IS_PITCH ? undefined : (selected ?? undefined)}
          code={cls.join_code}
          className={cls.name}
          onClose={() => setProjecting(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 28, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, flexShrink: 1 },
  crumbs: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  crumbBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, maxWidth: 260 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  spacer: { flex: 1 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 34, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1 },
  code: { fontVariant: ['tabular-nums'], letterSpacing: 2, fontWeight: '700' },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
