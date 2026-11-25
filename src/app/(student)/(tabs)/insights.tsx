import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Lightning, Moon, Sparkle, Timer } from '@/components/ui/icons';

import { Screen } from '@/components/student/Screen';
import { BarChart, Card, Chip, Heatmap, LargeTitleHeader, Ring, Stagger, StatTile, Text } from '@/components/ui';
import { heatmapMonths, seedHeatmap } from '@/data/seed';
import { SHORT } from '@/data/skills';
import { IS_PITCH } from '@/lib/config';
import { gapEngine } from '@/services/ai/gapEngine';
import { flushStudent, pullStudent } from '@/services/backend/sync';
import { reportNow } from '@/services/monitor';
import { useDevice } from '@/services/monitor/bridge';
import { useTheme } from '@/design/theme';
import { space } from '@/design/tokens';
import { useWeek, weeklyGrade, heatmapDate, learnHeatmap, masteryGain } from '@/hooks/useWeek';
import { formatDuration, useT, useL } from '@/i18n/useT';
import { todayKey, useAppStore } from '@/store/useAppStore';
import { useAuth } from '@/store/useAuth';

const WEEKS = 22;

async function refreshInsights() {
  await useDevice.getState().refresh();
  const id = useAuth.getState().profile?.id;
  if (IS_PITCH || !id) return;
  await reportNow().catch(() => {});
  await flushStudent(id).catch(() => {});
  await pullStudent(id);
}

