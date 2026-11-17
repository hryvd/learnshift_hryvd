import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { CheckCircle, Lightbulb, X } from 'phosphor-react-native';

import { SparkBurst } from '@/components/learn/Effects';
import { MasteryRow } from '@/components/learn/MasteryRow';
import { QuizOption, type OptionState } from '@/components/learn/QuizOption';
import { Paty } from '@/components/mascot/Paty';
import { Card, Chip, IconButton, InsetCard, PillButton, Text } from '@/components/ui';
import { questionsFor, type Question } from '@/data/questions';
import { SHORT, SKILL_BY_ID, type SkillId } from '@/data/skills';
import { haptic } from '@/design/haptics';
import { spring, useReducedMotion } from '@/design/motion';
import { ThemeProvider, useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { useL, useT } from '@/i18n/useT';
import { gapEngine } from '@/services/ai/gapEngine';
import { DEFAULT_QUIET_MIN } from '@/services/sentinel';
import { useAppStore } from '@/store/useAppStore';

const COUNT = 5;

/** Seconds elapsed since an epoch-ms timestamp (kept out of render code). */
const secondsSince = (t: number) => Math.max(1, (Date.now() - t) / 1000);

function pickNext(skill: SkillId, level: number, asked: string[]): Question {
  const mastery = useAppStore.getState().mastery;
  const root = gapEngine.rootGap(mastery, skill);
  const pool = [
    ...questionsFor(skill),
    ...(root !== skill ? questionsFor(root) : []),
    ...SKILL_BY_ID[skill].prereqs.flatMap(questionsFor),
  ];
  const fresh = pool.filter((q) => !asked.includes(q.id));
  const list = fresh.length ? fresh : pool;
  return [...list].sort(
    (a, b) => Math.abs(a.level - level) - Math.abs(b.level - level) || (a.skill === skill ? -1 : 1),
  )[0];
}

export function FullQuizOverlay({
  skillId,
  appName,
  onUnlock,
  onDismiss,
}: {
  skillId: SkillId;
  appName: string;
  onUnlock: () => void;
  onDismiss: () => void;
}) {
  return (
    <ThemeProvider mode="day">
      <FullQuizBody skillId={skillId} appName={appName} onUnlock={onUnlock} onDismiss={onDismiss} />
    </ThemeProvider>
  );
}

function FullQuizBody({
  skillId,
  appName,
  onUnlock,
  onDismiss,
}: {
  skillId: SkillId;
  appName: string;
  onUnlock: () => void;
  onDismiss: () => void;
}) {
  const { c } = useTheme();
  const t = useT();
  const L = useL();
  const reduced = useReducedMotion();
  const [startMastery] = useState(() => useAppStore.getState().mastery);
  const [startRoot] = useState(() => gapEngine.rootGap(startMastery, skillId));

  const [level, setLevel] = useState(() => Math.max(1, Math.min(5, Math.round(startMastery[skillId] * 5))));
  const [asked, setAsked] = useState<string[]>([]);
  const [q, setQ] = useState<Question>(() => pickNext(skillId, level, []));
  const [picked, setPicked] = useState<number | null>(null);
  const [hints, setHints] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [levelMsg, setLevelMsg] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [burst, setBurst] = useState(0);
  const [secs, setSecs] = useState(0);
  const startedRef = useRef(0);
  const pill = useSharedValue(0);

  useEffect(() => {
    if (picked != null || done) return;
    startedRef.current = Date.now();
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [q.id, picked, done]);

  const answer = (i: number) => {
    if (picked != null) return;
    setPicked(i);
    const correct = i === q.answer;
    const s = useAppStore.getState();
    s.answer(
      { skill: q.skill, correct, seconds: secondsSince(startedRef.current), hints: showHint ? 1 : 0 },
      { questionId: q.id, chosen: i, context: 'quiz' },
    );
    const nextLevel = Math.max(1, Math.min(5, level + (correct ? 1 : -1)));
    if (nextLevel !== level) setLevelMsg(t.quiz.levelChange(level, nextLevel));
    setLevel(nextLevel);
    if (correct) {
      setScore((x) => x + 1);
      haptic.success();
      setBurst((b) => b + 1);
    } else {
      haptic.warning();
      s.setLastMiss({ q: q.id, a: i });
      pill.set(reduced ? 1 : withSpring(1, spring.smooth));
    }
  };

  const next = () => {
    const nextAsked = [...asked, q.id];
    setAsked(nextAsked);
    if (nextAsked.length >= COUNT) {
      const reward = score * 10;
      const s = useAppStore.getState();
      if (reward > 0) s.addCoins(reward);
      s.recordDeckComplete(DEFAULT_QUIET_MIN);
      s.recordBreak(2);
      setDone(true);
      return;
    }
    setQ(pickNext(skillId, level, nextAsked));
    setSecs(0);
    setPicked(null);
    setShowHint(false);
    setLevelMsg(null);
    pill.set(0);
  };

  const stateFor = (i: number): OptionState => {
    if (picked == null) return 'idle';
    if (i === picked) return i === q.answer ? 'correct' : 'wrong';
    if (i === q.answer) return 'reveal';
    return 'dim';
  };

  const pillStyle = useAnimatedStyle(() => ({
    opacity: pill.get(),
    transform: [{ translateY: (1 - pill.get()) * 24 }],
  }));

  if (done) {
    return (
      <QuizOverlayResults
        skill={skillId}
        appName={appName}
        score={score}
        startMastery={startMastery}
        startRoot={startRoot}
        onUnlock={onUnlock}
      />
    );
  }

  const correct = picked === q.answer;
  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <IconButton
          tone="card"
          icon={<X size={18} weight="bold" color={c.text} />}
          accessibilityLabel={t.common.close}
          onPress={onDismiss}
        />
        <View style={styles.flex}>
          <Text variant="caption" color="accent" align="center" numberOfLines={1}>
            Overlaying {appName} · Full Quiz Reset
          </Text>
          <Text variant="headline" align="center">
            {L(SHORT[skillId])} · {t.quiz.progress(asked.length + 1, COUNT)} · 0:{String(secs).padStart(2, '0')}
          </Text>
        </View>
        <PillButton
          label={hints ? `${t.quiz.hint} · ${hints}` : t.quiz.hint}
          kind="neutral"
          size="sm"
          icon={<Lightbulb size={15} weight="fill" color={c.spark} />}
          disabled={picked != null || showHint}
          onPress={() => {
            setShowHint(true);
            setHints((h) => h + 1);
          }}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.levelRow}>
          <LevelDots level={level} />
          <Text variant="subhead" color="text">
            {t.quiz.level(level)}
          </Text>
          {levelMsg ? <Chip label={levelMsg} kind={correct ? 'accent' : 'neutral'} style={styles.levelChip} /> : null}
        </View>

        <Card style={styles.qCard}>
          <Text variant="title">{L(q.prompt)}</Text>
          {showHint ? (
            <InsetCard label={t.quiz.hint}>
              <Text variant="body">{L(q.hint)}</Text>
            </InsetCard>
          ) : null}
        </Card>

        <View style={styles.options}>
          {q.options.map((o, i) => (
            <QuizOption
              key={`${q.id}-${i}`}
              index={i}
              label={o}
              state={stateFor(i)}
              onPress={() => answer(i)}
              disabled={picked != null}
            />
          ))}
          <SparkBurst play={burst} size={160} />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {picked != null ? (
          <View style={styles.feedback}>
            <Text variant="headline" color={correct ? 'success' : 'danger'} style={styles.flex}>
              {correct ? t.brk.nice : t.brk.notQuite}
            </Text>
            {!correct ? (
              <Animated.View style={pillStyle}>
                <PillButton
                  label={t.quiz.seeWhy}
                  kind="secondary"
                  size="sm"
                  onPress={() => router.push({ pathname: '/tutor', params: { q: q.id, a: String(picked) } })}
                />
              </Animated.View>
            ) : null}
          </View>
        ) : null}
        <PillButton
          label={asked.length + 1 >= COUNT ? t.quiz.finish : t.quiz.next}
          size="lg"
          block
          disabled={picked == null}
          onPress={next}
        />
      </View>
    </View>
  );
}

