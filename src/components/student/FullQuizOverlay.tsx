import { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Dimensions, Easing, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowUp, Check, CheckCircle, House, Lightbulb } from 'phosphor-react-native';

import { Paty } from '@/components/mascot/Paty';
import { QuestionVisual } from '@/components/student/QuestionVisual';
import { Text } from '@/components/ui';
import { SUBJECTS, type LocalQuestion } from '@/data/localQuestions';
import { pickSession } from '@/data/pickQuestions';
import type { SkillId } from '@/data/skills';
import { haptic } from '@/design/haptics';
import { useReducedMotion } from '@/design/motion';
import { ThemeProvider } from '@/design/theme';
import { DEFAULT_QUIET_MIN } from '@/services/sentinel';
import { useAppStore } from '@/store/useAppStore';

const INK = '#17352F';
const GREEN = '#146B50';
const COUNT = 5;

/** A short, finite feed. Answers stay in this session, outside the backend sync queue. */
export function FullQuizOverlay({
  appName,
  onUnlock,
  onHome,
  onDismiss,
  animateIn = false,
}: {
  skillId?: SkillId;
  appName: string;
  onUnlock: () => void;
  /** When set, the finish screen offers "Back to Home" as the main way out. */
  onHome?: () => void;
  /** Only used when there is nothing to answer; there is no close control. */
  onDismiss: () => void;
  /** Glide the sheet up from the bottom when it first appears. */
  animateIn?: boolean;
}) {
  return (
    <ThemeProvider mode="day">
      <LearningFeed appName={appName} onUnlock={onUnlock} onHome={onHome} onDismiss={onDismiss} animateIn={animateIn} />
    </ThemeProvider>
  );
}

const GLIDE = Easing.bezier(0.16, 1, 0.3, 1);

