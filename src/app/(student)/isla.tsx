import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretLeft, CheckCircle, Confetti, Hammer, HandPointing, LockSimple, Question } from 'phosphor-react-native';

import { IslaBackdrop } from '@/components/isla/IslaBackdrop';
import { BuildingThumb, IslaScene, useLoop } from '@/components/isla/IslaScene';
import { BottomSheet, Card, CoinCounter, IconButton, NavBar, PillButton, ProgressBar, Text } from '@/components/ui';
import { BUILDINGS, type BuildingId } from '@/data/seed';
import { haptic } from '@/design/haptics';
import { spring } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { useL, useT } from '@/i18n/useT';
import { useAppStore } from '@/store/useAppStore';

export default function Isla() {
  const { c, isNight } = useTheme();
  const t = useT();
  const L = useL();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const coins = useAppStore((s) => s.coins);
  const built = useAppStore((s) => s.built);
  const [sheet, setSheet] = useState(false);
  const [info, setInfo] = useState<BuildingId | null>(null);
  const [fresh, setFresh] = useState<BuildingId | null>(null);
  const [poke, setPoke] = useState<{ id: BuildingId; n: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [horizon, setHorizon] = useState(height * 0.42);
  const sceneW = Math.min(width, 640);
  const sceneH = (sceneW * 286) / 420;

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const next = BUILDINGS.find((b) => b.unlockAt > coins);
  const prevAt = [...BUILDINGS].reverse().find((b) => b.unlockAt <= coins)?.unlockAt ?? 0;
  const infoB = BUILDINGS.find((b) => b.id === info);
  const ready = BUILDINGS.filter((b) => coins >= b.unlockAt && !built.includes(b.id));
  const site = BUILDINGS.find((b) => !built.includes(b.id));
  const textOnSky = isNight ? '#F3EEE6' : '#1B2A33';
  const subOnSky = isNight ? 'rgba(243,238,230,0.75)' : 'rgba(27,42,51,0.7)';

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <IslaBackdrop horizon={horizon} width={width} height={height} />
      <View style={{ paddingTop: insets.top }}>
        <NavBar
          onBack={() => router.back()}
          backIcon={<CaretLeft size={20} weight="bold" color={c.text} />}
          backLabel={t.common.back}
          right={
            <>
              <CoinCounter value={coins} />
              <IconButton
                icon={<Question size={20} weight="bold" color={c.text} />}
                accessibilityLabel={t.isla.how}
                onPress={() => router.push('/isla-how')}
              />
            </>
          }
        />
        <Text variant="largeTitle" style={styles.title} color={textOnSky}>
          {t.isla.title}
        </Text>
        <Text variant="subhead" style={styles.sub} color={subOnSky}>
          {t.isla.progress(built.length, BUILDINGS.length)}
        </Text>
      </View>

      <View
        style={styles.scene}
        onLayout={(e) => {
          const { y, height: h } = e.nativeEvent.layout;
          setHorizon(y + Math.max(0, (h - sceneH) / 2) + sceneH * 0.2);
        }}
      >
        <IslaScene
          built={built}
          width={sceneW}
          interactive
          fresh={fresh}
          nextId={site?.id}
          poke={poke}
          onBuildingPress={(id) => {
            haptic.select();
            setPoke((p) => ({ id, n: (p?.n ?? 0) + 1 }));
            setInfo(id);
          }}
        />
        <View style={[styles.hint, { backgroundColor: isNight ? 'rgba(13,16,32,0.55)' : 'rgba(255,255,255,0.78)' }]}>
          <HandPointing size={14} weight="bold" color={isNight ? '#F3EEE6' : '#1B2A33'} />
          <Text variant="caption" color={isNight ? '#F3EEE6' : '#1B2A33'}>
            {t.isla.hint}
          </Text>
        </View>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        {next ? (
          <Card style={styles.nextCard}>
            <View style={[styles.thumbWell, { backgroundColor: c.inset }]}>
              <BuildingThumb id={next.id} size={52} locked />
              <View style={[styles.lock, { backgroundColor: c.card }]}>
                <LockSimple size={11} weight="fill" color={c.textSecondary} />
              </View>
            </View>
            <View style={styles.flexGap}>
              <View style={styles.rowBetween}>
                <Text variant="headline" numberOfLines={1} style={styles.flex}>
                  {t.how.next(L(next.name))}
                </Text>
                <Text variant="subhead" tabular>
                  {coins.toLocaleString('en-US')} / {next.unlockAt.toLocaleString('en-US')}
                </Text>
              </View>
              <ProgressBar progress={(coins - prevAt) / (next.unlockAt - prevAt)} color={c.spark} />
              <Text variant="caption" numberOfLines={1}>
                {t.isla.earnedBy}: {L(next.earnedBy)}
              </Text>
            </View>
          </Card>
        ) : (
          <Card style={styles.nextCard}>
            <View style={[styles.thumbWell, { backgroundColor: c.accentTint }]}>
              <Confetti size={26} weight="fill" color={c.accent} />
            </View>
            <Text variant="headline" style={styles.flex}>
              {t.isla.complete}
            </Text>
          </Card>
        )}
        <View style={styles.row}>
          <BuildButton
            label={ready.length ? `${t.isla.build} · ${ready.length}` : `+ ${t.isla.build}`}
            glow={ready.length > 0}
            onPress={() => setSheet(true)}
          />
          <PillButton
            label={t.isla.how}
            kind="secondary"
            size="lg"
            style={styles.flex}
            block
            onPress={() => router.push('/isla-how')}
          />
        </View>
      </View>

      {toast ? <Toast text={toast} top={insets.top + 64} /> : null}

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} accessibilityLabel={t.isla.sheet}>
        <View style={styles.sheetHead}>
          <Text variant="title">{t.isla.sheet}</Text>
          <Text variant="subhead">{t.isla.sheetSub}</Text>
        </View>
        <ScrollView style={styles.list} contentContainerStyle={styles.gap}>
          {BUILDINGS.map((b) => {
            const isBuilt = built.includes(b.id);
            const unlocked = coins >= b.unlockAt;
            return (
              <View
                key={b.id}
                style={[
                  styles.buildRow,
                  { backgroundColor: c.inset },
                  unlocked && !isBuilt ? { borderColor: c.spark, borderWidth: 2 } : null,
                ]}
              >
                <View style={[styles.rowThumb, { backgroundColor: c.card }]}>
                  <BuildingThumb id={b.id} size={48} locked={!unlocked} />
                </View>
                <View style={styles.flex}>
                  <Text variant="headline">{L(b.name)}</Text>
                  <Text variant="caption">
                    {t.isla.earnedBy}: {L(b.earnedBy)}
                  </Text>
                </View>
                {isBuilt ? (
                  <View style={styles.status}>
                    <CheckCircle size={18} weight="fill" color={c.success} />
                    <Text variant="subhead" color="success">
                      {t.isla.built}
                    </Text>
                  </View>
                ) : unlocked ? (
                  <PillButton
                    label={t.isla.buildIt}
                    size="sm"
                    icon={<Hammer size={14} weight="fill" color={c.onAccent} />}
                    onPress={() => {
                      haptic.success();
                      useAppStore.getState().build(b.id);
                      setSheet(false);
                      setFresh(b.id);
                      setToast(t.isla.newBuilt(L(b.name)));
                    }}
                  />
                ) : (
                  <View style={styles.status}>
                    <LockSimple size={16} weight="fill" color={c.textTertiary} />
                    <Text variant="subhead" color="textTertiary">
                      {t.isla.notYet(b.unlockAt - coins)}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      </BottomSheet>

      <BottomSheet visible={!!info} onClose={() => setInfo(null)} accessibilityLabel={infoB ? L(infoB.name) : ''}>
        {infoB ? (
          <View style={styles.infoBody}>
            <View style={[styles.infoArt, { backgroundColor: c.inset }]}>
              <Bobbing>
                <BuildingThumb id={infoB.id} size={132} />
              </Bobbing>
            </View>
            <Text variant="title">{L(infoB.name)}</Text>
            <Text variant="overline">{t.isla.earnedBy}</Text>
            <Text variant="headline" color="accent">
              {L(infoB.earnedBy)}
            </Text>
            <PillButton label={t.common.close} kind="secondary" block onPress={() => setInfo(null)} />
          </View>
        ) : null}
      </BottomSheet>
    </View>
  );
}

/** Primary build button; breathes when something is ready to build. */
function BuildButton({ label, glow, onPress }: { label: string; glow: boolean; onPress: () => void }) {
  const t = useLoop(1200, 0, true, glow);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + t.get() * 0.03 }] }));
  return (
    <Animated.View style={[styles.flex, style]}>
      <PillButton label={label} size="lg" block onPress={onPress} />
    </Animated.View>
  );
}

