import { useRef, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretLeft, CheckCircle, FileText, Lightning, Sparkle, XCircle } from '@/components/ui/icons';

import { Paty } from '@/components/mascot/Paty';
import { Card, Chip, NavBar, PillButton, PressableScale, ProgressBar, SegmentedControl, Text } from '@/components/ui';
import { haptic } from '@/design/haptics';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { fontFor } from '@/design/typography';
import { IS_PITCH } from '@/lib/config';
import { moduleRewardKey } from '@/lib/rewards';
import * as api from '@/services/backend/api';
import { useAppStore } from '@/store/useAppStore';

type Mode = 'flashcards' | 'quiz';

function elapsedSec(startedAt: number): number {
  return startedAt > 0 ? Math.max(1, (Date.now() - startedAt) / 1000) : 8;
}

export default function ModuleStudyScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const fil = useAppStore((s) => s.lang === 'fil');
  const mod = useAppStore((s) => s.classModules.find((m) => m.id === id) ?? null);

  const [mode, setMode] = useState<Mode>('flashcards');
  const [cardIdx, setCardIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const [qIdx, setQIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [earnedNow, setEarnedNow] = useState(false);
  const [openingSource, setOpeningSource] = useState(false);
  const questionStartRef = useRef<number>(0);

  const openOriginalSource = async () => {
    if (!mod || !mod.shareSource || !mod.sourceId || IS_PITCH || openingSource) return;
    setOpeningSource(true);
    try {
      const signed = await api.getSourceSignedUrl({ moduleId: mod.id });
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(signed.url, '_blank', 'noopener,noreferrer');
      else await Linking.openURL(signed.url);
    } catch {
      // ignore if offline
    } finally {
      setOpeningSource(false);
    }
  };

  if (!mod) {
    return (
      <View style={[styles.root, { backgroundColor: c.bg, paddingTop: insets.top }]}>
        <NavBar
          onBack={() => router.back()}
          backIcon={<CaretLeft size={20} weight="bold" color={c.text} />}
          backLabel={fil ? 'Balik' : 'Back'}
        />
        <View style={styles.missing}>
          <Text variant="title">{fil ? 'Hindi mahanap ang module' : 'Module not found'}</Text>
          <PillButton label={fil ? 'Balik' : 'Go back'} kind="secondary" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const cards = mod.flashcards;
  const questions = mod.questions;
  const activeCard = cards[Math.min(cardIdx, Math.max(0, cards.length - 1))];
  const activeQ = questions[Math.min(qIdx, Math.max(0, questions.length - 1))];

  const chooseOption = (optIndex: number) => {
    if (!activeQ || picked !== null) return;
    setPicked(optIndex);
    const correct = optIndex === activeQ.answer;
    const elapsed = elapsedSec(questionStartRef.current);
    useAppStore.getState().recordModuleAttempt({
      moduleId: mod.id,
      questionId: activeQ.id,
      chosen: optIndex,
      correct,
      seconds: elapsed,
    });
    if (correct) {
      haptic.success();
      setCorrectCount((n) => n + 1);
    } else {
      haptic.light();
    }
  };

  const nextQuestion = () => {
    if (qIdx + 1 >= questions.length) {
      setFinished(true);
      const res = useAppStore.getState().claimReward({
        key: moduleRewardKey(mod.id),
        kind: 'module',
        ref: mod.id,
        meta: {},
      });
      if (res.applied) {
        setEarnedNow(true);
        // Guard Agos effort break count with the same idempotent module key.
        useAppStore.getState().recordBreak(3);
      }
      return;
    }
    questionStartRef.current = Date.now();
    setQIdx((i) => i + 1);
    setPicked(null);
  };

  const resetQuiz = () => {
    setQIdx(0);
    setPicked(null);
    setCorrectCount(0);
    setFinished(false);
  };

  return (
    <View style={[styles.root, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      <NavBar
        onBack={() => router.back()}
        backIcon={<CaretLeft size={20} weight="bold" color={c.text} />}
        backLabel={fil ? 'Balik' : 'Back'}
        right={<Chip label={mod.subject} kind="tinted" />}
      />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 36 }]}>
        <View style={styles.head}>
          <Text variant="largeTitle">{mod.title}</Text>
          {mod.summary ? (
            <Text variant="subhead" color="textSecondary">
              {mod.summary}
            </Text>
          ) : null}
          {mod.shareSource && mod.sourceId && !IS_PITCH ? (
            <View style={styles.sourceRow}>
              <PillButton
                label={openingSource ? (fil ? 'Binubuksan…' : 'Opening…') : fil ? 'Tingnan ang orihinal na file' : 'View original file'}
                kind="secondary"
                size="sm"
                icon={<FileText size={15} weight="bold" color={c.accent} />}
                disabled={openingSource}
                onPress={() => void openOriginalSource()}
              />
            </View>
          ) : null}
        </View>

        <SegmentedControl<Mode>
          options={[
            { value: 'flashcards', label: `${fil ? 'Flashcards' : 'Flashcards'} (${cards.length})` },
            { value: 'quiz', label: `Quiz (${questions.length})` },
          ]}
          value={mode}
          onChange={setMode}
        />

        {mode === 'flashcards' && activeCard ? (
          <View style={styles.gap}>
            <View style={styles.rowBetween}>
              <Text variant="overline">
                CARD {cardIdx + 1} OF {cards.length}
              </Text>
              <Text variant="caption" color="accent" style={fontFor(600)}>
                {flipped ? (fil ? 'Sagot' : 'Answer') : fil ? 'I-tap para baliktarin' : 'Tap card to flip'}
              </Text>
            </View>
            <ProgressBar progress={(cardIdx + 1) / Math.max(1, cards.length)} color={c.accent} />

            <PressableScale
              onPress={() => {
                haptic.select();
                setFlipped((f) => !f);
              }}
              style={[
                styles.flashcard,
                {
                  backgroundColor: flipped ? c.accentTint : c.card,
                  borderColor: flipped ? c.accent + '55' : c.hairline,
                },
              ]}
              accessibilityLabel={flipped ? activeCard.back : activeCard.front}
            >
              <Text variant="overline" color={flipped ? 'accent' : 'textSecondary'}>
                {flipped ? (fil ? 'PALIWANAG' : 'EXPLANATION') : fil ? 'KONSEPTO' : 'CONCEPT'}
              </Text>
              <Text variant="title" align="center">
                {flipped ? activeCard.back : activeCard.front}
              </Text>
              {!flipped && activeCard.hint ? (
                <Text variant="caption" align="center" color="textSecondary">
                  Hint: {activeCard.hint}
                </Text>
              ) : null}
            </PressableScale>

            <View style={styles.row}>
              <PillButton
                label={fil ? 'Nakaraan' : 'Previous'}
                kind="neutral"
                style={styles.flex}
                block
                disabled={cardIdx === 0}
                onPress={() => {
                  setFlipped(false);
                  setCardIdx((i) => Math.max(0, i - 1));
                }}
              />
              {cardIdx + 1 < cards.length ? (
                <PillButton
                  label={fil ? 'Susunod' : 'Next card'}
                  style={styles.flex}
                  block
                  onPress={() => {
                    setFlipped(false);
                    setCardIdx((i) => Math.min(cards.length - 1, i + 1));
                  }}
                />
              ) : (
                <PillButton
                  label={fil ? 'Subukan ang Quiz' : 'Start Quiz'}
                  icon={<Lightning size={16} weight="fill" color={c.onAccent} />}
                  style={styles.flex}
                  block
                  onPress={() => setMode('quiz')}
                />
              )}
            </View>
          </View>
        ) : null}

        {mode === 'quiz' && finished ? (
          <Card style={styles.doneCard}>
            <Paty expression="cheering" size={112} alive />
            <Text variant="largeTitle" align="center">
              {correctCount} / {questions.length}
            </Text>
            <Text variant="subhead" align="center">
              {fil ? 'Magaling! Tapos na ang module quiz.' : 'Nice work finishing your teacher module quiz.'}
            </Text>
            <Chip
              label={earnedNow ? '+25 coins' : fil ? 'Tapos na dati' : 'Already earned'}
              icon={<Sparkle size={14} weight="fill" color={c.success} />}
              tint={{ bg: c.success + '1A', fg: c.success }}
            />
            <View style={styles.row}>
              <PillButton label={fil ? 'Ulitin ang quiz' : 'Retry quiz'} kind="neutral" style={styles.flex} block onPress={resetQuiz} />
              <PillButton label={fil ? 'Tapos' : 'Done'} style={styles.flex} block onPress={() => router.back()} />
            </View>
          </Card>
        ) : mode === 'quiz' && activeQ ? (
          <View style={styles.gap}>
            <View style={styles.rowBetween}>
              <Text variant="overline">
                QUESTION {qIdx + 1} OF {questions.length}
              </Text>
              <Text variant="caption">{activeQ.topic}</Text>
            </View>
            <ProgressBar progress={(qIdx + 1) / Math.max(1, questions.length)} color={c.success} />

            <Card style={styles.gap}>
              <Text variant="title">{activeQ.prompt}</Text>
              {activeQ.options.map((opt, idx) => {
                const isPicked = picked === idx;
                const isRight = idx === activeQ.answer;
                const reveal = picked !== null;
                const bg = !reveal
                  ? c.inset
                  : isRight
                    ? c.success + '22'
                    : isPicked
                      ? c.accentTint
                      : c.inset;
                const border = !reveal
                  ? c.hairline
                  : isRight
                    ? c.success
                    : isPicked
                      ? c.danger
                      : c.hairline;
                return (
                  <PressableScale
                    key={idx}
                    disabled={reveal}
                    onPress={() => chooseOption(idx)}
                    style={[styles.optBtn, { backgroundColor: bg, borderColor: border }]}
                  >
                    <Text variant="headline" color={!reveal ? 'text' : isRight ? 'success' : isPicked ? 'danger' : 'text'} style={styles.flex}>
                      {String.fromCharCode(65 + idx)}. {opt}
                    </Text>
                    {reveal && isRight ? <CheckCircle size={18} weight="fill" color={c.success} /> : null}
                    {reveal && isPicked && !isRight ? <XCircle size={18} weight="fill" color={c.danger} /> : null}
                  </PressableScale>
                );
              })}

              {picked !== null ? (
                <View style={[styles.explainBox, { backgroundColor: c.inset }]}>
                  <Text variant="subhead" color="text">
                    {activeQ.explanation}
                  </Text>
                </View>
              ) : null}

              {picked !== null ? (
                <PillButton
                  label={qIdx + 1 >= questions.length ? (fil ? 'Tapusin' : 'Finish module') : fil ? 'Susunod' : 'Next question'}
                  block
                  size="lg"
                  onPress={nextQuestion}
                />
              ) : null}
            </Card>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: space.screen },
  body: { paddingHorizontal: space.screen, gap: space.gap, width: '100%', maxWidth: 560, alignSelf: 'center' },
  head: { gap: 6, marginTop: 4 },
  sourceRow: { alignItems: 'flex-start', marginTop: 4 },
  gap: { gap: 12 },
  row: { flexDirection: 'row', gap: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  flashcard: {
    minHeight: 220,
    borderRadius: radius.card,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  optBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: radius.inset,
    borderWidth: 1,
  },
  explainBox: { padding: 12, borderRadius: radius.inset },
  doneCard: { alignItems: 'center', gap: 12, paddingVertical: 28 },
});
