import { useEffect, useState } from 'react';
import { AppState, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CaretLeft,
  Compass,
  DownloadSimple,
  Eye,
  ShieldCheck,
  Sparkle,
  WarningCircle,
} from '@/components/ui/icons';

import {
  Card,
  Chip,
  IconButton,
  ListGroup,
  ListRow,
  NavBar,
  Notice,
  PillButton,
  PressableScale,
  ProgressBar,
  Stagger,
  Text,
  Toggle,
} from '@/components/ui';
import { haptic } from '@/design/haptics';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { fontFor } from '@/design/typography';
import { openBatterySettings, openOverlaySettings, openScrollSettings, requestAccess, status as monitorStatus } from '@/services/monitor';
import {
  exportPilotCsv,
  getMirrorStatus,
  NEUTRAL_SEEDS,
  OFFLINE_DECELERATION_CARDS,
  openNeutralSeedUrl,
  openOemAutostartSettings,
  provisionWorkProfile,
  setMirrorAuto,
  setSmartStudyGuard,
  triggerMirrorIntervention,
  type MirrorStatus,
} from '@/services/monitor/mirror';

type StrategyMode = 'ANTI_FEED' | 'SENSORY_DECAY' | 'DEJA_VU_LOOP';

export default function MirrorAppScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<MirrorStatus>(() => getMirrorStatus());
  const [perms, setPerms] = useState(() => monitorStatus());
  const [notice, setNotice] = useState<string | null>(null);
  const [deckVisible, setDeckVisible] = useState(false);
  const [deckMode, setDeckMode] = useState<StrategyMode>('SENSORY_DECAY');
  const [cardIdx, setCardIdx] = useState(0);

  const refresh = () => {
    setStatus(getMirrorStatus());
    setPerms(monitorStatus());
  };

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    const timer = setInterval(refresh, 3000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, []);

  const wpLabel =
    status.workProfileStatus === 'ACTIVE_AND_READY'
      ? 'Active & Ready'
      : status.workProfileStatus === 'CAN_PROVISION'
        ? 'Ready to Create'
        : 'Fallback Mode Active';

  const tierText = status.tierAReady
    ? 'Tier A · Isolated Neutral Work-Profile App'
    : 'Tier C · 60 FPS Low-Stimulation Deceleration Deck';

  const deckCards =
    deckMode === 'DEJA_VU_LOOP'
      ? [...OFFLINE_DECELERATION_CARDS.slice(0, 2), ...OFFLINE_DECELERATION_CARDS.slice(0, 2)]
      : [...OFFLINE_DECELERATION_CARDS];

  const handleTestShift = () => {
    haptic.select();
    if (status.nativeSupported) {
      const tier = triggerMirrorIntervention('com.zhiliaoapp.musically');
      setNotice(`Dispatched ${tier ?? 'Mirror Shift'}`);
      refresh();
      return;
    }
    setCardIdx(0);
    setDeckVisible(true);
  };

  return (
    <View style={[styles.root, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      <NavBar
        onBack={() => router.back()}
        backIcon={<CaretLeft size={20} weight="bold" color={c.text} />}
        title="Attention Mirror"
        right={<Chip label={status.tierAReady ? 'Tier A' : 'Tier C'} kind="tinted" />}
      />

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 36 }]}>
        <Stagger index={0}>
          <Card style={styles.heroCard}>
            <View style={styles.rowBetween}>
              <View style={[styles.badge, { backgroundColor: c.accentTint }]}>
                <Eye size={24} weight="fill" color={c.accent} />
              </View>
              <View style={styles.flex}>
                <Text variant="title">Interest-Redirect Mirror</Text>
                <Text variant="subhead">
                  Redirects high-stimulation feeds to a calm Neutral Space or 60 FPS low-dopamine deceleration deck.
                </Text>
              </View>
            </View>
            <View style={[styles.tierPill, { backgroundColor: c.inset }]}>
              <Text variant="caption" color="accent" style={fontFor(700)}>
                {tierText}
              </Text>
            </View>
            <View style={styles.metricsRow}>
              <View style={[styles.metricBox, { backgroundColor: c.inset }]}>
                <Text variant="overline">Scroll cadence</Text>
                <Text variant="title">{status.swipesPerMin}/m</Text>
              </View>
              <View style={[styles.metricBox, { backgroundColor: c.inset }]}>
                <Text variant="overline">Risk score</Text>
                <Text variant="title">{Math.round(status.riskScore * 100)}%</Text>
              </View>
              <View style={[styles.metricBox, { backgroundColor: c.inset }]}>
                <Text variant="overline">Work profile</Text>
                <Text variant="subhead" color="text" numberOfLines={1}>
                  {wpLabel}
                </Text>
              </View>
            </View>
            <ProgressBar progress={status.riskScore} color={status.riskScore >= 0.75 ? c.danger : c.accent} />
          </Card>
        </Stagger>

        {notice ? <Notice text={notice} tone="success" /> : null}

        <Stagger index={1}>
          <Card style={styles.gap}>
            <View style={styles.rowBetween}>
              <View style={styles.flex}>
                <Text variant="headline">Auto-shift on doomscroll</Text>
                <Text variant="caption">
                  When risk &gt; 75%, seamlessly switch into Neutral Space or launch the Low-Stimulation Deck.
                </Text>
              </View>
              <Toggle
                value={status.mirrorAutoEnabled}
                onChange={(v) => {
                  haptic.select();
                  setMirrorAuto(v);
                  setStatus((s) => ({ ...s, mirrorAutoEnabled: v }));
                }}
                accessibilityLabel="Auto-shift on doomscroll"
              />
            </View>

            <View style={styles.rowBetween}>
              <View style={styles.flex}>
                <Text variant="headline">Smart Study Guard (1-frame RAM)</Text>
                <Text variant="caption">
                  Opt-in on-device equation check (&lt; 50ms wipe, zero disk storage) pauses shifts during study videos.
                </Text>
              </View>
              <Toggle
                value={status.studyGuardEnabled}
                onChange={(v) => {
                  void setSmartStudyGuard(v).then((ok) => {
                    setNotice(ok ? 'Smart Study Guard active (RAM-only).' : 'Smart Study Guard off.');
                    refresh();
                  });
                }}
                accessibilityLabel="Smart Study Guard"
              />
            </View>
          </Card>
        </Stagger>

        <Stagger index={2}>
          <Card style={styles.gap}>
            <Text variant="title">Setup & Isolation</Text>
            <ListGroup>
              <ListRow
                title="1. LearnShift Neutral Work Profile"
                value={wpLabel}
                icon={<ShieldCheck size={20} weight="fill" color={status.workProfileStatus === 'ACTIVE_AND_READY' ? c.success : c.accent} />}
                onPress={() => {
                  if (status.workProfileStatus === 'ACTIVE_AND_READY') {
                    setNotice('LearnShift Neutral Work Profile is already active.');
                    return;
                  }
                  const started = provisionWorkProfile();
                  if (!started) {
                    setNotice('Managed Work Profile unavailable on this device — Tier C Low-RAM Deck handles deceleration automatically.');
                  }
                }}
              />
              <ListRow
                title="2. Usage Access permission"
                value={perms.access ? 'On' : 'Enable'}
                icon={<ShieldCheck size={20} weight="fill" color={perms.access ? c.success : c.accent} />}
                onPress={() => void requestAccess()}
              />
              <ListRow
                title="3. Scroll pattern sentinel"
                value={perms.scrollAccess ? 'On' : 'Enable'}
                icon={<ShieldCheck size={20} color={perms.scrollAccess ? c.success : c.accent} />}
                onPress={openScrollSettings}
              />
              <ListRow
                title="4. Overlay status pill"
                value={perms.overlay ? 'On' : 'Enable'}
                icon={<ShieldCheck size={20} color={perms.overlay ? c.success : c.accent} />}
                onPress={openOverlaySettings}
              />
              <ListRow
                title="5. OEM Battery & Autostart exemption"
                value={status.batteryExempt ? 'Safe' : 'Fix'}
                icon={<WarningCircle size={20} color={status.batteryExempt ? c.success : c.warning} />}
                onPress={() => {
                  openBatterySettings();
                  openOemAutostartSettings();
                }}
              />
            </ListGroup>
          </Card>
        </Stagger>

        <Stagger index={3}>
          <Card style={styles.gap}>
            <Text variant="title">Train Neutral Algorithm</Text>
            <Text variant="subhead">
              Open calm, low-dopamine lectures in Neutral Space to intentionally steer watch interest downward.
            </Text>
            <View style={styles.seedWrap}>
              {NEUTRAL_SEEDS.map((seed) => (
                <PressableScale
                  key={seed.id}
                  onPress={() => openNeutralSeedUrl(seed.youtubeUrl)}
                  style={[styles.seedPill, { backgroundColor: c.inset }]}
                >
                  <Compass size={15} weight="fill" color={c.accent} />
                  <Text variant="caption" color="text">
                    {seed.label}
                  </Text>
                </PressableScale>
              ))}
            </View>
          </Card>
        </Stagger>

        <Stagger index={4} style={styles.actionsGap}>
          <PillButton
            label={status.nativeSupported ? 'Test Mirror Shift (Tier A / Tier C)' : 'Launch Low-Stimulation Deck'}
            icon={<Sparkle size={18} weight="fill" color={c.onAccent} />}
            block
            size="lg"
            onPress={handleTestShift}
          />
          <PillButton
            label="Preview In-App Sensory Decay Deck"
            kind="secondary"
            block
            onPress={() => {
              setCardIdx(0);
              setDeckVisible(true);
            }}
          />
          {status.nativeSupported ? (
            <PillButton
              label="Export Anonymized Pilot CSV"
              kind="neutral"
              icon={<DownloadSimple size={18} weight="bold" color={c.text} />}
              block
              onPress={() => {
                void exportPilotCsv().then((path) => {
                  if (path) setNotice(`Exported CSV to ${path}`);
                });
              }}
            />
          ) : null}
        </Stagger>
      </ScrollView>

      <Modal visible={deckVisible} animationType="slide" onRequestClose={() => setDeckVisible(false)}>
        <View
          style={[
            styles.deckRoot,
            {
              paddingTop: insets.top + 14,
              paddingBottom: insets.bottom + 24,
              opacity: deckMode === 'SENSORY_DECAY' ? Math.max(0.62, 1 - cardIdx * 0.12) : 1,
            },
          ]}
        >
          <View style={styles.deckTop}>
            <View style={styles.pillBar}>
              <Text variant="caption" color="#E0E0E0">
                Low-Stimulation Deceleration · Card {cardIdx + 1}/{deckCards.length}
              </Text>
            </View>
            <IconButton
              kind="close"
              tone="glass"
              size={36}
              accessibilityLabel="Close deceleration deck"
              onPress={() => setDeckVisible(false)}
            />
          </View>

          <View style={styles.modeRow}>
            {(['SENSORY_DECAY', 'ANTI_FEED', 'DEJA_VU_LOOP'] as StrategyMode[]).map((m) => (
              <Chip
                key={m}
                label={m === 'SENSORY_DECAY' ? 'Sensory Decay' : m === 'ANTI_FEED' ? 'Anti-Feed' : 'Deja Vu Loop'}
                kind={deckMode === m ? 'accent' : 'outline'}
                onPress={() => {
                  setDeckMode(m);
                  setCardIdx(0);
                }}
              />
            ))}
          </View>

          <View style={styles.cardCenter}>
            <Text variant="caption" color="#9E9E9E">
              {deckCards[cardIdx]?.badge}
            </Text>
            <Text variant="largeTitle" color="#F5F5F5" align="center">
              {deckCards[cardIdx]?.title}
            </Text>
            <Text variant="body" color="#C8C8C8" align="center">
              {deckCards[cardIdx]?.body}
            </Text>
          </View>

          <View style={styles.deckFoot}>
            {cardIdx + 1 < deckCards.length ? (
              <PillButton label="Next Calm Card" block size="lg" onPress={() => setCardIdx((n) => n + 1)} />
            ) : (
              <PillButton label="Rest Eyes & Exit" block size="lg" onPress={() => setDeckVisible(false)} />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  body: { paddingHorizontal: space.screen, gap: space.gap, width: '100%', maxWidth: 620, alignSelf: 'center' },
  heroCard: { gap: 14 },
  badge: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  gap: { gap: 12 },
  actionsGap: { gap: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  tierPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.inset },
  metricsRow: { flexDirection: 'row', gap: 8 },
  metricBox: { flex: 1, padding: 10, borderRadius: radius.inset, gap: 4 },
  seedWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  seedPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.pill },
  deckRoot: { flex: 1, backgroundColor: '#121212', paddingHorizontal: 24, justifyContent: 'space-between' },
  deckTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pillBar: { backgroundColor: '#1E1E1E', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  modeRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap' },
  cardCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 18, paddingHorizontal: 8 },
  deckFoot: { paddingTop: 12 },
});
