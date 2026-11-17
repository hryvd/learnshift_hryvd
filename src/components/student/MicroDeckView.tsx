import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line } from 'react-native-svg';
import {
  ArrowDown,
  ArrowUp,
  BookmarkSimple,
  ChatTeardropText,
  CheckCircle,
  MoonStars,
  ShieldCheck,
  Sparkle,
  WarningCircle,
  X,
} from 'phosphor-react-native';

import { Diagram } from '@/components/learn/Diagram';
import { Chip, PillButton, PressableScale, Text } from '@/components/ui';
import {
  DECELERATION_DECK,
  INTEREST_LABELS,
  pickText,
  type DecelerationCard,
  type DeckLang,
  type MicroDeck,
} from '@/data/decks';
import { SHORT } from '@/data/skills';
import { haptic } from '@/design/haptics';
import { radius, space } from '@/design/tokens';
import { DEFAULT_QUIET_MIN } from '@/services/sentinel';
import { DEFAULT_SENTINEL, useAppStore } from '@/store/useAppStore';

import { VerticalPager } from './VerticalPager';

const SURFACE = '#F6F5F2';
const CARD_BG = '#FFFFFF';
const CARD_BORDER = 'rgba(17,17,17,0.09)';
const INK = '#111111';
const INK_SUB = '#5C5C62';
const ACCENT = '#C8400F';
const SUCCESS = '#2FBF5B';
const DANGER = '#E5484D';
const INDIGO = '#5B57D6';

const LANG_OPTIONS: { id: DeckLang; label: string }[] = [
  { id: 'en', label: 'EN' },
  { id: 'fil', label: 'FIL' },
  { id: 'taglish', label: 'TAGLISH' },
];

const CHOICE_LETTERS = ['A', 'B', 'C', 'D'] as const;

/** Seconds elapsed since an epoch-ms timestamp (kept out of render code). */
const secondsSince = (t: number) => Math.max(1, (Date.now() - t) / 1000);

