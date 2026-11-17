import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MoonStars, Play, Sparkle, X } from 'phosphor-react-native';

import { DecelerationDeckView, MicroDeckView } from '@/components/student/MicroDeckView';
import { VerticalPager } from '@/components/student/VerticalPager';
import { Paty } from '@/components/mascot/Paty';
import { IconButton, PillButton, ProgressBar, Text } from '@/components/ui';
import { pickMicroDecks, type MicroDeck } from '@/data/decks';
import { SHORT } from '@/data/skills';
import { haptic } from '@/design/haptics';
import { ThemeProvider } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { useLive } from '@/hooks/useLive';
import { stringsFor, useLang } from '@/i18n/useT';
import { MAX_DECKS_PER_DAY } from '@/services/sentinel';
import { DEFAULT_SENTINEL, todayKey, useAppStore } from '@/store/useAppStore';

const BG = '#F6F5F2';

type FeedMode = 'micro' | 'decel';

export default function Feed() {
  return (
    <ThemeProvider mode="day">
      <FeedScreen />
    </ThemeProvider>
  );
}

function FeedScreen() {
  const appLang = useLang();
  const t = stringsFor(appLang);
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const { mode: initialModeParam } = useLocalSearchParams<{ mode?: string }>();
  const live = useLive();

  const sentinel = useAppStore((s) => s.sentinel ?? DEFAULT_SENTINEL);
  const today = todayKey();
  const decksToday = sentinel.day === today ? sentinel.decksToday : 0;

  const [mode, setMode] = useState<FeedMode>(() =>
    initialModeParam === 'decel' || live.risk.lateNight ? 'decel' : 'micro',
  );
  const [page, setPage] = useState(0);

  // Finite by design: only up to today's remaining daily cap of 5 decks, then Done for Today.
  const [decks] = useState<MicroDeck[]>(() => {
    const remaining = Math.max(0, MAX_DECKS_PER_DAY - decksToday);
    return remaining > 0 ? pickMicroDecks(live.root, remaining) : [];
  });

  const [seenIds, setSeenIds] = useState<string[]>([]);

  const markSeen = (idx: number) => {
    const deck = decks[idx];
    if (!deck || seenIds.includes(deck.card_id)) return;
    setSeenIds((prev) => [...prev, deck.card_id]);
    useAppStore.getState().addFeedMinutes(1.5);
  };

  const handleIndexChange = (nextIdx: number) => {
    setPage(nextIdx);
    useAppStore.getState().recordSwipe(1);
    markSeen(nextIdx);
  };

  const handleDeckComplete = () => {
    setPage((p) => Math.min(decks.length, p + 1));
  };

  const headerTop = insets.top + 8;
  const contentTopOffset = mode === 'micro' ? insets.top + 96 : insets.top + 60;

  return (
    <View style={[styles.root, { backgroundColor: BG }]}>
      {mode === 'micro' ? (
        <VerticalPager
          pageHeight={height}
          pageWidth={width}
          index={page}
          onIndexChange={handleIndexChange}
          mode="burst"
          controlsPosition="bottom-right"
          bottomOffset={Math.max(insets.bottom, 16) + 92}
        >
          {decks.map((deck, idx) => (
            <MicroDeckView
              key={deck.card_id}
              deck={deck}
              pageHeight={height}
              pageWidth={width}
              scrollCards={false}
              topOffset={contentTopOffset}
              reasonLine={`Deck ${idx + 1} of ${decks.length} · ${SHORT[deck.skill_id].en}`}
              onComplete={handleDeckComplete}
              onNotNow1h={() => {
                useAppStore.getState().snoozeOneHour();
                router.back();
              }}
              onWindDown={() => setMode('decel')}
            />
          ))}
          <EndPage
            height={height}
            decksToday={decksToday}
            onSimulate={() => router.push('/simulate')}
            onBack={() => router.back()}
            endTitle={t.feed.endTitle}
            endSub={t.feed.endSub}
            endBack={t.feed.endBack}
          />
        </VerticalPager>
      ) : (
        <DecelerationDeckView
          pageHeight={height}
          pageWidth={width}
          topOffset={contentTopOffset}
          onCloseApp={() => router.back()}
          onWindDown={() => router.push('/winddown')}
        />
      )}

      {/* Floating top controls */}
      <View style={[styles.top, { paddingTop: headerTop }]} pointerEvents="box-none">
        <View style={styles.topRow}>
          <IconButton
            tone="card"
            icon={<X size={18} weight="bold" color="#111111" />}
            accessibilityLabel={t.common.close}
            onPress={() => router.back()}
          />
          <View style={styles.modeSwitch}>
            <Pressable
              onPress={() => {
                haptic.select();
                setMode('micro');
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === 'micro' }}
              style={[styles.modeBtn, mode === 'micro' ? styles.modeBtnActive : null]}
            >
              <Sparkle size={13} weight="fill" color={mode === 'micro' ? '#FFFFFF' : '#5C5C62'} />
              <Text variant="caption" color={mode === 'micro' ? '#FFFFFF' : '#111111'} style={styles.bold}>
                3-Card Swipe Feed
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                haptic.select();
                setMode('decel');
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === 'decel' }}
              style={[styles.modeBtn, mode === 'decel' ? styles.modeBtnDecel : null]}
            >
              <MoonStars size={13} weight="fill" color={mode === 'decel' ? '#FFFFFF' : '#5C5C62'} />
              <Text variant="caption" color={mode === 'decel' ? '#FFFFFF' : '#111111'} style={styles.bold}>
                Deceleration
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Daily finite cap indicator (hidden in calm Deceleration mode per Blueprint v2 §3.3) */}
        {mode === 'micro' ? (
          <View style={styles.capRow}>
            <Text variant="caption" color="#5C5C62" tabular>
              {Math.min(MAX_DECKS_PER_DAY, decksToday)} of {MAX_DECKS_PER_DAY} decks today
            </Text>
            <ProgressBar
              progress={Math.min(1, decksToday / MAX_DECKS_PER_DAY)}
              color="#C8400F"
              height={5}
              style={styles.track}
              accessibilityLabel={`${decksToday} of ${MAX_DECKS_PER_DAY} decks today`}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function EndPage({
  height,
  decksToday,
  onSimulate,
  onBack,
  endTitle,
  endSub,
  endBack,
}: {
  height: number;
  decksToday: number;
  onSimulate: () => void;
  onBack: () => void;
  endTitle: string;
  endSub: string;
  endBack: string;
}) {
  return (
    <View style={[styles.end, { height }]}>
      <Paty expression="waving" size={160} />
      <Text variant="largeTitle" color="#111111" align="center">
        {decksToday >= MAX_DECKS_PER_DAY ? 'Done for today' : endTitle}
      </Text>
      <Text variant="body" color="#5C5C62" align="center" style={styles.endSub}>
        {decksToday >= MAX_DECKS_PER_DAY
          ? 'Learn once, scroll free · 5 decks max per day. No streaks, no guilt.'
          : `${endSub} · Learn once, scroll free.`}
      </Text>
      <View style={styles.endActions}>
        <PillButton
          label="Open Live Overlay Guard"
          size="lg"
          block
          icon={<Play size={16} weight="fill" color="#FFFFFF" />}
          onPress={onSimulate}
        />
        <PillButton label={endBack} kind="neutral" size="md" block onPress={onBack} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bold: { fontWeight: '700' },
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: space.screen,
    gap: 8,
    zIndex: 30,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modeSwitch: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(17,17,17,0.09)',
    borderRadius: radius.pill,
    padding: 3,
    gap: 4,
    maxWidth: 320,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 30,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
  },
  modeBtnActive: { backgroundColor: '#C8400F' },
  modeBtnDecel: { backgroundColor: '#5B57D6' },
  capRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 48,
    maxWidth: 420,
  },
  track: { flex: 1, backgroundColor: 'rgba(17,17,17,0.12)' },
  end: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: space.screen,
  },
  endSub: { maxWidth: 340 },
  endActions: {
    width: '100%',
    maxWidth: 340,
    gap: 10,
    marginTop: 16,
  },
});