function LearningFeed({
  appName,
  onUnlock,
  onHome,
  onDismiss,
  animateIn,
}: {
  appName: string;
  onUnlock: () => void;
  onHome?: () => void;
  onDismiss: () => void;
  animateIn: boolean;
}) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const fil = useAppStore((s) => s.lang === 'fil');
  // Unseen questions come first; the session's picks are recorded once it mounts.
  const [session] = useState(() => {
    const { learningGrade, learningSubject, seenQuestions } = useAppStore.getState();
    return pickSession(learningGrade, learningSubject, seenQuestions ?? {}, COUNT);
  });
  const questions: LocalQuestion[] = session.questions;
  useEffect(() => {
    const { setSeenQuestions } = useAppStore.getState();
    for (const [pool, ids] of Object.entries(session.seen)) setSeenQuestions(pool, ids);
  }, [session]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [explain, setExplain] = useState(false);
  const [notice, setNotice] = useState('');
  const moving = useRef(false);
  const answered = useRef(false);
  const completed = useRef(false);
  const [translateY] = useState(() => new Animated.Value(0));
  const [fade] = useState(() => new Animated.Value(1));
  const [enter] = useState(() => new Animated.Value(animateIn ? Dimensions.get('window').height : 0));
  const [offset] = useState(() => Animated.add(translateY, enter));
  const q = questions[index];
  const done = index >= questions.length;
  const compactGrid = !!q && q.options.every((opt) => opt.length <= 14);

  useEffect(
    () => () => {
      translateY.stopAnimation();
      fade.stopAnimation();
      enter.stopAnimation();
    },
    [translateY, fade, enter],
  );
  // The sheet glides up over whatever is behind it.
  useEffect(() => {
    if (!animateIn || reduced) {
      enter.setValue(0);
      return;
    }
    Animated.timing(enter, { toValue: 0, duration: 520, easing: GLIDE, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [animateIn, reduced, enter]);
  // There is no way out except answering: Back is ignored until the break is complete.
  const doneRef = useRef(false);
  useEffect(() => {
    doneRef.current = done;
  }, [done]);
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (doneRef.current) (onHome ?? onUnlock)();
      return true;
    });
    return () => back.remove();
  }, [onUnlock, onHome]);
  useEffect(() => {
    if (reduced) moving.current = false;
  }, [index, reduced]);

  const answer = (choice: number) => {
    if (!q || answered.current || moving.current) return;
    answered.current = true;
    setPicked(choice);
    setExplain(true);
    setNotice('');
    if (choice === q.answer) {
      setScore((n) => n + 1);
      haptic.success();
    } else haptic.light();
  };

  const advance = () => {
    if (moving.current || done) return;
    if (picked == null) {
      setNotice(fil ? 'Pumili muna ng sagot bago mag-swipe.' : 'Pick an answer first before swiping up.');
      return;
    }
    const update = () => {
      if (index + 1 === questions.length && !completed.current) {
        completed.current = true;
        useAppStore.getState().recordDeckComplete(DEFAULT_QUIET_MIN);
        useAppStore.getState().recordBreak(1);
        useAppStore.getState().logNudge('break', [], 'took');
      }
      answered.current = false;
      setPicked(null);
      setExplain(false);
      setNotice('');
      setIndex((n) => n + 1);
    };
    haptic.select();
    moving.current = true;
    if (reduced) {
      update();
      return;
    }
    const native = Platform.OS !== 'web';
    // The answered card lifts away, the next one rises in with a soft landing.
    Animated.parallel([
      Animated.timing(translateY, { toValue: -120, duration: 190, easing: Easing.in(Easing.cubic), useNativeDriver: native }),
      Animated.timing(fade, { toValue: 0, duration: 190, easing: Easing.in(Easing.cubic), useNativeDriver: native }),
    ]).start(({ finished }) => {
      if (!finished) {
        moving.current = false;
        return;
      }
      translateY.setValue(140);
      update();
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 420, easing: GLIDE, useNativeDriver: native }),
        Animated.timing(fade, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: native }),
      ]).start(() => {
        moving.current = false;
      });
    });
  };

  // Whole-card upward swipe: question, options, and cue fit cleanly in one viewport.
  const swipe = usePanGesture({
    activeOffsetY: [-22, 22],
    failOffsetX: [-24, 24],
    onDeactivate: (event) => {
      'worklet';
      if (event.translationY < -44 || event.velocityY < -420) scheduleOnRN(advance);
    },
  });

  if (!questions.length) {
    return (
      <View style={styles.empty}>
        <Text variant="title">{fil ? 'Walang tanong sa napiling paksa' : 'No questions for this selection'}</Text>
        <Action label={fil ? 'Bumalik' : 'Go back'} onPress={onDismiss} />
      </View>
    );
  }

  return (
    <View style={styles.root} accessibilityViewIsModal>
      <Animated.View style={[styles.fill, { opacity: fade, transform: [{ translateY: offset }] }]}>
        <View style={[styles.handleWrap, { paddingTop: Math.max(8, insets.top) }]}>
          <View style={styles.sheetHandle} />
        </View>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text variant="overline" color={GREEN}>
              {done
                ? fil
                  ? 'TAPOS NA ANG PAHINGA'
                  : 'BREAK COMPLETE'
                : `${SUBJECTS.find((s) => s.id === q.subject)?.label} · GRADE ${q.grade} · ${index + 1}/${questions.length}`}
            </Text>
            <Text variant="headline" color={INK} numberOfLines={1} accessibilityRole="header" accessibilityLiveRegion="polite">
              {done ? (fil ? 'Bawat pag-aaral ay mahalaga' : 'A little learning goes a long way') : q.topic}
            </Text>
          </View>
          {!done ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={fil ? 'Tulong' : 'Help'}
              onPress={() => setExplain((v) => !v)}
              style={styles.helpBtn}
            >
              <Lightbulb size={18} color={GREEN} weight={explain ? 'fill' : 'regular'} />
            </Pressable>
          ) : null}
        </View>
        <View
          style={styles.progress}
          accessibilityLabel={`${Math.min(index + 1, questions.length)} of ${questions.length} questions`}
        >
          {questions.map((item, i) => (
            <View key={item.id} style={[styles.segment, i <= index && styles.segmentOn]} />
          ))}
        </View>

        {done ? (
          <ScrollView contentContainerStyle={styles.results}>
            <Paty expression="proud" size={140} />
            <Text variant="largeTitle" color={INK}>
              {fil ? 'May bago kang natutuhan!' : 'You made time to learn!'}
            </Text>
            <Text variant="body" color="#50675F" align="center">
              {fil
                ? `${score} sa ${questions.length} ang tamang sagot. Bawat pagsubok ay nakatutulong!`
                : `${score} of ${questions.length} answers correct. Every try helps you grow.`}
            </Text>
            <View style={styles.resultBadge}>
              <CheckCircle size={22} color={GREEN} />
              <Text color={GREEN}>{fil ? 'Tapos na ang iyong pahinga' : 'Your break is complete'}</Text>
            </View>
            {onHome ? (
              <>
                <Action label={fil ? 'Balik sa Home ng LearnShift' : 'Back to LearnShift Home'} icon="home" onPress={onHome} />
                {appName !== 'LearnShift' ? (
                  <SecondaryAction
                    label={fil ? `Buksan ang ${appName}` : `Open ${appName}`}
                    onPress={onUnlock}
                  />
                ) : null}
              </>
            ) : (
              <Action
                label={
                  fil
                    ? appName !== 'LearnShift'
                      ? `Balik sa free time · ${appName}`
                      : 'Balik sa free time'
                    : appName !== 'LearnShift'
                      ? `Back to free time · ${appName}`
                      : 'Back to your free time'
                }
                onPress={onUnlock}
              />
            )}
          </ScrollView>
        ) : (
          <GestureDetector gesture={swipe}>
            <View style={styles.cardBody}>
              <View style={styles.questionContent}>
                {q.visual ? <QuestionVisual visual={q.visual} /> : null}
                <Text
                  variant="title"
                  color={INK}
                  style={[styles.question, q.visual && styles.questionWithVisual]}
                  numberOfLines={4}
                >
                  {q.prompt}
                </Text>
                <View style={compactGrid ? styles.optionsGrid : styles.options}>
                  {q.options.map((option, i) => {
                    const correct = picked != null && i === q.answer;
                    const selected = picked === i;
                    return (
                      <Pressable
                        key={`${q.id}-${i}`}
                        onPress={() => answer(i)}
                        disabled={picked != null}
                        accessibilityRole="button"
                        accessibilityLabel={`${String.fromCharCode(65 + i)}. ${option}${correct ? '. Correct answer' : selected ? '. Your answer' : ''}`}
                        accessibilityState={{ disabled: picked != null, selected }}
                        style={({ pressed }) => [
                          styles.option,
                          compactGrid && styles.optionGrid,
                          pressed && styles.optionPressed,
                          selected && styles.optionSelected,
                          correct && styles.optionCorrect,
                        ]}
                      >
                        <View style={[styles.letter, correct && styles.letterCorrect]}>
                          {correct ? (
                            <Check size={15} color="#FFFFFF" weight="bold" />
                          ) : (
                            <Text variant="caption" color={INK}>
                              {String.fromCharCode(65 + i)}
                            </Text>
                          )}
                        </View>
                        <Text color={INK} style={styles.optionText} numberOfLines={2}>
                          {option}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {explain ? (
                  <View style={styles.explanation} accessibilityLiveRegion="polite">
                    <Text variant="caption" color={GREEN} style={styles.explainTitle}>
                      {fil
                        ? picked == null
                          ? 'Kaunting tulong'
                          : picked === q.answer
                            ? 'Tama!'
                            : 'Heto kung bakit'
                        : picked == null
                          ? 'Hint'
                          : picked === q.answer
                            ? 'You got it!'
                            : 'Here’s why'}
                    </Text>
                    <Text variant="caption" color={INK} numberOfLines={3}>
                      {q.explanation}
                    </Text>
                  </View>
                ) : null}
                {notice ? (
                  <Text variant="caption" color={GREEN} align="center" accessibilityLiveRegion="polite">
                    {notice}
                  </Text>
                ) : null}
              </View>

              <View style={[styles.swipeCueWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                <View style={[styles.swipeCue, picked != null ? styles.swipeCueReady : styles.swipeCueMuted]}>
                  <ArrowUp size={16} color={picked != null ? GREEN : '#50675F'} weight="bold" />
                  <Text variant="subhead" color={picked != null ? GREEN : '#50675F'}>
                    {fil ? 'Mag-swipe pataas kapag tapos na' : 'Swipe up when finished'}
                  </Text>
                </View>
              </View>
            </View>
          </GestureDetector>
        )}
      </Animated.View>
    </View>
  );
}

function Action({
  label,
  onPress,
  disabled = false,
  icon = 'up',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: 'up' | 'home';
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={[styles.primary, disabled && styles.disabled]}
    >
      <Text variant="headline" color="#FFFFFF">
        {label}
      </Text>
      {icon === 'home' ? (
        <House size={19} color="#FFFFFF" weight="bold" />
      ) : (
        <ArrowUp size={19} color="#FFFFFF" weight="bold" />
      )}
    </Pressable>
  );
}
function SecondaryAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.secondary}>
      <Text variant="headline" color={GREEN}>
        {label}
      </Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: '#F3F8F3' },
  fill: { flex: 1 },
  handleWrap: { alignItems: 'center', paddingBottom: 4 },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: '#C8D8CC' },
  header: { paddingHorizontal: 18, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerText: { flex: 1, gap: 2 },
  helpBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E1EEDF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progress: { flexDirection: 'row', gap: 4, paddingHorizontal: 18 },
  segment: { flex: 1, height: 3.5, borderRadius: 2, backgroundColor: '#D6E3D8' },
  segmentOn: { backgroundColor: GREEN },
  cardBody: { flex: 1, maxWidth: 680, width: '100%', alignSelf: 'center', justifyContent: 'space-between' },
  questionContent: { flex: 1, justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 8, gap: 10 },
  question: { fontSize: 20, lineHeight: 26 },
  questionWithVisual: { fontSize: 18, lineHeight: 24 },
  options: { gap: 8 },
  optionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CCDCCF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 46,
  },
  optionGrid: { width: '48.5%', minHeight: 50 },
  optionPressed: { backgroundColor: '#E4EDE5' },
  optionSelected: { borderColor: '#936B28', backgroundColor: '#FFF4DB' },
  optionCorrect: { borderColor: GREEN, backgroundColor: '#DEEFE3' },
  letter: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F4EE',
  },
  letterCorrect: { backgroundColor: GREEN },
  optionText: { flex: 1, flexShrink: 1, fontSize: 14, lineHeight: 18 },
  explanation: { padding: 10, borderRadius: 12, backgroundColor: '#E1EEDF', gap: 2 },
  explainTitle: { fontWeight: '700' },
  swipeCueWrap: { paddingHorizontal: 18, paddingTop: 6, alignItems: 'center' },
  swipeCue: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
  },
  swipeCueMuted: { opacity: 0.45, backgroundColor: '#E8EFE9' },
  swipeCueReady: { opacity: 1, backgroundColor: '#DCEFE2' },
  primary: {
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: GREEN,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  secondary: {
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: GREEN,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabled: { opacity: 0.5 },
  results: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 },
  resultBadge: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  empty: { flex: 1, justifyContent: 'center', padding: 24, gap: 20 },
});
