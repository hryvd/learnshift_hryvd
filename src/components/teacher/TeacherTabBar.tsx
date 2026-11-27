import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { Text } from '@/components/ui';
import { BarTab, CenterPlusButton, FloatingBarShell } from '@/components/ui/FloatingBar';
import { BookOpenText, ChalkboardTeacher, ChatTeardropText, GearSix, type IconProps } from '@/components/ui/icons';
import { useTheme } from '@/design/theme';
import { useDesktop } from '@/hooks/useDesktop';
import { teacherStrings as T } from '@/i18n/staff';
import { IS_PITCH } from '@/lib/config';
import { useTeacher } from '@/services/backend/teacher';
import { useAppStore } from '@/store/useAppStore';

export type TeacherTab = 'classes' | 'modules' | 'review' | 'settings';

type TabItem = {
  key: TeacherTab;
  href: '/teacher' | '/teacher/modules' | '/teacher/review' | '/teacher/settings';
  label: string;
  Icon: React.ComponentType<IconProps>;
};

const LEFT_ITEMS: TabItem[] = [
  { key: 'classes', href: '/teacher', label: T.tabClasses, Icon: ChalkboardTeacher },
  { key: 'modules', href: '/teacher/modules', label: T.tabModules, Icon: BookOpenText },
];

const RIGHT_ITEMS: TabItem[] = [
  { key: 'review', href: '/teacher/review', label: T.tabReview, Icon: ChatTeardropText },
  { key: 'settings', href: '/teacher/settings', label: T.tabSettings, Icon: GearSix },
];

/** Shared floating tab bar across the teacher workspace, with the centered '+' upload button. */
export function TeacherTabBar({ active }: { active: TeacherTab }) {
  const { c } = useTheme();
  const review = useTeacher((s) => s.review);
  const uploadOpen = useTeacher((s) => s.uploadOpen);
  const setUploadOpen = useTeacher((s) => s.setUploadOpen);
  const realOpen = review.filter((r) => r.status === 'needs_review').length;
  const pitchReview = useAppStore((s) => s.review);
  const pitchReviewed = useAppStore((s) => s.reviewed);
  const pitchOpen = pitchReview.filter((r) => !pitchReviewed[r.id]).length;
  const pendingCount = IS_PITCH ? pitchOpen : realOpen;
  // Laptops use the sidebar instead.
  const { isDesktop } = useDesktop();
  if (isDesktop) return null;

  const renderTab = (item: TabItem) => {
    const showBadge = item.key === 'review' && pendingCount > 0;
    return (
      <BarTab
        key={item.key}
        label={item.label}
        Icon={item.Icon}
        tint={c.tabInsights}
        active={active === item.key && !uploadOpen}
        accessibilityHint={showBadge ? `${pendingCount} waiting for review` : undefined}
        onPress={() => {
          setUploadOpen(false);
          if (active === item.key) return;
          router.replace(item.href);
        }}
        badge={
          showBadge ? (
            <View style={[styles.badge, { backgroundColor: c.accent, borderColor: c.card }]}>
              <Text variant="caption" color="onAccent" style={styles.badgeText}>
                {pendingCount > 9 ? '9+' : String(pendingCount)}
              </Text>
            </View>
          ) : null
        }
      />
    );
  };

  return (
    <FloatingBarShell>
      {LEFT_ITEMS.map(renderTab)}
      <CenterPlusButton
        open={uploadOpen}
        label="Upload module"
        openLabel="Close module upload"
        onPress={() => setUploadOpen(!uploadOpen)}
      />
      {RIGHT_ITEMS.map(renderTab)}
    </FloatingBarShell>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -5,
    right: -11,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, lineHeight: 12, fontWeight: '700' },
});
