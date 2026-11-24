import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookOpenText, ChalkboardTeacher, ChatTeardropText, GearSix, type IconProps } from 'phosphor-react-native';

import { Text } from '@/components/ui';
import { haptic } from '@/design/haptics';
import { useTheme } from '@/design/theme';
import { fontFor } from '@/design/typography';
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

const ITEMS: TabItem[] = [
  { key: 'classes', href: '/teacher', label: T.tabClasses, Icon: ChalkboardTeacher },
  { key: 'modules', href: '/teacher/modules', label: T.tabModules, Icon: BookOpenText },
  { key: 'review', href: '/teacher/review', label: T.tabReview, Icon: ChatTeardropText },
  { key: 'settings', href: '/teacher/settings', label: T.tabSettings, Icon: GearSix },
];

const labelFont = fontFor(600);

/** Shared bottom tab bar across the multi-page teacher workspace. */
export function TeacherTabBar({ active }: { active: TeacherTab }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const review = useTeacher((s) => s.review);
  const realOpen = review.filter((r) => r.status === 'needs_review').length;
  const pitchReview = useAppStore((s) => s.review);
  const pitchReviewed = useAppStore((s) => s.reviewed);
  const pitchOpen = pitchReview.filter((r) => !pitchReviewed[r.id]).length;
  const pendingCount = IS_PITCH ? pitchOpen : realOpen;
  const bottom = Math.max(insets.bottom, 10);

  return (
    <View style={styles.pinned} pointerEvents="box-none">
      <LinearGradient
        pointerEvents="none"
        colors={[c.bg + '00', c.bg + 'E6', c.bg]}
        locations={[0, 0.6, 1]}
        style={styles.fade}
      />
      <View style={[styles.bar, { backgroundColor: c.card, paddingBottom: bottom, borderTopColor: c.hairline }]}>
        {ITEMS.map((item) => {
          const isActive = active === item.key;
          const color = isActive ? c.tabInsights : c.tabIdle;
          const Icon = item.Icon;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={item.label}
              onPress={() => {
                if (isActive) return;
                haptic.select();
                router.replace(item.href);
              }}
              style={styles.tab}
            >
              <View style={styles.iconWrap}>
                <Icon size={24} weight="fill" color={color} />
                {item.key === 'review' && pendingCount > 0 ? (
                  <View style={[styles.badge, { backgroundColor: c.accent }]}>
                    <Text variant="caption" color="onAccent" style={styles.badgeText}>
                      {pendingCount > 9 ? '9+' : String(pendingCount)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text variant="caption" color={color} style={[styles.label, labelFont]} numberOfLines={1}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pinned: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  fade: { position: 'absolute', left: 0, right: 0, top: -36, height: 42 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    paddingHorizontal: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 48, gap: 3 },
  iconWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, lineHeight: 14 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, lineHeight: 12, fontWeight: '700' },
});