function LevelDots({ level }: { level: number }) {
  return (
    <View style={styles.dots} accessibilityLabel={`Level ${level} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <LevelDot key={n} on={n <= level} />
      ))}
    </View>
  );
}

function LevelDot({ on }: { on: boolean }) {
  const { c } = useTheme();
  const v = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    v.set(withSpring(on ? 1 : 0, spring.bouncy));
  }, [on, v]);
  const s = useAnimatedStyle(() => ({ opacity: 0.25 + v.get() * 0.75, transform: [{ scale: 0.8 + v.get() * 0.2 }] }));
  return <Animated.View style={[styles.dot, { backgroundColor: c.accent }, s]} />;
}

function QuizOverlayResults({
  skill,
  appName,
  score,
  startMastery,
  startRoot,
  onUnlock,
}: {
  skill: SkillId;
  appName: string;
  score: number;
  startMastery: Record<SkillId, number>;
  startRoot: SkillId;
  onUnlock: () => void;
}) {
  const { c } = useTheme();
  const t = useT();
  const L = useL();
  const mastery = useAppStore((s) => s.mastery);
  const root = gapEngine.rootGap(mastery, skill);
  const reward = score * 10;
  const skills = Array.from(new Set<SkillId>([skill, startRoot, root]));

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.center}>
          <Paty expression={score >= 3 ? 'proud' : 'happy'} size={120} />
          <Text variant="overline">{t.quiz.results}</Text>
          <Text variant="display" tabular>
            {t.quiz.score(score, COUNT)}
          </Text>
          <Chip label={root !== startRoot ? t.quiz.rootUpdated : t.quiz.rootStill(L(SHORT[root]))} kind="accent" />
        </View>

        <Card style={styles.masteryCard}>
          {skills.map((s, i) => (
            <MasteryRow
              key={s}
              label={L(SKILL_BY_ID[s].name)}
              from={startMastery[s]}
              to={mastery[s]}
              delay={300 + i * 120}
              color={s === root ? c.accent : undefined}
            />
          ))}
        </Card>

        {reward > 0 ? (
          <View style={[styles.earn, { backgroundColor: c.accentTint }]}>
            <Text variant="title" color="accent">
              {t.brk.earned(reward)}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <PillButton
          label={`Unlock ${appName} · Scroll Free for 20m`}
          size="lg"
          block
          icon={<CheckCircle size={18} weight="fill" color={c.onAccent} />}
          onPress={onUnlock}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F5F2' },
  flex: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: space.screen,
    paddingVertical: 6,
  },
  body: {
    paddingHorizontal: space.screen,
    gap: space.gap,
    paddingBottom: 14,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 28 },
  levelChip: { height: 26 },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  qCard: { gap: 10 },
  options: { gap: 8 },
  footer: {
    paddingHorizontal: space.screen,
    gap: 10,
    paddingTop: 6,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  feedback: { flexDirection: 'row', alignItems: 'center', minHeight: 38 },
  center: { alignItems: 'center', gap: 6, paddingTop: 6 },
  masteryCard: { gap: 14 },
  earn: { alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 8, borderRadius: radius.pill },
});

