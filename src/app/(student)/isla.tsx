import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CaretLeft,
  ChatCircleDots,
  CheckCircle,
  Compass,
  Confetti,
  Flag,
  Hammer,
  HandPointing,
  Island,
  Lighthouse,
  LockSimple,
  Plus,
  Prohibit,
  Question,
  ShieldCheck,
  Sparkle,
  TrendUp,
  UserPlus,
  UsersThree,
} from '@/components/ui/icons';

import { IslaBackdrop } from '@/components/isla/IslaBackdrop';
import { BuildingThumb, IslaScene, useLoop } from '@/components/isla/IslaScene';
import { KapuluanScene } from '@/components/isla/KapuluanScene';
import { PactCeremony } from '@/components/isla/PactCeremony';
import { SagwanIcon } from '@/components/isla/SagwanIcon';
import {
  BottomSheet,
  Card,
  Chip,
  CoinCounter,
  EmptyState,
  IconButton,
  InsetCard,
  NavBar,
  Notice,
  PillButton,
  PressableScale,
  ProgressBar,
  SegmentedControl,
  SheetHeader,
  Text,
  TextField,
} from '@/components/ui';
import { GROUP_BUILDINGS, SAGWAN_CHEERS, bridgeTier, type ArchipelagoMember } from '@/data/kapuluan';
import { BUILDINGS, type BuildingId } from '@/data/seed';
import { haptic } from '@/design/haptics';
import { pressScale, spring } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { fontFor } from '@/design/typography';
import { useL, useT } from '@/i18n/useT';
import { IS_PITCH } from '@/lib/config';
import { checkProfanity } from '@/lib/profanity';
import {
  blockUser,
  createArchipelago,
  inviteFriendToArchipelago,
  leaveArchipelago,
  openDmWithFriend,
  pitchSimulateCarloReturn,
  reportUser,
  respondArchipelagoInvite,
  throwSagwan,
  useSocial,
} from '@/services/backend/social';
import { useAppStore } from '@/store/useAppStore';

type IslaTab = 'kapuluan' | 'my';
type ReportReason = 'bullying' | 'profanity' | 'spam' | 'inappropriate' | 'other';
const REPORT_REASONS: ReportReason[] = ['bullying', 'profanity', 'spam', 'inappropriate', 'other'];