function Bobbing({ children }: { children: React.ReactNode }) {
  const t = useLoop(1800);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -6 * t.get() }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

function Toast({ text, top }: { text: string; top: number }) {
  const { c } = useTheme();
  const y = useSharedValue(-20);
  const s = useSharedValue(0.9);
  useEffect(() => {
    y.set(withSpring(0, spring.bouncy));
    s.set(withSequence(withTiming(1.06, { duration: 180 }), withSpring(1, spring.bouncy)));
  }, [y, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }, { scale: s.get() }] }));
  return (
    <Animated.View style={[styles.toast, { backgroundColor: c.tileDark, top }, style]} pointerEvents="none">
      <Confetti size={16} weight="fill" color={c.spark} />
      <Text variant="subhead" color={c.tileDarkText}>
        {text}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  flex: { flex: 1 },
  flexGap: { flex: 1, gap: 8 },
  title: { paddingHorizontal: space.screen },
  sub: { paddingHorizontal: space.screen, marginTop: 2 },
  scene: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 6 },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  bottom: { paddingHorizontal: space.screen, gap: space.gap, width: '100%', maxWidth: 560, alignSelf: 'center' },
  nextCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  thumbWell: { width: 60, height: 60, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  lock: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gap: { gap: 10 },
  row: { flexDirection: 'row', gap: space.gap },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  sheetHead: { gap: 2, marginBottom: 12 },
  list: { maxHeight: 420 },
  buildRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.inset },
  rowThumb: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoBody: { gap: 8, paddingBottom: 8 },
  infoArt: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.inset, paddingVertical: 12, marginBottom: 6 },
});
