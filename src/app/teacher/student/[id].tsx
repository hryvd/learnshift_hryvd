import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretLeft, LockKey } from '@/components/ui/icons';

import { MasteryRow } from '@/components/learn/MasteryRow';
import { ConfirmDialog } from '@/components/teacher/ConfirmDialog';
import { BarChart, Card, Chip, EmptyState, ListGroup, ListRow, NavBar, PillButton, Ring, Skeleton, Text } from '@/components/ui';
import { useDesktop } from '@/hooks/useDesktop';
import { printDocument } from '@/lib/exportFile';
import { useShortcut } from '@/lib/shortcuts';
import { QUESTION_BY_ID } from '@/data/questions';
import { buildSections } from '@/data/class';
import { SKILL_BY_ID, SKILLS } from '@/data/skills';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { teacherStrings as T } from '@/i18n/staff';
import { gapEngine } from '@/services/ai/gapEngine';
import { IS_PITCH } from '@/lib/config';
import { removeStudent } from '@/services/backend/api';
import { loadAllRosters, loadRoster, useTeacher, type LiveStudent } from '@/services/backend/teacher';
import { useAppStore } from '@/store/useAppStore';

/** One student's learning picture. Learning data only — no screen-time data exists here. */
export default function TeacherStudent() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { contentWidth: width, isDesktop } = useDesktop();
  const { id, section: sectionParam } = useLocalSearchParams<{ id: string; section?: string }>();
  const mika = useAppStore((s) => s.mastery);
  const live = useTeacher((s) =>
    sectionParam
      ? s.students[sectionParam]?.find((x) => x.id === id)
      : Object.values(s.students).flat().find((x) => x.id === id),
  );
  // Which of this teacher's classes the student is in (for direct links without ?section).
  const foundIn = useTeacher((s) =>
    sectionParam ?? Object.keys(s.students).find((k) => s.students[k]?.some((x) => x.id === id)),
  );
  const section = sectionParam ?? foundIn;
  const className = useTeacher((s) => s.classes.find((x) => x.id === section)?.name);
  // Prev / next within the same class, alphabetical (matches the heatmap's A–Z).
  const roster = useTeacher((s) => (section ? s.students[section] : undefined));
  const order = useMemo(() => (roster ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)), [roster]);
  const idx = order.findIndex((x) => x.id === id);
  const prev = idx > 0 ? order[idx - 1] : null;
  const next = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
  const go = (to: { id: string } | null) => {
    if (to && section) router.replace({ pathname: '/teacher/student/[id]', params: { id: to.id, section } });
  };
  // This student's tutor answers that need (or got) a teacher check — already loaded, no extra query.
  const allReview = useTeacher((s) => s.review);
  const flagged = useMemo(() => allReview.filter((r) => r.studentId === id).slice(0, 5), [allReview, id]);
  const pitch = useMemo(() => {
    if (!IS_PITCH) return undefined;
    const secs = buildSections(mika);
    const sec = secs.find((s) => s.id === section) ?? secs[0];
    return sec.students.find((s) => s.id === id) ?? secs.flatMap((s) => s.students).find((s) => s.id === id);
  }, [mika, id, section]);
  const student = IS_PITCH ? pitch : live;
  const wide = width >= 900;
  const [confirm, setConfirm] = useState(false);
  const [resolving, setResolving] = useState(() => !IS_PITCH);

  // Opened directly (refresh, bookmark): load rosters, then decide.
  useEffect(() => {
    if (IS_PITCH || live) return;
    let alive = true;
    (sectionParam ? loadRoster(sectionParam) : loadAllRosters()).finally(() => {
      if (alive) setResolving(false);
    });
    return () => {
      alive = false;
    };
  }, [live, sectionParam]);

  useShortcut('ArrowLeft', () => go(prev), { mod: false, enabled: isDesktop && !!prev });
  useShortcut('ArrowRight', () => go(next), { mod: false, enabled: isDesktop && !!next });

  // Deterministic back: a direct link has no history to go back to.
  const back = () => (router.canGoBack() ? router.back() : router.replace('/teacher'));

  if (!student) {
    return (
      <View style={[styles.root, { backgroundColor: c.bg, paddingTop: insets.top }]}>
        <NavBar onBack={back} backIcon={<CaretLeft size={20} weight="bold" color={c.text} />} />
        {resolving ? (
          <View style={[styles.body, styles.stack, { maxWidth: 1000 }]} accessibilityLabel="Loading student">
            <Skeleton height={120} r={20} />
            <Skeleton height={200} r={20} />
          </View>
        ) : (
          <EmptyState
            title="Student not found"
            subtitle="This student isn't in any of your classes, or was removed."
            action={{ label: 'Back to classes', onPress: () => router.replace('/teacher') }}
          />
        )}
      </View>
    );
  }

  const avg = SKILLS.reduce((a, s) => a + student.mastery[s.id], 0) / SKILLS.length;
  const root = gapEngine.rootGap(student.mastery);
  const fc = gapEngine.forecast(student.mastery, root);
  const date = fc.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const sorted = [...SKILLS].sort((a, b) => student.mastery[a.id] - student.mastery[b.id]);
  const extra = student as Partial<LiveStudent>;
  const history = student.history.length ? student.history : [avg];

  const print = () =>
    printDocument(
      `${student.name} — learning summary`,
      `${className ?? ''} · printed ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · average mastery ${Math.round(avg * 100)}%`,
      [
        {
          heading: 'Skill mastery (weakest first)',
          head: ['Skill', 'Mastery'],
          rows: sorted.map((k) => [k.name.en + (k.id === root ? ' (root gap)' : ''), `${Math.round(student.mastery[k.id] * 100)}%`]),
        },
        {
          heading: 'Weekly average',
          head: history.map((_, k) => `Week ${k + 1}`),
          rows: [history.map((h) => `${Math.round(h * 100)}%`)],
        },
      ],
    );

  return (
    <View style={[styles.root, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      {!isDesktop ? (
        <NavBar onBack={back} backIcon={<CaretLeft size={20} weight="bold" color={c.text} />} title={student.name} />
      ) : (
        <View style={styles.deskNav}>
          <PillButton label="← Previous" kind="neutral" size="sm" disabled={!prev} onPress={() => go(prev)} accessibilityLabel={prev ? `Previous student: ${prev.name}` : 'No previous student'} />
          <Text variant="caption" style={styles.flex} align="center">
            {idx >= 0 ? `${idx + 1} of ${order.length} in ${className ?? 'class'} · ← → to switch` : className ?? ''}
          </Text>
          <PillButton label="Print summary" kind="neutral" size="sm" onPress={print} />
          <PillButton label="Next →" kind="neutral" size="sm" disabled={!next} onPress={() => go(next)} accessibilityLabel={next ? `Next student: ${next.name}` : 'No next student'} />
        </View>
      )}
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32, maxWidth: wide ? 1000 : 560 }]}
      >
        <View style={wide ? styles.columns : styles.stack}>
          <View style={[styles.stack, wide && styles.flex]}>
            <Card style={styles.summary}>
              <Ring progress={avg} size={96} stroke={9} accessibilityLabel={`${T.avg} ${Math.round(avg * 100)}%`}>
                <Text variant="statNumber">{Math.round(avg * 100)}</Text>
              </Ring>
              <View style={styles.flexGap}>
                <Text variant="overline">{T.avg}</Text>
                <Text variant="title">{student.name}</Text>
                <Chip label={T.rootGap(SKILL_BY_ID[root].name.en)} kind="tinted" />
                {!fc.mastered ? <Text variant="subhead">{T.forecast(SKILL_BY_ID[root].name.en, date)}</Text> : null}
              </View>
            </Card>
            <Card style={styles.gap}>
              <Text variant="headline">{T.trend}</Text>
              <BarChart
                values={history.map((h) => Math.round(h * 100))}
                labels={history.map((_, k) => `W${k + 1}`)}
                highlight={history.length - 1}
                highlightLabel={`${Math.round(history[history.length - 1] * 100)}%`}
                max={100}
                height={110}
                accessibilityLabel={`${T.trend}: ${history.map((h) => Math.round(h * 100)).join(', ')} percent`}
              />
              {extra.answered !== undefined ? (
                <Text variant="caption">
                  {extra.answered ? T.answers(extra.answered) : T.never}
                  {extra.lastActive
                    ? ` · ${T.lastActive(new Date(extra.lastActive).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}`
                    : ''}
                </Text>
              ) : null}
            </Card>
            {!IS_PITCH && flagged.length ? (
              <Card style={styles.gap}>
                <Text variant="headline">Tutor answers to check</Text>
                {flagged.map((r) => (
                  <View key={r.id} style={styles.flagRow}>
                    <Text variant="subhead" color="text" style={styles.flex} numberOfLines={2}>
                      {QUESTION_BY_ID[r.questionId]?.prompt.en ?? 'Practice question'}
                    </Text>
                    <Chip
                      label={r.status === 'needs_review' ? 'Needs review' : r.status === 'approved' ? T.approved : T.edited}
                      kind={r.status === 'needs_review' ? 'tinted' : 'outline'}
                    />
                  </View>
                ))}
                <PillButton label="Open review queue" kind="secondary" size="sm" onPress={() => router.replace('/teacher/review')} />
              </Card>
            ) : null}
            <View style={[styles.note, { backgroundColor: c.inset }]}>
              <LockKey size={16} weight="fill" color={c.textSecondary} />
              <Text variant="subhead" style={styles.flex}>
                {T.learningOnly}
              </Text>
            </View>
            {!IS_PITCH && section ? (
              <ListGroup>
                <ListRow title={T.remove} destructive chevron={false} onPress={() => setConfirm(true)} />
              </ListGroup>
            ) : null}
            {!IS_PITCH && section ? (
              <ConfirmDialog
                visible={confirm}
                title={`Remove ${student.name}?`}
                body={`${student.name} leaves ${className ?? 'this class'}. Their learning history stays with them; they can rejoin with the join code.`}
                confirmLabel="Remove student"
                onClose={() => setConfirm(false)}
                onConfirm={async () => {
                  await removeStudent(section, student.id);
                  await loadRoster(section);
                  router.replace('/teacher');
                }}
              />
            ) : null}
          </View>
          <Card style={[styles.gapLg, wide && styles.flex]}>
            <Text variant="headline">{T.mastery}</Text>
            {sorted.map((s) => (
              <MasteryRow
                key={s.id}
                label={s.name.en}
                from={0}
                to={student.mastery[s.id]}
                color={s.id === root ? c.accent : student.mastery[s.id] >= 0.7 ? c.success : c.accentFaded}
                delay={120}
              />
            ))}
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  flexGap: { flex: 1, gap: 6, alignItems: 'flex-start' },
  body: { paddingHorizontal: space.screen, width: '100%', alignSelf: 'center' },
  columns: { flexDirection: 'row', gap: space.gap, alignItems: 'flex-start' },
  stack: { gap: space.gap },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  gap: { gap: 10 },
  gapLg: { gap: 16 },
  deskNav: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 28, paddingVertical: 12 },
  flagRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: radius.inset },
});
