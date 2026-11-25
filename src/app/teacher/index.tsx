import { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, BookOpenText, ChalkboardTeacher, Plus, TrendDown, Warning } from '@/components/ui/icons';

import { Paty } from '@/components/mascot/Paty';
import { ClassHeatmap, MasteryLegend, masteryColor } from '@/components/teacher/ClassHeatmap';
import { CreateClassCard, JoinCodeCard, TeacherAccountCard } from '@/components/teacher/TeacherPanels';
import { TeacherTabBar } from '@/components/teacher/TeacherTabBar';
import {
  BottomSheet,
  Card,
  Chip,
  DevChip,
  EmptyState,
  Notice,
  PillButton,
  SegmentedControl,
  Stagger,
  Text,
} from '@/components/ui';
import { buildSections, needsSupport, type Section, type Student } from '@/data/class';
import { SKILL_BY_ID, SKILLS, type SkillId } from '@/data/skills';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { fontFor } from '@/design/typography';
import { usePullRefresh } from '@/hooks/useAutoRefresh';
import { teacherStrings as T } from '@/i18n/staff';
import { IS_PITCH } from '@/lib/config';
import { gapEngine } from '@/services/ai/gapEngine';
import type { ClassModule } from '@/services/ai/moduleGenerator';
import { asSection, refreshTeacher, useTeacher, type LiveStudent } from '@/services/backend/teacher';
import { useAppStore } from '@/store/useAppStore';
import { useAuth } from '@/store/useAuth';

const EMPTY_MODULES: ClassModule[] = [];
const EMPTY_STUDENTS: LiveStudent[] = [];

export default function TeacherHome() {
  return IS_PITCH ? <PitchTeacher /> : <RealTeacher />;
}

function PitchTeacher() {
  const mika = useAppStore((s) => s.mastery);
  const pitchModules = useAppStore((s) => s.classModules);
  const sections = useMemo(() => buildSections(mika), [mika]);
  const [sectionId, setSectionId] = useState(sections[0].id);
  const section = sections.find((s) => s.id === sectionId) ?? sections[0];
  return (
    <Dashboard
      sections={sections}
      section={section}
      onSection={setSectionId}
      moduleCount={pitchModules.length}
      title="Grade 8 – Sampaguita"
      subtitle={`${T.teacher} · ${T.learningOnly}`}
    />
  );
}

function RealTeacher() {
  const { c } = useTheme();
  const loading = useTeacher((s) => s.loading);
  const error = useTeacher((s) => s.error);
  const classes = useTeacher((s) => s.classes);
  const selected = useTeacher((s) => s.selected);
  const students = useTeacher((s) => (s.selected ? s.students[s.selected] : undefined));
  const selectedModules = useTeacher((s) => (s.selected ? s.modules[s.selected] : undefined));
  const modules = selectedModules ?? EMPTY_MODULES;
  const me = useAuth((s) => s.profile);
  const [creating, setCreating] = useState(false);
  const cls = classes.find((x) => x.id === selected) ?? null;
  const sections = useMemo(
    () => classes.map((x) => asSection(x, x.id === selected ? (students ?? EMPTY_STUDENTS) : EMPTY_STUDENTS)),
    [classes, selected, students],
  );

  if (loading && classes.length === 0) {
    return (
      <Frame title={T.classes} subtitle={me?.display_name ?? T.teacher} showTabs>
        <Card style={styles.loadingCard}>
          <ActivityIndicator size="small" color={c.accent} />
          <Text variant="subhead">Loading your classes…</Text>
        </Card>
      </Frame>
    );
  }

  if (error && classes.length === 0) {
    return (
      <Frame title={T.classes} subtitle={me?.display_name ?? T.teacher} showTabs>
        <Notice text={error} />
        <PillButton label="Try again" block onPress={() => void refreshTeacher()} />
        <TeacherAccountCard />
      </Frame>
    );
  }

  if (classes.length === 0 || creating) {
    return (
      <Frame title={classes.length === 0 ? T.createTitle : T.newClass} subtitle={me?.display_name ?? T.teacher} showTabs>
        {classes.length === 0 ? (
          <Card style={styles.welcomeCard}>
            <Paty expression="waving" size={72} />
            <View style={styles.flex}>
              <Text variant="headline">Welcome{me?.display_name ? `, ${me.display_name.split(' ')[0]}` : ''}!</Text>
              <Text variant="subhead">
                Create a class to get a student join code, upload lesson modules for AI quizzes, and review class mastery.
              </Text>
            </View>
          </Card>
        ) : null}
        <CreateClassCard
          first={classes.length === 0}
          onDone={() => setCreating(false)}
          onCancel={classes.length ? () => setCreating(false) : undefined}
        />
        <TeacherAccountCard />
      </Frame>
    );
  }
  if (!cls) return <Frame title={T.classes} subtitle={me?.display_name ?? T.teacher} showTabs />;

  const section = sections.find((s) => s.id === cls.id)!;
  return (
    <Dashboard
      sections={sections}
      section={section}
      onSection={(id) => useTeacher.getState().select(id)}
      title={cls.name}
      subtitle={`${me?.display_name ?? ''} · ${T.learningOnly}`}
      joinCode={cls.join_code}
      moduleCount={modules.length}
      onNewClass={() => setCreating(true)}
      empty={students !== undefined && students.length === 0}
    />
  );
}

