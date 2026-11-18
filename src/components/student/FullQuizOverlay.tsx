import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Animated, BackHandler, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowUp, Check, CheckCircle, Lightbulb, ShieldCheck, X } from 'phosphor-react-native';

import { Paty } from '@/components/mascot/Paty';
import { Text } from '@/components/ui';
import { LOCAL_QUESTIONS, SUBJECTS, type LocalQuestion } from '@/data/localQuestions';
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
  onDismiss,
}: {
  skillId?: SkillId;
  appName: string;
  onUnlock: () => void;
  onDismiss: () => void;
}) {
  return (
    <ThemeProvider mode="day">
      <LearningFeed appName={appName} onUnlock={onUnlock} onDismiss={onDismiss} />
    </ThemeProvider>
  );
}

function LearningFeed({
  appName,
  onUnlock,
  onDismiss,
}: {
  appName: string;
  onUnlock: () => void;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const fil = useAppStore((s) => s.lang === 'fil');
  const [questions] = useState<LocalQuestion[]>(() => {
    const { learningGrade, learningSubject } = useAppStore.getState();
    const pool = LOCAL_QUESTIONS.filter(
      (q) => q.grade === learningGrade && (learningSubject === 'mixed' || q.subject === learningSubject),
    );
    // Mixed practice covers each subject once; a subject session samples without replacement.
    if (learningSubject === 'mixed') {
      return SUBJECTS.flatMap((subject) => {
        const choices = pool.filter((q) => q.subject === subject.id);
        return choices.length ? [choices[Math.floor(Math.random() * choices.length)]] : [];
      });
    }
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, COUNT);
  });
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [explain, setExplain] = useState(false);
  const [notice, setNotice] = useState('');
  const [height, setHeight] = useState(800);
  const moving = useRef(false);
  const answered = useRef(false);
  const completed = useRef(false);
  const [translateY] = useState(() => new Animated.Value(0));
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const q = questions[index];
  const done = index >= questions.length;

  useEffect(
    () => () => {
      translateY.stopAnimation();
    },
    [translateY],
  );
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      onDismiss();
      return true;
    });
    return () => back.remove();
  }, [onDismiss]);
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
      setNotice(fil ? 'Pumili muna ng sagot. Hindi kailangang magmadali.' : 'Choose an answer first. Take your time.');
      return;
    }
    const update = () => {
      if (index + 1 === questions.length && !completed.current) {
        completed.current = true;
        useAppStore.getState().recordDeckComplete(DEFAULT_QUIET_MIN);
        useAppStore.getState().recordBreak(1);
      }
      answered.current = false;
      setPicked(null);
      setExplain(false);
      setNotice('');
      setIndex((n) => n + 1);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    };
    haptic.select();
    moving.current = true;
    if (reduced) {
      update();
      return;
    }
    Animated.timing(translateY, { toValue: -height, duration: 170, useNativeDriver: Platform.OS !== 'web' }).start(({ finished }) => {
      if (!finished) {
        moving.current = false;
        return;
      }
      translateY.setValue(height);
      update();
      Animated.timing(translateY, { toValue: 0, duration: 240, useNativeDriver: Platform.OS !== 'web' }).start(() => {
        moving.current = false;
      });
    });
  };

  // The footer is the swipe surface; question text retains normal scrolling.
  // Coordinates exist only for this gesture and are never stored or transmitted.
  const swipe = usePanGesture({
    activeOffsetY: [-24, 24],
    failOffsetX: [-24, 24],
    onDeactivate: (event) => {
      'worklet';
      if (event.translationY < -56 || event.velocityY < -500) scheduleOnRN(advance);
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
    <View style={styles.root} onLayout={(event) => setHeight(event.nativeEvent.layout.height)} accessibilityViewIsModal>
      <Animated.View style={[styles.fill, { transform: [{ translateY }] }]}>
        <View style={[styles.header, { paddingTop: Math.max(12, insets.top) }]}>
          <View style={styles.headerText}>
            <Text variant="overline" color={GREEN}>
              {done
                ? fil
                  ? 'TAPOS NA ANG PAHINGA'
                  : 'BREAK COMPLETE'
                : `${SUBJECTS.find((s) => s.id === q.subject)?.label} · GRADE ${q.grade}`}
            </Text>
            <Text variant="headline" color={INK} accessibilityRole="header" accessibilityLiveRegion="polite">
              {done ? (fil ? 'Bawat pag-aaral ay mahalaga' : 'A little learning goes a long way') : q.topic}
            </Text>
          </View>
          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={fil ? 'Isara ang learning break' : 'Close learning break'}
            style={styles.close}
          >
            <X size={23} color={INK} />
          </Pressable>
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
            <Action
              label={fil ? 'Bumalik' : appName === 'LearnShift' ? 'Back to learning' : `Back to ${appName}`}
              onPress={onUnlock}
            />
          </ScrollView>
        ) : (
          <>
            <View style={styles.main}>
              <ScrollView
                ref={scrollRef}
                contentContainerStyle={styles.questionContent}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
              >
                <Text variant="caption" color="#50675F">
                  {fil
                    ? `TANONG ${index + 1} SA ${questions.length} · WALANG MADALIAN`
                    : `QUESTION ${index + 1} OF ${questions.length} · NO RUSH`}
                </Text>
                <Text variant="title" color={INK} style={styles.question}>
                  {q.prompt}
                </Text>
                <View style={styles.options}>
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
                          pressed && styles.optionPressed,
                          selected && styles.optionSelected,
                          correct && styles.optionCorrect,
                        ]}
                      >
                        <View style={[styles.letter, correct && styles.letterCorrect]}>
                          {correct ? (
                            <Check size={17} color="#FFFFFF" weight="bold" />
                          ) : (
                            <Text variant="subhead" color={INK}>
                              {String.fromCharCode(65 + i)}
                            </Text>
                          )}
                        </View>
                        <Text color={INK} style={styles.optionText}>
                          {option}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {explain ? (
                  <View style={styles.explanation} accessibilityLiveRegion="polite">
                    <Text variant="headline" color={GREEN}>
                      {fil
                        ? picked == null
                          ? 'Kaunting tulong'
                          : picked === q.answer
                            ? 'Tama!'
                            : 'Magandang pagsubok. Heto kung bakit.'
                        : picked == null
                          ? 'A little help'
                          : picked === q.answer
                            ? 'You got it!'
                            : 'Good try. Here’s why.'}
                    </Text>
                    <Text color={INK}>{q.explanation}</Text>
                  </View>
                ) : null}
                {notice ? (
                  <Text color={GREEN} accessibilityLiveRegion="polite">
                    {notice}
                  </Text>
                ) : null}
              </ScrollView>
              <View style={styles.rail}>
                <RailButton
                  label={fil ? (explain ? 'Itago' : 'Tulong') : explain ? 'Hide help' : 'Help'}
                  icon={<Lightbulb size={25} color={GREEN} />}
                  onPress={() => setExplain((v) => !v)}
                />
                <RailButton
                  label={fil ? 'Sunod' : 'Next'}
                  icon={<ArrowUp size={25} color={GREEN} />}
                  onPress={advance}
                />
                <RailButton
                  label={fil ? 'Pribado' : 'Privacy'}
                  icon={<ShieldCheck size={25} color={GREEN} />}
                  onPress={() =>
                    setNotice(
                      fil
                        ? 'Gumagana ang mga tanong offline. Sa sesyong ito lang ang iyong mga sagot. Walang naka-save na lokasyon ng pagpindot o nilalaman ng screen.'
                        : 'Questions work offline. Your answers stay in this session. No touch coordinates or screen content are saved.',
                    )
                  }
                />
              </View>
            </View>
            <GestureDetector gesture={swipe}>
              <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                <View style={styles.footerLine}>
                  <View style={styles.brandDot} />
                  <Text variant="headline" color={INK}>
                    LearnShift
                  </Text>
                  <Text variant="caption" color="#50675F">
                    {fil ? 'Sandaling pahinga. Bagong kaalaman.' : 'Scrolling better minutes.'}
                  </Text>
                </View>
                <Text variant="subhead" color="#50675F">
                  {fil
                    ? picked == null
                      ? 'Pumili ng sagot. Walang countdown.'
                      : index + 1 === questions.length
                        ? 'Mahusay! Mag-swipe pataas dito para matapos.'
                        : 'Kapag handa ka na, mag-swipe pataas dito.'
                    : picked == null
                      ? 'Tap an answer. There’s no countdown.'
                      : index + 1 === questions.length
                        ? 'Nice work. Swipe up here to finish.'
                        : 'Ready when you are. Swipe up here.'}
                </Text>
                <Action
                  label={
                    fil
                      ? index + 1 === questions.length
                        ? 'Tapusin ang pahinga'
                        : 'Susunod na tanong'
                      : index + 1 === questions.length
                        ? 'Finish break'
                        : 'Next question'
                  }
                  onPress={advance}
                  disabled={picked == null}
                />
              </View>
            </GestureDetector>
          </>
        )}
      </Animated.View>
    </View>
  );
}

