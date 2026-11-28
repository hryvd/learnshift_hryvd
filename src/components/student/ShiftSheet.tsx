import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import {
  ChatsCircle,
  Eye,
  HouseLine,
  Lightning,
  MonitorPlay,
  MoonStars,
  Question,
  Sparkle,
  Timer,
} from '@/components/ui/icons';

import { FeatureTile } from '@/components/ui';
import { useTheme } from '@/design/theme';
import { space } from '@/design/tokens';
import { useLive } from '@/hooks/useLive';
import { useT } from '@/i18n/useT';

/** Places low-contrast warm/spark icons on a soft tinted disc in Day mode so they stay crisp on white tiles. */
function SparkBadge({ children }: { children: ReactNode }) {
  const { c, isNight } = useTheme();
  if (isNight) return <>{children}</>;
  return <View style={[styles.sparkDisc, { backgroundColor: c.accentTint }]}>{children}</View>;
}

/** Tile grid rendered inside `ShiftMorph`. */
export function ShiftSheetContent({ onClose }: { onClose: () => void }) {
  const { c, isNight } = useTheme();
  const t = useT();
  const live = useLive();

  const go = (href: Parameters<typeof router.push>[0]) => {
    onClose();
    router.push(href);
  };

  return (
    <View style={styles.grid}>
      {live.risk.lateNight ? (
        <FeatureTile
          title={t.shift.windTitle}
          status={t.shift.windSub}
          statusAccent
          style={styles.wide}
          onPress={() => go('/winddown')}
          art={<MoonStars size={70} weight="fill" color={c.indigo} />}
        />
      ) : (
        <>
          <FeatureTile
            title={t.shift.overlayQuizTitle}
            status={t.shift.overlayQuizSub}
            statusAccent
            style={styles.tile}
            onPress={() => go({ pathname: '/simulate', params: { app: 'tiktok', start: 'quiz' } })}
            art={<Question size={68} weight="fill" color={c.tabLearn} />}
          />
          <FeatureTile
            title={t.shift.breakTitle}
            status={t.shift.breakSub}
            statusAccent
            style={styles.tile}
            onPress={() => go({ pathname: '/break/[id]', params: { id: live.root } })}
            art={
              <SparkBadge>
                <Lightning size={isNight ? 70 : 34} weight="fill" color={isNight ? c.spark : c.sparkDeep} />
              </SparkBadge>
            }
          />
        </>
      )}
      <FeatureTile
        title={t.shift.scrollSimTitle}
        status={t.shift.scrollSimSub}
        statusAccent
        style={styles.tile}
        onPress={() => go({ pathname: '/simulate', params: { app: 'tiktok' } })}
        art={<MonitorPlay size={66} weight="fill" color={c.accent} />}
      />
      <FeatureTile
        title={t.shift.feedTitle}
        status={t.shift.feedSub}
        style={styles.tile}
        onPress={() => go('/feed')}
        art={
          <SparkBadge>
            <Sparkle size={isNight ? 66 : 34} weight="fill" color={isNight ? c.spark : c.sparkDeep} />
          </SparkBadge>
        }
      />
      <FeatureTile
        title={t.shift.tutorTitle}
        status={t.shift.tutorSub}
        style={styles.tile}
        onPress={() => go('/tutor')}
        art={<ChatsCircle size={68} weight="fill" color={c.tabInsights} />}
      />
      <FeatureTile
        title={t.shift.focusTitle}
        status={t.shift.focusSub}
        style={styles.tile}
        onPress={() => go('/focus')}
        art={<Timer size={68} weight="fill" color={c.tabProfile} />}
      />
      <FeatureTile
        title="Attention Mirror"
        status="Neutral Feed & Low-Stim Shift"
        statusAccent
        style={styles.wide}
        onPress={() => go('/mirror' as unknown as Href)}
        art={<Eye size={66} weight="fill" color={c.accent} />}
      />
      <FeatureTile
        title={t.isla.title}
        status={t.isla.how}
        style={styles.wide}
        onPress={() => go('/isla')}
        art={<HouseLine size={66} weight="fill" color={c.success} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gap },
  tile: { flexBasis: '47%', flexGrow: 1 },
  wide: { flexBasis: '100%' },
  sparkDisc: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginBottom: 10,
  },
});
