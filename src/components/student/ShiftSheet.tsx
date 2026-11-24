import { StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { ChatsCircle, Eye, HouseLine, Lightning, MonitorPlay, MoonStars, Question, Sparkle, Timer } from 'phosphor-react-native';

import { BottomSheet, DarkTile, Text } from '@/components/ui';
import { useLive } from '@/hooks/useLive';
import { useTheme } from '@/design/theme';
import { space } from '@/design/tokens';
import { useT } from '@/i18n/useT';

import { useTabInset } from './Screen';

/** Center-button sheet: four big tiles, one tap each. */
export function ShiftSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { c } = useTheme();
  const t = useT();
  const live = useLive();
  const inset = useTabInset();

  const go = (href: Parameters<typeof router.push>[0]) => {
    onClose();
    router.push(href);
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      surface={c.bg}
      style={{ paddingBottom: inset - 8 }}
      accessibilityLabel={t.shift.title}
    >
      <Text variant="title" style={styles.title}>
        {t.shift.title}
      </Text>
      <View style={styles.grid}>
        {live.risk.lateNight ? (
          <DarkTile
            title={t.shift.windTitle}
            status={t.shift.windSub}
            statusAccent
            style={styles.wide}
            onPress={() => go('/winddown')}
            art={<MoonStars size={70} weight="fill" color={c.indigo} />}
          />
        ) : (
          <>
            <DarkTile
              title={t.shift.overlayQuizTitle}
              status={t.shift.overlayQuizSub}
              statusAccent
              style={styles.tile}
              onPress={() => go({ pathname: '/simulate', params: { app: 'tiktok', start: 'quiz' } })}
              art={<Question size={70} weight="fill" color={c.tabLearn} />}
            />
            <DarkTile
              title={t.shift.breakTitle}
              status={t.shift.breakSub}
              statusAccent
              style={styles.tile}
              onPress={() => go({ pathname: '/break/[id]', params: { id: live.root } })}
              art={<Lightning size={70} weight="fill" color={c.spark} />}
            />
          </>
        )}
        <DarkTile
          title={t.shift.scrollSimTitle}
          status={t.shift.scrollSimSub}
          statusAccent
          style={styles.tile}
          onPress={() => go({ pathname: '/simulate', params: { app: 'tiktok' } })}
          art={<MonitorPlay size={66} weight="fill" color={c.accent} />}
        />
        <DarkTile
          title={t.shift.feedTitle}
          status={t.shift.feedSub}
          style={styles.tile}
          onPress={() => go('/feed')}
          art={<Sparkle size={66} weight="fill" color={c.spark} />}
        />
        <DarkTile
          title={t.shift.tutorTitle}
          status={t.shift.tutorSub}
          style={styles.tile}
          onPress={() => go('/tutor')}
          art={<ChatsCircle size={70} weight="fill" color={c.tabInsights} />}
        />
        <DarkTile
          title={t.shift.focusTitle}
          status={t.shift.focusSub}
          style={styles.tile}
          onPress={() => go('/focus')}
          art={<Timer size={70} weight="fill" color={c.tabProfile} />}
        />
        <DarkTile
          title="Attention Mirror"
          status="Neutral Feed & Low-Stim Shift"
          statusAccent
          style={styles.wide}
          onPress={() => go('/mirror' as unknown as Href)}
          art={<Eye size={66} weight="fill" color={c.accent} />}
        />
        <DarkTile
          title={t.isla.title}
          status={t.isla.how}
          style={styles.wide}
          onPress={() => go('/isla')}
          art={<HouseLine size={66} weight="fill" color={c.success} />}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gap },
  tile: { flexBasis: '47%', flexGrow: 1 },
  wide: { flexBasis: '100%' },
});