export default function IslaScreen() {
  const { c, isNight } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const t = useT();
  const L = useL();

  // Solo isla state
  const built = useAppStore((s) => s.built);
  const coins = useAppStore((s) => s.coins);
  const build = useAppStore((s) => s.build);
  const [sheet, setSheet] = useState(false);
  const [info, setInfo] = useState<BuildingId | null>(null);
  const [fresh, setFresh] = useState<BuildingId | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [poke, setPoke] = useState<{ id: BuildingId; n: number } | null>(null);

  // Kapuluan state
  const socialEnabled = useSocial((s) => s.socialEnabled);
  const chatEnabled = useSocial((s) => s.chatEnabled);
  const friends = useSocial((s) => s.friends);
  const archipelagos = useSocial((s) => s.archipelagos);
  const incomingInvites = useSocial((s) => s.incomingInvites);
  const selectedArchipelagoId = useSocial((s) => s.selectedArchipelagoId);
  const pendingCeremony = useSocial((s) => s.pendingCeremony);
  const welcomeBackName = useSocial((s) => s.welcomeBackName);
  const selectArchipelago = useSocial((s) => s.selectArchipelago);
  const consumeCeremony = useSocial((s) => s.consumeCeremony);
  const consumeWelcomeBack = useSocial((s) => s.consumeWelcomeBack);

  const [tab, setTab] = useState<IslaTab>('kapuluan');
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pactName, setPactName] = useState('');
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [sagwanPulse, setSagwanPulse] = useState<{ toId: string; seq: number } | null>(null);

  const [reportTarget, setReportTarget] = useState<{ id: string; name: string } | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>('profanity');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSent, setReportSent] = useState(false);

  const nextIdx = BUILDINGS.findIndex((b) => coins < b.unlockAt);
  const next = nextIdx >= 0 ? BUILDINGS[nextIdx] : undefined;
  const prevAt = nextIdx > 0 ? BUILDINGS[nextIdx - 1].unlockAt : 0;
  const ready = BUILDINGS.filter((b) => coins >= b.unlockAt && !built.includes(b.id));
  const readyIds = ready.map((b) => b.id);
  const infoB = info ? BUILDINGS.find((b) => b.id === info) : null;
  const activeArch = archipelagos.find((a) => a.id === selectedArchipelagoId) ?? archipelagos[0] ?? null;
  const inspectMember: ArchipelagoMember | null = activeArch?.members.find((m) => m.studentId === inspectId) ?? null;

  useEffect(() => {
    if (!fresh) return;
    const id = setTimeout(() => setFresh(null), 1600);
    return () => clearTimeout(id);
  }, [fresh]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  const w = Math.min(width, 520);
  const soloStageH = Math.max(250, Math.min(370, Math.round(height * 0.42)));
  const soloHorizon = Math.round(soloStageH * 0.24);
  const kapStageW = Math.max(280, Math.min(540, width - space.screen * 2));
  const kapStageH = Math.min(340, Math.max(250, Math.round(kapStageW * 0.78)));

  const handleCreatePact = async () => {
    const clean = pactName.trim();
    if (!clean) {
      setCreateErr('Give your barkada pact a name.');
      return;
    }
    if (!checkProfanity(clean).ok) {
      setCreateErr(t.chat.profanityError);
      return;
    }
    setCreateBusy(true);
    setCreateErr(null);
    try {
      await createArchipelago(clean, pickedIds);
      setCreateOpen(false);
      setPactName('');
      setPickedIds([]);
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : 'Could not create barkada pact.');
    } finally {
      setCreateBusy(false);
    }
  };

  const handleThrowSagwan = async (member: ArchipelagoMember, cheerText?: string) => {
    if (!activeArch) return;
    try {
      await throwSagwan(activeArch.id, member.studentId, cheerText);
      haptic.success();
      setSagwanPulse((prev) => ({ toId: member.studentId, seq: (prev?.seq ?? 0) + 1 }));
      setToast(t.home.sagwanSent(member.displayName.split(' ')[0]));
    } catch (e) {
      haptic.warning();
      setToast(e instanceof Error ? e.message : 'Could not send Sagwan.');
    }
  };

  const rankedMembers = activeArch ? [...activeArch.members].sort((a, b) => b.agos7d - a.agos7d) : [];
  const primaryDrifter = activeArch?.members.find((m) => !m.isMe && m.driftLevel >= 0.25) ?? null;
  const invitableFriends = activeArch
    ? friends.filter((f) => !activeArch.members.some((m) => m.studentId === f.id))
    : [];
  const activeTier = activeArch ? bridgeTier(activeArch.streakDays) : 'rope';

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      {tab === 'my' ? <IslaBackdrop width={width} height={height} horizon={insets.top + 60 + soloHorizon} /> : null}

      <View style={{ paddingTop: insets.top }}>
        <NavBar
          onBack={() => router.back()}
          backIcon={<CaretLeft size={18} weight="bold" color={c.text} />}
          backLabel={t.common.back}
          title={tab === 'kapuluan' ? t.isla.tabKapuluan : t.isla.title}
          tone={tab === 'my' ? 'glass' : undefined}
          right={
            <View style={styles.navRight}>
              {tab === 'kapuluan' ? (
                <IconButton
                  icon={<UsersThree size={18} weight="bold" color={c.text} />}
                  onPress={() => router.push('/friends')}
                  accessibilityLabel={t.friends.title}
                />
              ) : (
                <BadgeBump n={coins}>
                  <CoinCounter value={coins} />
                </BadgeBump>
              )}
              <IconButton
                icon={<Question size={18} weight="bold" color={c.text} />}
                onPress={() => router.push('/isla-how')}
                tone={tab === 'my' ? 'card' : undefined}
                accessibilityLabel={t.how.title}
              />
            </View>
          }
        />

        <View style={styles.segWrap}>
          <SegmentedControl<IslaTab>
            options={[
              { value: 'kapuluan', label: t.isla.tabKapuluan },
              { value: 'my', label: t.isla.tabMyIsla },
            ]}
            value={tab}
            onChange={(v) => {
              setTab(v);
              setConfirmLeave(false);
            }}
          />
        </View>
      </View>

      {tab === 'kapuluan' ? (
        <ScrollView contentContainerStyle={[styles.kapBody, { paddingBottom: insets.bottom + 28 }]}>
          {!socialEnabled ? (
            <Card>
              <EmptyState
                expression="sleepy"
                title={t.isla.socialPausedTitle}
                subtitle={t.isla.socialPausedSub}
                action={{ label: t.isla.tabMyIsla, onPress: () => setTab('my') }}
              />
            </Card>
          ) : (
            <>
              {/* Welcome-back banner when a mate swims out of drift */}
              {welcomeBackName ? (
                <Card style={[styles.welcomeCard, { backgroundColor: c.accentTint }]}>
                  <Sparkle size={20} weight="fill" color={c.accent} />
                  <Text variant="headline" color="accent" style={styles.flex}>
                    {t.isla.welcomeBack(welcomeBackName)}
                  </Text>
                  <PillButton label={t.common.done} size="sm" kind="secondary" onPress={consumeWelcomeBack} />
                </Card>
              ) : null}

              {/* Incoming Barkada Pact Invites */}
              {incomingInvites.length > 0 ? (
                <Card style={[styles.gap, { borderColor: c.accent, borderWidth: 1.5 }]}>
                  <Text variant="headline">{t.isla.incomingInvites}</Text>
                  {incomingInvites.map((inv) => (
                    <View key={inv.id} style={[styles.inviteRow, { borderColor: c.hairline }]}>
                      <View style={styles.flex}>
                        <Text variant="headline">{inv.archipelagoName}</Text>
                        <Text variant="caption">
                          {inv.inviterName} · {t.isla.barkadaProgress(inv.memberCount, inv.streakDays)}
                        </Text>
                      </View>
                      <View style={styles.btnPair}>
                        <PillButton
                          label={t.isla.declineInvite}
                          size="sm"
                          kind="neutral"
                          onPress={() => void respondArchipelagoInvite(inv.id, false)}
                        />
                        <PillButton
                          label={t.isla.acceptInvite}
                          size="sm"
                          kind="primary"
                          onPress={() => void respondArchipelagoInvite(inv.id, true)}
                        />
                      </View>
                    </View>
                  ))}
                </Card>
              ) : null}

              {/* Pact switcher chips + New barkada */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pactStrip}>
                {archipelagos.map((a) => {
                  const selected = a.id === activeArch?.id;
                  return (
                    <Chip
                      key={a.id}
                      label={`${a.name} · ${a.streakDays}d`}
                      kind={selected ? 'accent' : 'neutral'}
                      icon={<Island size={14} weight="fill" color={selected ? c.onAccent : c.accent} />}
                      onPress={() => {
                        haptic.select();
                        setConfirmLeave(false);
                        selectArchipelago(a.id);
                      }}
                    />
                  );
                })}
                <Chip
                  label={t.isla.createPact}
                  kind="tinted"
                  icon={<Plus size={14} weight="bold" color={c.accent} />}
                  onPress={() => {
                    setCreateErr(null);
                    setCreateOpen(true);
                  }}
                />
              </ScrollView>

              {!activeArch ? (
                <Card style={styles.gap}>
                  <EmptyState
                    expression="waving"
                    title={t.isla.pactsEmptyTitle}
                    subtitle={t.isla.pactsEmptySub}
                    action={{ label: t.isla.createPact, onPress: () => setCreateOpen(true) }}
                  />
                  <PillButton
                    label={t.isla.joinFriends}
                    kind="neutral"
                    icon={<UsersThree size={16} weight="bold" color={c.text} />}
                    onPress={() => router.push('/friends')}
                    block
                  />
                </Card>
              ) : (
                <>
                  {/* Archipelago Hero Canvas Card */}
                  <Card padded={false} style={styles.canvasCard}>
                    <KapuluanScene
                      archipelago={activeArch}
                      width={kapStageW}
                      height={kapStageH}
                      selectedMemberId={inspectId}
                      onSelectMember={(sid) => {
                        haptic.select();
                        setInspectId(sid);
                      }}
                      sagwanPulse={sagwanPulse}
                    />

                    {/* Top Floating Tier + Streak Overlay */}
                    <View style={styles.topOverlay} pointerEvents="none">
                      <View
                        style={[
                          styles.hudPill,
                          { backgroundColor: isNight ? 'rgba(13,16,32,0.78)' : 'rgba(255,255,255,0.88)' },
                        ]}
                      >
                        <Compass size={14} weight="fill" color={c.accent} />
                        <Text variant="caption" color="text" style={fontFor(700)}>
                          {t.isla.tierNames[activeTier]} · {t.isla.tulayStreak(activeArch.streakDays)}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.hudPill,
                          { backgroundColor: isNight ? 'rgba(13,16,32,0.78)' : 'rgba(255,255,255,0.88)' },
                        ]}
                      >
                        <ShieldCheck
                          size={14}
                          weight="fill"
                          color={activeArch.freezeUsedThisWeek ? c.warning : c.success}
                        />
                        <Text variant="caption" color="text" style={fontFor(600)}>
                          {activeArch.freezeUsedThisWeek ? t.isla.freezeUsed : t.isla.freezeReady}
                        </Text>
                      </View>
                    </View>

                    {/* Footer status + actions strip */}
                    <View style={styles.canvasFooter}>
                      <View style={styles.rowBetween}>
                        <Text
                          variant="subhead"
                          color={activeArch.todayComplete ? 'success' : 'textSecondary'}
                          style={fontFor(600)}
                        >
                          {activeArch.todayComplete ? t.isla.tulayTodayDone : t.isla.tulayTodayWaiting}
                        </Text>
                        <Text variant="caption" color="textTertiary">
                          {t.isla.barkadaProgress(activeArch.members.length, activeArch.streakDays)}
                        </Text>
                      </View>

                      <View style={styles.actionRow}>
                        {chatEnabled && activeArch.conversationId ? (
                          <PillButton
                            label={t.isla.openGroupChat}
                            size="sm"
                            kind="secondary"
                            icon={<ChatCircleDots size={15} weight="fill" color={c.accent} />}
                            onPress={() => router.push(`/chat/${activeArch.conversationId}`)}
                          />
                        ) : null}

                        {primaryDrifter ? (
                          <PillButton
                            label={`${t.isla.throwSagwan} · ${primaryDrifter.displayName.split(' ')[0]}`}
                            size="sm"
                            kind="primary"
                            icon={<SagwanIcon size={15} color={c.onAccent} />}
                            onPress={() => void handleThrowSagwan(primaryDrifter)}
                          />
                        ) : null}

                        {activeArch.members.length < 5 && invitableFriends.length > 0 ? (
                          <PillButton
                            label={t.isla.inviteFriend}
                            size="sm"
                            kind="neutral"
                            icon={<UserPlus size={15} weight="bold" color={c.text} />}
                            onPress={() => setInviteOpen(true)}
                          />
                        ) : null}

                        {IS_PITCH &&
                        activeArch.id === 'arch-sampaguita' &&
                        primaryDrifter?.studentId === 'pitch-carlo' ? (
                          <PillButton
                            label={t.isla.demoReturnBtn}
                            size="sm"
                            kind="neutral"
                            icon={<Sparkle size={14} weight="fill" color={c.spark} />}
                            onPress={() => {
                              haptic.success();
                              pitchSimulateCarloReturn();
                            }}
                          />
                        ) : null}
                      </View>
                    </View>
                  </Card>

                  {/* Weekly Barkada Ranking & Agos Tide */}
                  <Card style={styles.gap}>
                    <View style={styles.rowBetween}>
                      <Text variant="headline">{t.isla.tabKapuluan} · Agos</Text>
                      <Lighthouse size={18} weight="fill" color={c.spark} />
                    </View>

                    {rankedMembers.map((m, idx) => (
                      <PressableScale
                        key={m.studentId}
                        scaleTo={pressScale.card}
                        onPress={() => {
                          haptic.select();
                          setInspectId(m.studentId);
                        }}
                        style={[styles.rankRow, { borderColor: c.hairline }]}
                      >
                        <View style={[styles.rankNum, { backgroundColor: idx === 0 ? c.accentTint : c.inset }]}>
                          <Text variant="headline" color={idx === 0 ? 'accent' : 'text'} tabular>
                            {idx + 1}
                          </Text>
                        </View>

                        <View style={styles.flexGapSm}>
                          <View style={styles.rowBetween}>
                            <Text variant="headline" numberOfLines={1} style={styles.flex}>
                              {m.isMe ? `${m.displayName} (You)` : m.displayName}
                            </Text>
                            <Text variant="headline" color={m.driftLevel >= 0.25 ? 'warning' : 'accent'} tabular>
                              {m.agos7d}
                            </Text>
                          </View>

                          <ProgressBar progress={Math.min(1, m.agos7d / 100)} height={6} />

                          <View style={styles.badgeRow}>
                            <Chip
                              label={t.isla.tideBands[m.tideBand]}
                              kind={m.driftLevel >= 0.25 ? 'tinted' : 'neutral'}
                            />
                            {m.isLighthouseLeader ? (
                              <Chip
                                label={t.isla.lighthouseLeader}
                                kind="tinted"
                                icon={<Lighthouse size={12} weight="fill" color={c.spark} />}
                              />
                            ) : null}
                            {m.isMostImproved ? (
                              <Chip
                                label={t.isla.mostImproved}
                                kind="neutral"
                                icon={<TrendUp size={12} weight="bold" color={c.success} />}
                              />
                            ) : null}
                            <Text variant="caption" color="textTertiary">
                              {t.isla.buildingsCount(m.built.length)}
                            </Text>
                          </View>
                        </View>
                      </PressableScale>
                    ))}
                  </Card>

                  {/* Shared Group Landmarks */}
                  <Card style={styles.gap}>
                    <Text variant="headline">{t.isla.groupBuildings}</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.pactStrip}
                    >
                      {GROUP_BUILDINGS.map((gb) => {
                        const unlocked = activeArch.streakDays >= gb.unlockStreak;
                        return (
                          <InsetCard
                            key={gb.id}
                            style={[
                              styles.groupTile,
                              {
                                backgroundColor: unlocked ? c.accentTint : c.inset,
                                opacity: unlocked ? 1 : 0.72,
                              },
                            ]}
                          >
                            <View style={styles.rowBetween}>
                              {unlocked ? (
                                <CheckCircle size={16} weight="fill" color={c.success} />
                              ) : (
                                <LockSimple size={15} weight="bold" color={c.textTertiary} />
                              )}
                              <Text variant="caption" color={unlocked ? 'accent' : 'textTertiary'} style={fontFor(700)}>
                                {t.isla.unlockedAt(gb.unlockStreak)}
                              </Text>
                            </View>
                            <Text variant="headline" numberOfLines={1}>
                              {L(gb.name)}
                            </Text>
                            <Text variant="caption" numberOfLines={1}>
                              {L(gb.desc)}
                            </Text>
                          </InsetCard>
                        );
                      })}
                    </ScrollView>
                  </Card>

                  <PillButton
                    label={confirmLeave ? t.isla.leaveConfirm : t.isla.leavePact}
                    kind="neutral"
                    size="sm"
                    onPress={() => {
                      if (!confirmLeave) {
                        setConfirmLeave(true);
                        return;
                      }
                      setConfirmLeave(false);
                      void leaveArchipelago(activeArch.id);
                    }}
                  />
                </>
              )}
            </>
          )}
        </ScrollView>
      ) : (
        <>
          <View
            style={{
              height: soloStageH,
              marginTop: 12,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IslaScene
              built={built}
              width={w}
              interactive
              onBuildingPress={(id) => {
                haptic.select();
                setPoke((p) => ({ id, n: (p?.n ?? 0) + 1 }));
                setInfo(id);
              }}
              fresh={fresh}
              nextId={readyIds[0]}
              poke={poke}
            />
            <View
              style={[styles.hint, { backgroundColor: isNight ? 'rgba(13,16,32,0.55)' : 'rgba(255,255,255,0.78)' }]}
            >
              <HandPointing size={14} weight="fill" color={isNight ? c.text : c.textSecondary} />
              <Text variant="caption" color={isNight ? 'text' : 'textSecondary'}>
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
        </>
      )}

      {/* Fresh build or Sagwan toast */}
      {toast ? <FreshToast label={toast} top={insets.top + 68} /> : null}

      {/* Solo Build Sheet */}
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
                  styles.bRow,
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
                      build(b.id);
                      setSheet(false);
                      setFresh(b.id);
                      setToast(t.isla.newBuilt(L(b.name)));
                    }}
                  />
                ) : (
                  <View style={styles.status}>
                    <LockSimple size={16} weight="fill" color={c.textTertiary} />
                    <Text variant="subhead" color="textTertiary" tabular>
                      {t.isla.notYet(b.unlockAt - coins)}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      </BottomSheet>

      {/* Solo Building Detail Sheet */}
      <BottomSheet visible={!!info} onClose={() => setInfo(null)} accessibilityLabel={infoB ? L(infoB.name) : ''}>
        {infoB ? (
          <View style={styles.infoBody}>
            <View style={[styles.infoArt, { backgroundColor: c.inset }]}>
              <Bobbing>
                <BuildingThumb id={infoB.id} size={132} />
              </Bobbing>
            </View>
            <Text variant="title" align="center">
              {L(infoB.name)}
            </Text>
            <Text variant="overline" align="center">
              {t.isla.earnedBy}
            </Text>
            <Text variant="headline" color="accent" align="center">
              {L(infoB.earnedBy)}
            </Text>
            <PillButton label={t.common.close} kind="secondary" block onPress={() => setInfo(null)} />
          </View>
        ) : null}
      </BottomSheet>

      {/* Island Inspector Sheet */}
      <BottomSheet visible={!!inspectMember} onClose={() => setInspectId(null)}>
        <SheetHeader
          title={inspectMember?.isMe ? `${inspectMember.displayName} (You)` : inspectMember?.displayName}
          right={{ label: t.common.close, onPress: () => setInspectId(null) }}
        />
        {inspectMember ? (
          <ScrollView contentContainerStyle={[styles.sheetBody, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.inspectStage}>
              <IslaScene built={inspectMember.built} width={220} interactive={false} alive={false} />
            </View>

            <View style={styles.badgeRow}>
              <Chip label={`${t.isla.tideBands[inspectMember.tideBand]} · ${inspectMember.agos7d}`} kind="accent" />
              <Chip label={t.isla.buildingsCount(inspectMember.built.length)} kind="neutral" />
              <Chip
                label={inspectMember.goalMetToday ? t.isla.tulayTodayDone : t.isla.tulayTodayWaiting}
                kind={inspectMember.goalMetToday ? 'tinted' : 'outline'}
              />
            </View>

            {!inspectMember.isMe ? (
              <>
                <View style={styles.gapSm}>
                  <Text variant="headline">{t.isla.throwSagwan}</Text>
                  <Text variant="caption">{t.isla.sagwanHint}</Text>
                  <View style={styles.badgeRow}>
                    {SAGWAN_CHEERS.map((ch, i) => (
                      <PillButton
                        key={i}
                        label={L(ch)}
                        size="sm"
                        kind="secondary"
                        icon={<SagwanIcon size={14} color={c.accent} />}
                        onPress={() => void handleThrowSagwan(inspectMember, L(ch))}
                      />
                    ))}
                  </View>
                </View>

                <View style={styles.row}>
                  {chatEnabled ? (
                    <PillButton
                      label={t.isla.messageFriend}
                      kind="primary"
                      icon={<ChatCircleDots size={16} weight="fill" color={c.onAccent} />}
                      style={styles.flex}
                      onPress={() => {
                        const fid = inspectMember.studentId;
                        setInspectId(null);
                        void openDmWithFriend(fid).then((cid) => router.push(`/chat/${cid}`));
                      }}
                    />
                  ) : null}
                  <PillButton
                    label={t.friends.report}
                    kind="neutral"
                    icon={<Flag size={16} weight="fill" color={c.warning} />}
                    onPress={() => {
                      const target = { id: inspectMember.studentId, name: inspectMember.displayName };
                      setInspectId(null);
                      setReportSent(false);
                      setReportTarget(target);
                    }}
                  />
                  <PillButton
                    label={t.friends.block}
                    kind="destructive"
                    icon={<Prohibit size={16} weight="fill" color={c.danger} />}
                    onPress={() => {
                      const fid = inspectMember.studentId;
                      setInspectId(null);
                      haptic.warning();
                      void blockUser(fid);
                    }}
                  />
                </View>
              </>
            ) : null}
          </ScrollView>
        ) : null}
      </BottomSheet>

      {/* Create Barkada Sheet (max 5 islands) */}
      <BottomSheet visible={createOpen} onClose={() => setCreateOpen(false)}>
        <SheetHeader
          title={t.isla.newPactTitle}
          right={{ label: t.common.close, onPress: () => setCreateOpen(false) }}
        />
        <ScrollView contentContainerStyle={[styles.sheetBody, { paddingBottom: insets.bottom + 20 }]}>
          <TextField
            label={t.isla.newPactName}
            placeholder={t.isla.newPactNamePh}
            value={pactName}
            onChangeText={setPactName}
            maxLength={32}
          />
          <Text variant="subhead" color="text">
            {t.isla.pickFriends}
          </Text>
          {friends.length === 0 ? (
            <Notice text={t.friends.noFriendsSub} tone="success" />
          ) : (
            <View style={styles.badgeRow}>
              {friends.map((f) => {
                const chosen = pickedIds.includes(f.id);
                return (
                  <Chip
                    key={f.id}
                    label={f.displayName}
                    kind={chosen ? 'accent' : 'neutral'}
                    onPress={() => {
                      haptic.select();
                      setPickedIds((prev) => {
                        if (prev.includes(f.id)) return prev.filter((x) => x !== f.id);
                        if (prev.length >= 4) return prev;
                        return [...prev, f.id];
                      });
                    }}
                  />
                );
              })}
            </View>
          )}
          <Text variant="caption" color="textTertiary">
            {t.isla.maxIslandsHint}
          </Text>
          {createErr ? <Notice text={createErr} tone="danger" /> : null}
          <PillButton
            label={t.isla.createPact}
            kind="primary"
            block
            disabled={createBusy}
            onPress={() => void handleCreatePact()}
          />
        </ScrollView>
      </BottomSheet>

      {/* Invite Friend to Existing Pact Sheet */}
      <BottomSheet visible={inviteOpen} onClose={() => setInviteOpen(false)}>
        <SheetHeader
          title={t.isla.inviteFriend}
          right={{ label: t.common.close, onPress: () => setInviteOpen(false) }}
        />
        <View style={[styles.sheetBody, { paddingBottom: insets.bottom + 20 }]}>
          {invitableFriends.map((f) => (
            <PillButton
              key={f.id}
              label={`${f.displayName} · Grade ${f.grade ?? ''}`}
              kind="secondary"
              block
              icon={<UserPlus size={16} weight="bold" color={c.accent} />}
              onPress={() => {
                if (!activeArch) return;
                setInviteOpen(false);
                void inviteFriendToArchipelago(activeArch.id, f.id);
              }}
            />
          ))}
        </View>
      </BottomSheet>

      {/* Report Sheet */}
      <BottomSheet visible={!!reportTarget} onClose={() => setReportTarget(null)}>
        <SheetHeader
          title={`${t.friends.reportTitle}${reportTarget ? ` · ${reportTarget.name}` : ''}`}
          right={{ label: t.common.close, onPress: () => setReportTarget(null) }}
        />
        <View style={[styles.sheetBody, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.badgeRow}>
            {REPORT_REASONS.map((r) => (
              <Chip
                key={r}
                label={t.friends.reportReasons[r]}
                kind={reportReason === r ? 'accent' : 'neutral'}
                onPress={() => setReportReason(r)}
              />
            ))}
          </View>
          <TextField
            label={t.friends.reportDetails}
            value={reportDetails}
            onChangeText={setReportDetails}
            maxLength={300}
          />
          {reportSent ? <Notice text={t.friends.reportSent} tone="success" /> : null}
          <PillButton
            label={t.friends.submitReport}
            kind="destructive"
            block
            onPress={() => {
              if (!reportTarget) return;
              void reportUser(reportTarget.id, reportReason, reportDetails).then(() => {
                haptic.success();
                setReportSent(true);
                setTimeout(() => {
                  setReportTarget(null);
                  setReportSent(false);
                  setReportDetails('');
                }, 1100);
              });
            }}
          />
        </View>
      </BottomSheet>

      {/* Pact Ceremony Celebration */}
      <PactCeremony
        visible={!!pendingCeremony}
        archipelagoName={pendingCeremony?.name ?? 'Kapuluan'}
        onDone={consumeCeremony}
      />
    </View>
  );
}

function BuildButton({ label, glow, onPress }: { label: string; glow: boolean; onPress: () => void }) {
  const pulse = useLoop(1200, 0, true, glow);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pulse.get() * 0.03 }] }));
  return (
    <Animated.View style={[styles.flex, style]}>
      <PillButton label={label} size="lg" block onPress={onPress} />
    </Animated.View>
  );
}