export default function Insights() {
  const { c } = useTheme();
  const t = useT();
  const L = useL();
  const week = useWeek();
  const breaksToday = useAppStore((s) => (s.breaksDay === todayKey() ? s.breaksToday : 0));
  const mastery = useAppStore((s) => s.mastery);
  const feed = useAppStore((s) => s.feed);
  const learnDays = useAppStore((s) => s.learnDays);
  const learnMinutes = useAppStore((s) => s.learnMinutes);
  const usage = useAppStore((s) => s.usage);
  const history = useAppStore((s) => s.history);
  const heat = useMemo(() => (IS_PITCH ? seedHeatmap(WEEKS) : learnHeatmap(learnDays, WEEKS)), [learnDays]);
  const months = useMemo(() => heatmapMonths(WEEKS, t.months), [t.months]);

  // Learning days this month = non-zero cells in the current month.
  const learningDays = useMemo(() => {
    const today = new Date();
    const lastIndex = WEEKS * 7 - 1 - (6 - today.getDay());
    return heat.slice(lastIndex - today.getDate() + 1, lastIndex + 1).filter((v) => v > 0).length;
  }, [heat]);

  // What a tapped heatmap day shows: the date, minutes studied and questions answered.
  const describeDay = (index: number) => {
    const date = heatmapDate(index, WEEKS);
    if (!date) return null;
    const key = todayKey(date);
    const level = heat[index] ?? 0;
    // The demo has no per-day history, so it shows figures that match each cell's shade.
    const minutes = IS_PITCH
      ? level === 0
        ? 0
        : [0, 4, 10, 18, 28][level] + (index % 4)
      : Math.max(usage.find((u) => u.day === key)?.learning ?? 0, learnMinutes[key] ?? 0);
    const questions = IS_PITCH ? [0, 2, 5, 8, 12][level] : (learnDays[key] ?? 0);
    return {
      title: t.insights.dayDate(t.days.long[date.getDay()], t.months[date.getMonth()], date.getDate()),
      body:
        minutes === 0 && questions === 0
          ? t.insights.dayNoStudy
          : t.insights.dayStudied(formatDuration(minutes), questions),
    };
  };

  // The demo tracks Fractions; real accounts track their current root gap.
  const focus = IS_PITCH ? 'fractions' : gapEngine.rootGap(mastery);
  const masteryUp = masteryGain(mastery[focus], history[focus] ?? []);
  const { score, grade } = weeklyGrade(week.breaks, week.breakTarget, week.lateMinutes, masteryUp);
  const todayIdx = 6;
  const labels = week.days.map((d) => t.days.long[d.weekday]);
  const feedMin = 42 + Math.round(feed.minutes);
  const calmNights = week.days.filter((d) => d.lateMinutes === 0).length;

  let i = 0;
  return (
    <Screen
      tabs
      onRefresh={refreshInsights}
      header={
        <LargeTitleHeader
          title={t.insights.title}
          action={{ label: t.common.share, onPress: () => router.push('/share') }}
        />
      }
    >
      <Stagger index={i++}>
        <Card style={styles.gap}>
          <View style={styles.rowBetween}>
            <Text variant="headline">{t.insights.learningDays}</Text>
            <View style={styles.inline}>
              <Text variant="title">{learningDays}</Text>
              <Text variant="caption"> {t.insights.days}</Text>
            </View>
          </View>
          <Heatmap
            data={heat}
            weeks={WEEKS}
            months={months}
            accessibilityLabel={`${t.insights.learningDays}: ${learningDays} ${t.insights.days}`}
            accessibilityHint={t.insights.tapDayHint}
            describe={describeDay}
          />
        </Card>
      </Stagger>

      <Stagger index={i++}>
        <Card style={styles.gap}>
          <View style={styles.rowBetween}>
            <View>
              <Text variant="headline">{t.insights.screenTime}</Text>
              <Text variant="subhead">{t.insights.avg(formatDuration(week.avgMinutes))}</Text>
            </View>
            <Text variant="subhead" color="success">
              {t.insights.vsLast(formatDuration(week.dropMinutes))}
            </Text>
          </View>
          <BarChart
            values={week.days.map((d) => d.minutes)}
            labels={labels}
            highlight={todayIdx}
            highlightLabel={formatDuration(week.days[todayIdx].minutes)}
            accessibilityLabel={`${t.insights.screenTime}: ${week.days.map((d, k) => `${labels[k]} ${formatDuration(d.minutes)}`).join(', ')}`}
          />
        </Card>
      </Stagger>

      <Stagger index={i++} style={styles.row}>
        <StatTile
          label={t.insights.lateNight}
          value={week.lateMinutes}
          unit="m"
          caption={t.insights.thisWeek}
          icon={<Moon size={16} weight="fill" color={c.indigo} />}
          style={styles.flex}
        />
        <StatTile
          label={t.insights.breaks}
          value={week.breaks}
          caption={
            breaksToday > 0
              ? `${breaksToday} ${t.common.today.toLowerCase()} · ${t.insights.thisWeek}`
              : t.insights.taken
          }
          icon={<Lightning size={16} weight="fill" color={c.accent} />}
          style={styles.flex}
        />
      </Stagger>
      <Stagger index={i++} style={styles.row}>
        <StatTile
          label={t.insights.mastery}
          value={`+${Math.round(masteryUp * 100)}`}
          unit="%"
          caption={t.insights.fractionsUp(L(SHORT[focus]))}
          icon={<Sparkle size={16} weight="fill" color={c.success} />}
          style={styles.flex}
          onPress={() => router.push({ pathname: '/skill/[id]', params: { id: focus } })}
        />
        <StatTile
          label={t.insights.feed}
          value={feedMin}
          unit="m"
          caption={t.insights.underCap}
          icon={<Timer size={16} weight="fill" color={c.tabInsights} />}
          style={styles.flex}
        />
      </Stagger>

      <Stagger index={i++}>
        <Card style={styles.report}>
          <Ring progress={score} size={104} stroke={9} accessibilityLabel={`${t.insights.report}: ${grade}`}>
            <Text variant="statNumber">{grade}</Text>
          </Ring>
          <View style={styles.flexGap}>
            <Chip label={t.insights.report} kind="accent" style={styles.smallChip} />
            <Text variant="headline">{t.insights.reportTitle}</Text>
            <Text variant="subhead">{t.insights.reportSub(calmNights)}</Text>
          </View>
        </Card>
      </Stagger>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexGap: { flex: 1, gap: 4, alignItems: 'flex-start' },
  gap: { gap: 14 },
  row: { flexDirection: 'row', gap: space.gap },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  inline: { flexDirection: 'row', alignItems: 'flex-end' },
  report: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  smallChip: { height: 24, paddingHorizontal: 10, marginBottom: 4 },
});
