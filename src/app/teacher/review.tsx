import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatTeardropText } from '@/components/ui/icons';

import { TeacherReviewQueueCard } from '@/components/teacher/ReviewQueueCard';
import { TeacherTabBar } from '@/components/teacher/TeacherTabBar';
import { Stagger, Text } from '@/components/ui';
import { useTheme } from '@/design/theme';
import { space } from '@/design/tokens';
import { usePullRefresh } from '@/hooks/useAutoRefresh';
import { teacherStrings as T } from '@/i18n/staff';
import { IS_PITCH } from '@/lib/config';
import { refreshTeacher } from '@/services/backend/teacher';

export default function TeacherReview() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const pull = usePullRefresh(refreshTeacher);

  return (
    <View style={[styles.root, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 110 }]}
        refreshControl={
          IS_PITCH ? undefined : (
            <RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={c.accent} colors={[c.accent]} />
          )
        }
      >
        <Stagger index={0} style={styles.header}>
          <View style={[styles.badge, { backgroundColor: c.tabInsights }]}>
            <ChatTeardropText size={22} weight="fill" color="#FFFFFF" />
          </View>
          <View style={styles.flex}>
            <Text variant="largeTitle">{T.review}</Text>
            <Text variant="subhead">{T.learningOnly}</Text>
          </View>
        </Stagger>
        <Stagger index={1}>
          <TeacherReviewQueueCard />
        </Stagger>
      </ScrollView>
      <TeacherTabBar active="review" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  body: { paddingHorizontal: space.screen, gap: space.gap, width: '100%', maxWidth: 680, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8 },
  badge: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