function Action({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
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
      <ArrowUp size={19} color="#FFFFFF" weight="bold" />
    </Pressable>
  );
}
function RailButton({ label, icon, onPress }: { label: string; icon: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.railButton}>
      <View style={styles.railIcon}>{icon}</View>
      <Text variant="caption" color={GREEN}>
        {label}
      </Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: '#F3F8F3' },
  fill: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, gap: 4 },
  close: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E4EDE5',
  },
  progress: { flexDirection: 'row', gap: 5, paddingHorizontal: 20 },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#D6E3D8' },
  segmentOn: { backgroundColor: GREEN },
  main: { flex: 1, flexDirection: 'row', maxWidth: 760, width: '100%', alignSelf: 'center' },
  questionContent: { flexGrow: 1, justifyContent: 'center', padding: 20, paddingRight: 10, gap: 16 },
  question: { fontSize: 26, lineHeight: 34 },
  options: { gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CCDCCF',
    borderRadius: 18,
    padding: 14,
    minHeight: 60,
  },
  optionPressed: { backgroundColor: '#E4EDE5' },
  optionSelected: { borderColor: '#936B28', backgroundColor: '#FFF4DB' },
  optionCorrect: { borderColor: GREEN, backgroundColor: '#DEEFE3' },
  letter: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F4EE',
  },
  letterCorrect: { backgroundColor: GREEN },
  optionText: { flex: 1, flexShrink: 1 },
  explanation: { padding: 16, borderRadius: 18, backgroundColor: '#E1EEDF', gap: 6 },
  rail: { width: 68, paddingRight: 6, justifyContent: 'center', gap: 22 },
  railButton: { minWidth: 48, minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 4 },
  railIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#E1EEDF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    gap: 10,
    borderTopWidth: 1,
    borderColor: '#D6E3D8',
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
  },
  footerLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  brandDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: GREEN },
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
  disabled: { opacity: 0.5 },
  results: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 },
  resultBadge: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  empty: { flex: 1, justifyContent: 'center', padding: 24, gap: 20 },
});