export function LangSwitch({
  lang,
  onChange,
}: {
  lang: DeckLang;
  onChange: (next: DeckLang) => void;
}) {
  return (
    <View style={styles.langRow} accessibilityRole="radiogroup" accessibilityLabel="Card language">
      {LANG_OPTIONS.map((opt) => {
        const active = lang === opt.id;
        return (
          <Pressable
            key={opt.id}
            onPress={() => {
              haptic.select();
              onChange(opt.id);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={[styles.langChip, active ? styles.langChipActive : null]}
          >
            <Text variant="caption" color={active ? '#FFFFFF' : INK_SUB} style={styles.bold}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type MicroDeckProps = {
  deck: MicroDeck;
  pageHeight: number;
  pageWidth: number;
  reasonLine?: string;
  /** True when this view owns vertical swipe across Card 1 -> Card 2 -> Card 3 (overlay mode). */
  scrollCards?: boolean;
  /** Top safe padding override (when embedded under a parent header). */
  topOffset?: number;
  onComplete?: (info: { correct: boolean; cardId: string }) => void;
  onDismiss?: () => void;
  onNotNow1h?: () => void;
  onWindDown?: () => void;
};

export function MicroDeckView({
  deck,
  pageHeight,
  pageWidth,
  reasonLine,
  scrollCards = true,
  topOffset,
  onComplete,
  onDismiss,
  onNotNow1h,
  onWindDown,
}: MicroDeckProps) {
  const insets = useSafeAreaInsets();
  const deckLang = useAppStore((s) => s.sentinel?.deckLang ?? DEFAULT_SENTINEL.deckLang);
  const setDeckLang = useAppStore((s) => s.setDeckLang);
  const saved = useAppStore((s) => s.feed.saved.includes(deck.card_id));
  const [step, setStep] = useState(0);
  const [showContrast, setShowContrast] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [regretChoice, setRegretChoice] = useState<'yes' | 'no' | null>(null);
  const startedAtRef = useRef(0);
  const finishedRef = useRef(false);

  useEffect(() => {
    startedAtRef.current = Date.now();
  }, [deck.card_id, step]);

  const topPad = topOffset ?? insets.top + 14;
  const botPad = Math.max(insets.bottom, 16) + 18;
  const maxW = Math.min(pageWidth, 540);
  const diagramW = Math.max(200, maxW - space.screen * 2 - 36);

  const selectChoice = (idx: number) => {
    if (picked != null) return;
    setPicked(idx);
    const choice = deck.check.choices[idx];
    const correct = !!choice?.correct;
    const elapsedSec = startedAtRef.current > 0 ? secondsSince(startedAtRef.current) : 6;
    const s = useAppStore.getState();
    s.answer(
      { skill: deck.skill_id, correct, seconds: elapsedSec, hints: 0 },
      { questionId: deck.check.question_id, chosen: idx, context: 'feed' },
    );
    s.reward('break', correct);
    if (correct) {
      haptic.success();
    } else {
      haptic.warning();
      s.setLastMiss({ q: deck.check.question_id, a: idx });
    }
  };

  const finishDeck = (correct: boolean) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    useAppStore.getState().recordDeckComplete(DEFAULT_QUIET_MIN);
    haptic.success();
    onComplete?.({ correct, cardId: deck.card_id });
  };

  const card1 = (
    <View style={[styles.cardPage, { height: pageHeight, width: pageWidth, paddingTop: topPad, paddingBottom: botPad }]}>
      <View style={[styles.cardColumn, { maxWidth: maxW }]}>
        <DeckTopBar
          step={0}
          onSelectStep={setStep}
          lang={deckLang}
          onLang={setDeckLang}
          reasonLine={reasonLine ?? `${SHORT[deck.skill_id][deckLang === 'fil' ? 'fil' : 'en']} · ~${deck.est_seconds}s`}
          saved={saved}
          onSave={() => useAppStore.getState().toggleSaved(deck.card_id)}
          onDismiss={onDismiss}
        />

        <View style={styles.heroCenter}>
          <View style={styles.tagRow}>
            <Chip
              label={pickText(INTEREST_LABELS[deck.interest_tag], deckLang)}
              tint={{ bg: 'rgba(200,64,15,0.12)', fg: ACCENT }}
            />
            <Chip
              label={SHORT[deck.skill_id][deckLang === 'fil' ? 'fil' : 'en']}
              tint={{ bg: 'rgba(17,17,17,0.06)', fg: INK }}
            />
          </View>

          <Text variant="overline" color={ACCENT}>
            CARD 1 OF 3 · HOOK (~5S)
          </Text>
          <Text variant="largeTitle" color={INK} style={styles.hookText}>
            {pickText(deck.hook, deckLang)}
          </Text>
          <Text variant="subhead" color={INK_SUB}>
            {deckLang === 'en'
              ? 'Finish this 3-card reset and LearnShift stays quiet for 20 minutes.'
              : deckLang === 'fil'
                ? 'Tapusin ang 3-card reset na ito at mananahimik ang LearnShift ng 20 minuto.'
                : 'Tapusin ang 3-card reset na ito, quiet mode for 20 minutes after.'}
          </Text>
        </View>

        <View style={styles.cardFooter}>
          <PressableScale
            onPress={() => {
              haptic.light();
              setStep(1);
            }}
            style={styles.primaryCta}
            accessibilityLabel="Swipe up for the 15-sec idea"
          >
            <ArrowUp size={18} weight="bold" color="#FFFFFF" />
            <Text variant="headline" color="#FFFFFF">
              {deckLang === 'fil' ? 'I-swipe pataas para sa ideya' : 'Swipe up · 15-sec micro-lesson'}
            </Text>
          </PressableScale>
          <GuardrailRow onDismiss={onDismiss} onNotNow1h={onNotNow1h} onWindDown={onWindDown} />
        </View>
      </View>
    </View>
  );

  const card2 = (
    <View style={[styles.cardPage, { height: pageHeight, width: pageWidth, paddingTop: topPad, paddingBottom: botPad }]}>
      <View style={[styles.cardColumn, { maxWidth: maxW }]}>
        <DeckTopBar
          step={1}
          onSelectStep={setStep}
          lang={deckLang}
          onLang={setDeckLang}
          reasonLine={reasonLine ?? `${SHORT[deck.skill_id][deckLang === 'fil' ? 'fil' : 'en']} · ~15s`}
          saved={saved}
          onSave={() => useAppStore.getState().toggleSaved(deck.card_id)}
          onDismiss={onDismiss}
        />

        <ScrollView style={styles.flex} contentContainerStyle={styles.lessonBody} showsVerticalScrollIndicator={false}>
          <Text variant="overline" color={ACCENT}>
            CARD 2 OF 3 · MICRO-LESSON (~15S)
          </Text>

          <View style={styles.diagramBox}>
            <Diagram spec={deck.lesson.diagram} width={diagramW} accessibilityLabel={pickText(deck.hook, deckLang)} />
          </View>

          <View style={styles.stepsCol}>
            {deck.lesson.steps.map((st, idx) => (
              <View key={idx} style={styles.stepBox}>
                <View style={styles.stepBadge}>
                  <Text variant="caption" color="#FFFFFF" style={styles.bold}>
                    {idx + 1}
                  </Text>
                </View>
                <Text variant="body" color={INK} style={styles.flex}>
                  {pickText(st, deckLang)}
                </Text>
              </View>
            ))}
          </View>

          {deck.lesson.contrast ? (
            <View style={styles.contrastWrap}>
              <PressableScale
                onPress={() => setShowContrast((v) => !v)}
                style={styles.contrastToggle}
                accessibilityLabel="Toggle contrast example"
              >
                <Sparkle size={14} weight="fill" color={ACCENT} />
                <Text variant="subhead" color={ACCENT} style={styles.bold}>
                  {showContrast ? 'Hide contrast card' : 'Compare: non-proportional case'}
                </Text>
              </PressableScale>
              {showContrast ? (
                <View style={styles.contrastBody}>
                  <Text variant="subhead" color={DANGER}>
                    ✕ {pickText(deck.lesson.contrast.wrongLabel, deckLang)}
                  </Text>
                  <Text variant="subhead" color={SUCCESS}>
                    ✓ {pickText(deck.lesson.contrast.rightLabel, deckLang)}
                  </Text>
                  <Text variant="caption" color={INK_SUB}>
                    {pickText(deck.lesson.contrast.note, deckLang)}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.provenanceRow}>
            <ShieldCheck size={14} weight="fill" color={SUCCESS} />
            <Text variant="caption" color={INK_SUB}>
              Solver verified · Teacher approved · {deck.provenance.source_ref}
            </Text>
          </View>
        </ScrollView>

        <View style={styles.cardFooter}>
          <PressableScale
            onPress={() => {
              haptic.light();
              setStep(2);
            }}
            style={styles.primaryCta}
            accessibilityLabel="Swipe up for one-tap check"
          >
            <ArrowUp size={18} weight="bold" color="#FFFFFF" />
            <Text variant="headline" color="#FFFFFF">
              {deckLang === 'fil' ? 'I-swipe pataas para sa check' : 'Swipe up · One-tap check'}
            </Text>
          </PressableScale>
          {!scrollCards ? (
            <Pressable onPress={() => setStep(0)} style={styles.backStep}>
              <Text variant="caption" color={INK_SUB}>
                ← Back to Hook
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );

  const selectedChoice = picked != null ? deck.check.choices[picked] : null;
  const isCorrect = !!selectedChoice?.correct;

  const card3 = (
    <View style={[styles.cardPage, { height: pageHeight, width: pageWidth, paddingTop: topPad, paddingBottom: botPad }]}>
      <View style={[styles.cardColumn, { maxWidth: maxW }]}>
        <DeckTopBar
          step={2}
          onSelectStep={setStep}
          lang={deckLang}
          onLang={setDeckLang}
          reasonLine={reasonLine ?? `${SHORT[deck.skill_id][deckLang === 'fil' ? 'fil' : 'en']} · ~10s`}
          saved={saved}
          onSave={() => useAppStore.getState().toggleSaved(deck.card_id)}
          onDismiss={onDismiss}
        />

        <ScrollView style={styles.flex} contentContainerStyle={styles.lessonBody} showsVerticalScrollIndicator={false}>
          <Text variant="overline" color={ACCENT}>
            CARD 3 OF 3 · ONE-TAP CHECK (~10S)
          </Text>
          <Text variant="title" color={INK}>
            {pickText(deck.check.prompt, deckLang)}
          </Text>

          <View style={styles.choicesGrid}>
            {deck.check.choices.map((ch, idx) => {
              const chosen = picked === idx;
              const right = !!ch.correct;
              const reveal = picked != null && !chosen && right;
              return (
                <PressableScale
                  key={ch.text}
                  onPress={() => selectChoice(idx)}
                  disabled={picked != null}
                  accessibilityLabel={`${CHOICE_LETTERS[idx]}: ${ch.text}`}
                  style={[
                    styles.choiceBtn,
                    chosen ? (right ? styles.choiceCorrect : styles.choiceWrong) : null,
                    reveal ? styles.choiceReveal : null,
                  ]}
                >
                  <View style={[styles.letterBadge, chosen ? styles.letterBadgeChosen : null]}>
                    <Text variant="caption" color={chosen ? '#FFFFFF' : INK} style={styles.bold}>
                      {CHOICE_LETTERS[idx]}
                    </Text>
                  </View>
                  <Text variant="headline" color={chosen ? '#FFFFFF' : INK} numberOfLines={2} style={styles.flex}>
                    {ch.text}
                  </Text>
                </PressableScale>
              );
            })}
          </View>

          {picked != null ? (
            <View style={[styles.feedbackCard, isCorrect ? styles.feedbackRight : styles.feedbackWrong]}>
              <View style={styles.feedbackHead}>
                {isCorrect ? (
                  <CheckCircle size={20} weight="fill" color={SUCCESS} />
                ) : (
                  <WarningCircle size={20} weight="fill" color={DANGER} />
                )}
                <Text variant="headline" color={isCorrect ? SUCCESS : DANGER} style={styles.flex}>
                  {isCorrect
                    ? 'Quiet for 20 minutes after this!'
                    : selectedChoice?.misconception_id
                      ? `Misconception: ${selectedChoice.misconception_id}`
                      : 'Common slip'}
                </Text>
              </View>
              {!isCorrect && selectedChoice?.misconception_label ? (
                <Text variant="subhead" color={INK}>
                  {pickText(selectedChoice.misconception_label, deckLang)}
                </Text>
              ) : null}
              <Text variant="subhead" color={INK_SUB}>
                {pickText(deck.check.explanation, deckLang)}
              </Text>

              {isCorrect ? (
                <View style={styles.quietBanner}>
                  <Text variant="caption" color={SUCCESS} style={styles.bold}>
                    LEARN ONCE, SCROLL FREE · BKT MASTERY UPDATED
                  </Text>
                  <Text variant="caption" color={INK_SUB}>
                    Did you mean to scroll this long?
                  </Text>
                  <View style={styles.regretRow}>
                    <PressableScale
                      onPress={() => {
                        if (regretChoice) return;
                        setRegretChoice('yes');
                        useAppStore.getState().voteRegret(true);
                      }}
                      style={[styles.regretBtn, regretChoice === 'yes' ? styles.regretSelected : null]}
                    >
                      <Text variant="caption" color={INK}>
                        Yes
                      </Text>
                    </PressableScale>
                    <PressableScale
                      onPress={() => {
                        if (regretChoice) return;
                        setRegretChoice('no');
                        useAppStore.getState().voteRegret(false);
                      }}
                      style={[styles.regretBtn, regretChoice === 'no' ? styles.regretSelected : null]}
                    >
                      <Text variant="caption" color={INK}>
                        No, glad I reset
                      </Text>
                    </PressableScale>
                  </View>
                </View>
              ) : (
                <View style={styles.tutorRow}>
                  <PressableScale
                    onPress={() =>
                      router.push({
                        pathname: '/tutor',
                        params: { q: deck.check.question_id, a: String(picked) },
                      })
                    }
                    style={styles.tutorBtn}
                  >
                    <ChatTeardropText size={16} weight="fill" color={INK} />
                    <Text variant="subhead" color={INK} style={styles.bold}>
                      Ask Tutor
                    </Text>
                  </PressableScale>
                </View>
              )}
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.cardFooter}>
          {picked != null ? (
            <PressableScale onPress={() => finishDeck(isCorrect)} style={styles.primaryCta}>
              <ArrowUp size={18} weight="bold" color="#FFFFFF" />
              <Text variant="headline" color="#FFFFFF">
                {scrollCards
                  ? 'Done! Swipe up ↑ or tap to return'
                  : isCorrect
                    ? 'Quiet for 20 min · Done'
                    : 'Got it · Finish reset'}
              </Text>
            </PressableScale>
          ) : (
            <GuardrailRow onDismiss={onDismiss} onNotNow1h={onNotNow1h} onWindDown={onWindDown} />
          )}
          {!scrollCards ? (
            <Pressable onPress={() => setStep(1)} style={styles.backStep}>
              <Text variant="caption" color={INK_SUB}>
                ← Back to Lesson
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );

  const doneCard = (
    <View style={[styles.cardPage, { height: pageHeight, width: pageWidth, paddingTop: topPad, paddingBottom: botPad }]}>
      <View style={[styles.cardColumn, { maxWidth: maxW, justifyContent: 'center', alignItems: 'center', gap: 14 }]}>
        <CheckCircle size={48} weight="fill" color={SUCCESS} />
        <Text variant="largeTitle" color={INK} align="center">
          {isCorrect ? 'Reset complete!' : 'Nice work finishing!'}
        </Text>
        <Text variant="body" color={INK_SUB} align="center">
          Quiet mode active for {DEFAULT_QUIET_MIN} minutes.
        </Text>
        <PressableScale onPress={() => finishDeck(isCorrect)} style={styles.primaryCta}>
          <ArrowUp size={18} weight="bold" color="#FFFFFF" />
          <Text variant="headline" color="#FFFFFF">
            Return to app
          </Text>
        </PressableScale>
      </View>
    </View>
  );

  if (!scrollCards) {
    return (
      <View style={[styles.deckRoot, { height: pageHeight, width: pageWidth }]}>
        {step === 0 ? card1 : step === 1 ? card2 : card3}
      </View>
    );
  }

  return (
    <View style={[styles.deckRoot, { height: pageHeight, width: pageWidth }]}>
      <VerticalPager
        pageHeight={pageHeight}
        pageWidth={pageWidth}
        index={step}
        onIndexChange={(next) => {
          if (next >= 3) {
            finishDeck(isCorrect);
            return;
          }
          setStep(next);
        }}
        onFlickDownAtTop={onDismiss}
        mode="burst"
        controlsPosition="bottom-right"
        bottomOffset={botPad + 64}
      >
        {card1}
        {card2}
        {card3}
        {doneCard}
      </VerticalPager>
    </View>
  );
}

function DeckTopBar({
  step,
  onSelectStep,
  lang,
  onLang,
  reasonLine,
  saved,
  onSave,
  onDismiss,
}: {
  step: number;
  onSelectStep?: (i: number) => void;
  lang: DeckLang;
  onLang: (l: DeckLang) => void;
  reasonLine: string;
  saved: boolean;
  onSave: () => void;
  onDismiss?: () => void;
}) {
  return (
    <View style={styles.topBar}>
      <View style={styles.topRow}>
        <View style={styles.brandBadge}>
          <Sparkle size={12} weight="fill" color={ACCENT} />
          <Text variant="caption" color={INK} style={styles.bold}>
            LearnShift
          </Text>
        </View>
        <LangSwitch lang={lang} onChange={onLang} />
        <View style={styles.topIcons}>
          <PressableScale onPress={onSave} accessibilityLabel="Save deck" style={styles.smallIconBtn}>
            <BookmarkSimple size={16} weight="fill" color={saved ? ACCENT : INK} />
          </PressableScale>
          {onDismiss ? (
            <PressableScale onPress={onDismiss} accessibilityLabel="Dismiss" style={styles.smallIconBtn}>
              <X size={16} weight="bold" color={INK} />
            </PressableScale>
          ) : null}
        </View>
      </View>
      <View style={styles.stepMeta}>
        <Text variant="caption" color={INK_SUB} numberOfLines={1} style={styles.flex}>
          {reasonLine}
        </Text>
        <View style={styles.stepPills}>
          {[0, 1, 2].map((i) => (
            <Pressable
              key={i}
              hitSlop={8}
              onPress={() => {
                haptic.select();
                onSelectStep?.(i);
              }}
              accessibilityLabel={`Card ${i + 1} of 3`}
              style={[styles.stepPill, i === step ? styles.stepPillActive : i < step ? styles.stepPillDone : null]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function GuardrailRow({
  onDismiss,
  onNotNow1h,
  onWindDown,
}: {
  onDismiss?: () => void;
  onNotNow1h?: () => void;
  onWindDown?: () => void;
}) {
  if (!onDismiss && !onNotNow1h && !onWindDown) return null;
  return (
    <View style={styles.guardRow}>
      {onDismiss ? (
        <PressableScale onPress={onDismiss} style={styles.guardBtn} accessibilityLabel="Flick down to dismiss">
          <ArrowDown size={13} weight="bold" color={INK_SUB} />
          <Text variant="caption" color={INK_SUB}>
            Not now
          </Text>
        </PressableScale>
      ) : null}
      {onNotNow1h ? (
        <PressableScale onPress={onNotNow1h} style={styles.guardBtn} accessibilityLabel="Quiet for 1 hour">
          <Text variant="caption" color={INK_SUB}>
            Not now 1h
          </Text>
        </PressableScale>
      ) : null}
      {onWindDown ? (
        <PressableScale onPress={onWindDown} style={styles.guardBtn} accessibilityLabel="Wind down mode">
          <MoonStars size={13} weight="fill" color={INDIGO} />
          <Text variant="caption" color={INDIGO}>
            Wind-down
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

/**
 * Calm, low-arousal Deceleration Deck (Blueprint v2 Section 3.3):
 * - No counters, no likes, no red badges, dark #121212 surface
 * - 420 ms slow transitions via VerticalPager mode="decelerate"
 * - Finite end card offering to close the app or open Wind-down
 */
export function DecelerationDeckView({
  pageHeight,
  pageWidth,
  topOffset,
  onCloseApp,
  onWindDown,
  onDismiss,
}: {
  pageHeight?: number;
  pageWidth?: number;
  topOffset?: number;
  onCloseApp: () => void;
  onWindDown?: () => void;
  onDismiss?: () => void;
}) {
  const dims = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const h = pageHeight ?? dims.height;
  const w = pageWidth ?? dims.width;
  const deckLang = useAppStore((s) => s.sentinel?.deckLang ?? DEFAULT_SENTINEL.deckLang);
  const setDeckLang = useAppStore((s) => s.setDeckLang);
  const [index, setIndex] = useState(0);
  const [stars, setStars] = useState<[boolean, boolean, boolean]>([false, false, false]);
  const [tomorrowPick, setTomorrowPick] = useState<number | null>(null);

  const topPad = topOffset ?? insets.top + 16;
  const botPad = Math.max(insets.bottom, 16) + 20;
  const maxW = Math.min(w, 520);

  const toggleStar = (idx: number) => {
    setStars((prev) => {
      const next: [boolean, boolean, boolean] = [...prev] as [boolean, boolean, boolean];
      next[idx] = !next[idx];
      return next;
    });
  };

  return (
    <View style={[styles.decelRoot, { height: h, width: w }]}>
      <VerticalPager
        pageHeight={h}
        pageWidth={w}
        index={index}
        onIndexChange={(next) => setIndex(next)}
        onFlickDownAtTop={onDismiss}
        mode="decelerate"
        controlsPosition="bottom-right"
        bottomOffset={botPad + 54}
      >
        {DECELERATION_DECK.map((card, i) => (
          <DecelCardPage
            key={card.id}
            card={card}
            isLast={i === DECELERATION_DECK.length - 1}
            lang={deckLang}
            onLang={setDeckLang}
            height={h}
            width={w}
            maxW={maxW}
            topPad={topPad}
            botPad={botPad}
            stars={stars}
            onToggleStar={toggleStar}
            tomorrowPick={tomorrowPick}
            onPickTomorrow={setTomorrowPick}
            onNext={() => setIndex((k) => Math.min(DECELERATION_DECK.length - 1, k + 1))}
            onCloseApp={onCloseApp}
            onWindDown={onWindDown}
            onDismiss={onDismiss}
          />
        ))}
      </VerticalPager>
    </View>
  );
}

function DecelCardPage({
  card,
  isLast,
  lang,
  onLang,
  height,
  width,
  maxW,
  topPad,
  botPad,
  stars,
  onToggleStar,
  tomorrowPick,
  onPickTomorrow,
  onNext,
  onCloseApp,
  onWindDown,
  onDismiss,
}: {
  card: DecelerationCard;
  isLast: boolean;
  lang: DeckLang;
  onLang: (l: DeckLang) => void;
  height: number;
  width: number;
  maxW: number;
  topPad: number;
  botPad: number;
  stars: [boolean, boolean, boolean];
  onToggleStar: (idx: number) => void;
  tomorrowPick: number | null;
  onPickTomorrow: (idx: number) => void;
  onNext: () => void;
  onCloseApp: () => void;
  onWindDown?: () => void;
  onDismiss?: () => void;
}) {
  const starPts: [number, number][] = [
    [130, 30],
    [54, 126],
    [206, 126],
  ];

  return (
    <View style={[styles.cardPage, { height, width, paddingTop: topPad, paddingBottom: botPad }]}>
      <View style={[styles.cardColumn, { maxWidth: maxW }]}>
        <View style={styles.topRow}>
          <View style={styles.decelBadge}>
            <MoonStars size={13} weight="fill" color={INDIGO} />
            <Text variant="caption" color={INK_SUB}>
              Deceleration Deck
            </Text>
          </View>
          <LangSwitch lang={lang} onChange={onLang} />
          {onDismiss ? (
            <PressableScale onPress={onDismiss} accessibilityLabel="Dismiss" style={styles.smallIconBtn}>
              <X size={16} weight="bold" color={INK_SUB} />
            </PressableScale>
          ) : null}
        </View>

        <View style={styles.decelBody}>
          <Text variant="overline" color={INDIGO}>
            {pickText(card.eyebrow, lang)}
          </Text>
          <Text variant="largeTitle" color={INK} style={styles.decelTitle}>
            {pickText(card.title, lang)}
          </Text>
          <Text variant="body" color={INK_SUB} style={styles.decelCopy}>
            {pickText(card.body, lang)}
          </Text>

          {card.kind === 'puzzle' ? (
            <View style={styles.puzzleCard}>
              <Svg width={260} height={156}>
                {stars[0] && stars[1] ? (
                  <Line x1={130} y1={30} x2={54} y2={126} stroke={INDIGO} strokeWidth={2} strokeDasharray="4 4" />
                ) : null}
                {stars[1] && stars[2] ? (
                  <Line x1={54} y1={126} x2={206} y2={126} stroke={INDIGO} strokeWidth={2} strokeDasharray="4 4" />
                ) : null}
                {stars[0] && stars[2] ? (
                  <Line x1={206} y1={126} x2={130} y2={30} stroke={INDIGO} strokeWidth={2} strokeDasharray="4 4" />
                ) : null}
                {starPts.map(([cx, cy], idx) => (
                  <Circle
                    key={idx}
                    cx={cx}
                    cy={cy}
                    r={stars[idx] ? 12 : 9}
                    fill={stars[idx] ? INDIGO : 'rgba(17,17,17,0.14)'}
                  />
                ))}
              </Svg>
              <View style={styles.starBtns}>
                {[0, 1, 2].map((idx) => (
                  <PressableScale
                    key={idx}
                    onPress={() => onToggleStar(idx)}
                    style={[styles.starChip, stars[idx] ? styles.starChipOn : null]}
                  >
                    <Text variant="caption" color={stars[idx] ? '#FFFFFF' : INK_SUB}>
                      Star {idx + 1}
                    </Text>
                  </PressableScale>
                ))}
              </View>
              {card.note ? (
                <Text variant="caption" color={INK_SUB}>
                  {pickText(card.note, lang)}
                </Text>
              ) : null}
            </View>
          ) : null}

          {card.kind === 'tomorrow' && card.options ? (
            <View style={styles.tomorrowList}>
              {card.options.map((opt, idx) => {
                const active = tomorrowPick === idx;
                return (
                  <PressableScale
                    key={idx}
                    onPress={() => onPickTomorrow(idx)}
                    style={[styles.tomorrowOpt, active ? styles.tomorrowOptActive : null]}
                  >
                    <CheckCircle size={18} weight={active ? 'fill' : 'regular'} color={active ? INDIGO : INK_SUB} />
                    <Text variant="subhead" color={INK} style={styles.flex}>
                      {pickText(opt, lang)}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
          ) : null}
        </View>

        <View style={styles.cardFooter}>
          {isLast ? (
            <View style={styles.endActions}>
              <PillButton label="Close and rest" size="lg" block onPress={onCloseApp} />
              {onWindDown ? (
                <PillButton label="Open Wind-down" kind="neutral" size="md" block onPress={onWindDown} />
              ) : null}
            </View>
          ) : (
            <PressableScale onPress={onNext} style={styles.decelNext}>
              <Text variant="subhead" color={INK_SUB}>
                Swipe slowly for next card
              </Text>
            </PressableScale>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  deckRoot: { backgroundColor: SURFACE },
  decelRoot: { backgroundColor: SURFACE },
  cardPage: {
    backgroundColor: SURFACE,
    paddingHorizontal: space.screen,
    alignItems: 'center',
  },
  cardColumn: {
    flex: 1,
    width: '100%',
    justifyContent: 'space-between',
    gap: 14,
  },
  topBar: { gap: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  brandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(17,17,17,0.06)',
    paddingHorizontal: 10,
    height: 28,
    borderRadius: radius.pill,
  },
  decelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(91,87,214,0.12)',
    paddingHorizontal: 10,
    height: 28,
    borderRadius: radius.pill,
  },
  langRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(17,17,17,0.06)',
    borderRadius: radius.pill,
    padding: 2,
    gap: 2,
  },
  langChip: {
    paddingHorizontal: 8,
    height: 24,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langChipActive: { backgroundColor: ACCENT },
  topIcons: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  smallIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(17,17,17,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepPills: { flexDirection: 'row', gap: 4 },
  stepPill: { width: 16, height: 4, borderRadius: 2, backgroundColor: 'rgba(17,17,17,0.14)' },
  stepPillDone: { backgroundColor: 'rgba(200,64,15,0.45)' },
  stepPillActive: { width: 26, backgroundColor: ACCENT },
  heroCenter: { flex: 1, justifyContent: 'center', gap: 14, paddingRight: 44 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hookText: { fontSize: 28, lineHeight: 34 },
  lessonBody: { gap: 12, paddingRight: 44, paddingBottom: 12 },
  diagramBox: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radius.card,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  stepsCol: { gap: 8 },
  stepBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: CARD_BG,
    padding: 12,
    borderRadius: radius.inset,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  contrastWrap: {
    backgroundColor: 'rgba(200,64,15,0.07)',
    borderRadius: radius.inset,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(200,64,15,0.22)',
    gap: 8,
  },
  contrastToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  contrastBody: { gap: 4 },
  provenanceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  choicesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  choiceBtn: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 54,
    borderRadius: radius.inset,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  choiceCorrect: { backgroundColor: SUCCESS, borderColor: SUCCESS },
  choiceWrong: { backgroundColor: DANGER, borderColor: DANGER },
  choiceReveal: { borderWidth: 2, borderColor: SUCCESS },
  letterBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(17,17,17,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterBadgeChosen: { backgroundColor: 'rgba(255,255,255,0.28)' },
  feedbackCard: {
    borderRadius: radius.inset,
    padding: 12,
    gap: 6,
    borderWidth: 1,
  },
  feedbackRight: { backgroundColor: 'rgba(47,191,91,0.10)', borderColor: 'rgba(47,191,91,0.4)' },
  feedbackWrong: { backgroundColor: 'rgba(229,72,77,0.10)', borderColor: 'rgba(229,72,77,0.4)' },
  feedbackHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quietBanner: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(17,17,17,0.08)',
    gap: 6,
  },
  regretRow: { flexDirection: 'row', gap: 8 },
  regretBtn: {
    paddingHorizontal: 12,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(17,17,17,0.06)',
    justifyContent: 'center',
  },
  regretSelected: { borderWidth: 1, borderColor: SUCCESS, backgroundColor: 'rgba(47,191,91,0.16)' },
  tutorRow: { flexDirection: 'row', marginTop: 4 },
  tutorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(17,17,17,0.08)',
  },
  cardFooter: { gap: 8 },
  primaryCta: {
    height: 50,
    borderRadius: radius.pill,
    backgroundColor: ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  guardRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  guardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(17,17,17,0.06)',
  },
  backStep: { alignSelf: 'center', paddingVertical: 4 },
  decelBody: { flex: 1, justifyContent: 'center', gap: 14, paddingRight: 40 },
  decelTitle: { fontSize: 26, lineHeight: 33 },
  decelCopy: { fontSize: 16, lineHeight: 23 },
  puzzleCard: {
    alignItems: 'center',
    gap: 10,
    backgroundColor: CARD_BG,
    borderRadius: radius.card,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(91,87,214,0.22)',
  },
  starBtns: { flexDirection: 'row', gap: 8 },
  starChip: {
    paddingHorizontal: 12,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(17,17,17,0.06)',
    justifyContent: 'center',
  },
  starChipOn: { backgroundColor: INDIGO },
  tomorrowList: { gap: 8 },
  tomorrowOpt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: CARD_BG,
    borderRadius: radius.inset,
    padding: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  tomorrowOptActive: { borderColor: INDIGO, backgroundColor: 'rgba(91,87,214,0.10)' },
  decelNext: {
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(17,17,17,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endActions: { gap: 10 },
});