function Bobbing({ children }: { children: ReactNode }) {
  const pulse = useLoop(1800);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -6 * pulse.get() }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

function BadgeBump({ n, children }: { n: number; children: ReactNode }) {
  const s = useSharedValue(1);
  useEffect(() => {
    s.set(withSequence(withSpring(1.12, spring.snappy), withSpring(1, spring.bouncy)));
  }, [n, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

function FreshToast({ label, top }: { label: string; top: number }) {
  const { c } = useTheme();
  const y = useSharedValue(-16);
  const o = useSharedValue(0);
  useEffect(() => {
    y.set(withSpring(0, spring.bouncy));
    o.set(withTiming(1, { duration: 220 }));
  }, [y, o]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }], opacity: o.get() }));
  return (
    <Animated.View style={[styles.toast, { backgroundColor: c.tileDark, top }, style]} pointerEvents="none">
      <Confetti size={18} weight="fill" color={c.spark} />
      <Text variant="headline" color="tileDarkText">
        {label}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  flexGap: { flex: 1, gap: 6 },
  flexGapSm: { flex: 1, gap: 6 },
  navRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  segWrap: { paddingHorizontal: space.screen, paddingTop: 4, paddingBottom: 8 },
  kapBody: { paddingHorizontal: space.screen, gap: space.gap },
  gap: { gap: 12 },
  gapSm: { gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  btnPair: { flexDirection: 'row', gap: 6 },
  welcomeCard: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pactStrip: { gap: 8, paddingVertical: 2 },
  canvasCard: { overflow: 'hidden' },
  topOverlay: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 6,
  },
  hudPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  canvasFooter: { padding: space.card, gap: 10 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rankNum: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  groupTile: { width: 156, gap: 4 },
  sheetBody: { paddingHorizontal: space.screen, paddingTop: 8, gap: 12 },
  inspectStage: { alignItems: 'center', paddingVertical: 4 },
  hint: {
    position: 'absolute',
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  bottom: { marginTop: 'auto', paddingHorizontal: space.screen, gap: space.gap },
  nextCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  thumbWell: {
    width: 72,
    height: 72,
    borderRadius: radius.inset,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lock: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetHead: { paddingHorizontal: space.screen, paddingBottom: 12, gap: 2 },
  list: { maxHeight: 420, paddingHorizontal: space.screen },
  bRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: radius.inset,
  },
  rowThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoBody: { padding: space.screen, gap: 10 },
  infoArt: { alignSelf: 'center', padding: 14, borderRadius: radius.card },
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
});