function Frame({
  title,
  subtitle,
  showTabs,
  children,
}: {
  title: string;
  subtitle: string;
  showTabs?: boolean;
  children?: React.ReactNode;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const pull = usePullRefresh(refreshTeacher);
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { backgroundColor: c.bg, paddingTop: insets.top }]}
    >
      <ScrollView
        contentContainerStyle={[styles.body, { maxWidth: 560, paddingBottom: insets.bottom + 110 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          IS_PITCH ? undefined : (
            <RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={c.accent} colors={[c.accent]} />
          )
        }
      >
        <View style={styles.header}>
          <View style={[styles.badge, { backgroundColor: c.tabInsights }]}>
            <ChalkboardTeacher size={22} weight="fill" color="#FFFFFF" />
          </View>
          <View style={styles.flex}>
            <Text variant="largeTitle" numberOfLines={2}>
              {title}
            </Text>
            <Text variant="subhead">{subtitle}</Text>
          </View>
        </View>
        {children}
      </ScrollView>
      {showTabs ? <TeacherTabBar active="classes" /> : null}
    </KeyboardAvoidingView>
  );
}

function Dashboard({
  sections,
  section,
  onSection,
  title,
  subtitle,
  joinCode,
  moduleCount,
  onNewClass,
  empty,
}: {
  sections: Section[];
  section: Section;
  onSection: (id: string) => void;
  title: string;
  subtitle: string;
  joinCode?: string;
  moduleCount: number;
  onNewClass?: () => void;
  empty?: boolean;
}) {
  const { c, isNight } = useTheme();
  const insets = useSafeAreaInsets();
  const pull = usePullRefresh(refreshTeacher);
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [cell, setCell] = useState<{ s: Student; skill: SkillId } | null>(null);

  const active = useMemo(
    () => section.students.filter((s) => (s as { answered?: number }).answered !== 0),
    [section],
  );
  const support = useMemo(
    () => needsSupport({ ...section, students: active }, (m) => gapEngine.rootGap(m)),
    [section, active],
  );

  const rootCounts = useMemo(() => {
    const counts = new Map<SkillId, number>();
    for (const st of active) {
      const r = gapEngine.rootGap(st.mastery);
      if (st.mastery[r] < 0.5) counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  }, [active]);

  const maxW = wide ? 1240 : 560;
  const contentW = Math.min(width, maxW) - space.screen * 2;
  const heatW = wide ? contentW * 0.62 - space.gap / 2 : contentW;
  const heatInner = heatW - space.card * 2;
  const openStudent = (s: Student) =>
    router.push({ pathname: '/teacher/student/[id]', params: { id: s.id, section: section.id } });

  const heat = (
    <Card style={styles.gap}>
      <View style={styles.rowBetween}>
        <View style={styles.flex}>
          <Text variant="title">{T.classTitle}</Text>
          <Text variant="subhead">{T.classSub(section.students.length)}</Text>
        </View>
        <MasteryLegend low={T.low2} high={T.high} />
      </View>
      {rootCounts ? (
        <View style={[styles.insight, { backgroundColor: c.accentTint }]}>
          <Warning size={16} weight="fill" color={c.accent} />
          <Text variant="subhead" color="text" style={styles.flex}>
            {T.classRoot(SKILL_BY_ID[rootCounts[0]].name.en, rootCounts[1])}
          </Text>
        </View>
      ) : null}
      {empty ? (
        <EmptyState title={T.noStudents} subtitle={T.noStudentsSub} expression="curious" />
      ) : (
        <ClassHeatmap
          students={section.students}
          width={heatInner}
          height={Math.min(wide ? 620 : 470, 90 + section.students.length * 40)}
          highlight={rootCounts?.[0]}
          onCell={(s, skill) => setCell({ s, skill })}
          onStudent={openStudent}
        />
      )}
    </Card>
  );

  const side = (
    <View style={styles.sideCol}>
      {joinCode ? <JoinCodeCard code={joinCode} /> : null}
      <Card style={styles.gap} onPress={() => router.replace('/teacher/modules')}>
        <View style={styles.rowBetween}>
          <View style={[styles.modBadge, { backgroundColor: c.accentTint }]}>
            <BookOpenText size={20} weight="fill" color={c.accent} />
          </View>
          <View style={styles.flex}>
            <Text variant="headline">{T.manageModules}</Text>
            <Text variant="caption">
              {moduleCount > 0 ? `${moduleCount} ${moduleCount === 1 ? 'module' : 'modules'} published` : T.modulesSub}
            </Text>
          </View>
          <ArrowRight size={18} weight="bold" color={c.accent} />
        </View>
      </Card>
      <Card style={styles.gap}>
        <Text variant="title">{T.needs}</Text>
        {support.length === 0 ? <Text variant="subhead">{T.never}</Text> : null}
        {support.map(({ student, reasons }) => (
          <Card
            key={student.id}
            onPress={() => openStudent(student)}
            style={[styles.supportRow, { backgroundColor: c.inset }]}
            padded={false}
          >
            <View style={styles.supportInner}>
              <Text variant="headline" numberOfLines={1}>
                {student.name}
              </Text>
              <View style={styles.chips}>
                {reasons.map((r, i) => (
                  <Chip
                    key={i}
                    label={
                      r.kind === 'root'
                        ? T.rootGap(SKILL_BY_ID[r.skill].name.en)
                        : r.kind === 'dropping'
                          ? T.dropping
                          : T.low(SKILL_BY_ID[r.skill].name.en)
                    }
                    kind={r.kind === 'root' ? 'tinted' : 'neutral'}
                    icon={r.kind === 'dropping' ? <TrendDown size={13} weight="bold" color={c.text} /> : undefined}
                    style={styles.smallChip}
                  />
                ))}
              </View>
            </View>
          </Card>
        ))}
      </Card>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.body, { maxWidth: maxW, paddingBottom: insets.bottom + 110 }]}
        refreshControl={
          IS_PITCH ? undefined : (
            <RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={c.accent} colors={[c.accent]} />
          )
        }
      >
        <Stagger index={0} style={styles.header}>
          <View style={[styles.badge, { backgroundColor: c.tabInsights }]}>
            <ChalkboardTeacher size={22} weight="fill" color="#FFFFFF" />
          </View>
          <View style={styles.flex}>
            <Text variant="largeTitle" numberOfLines={1}>
              {title}
            </Text>
            <Text variant="subhead" numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
          {IS_PITCH ? <DevChip onPress={() => router.push('/demo')} /> : null}
        </Stagger>
        <Stagger index={1} style={styles.segRow}>
          {sections.length > 1 ? (
            <SegmentedControl
              options={sections.map((s) => ({ value: s.id, label: s.name }))}
              value={section.id}
              onChange={onSection}
              style={styles.seg}
            />
          ) : null}
          {onNewClass ? (
            <PillButton
              label={T.newClass}
              kind="neutral"
              size="sm"
              icon={<Plus size={14} weight="bold" color={c.text} />}
              onPress={onNewClass}
            />
          ) : null}
        </Stagger>
        {wide ? (
          <View style={styles.columns}>
            <View style={styles.mainCol}>{heat}</View>
            {side}
          </View>
        ) : (
          <>
            {heat}
            {side}
          </>
        )}
      </ScrollView>

      <BottomSheet visible={!!cell} onClose={() => setCell(null)} accessibilityLabel="Cell detail">
        {cell ? (
          <View style={styles.sheet}>
            <View style={styles.rowBetween}>
              <View style={styles.flex}>
                <Text variant="overline">{SKILL_BY_ID[cell.skill].name.en}</Text>
                <Text variant="title">{cell.s.name}</Text>
              </View>
              <View style={[styles.bigCell, { backgroundColor: masteryColor(cell.s.mastery[cell.skill], c, isNight) }]}>
                <Text
                  variant="title"
                  color={cell.s.mastery[cell.skill] < 0.35 || cell.s.mastery[cell.skill] >= 0.8 ? '#FFFFFF' : 'text'}
                  style={fontFor(800)}
                >
                  {Math.round(cell.s.mastery[cell.skill] * 100)}%
                </Text>
              </View>
            </View>
            <Text variant="body">{T.rootGap(SKILL_BY_ID[gapEngine.rootGap(cell.s.mastery, cell.skill)].name.en)}</Text>
            <View style={styles.chips}>
              {SKILLS.filter((s) => SKILL_BY_ID[cell.skill].prereqs.includes(s.id)).map((s) => (
                <Chip key={s.id} label={`${s.name.en} ${Math.round(cell.s.mastery[s.id] * 100)}%`} kind="outline" />
              ))}
            </View>
            <PillButton
              label={T.open}
              block
              onPress={() => {
                const s = cell.s;
                setCell(null);
                openStudent(s);
              }}
            />
          </View>
        ) : null}
      </BottomSheet>

      <TeacherTabBar active="classes" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  body: { paddingHorizontal: space.screen, gap: space.gap, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8 },
  badge: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  modBadge: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  seg: { maxWidth: 420, flexGrow: 1 },
  columns: { flexDirection: 'row', gap: space.gap, alignItems: 'flex-start' },
  mainCol: { flex: 1.62 },
  sideCol: { flex: 1, gap: space.gap },
  gap: { gap: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  insight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  supportRow: { borderRadius: radius.inset },
  supportInner: { padding: 14, gap: 8 },
  loadingCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  welcomeCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  smallChip: { height: 26, paddingHorizontal: 10 },
  sheet: { gap: 14, paddingBottom: 8 },
  bigCell: { width: 76, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
