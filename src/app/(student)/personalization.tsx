import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { CaretLeft, Check, Info } from '@/components/ui/icons';

import { Screen } from '@/components/student/Screen';
import { Card, LargeTitleHeader, NavBar, Notice, PressableScale, Stagger, Text } from '@/components/ui';
import { SUBJECTS, type SubjectId } from '@/data/localQuestions';
import { haptic } from '@/design/haptics';
import { useTheme } from '@/design/theme';
import { radius } from '@/design/tokens';
import { fontFor } from '@/design/typography';
import { useT } from '@/i18n/useT';
import { IS_PITCH } from '@/lib/config';
import { flushStudent } from '@/services/backend/sync';
import { useDevice } from '@/services/monitor/bridge';
import { patchProfile, useAuth } from '@/store/useAuth';
import { useAppStore } from '@/store/useAppStore';

const GRADE_GROUPS: { key: 'gradeSchool' | 'juniorHigh' | 'seniorHigh'; grades: number[] }[] = [
  { key: 'gradeSchool', grades: [1, 2, 3, 4, 5, 6] },
  { key: 'juniorHigh', grades: [7, 8, 9, 10] },
  { key: 'seniorHigh', grades: [11, 12] },
];

export default function Personalization() {
  const { c } = useTheme();
  const t = useT();
  const userId = useAuth((s) => s.profile?.id ?? null);
  const learningGrade = useAppStore((s) => s.learningGrade);
  const learningSubject = useAppStore((s) => s.learningSubject);

  const [savedTick, setSavedTick] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const persistNow = async (prevGrade: number, prevSubject: SubjectId | 'mixed') => {
    setError(null);
    void useDevice.getState().refresh();
    if (IS_PITCH || !userId) {
      setSavedTick((n) => n + 1);
      return;
    }
    try {
      await flushStudent(userId);
      setSavedTick((n) => n + 1);
    } catch {
      // Revert optimistic selection on failure and show a plain-language error.
      useAppStore.getState().hydrate({
        learningGrade: prevGrade,
        learningSubject: prevSubject,
        dirty: { ...useAppStore.getState().dirty, personalization: false },
      });
      patchProfile({ grade: prevGrade });
      setError(t.profile.saveError);
    }
  };

  const selectGrade = (grade: number) => {
    if (grade === learningGrade) return;
    haptic.select();
    const prevGrade = learningGrade;
    const prevSubject = learningSubject;
    useAppStore.getState().setLearningGrade(grade);
    if (!IS_PITCH && userId) patchProfile({ grade });
    void persistNow(prevGrade, prevSubject);
  };

  const selectSubject = (subject: SubjectId | 'mixed') => {
    if (subject === learningSubject) return;
    haptic.select();
    const prevGrade = learningGrade;
    const prevSubject = learningSubject;
    useAppStore.getState().setLearningSubject(subject);
    void persistNow(prevGrade, prevSubject);
  };

  return (
    <Screen
      header={
        <View>
          <NavBar
            onBack={() => router.back()}
            backIcon={<CaretLeft size={20} weight="bold" color={c.text} />}
            backLabel={t.common.back}
            right={
              savedTick > 0 && !error ? (
                <View style={styles.savedBadge} accessibilityLiveRegion="polite">
                  <Check size={14} weight="bold" color={c.success} />
                  <Text variant="caption" color="success" style={fontFor(600)}>
                    {t.profile.savedCaption}
                  </Text>
                </View>
              ) : null
            }
          />
          <LargeTitleHeader title={t.profile.personalization} />
        </View>
      }
    >
      {error ? (
        <Notice tone="danger" text={error} />
      ) : null}

      <Stagger index={0}>
        <Card style={styles.card}>
          <View style={styles.headGap}>
            <Text variant="headline">{t.profile.gradeLabel}</Text>
            <Text variant="subhead" color="textSecondary">
              {t.profile.yourQuestionsSub}
            </Text>
          </View>

          {GRADE_GROUPS.map((group) => (
            <View key={group.key} style={styles.group}>
              <Text variant="overline" color="textSecondary">
                {t.profile[group.key]}
              </Text>
              <View style={styles.chipRow}>
                {group.grades.map((grade) => {
                  const selected = learningGrade === grade;
                  return (
                    <PressableScale
                      key={grade}
                      accessibilityRole="button"
                      accessibilityLabel={`Grade ${grade}`}
                      accessibilityState={{ selected }}
                      onPress={() => selectGrade(grade)}
                      style={[
                        styles.gradeChip,
                        {
                          backgroundColor: selected ? c.accent : c.inset,
                          borderColor: selected ? c.accent : c.hairline,
                        },
                      ]}
                    >
                      <Text
                        variant="headline"
                        color={selected ? c.onAccent : c.text}
                        tabular
                      >
                        {grade}
                      </Text>
                    </PressableScale>
                  );
                })}
              </View>
            </View>
          ))}

          {learningGrade >= 11 ? (
            <View style={[styles.noteBox, { backgroundColor: c.accentTint }]}>
              <Info size={16} weight="fill" color={c.accent} />
              <Text variant="caption" color="accent" style={[styles.flex, fontFor(600)]}>
                {t.profile.seniorHighPracticeNote}
              </Text>
            </View>
          ) : null}
        </Card>
      </Stagger>

      <Stagger index={1}>
        <Card style={styles.card}>
          <Text variant="headline">{t.profile.subjectLabel}</Text>
          <View style={styles.chipRow}>
            {[{ id: 'mixed' as const, label: t.profile.allSubjects }, ...SUBJECTS].map((subject) => {
              const selected = learningSubject === subject.id;
              return (
                <PressableScale
                  key={subject.id}
                  accessibilityRole="button"
                  accessibilityLabel={subject.label}
                  accessibilityState={{ selected }}
                  onPress={() => selectSubject(subject.id)}
                  style={[
                    styles.subjectChip,
                    {
                      backgroundColor: selected ? c.accent : c.inset,
                      borderColor: selected ? c.accent : c.hairline,
                    },
                  ]}
                >
                  <Text variant="subhead" color={selected ? c.onAccent : c.text} style={fontFor(600)}>
                    {subject.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
          <Text variant="caption" color="textSecondary">
            {t.profile.questionsNote}
          </Text>
        </Card>
      </Stagger>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: 14 },
  headGap: { gap: 4 },
  group: { gap: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gradeChip: {
    minWidth: 48,
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectChip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.inset,
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingRight: 4,
  },
});
