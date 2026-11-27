import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import type { Student } from '@/data/class';
import { SKILLS, type SkillId } from '@/data/skills';
import { haptic } from '@/design/haptics';
import { useTheme } from '@/design/theme';
import type { Palette } from '@/design/tokens';

/** Five mastery bands: needs work (ember) → strong (green). */
export function masteryColor(m: number, c: Palette, isNight: boolean): string {
  if (m < 0.35) return c.accent;
  if (m < 0.5) return c.accentFaded;
  if (m < 0.65) return c.chartIdle;
  if (m < 0.8) return isNight ? '#3C6E54' : '#A8E2B9';
  return c.success;
}

type Props = {
  students: Student[];
  width: number;
  height: number;
  onCell: (s: Student, skill: SkillId) => void;
  onStudent: (s: Student) => void;
  highlight?: SkillId | null;
  /** Laptop: print each percentage and the column average (not color alone). */
  showValues?: boolean;
  /** Laptop: click a skill header to sort students by it. */
  sortSkill?: SkillId | null;
  onSortSkill?: (s: SkillId) => void;
};

/** Text on a mastery cell: dark ink on light/bright fills, white only on deep Day fills. */
export function masteryInk(m: number, c: Palette, isNight: boolean): string {
  if (isNight) return m < 0.5 || m >= 0.8 ? '#1A1410' : c.text;
  return m < 0.35 || m >= 0.8 ? '#FFFFFF' : c.text;
}

/**
 * Students (rows) × Grade 7 Math skills (columns). Sticky skill header,
 * cells sized to fit the card so nothing scrolls sideways at 360 dp.
 */
export function ClassHeatmap({
  students,
  width,
  height,
  onCell,
  onStudent,
  highlight,
  showValues,
  sortSkill,
  onSortSkill,
}: Props) {
  const { c, isNight } = useTheme();
  const nameW = showValues ? Math.min(200, Math.max(120, width * 0.24)) : Math.min(150, Math.max(78, width * 0.26));
  const cell = Math.max(20, Math.min(showValues ? 72 : 52, Math.floor((width - nameW) / SKILLS.length)));
  const values = showValues && cell >= 36;
  const colAvg = (id: SkillId) =>
    students.length ? Math.round((students.reduce((a, st) => a + st.mastery[id], 0) / students.length) * 100) : 0;
  const [focus, setFocus] = useState<string | null>(null);

  return (
    <View style={{ height }}>
      <ScrollView stickyHeaderIndices={[0]} showsVerticalScrollIndicator={!!showValues} nestedScrollEnabled>
        <View style={[styles.header, { backgroundColor: c.card }]}>
          <View style={{ width: nameW }} />
          {SKILLS.map((s) => (
            <Pressable
              key={s.id}
              disabled={!onSortSkill}
              onPress={() => onSortSkill?.(s.id)}
              accessibilityRole={onSortSkill ? 'button' : undefined}
              accessibilityLabel={`${s.name.en}${onSortSkill ? `, sort by this skill${sortSkill === s.id ? ' (sorted, lowest first)' : ''}` : ''}`}
              style={({ hovered }) => [
                styles.headCell,
                { width: cell },
                hovered && onSortSkill ? { backgroundColor: c.inset } : null,
                sortSkill === s.id ? { borderBottomWidth: 2, borderBottomColor: c.accent } : null,
              ]}
            >
              <Text
                variant="caption"
                color={highlight === s.id ? 'accent' : 'textSecondary'}
                style={[styles.headText, values && styles.headTextLg]}
                numberOfLines={1}
                accessibilityLabel={s.name.en}
                {...({ title: s.name.en } as object)}
              >
                {s.abbr}
              </Text>
              {values ? (
                <Text
                  variant="caption"
                  color={highlight === s.id ? 'accent' : 'textTertiary'}
                  style={styles.avgText}
                  accessibilityLabel={`Class average ${colAvg(s.id)}%`}
                >
                  {colAvg(s.id)}%
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
        {students.map((st) => (
          <View key={st.id} style={[styles.row, focus === st.id && { backgroundColor: c.inset }]}>
            <Pressable
              onPress={() => {
                haptic.select();
                onStudent(st);
              }}
              style={[styles.name, { width: nameW }]}
              accessibilityRole="button"
              accessibilityLabel={st.name}
            >
              <Text variant="subhead" color="text" numberOfLines={1}>
                {width < 520
                  ? (() => {
                      const parts = st.name.trim().split(/\s+/);
                      return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
                    })()
                  : st.name}
              </Text>
            </Pressable>
            {SKILLS.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => {
                  haptic.select();
                  setFocus(st.id);
                  onCell(st, s.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${st.name}, ${s.name.en}, ${Math.round(st.mastery[s.id] * 100)}%`}
                style={({ pressed, hovered }) => [
                  styles.cellWrap,
                  { width: cell, height: Math.min(cell, 30) + 4, opacity: pressed ? 0.6 : hovered ? 0.82 : 1 },
                ]}
                {...({ title: `${st.name} · ${s.name.en} · ${Math.round(st.mastery[s.id] * 100)}%` } as object)}
              >
                <View
                  style={[
                    styles.cell,
                    { backgroundColor: masteryColor(st.mastery[s.id], c, isNight) },
                    highlight === s.id && styles.cellHi,
                  ]}
                >
                  {values ? (
                    <Text
                      variant="caption"
                      color={masteryInk(st.mastery[s.id], c, isNight)}
                      style={styles.cellText}
                    >
                      {Math.round(st.mastery[s.id] * 100)}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export function MasteryLegend({ low, high }: { low: string; high: string }) {
  const { c, isNight } = useTheme();
  return (
    <View style={styles.legend} accessible accessibilityLabel={`${low} to ${high}`}>
      <Text variant="caption">{low}</Text>
      {[0.2, 0.42, 0.58, 0.72, 0.9].map((m) => (
        <View key={m} style={[styles.legendCell, { backgroundColor: masteryColor(m, c, isNight) }]} />
      ))}
      <Text variant="caption">{high}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', paddingBottom: 6 },
  headCell: { alignItems: 'center', borderRadius: 6, paddingVertical: 2 },
  headText: { fontSize: 10, letterSpacing: 0.3 },
  headTextLg: { fontSize: 12, fontWeight: '700' },
  avgText: { fontSize: 11, fontVariant: ['tabular-nums'] },
  cellText: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 8 },
  name: { paddingRight: 6, minHeight: 30, justifyContent: 'center' },
  cellWrap: { padding: 2 },
  cell: { flex: 1, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  cellHi: { borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.25)' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendCell: { width: 14, height: 14, borderRadius: 4 },
});
