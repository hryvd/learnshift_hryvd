import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowsClockwise,
  ArrowsOutSimple,
  CaretLeft,
  ChatCircleDots,
  Check,
  CopySimple,
  DotsThree,
  Flag,
  Island,
  Prohibit,
  QrCode,
  Scan,
  ShareNetwork,
  ShieldWarning,
  UserMinus,
  UserPlus,
  UsersThree,
} from 'phosphor-react-native';

import { FriendQrCode, type PassThemeId } from '@/components/friends/FriendQrPass';
import { FriendShareSheet, FullScreenQrModal } from '@/components/friends/FriendShareSheet';
import { QrScannerModal } from '@/components/friends/QrScannerModal';
import { PatyAvatar } from '@/components/mascot/Paty';
import {
  BottomSheet,
  Card,
  Chip,
  EmptyState,
  IconButton,
  NavBar,
  Notice,
  PillButton,
  PressableScale,
  SheetHeader,
  Skeleton,
  Stagger,
  Text,
  TextField,
} from '@/components/ui';
import type { FriendProfile } from '@/data/kapuluan';
import { haptic } from '@/design/haptics';
import { pressScale } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { fontFor } from '@/design/typography';
import { useL, useT } from '@/i18n/useT';
import { IS_PITCH } from '@/lib/config';
import { normalizeFriendCode } from '@/lib/qr';
import {
  blockUser,
  inviteFriendToArchipelago,
  loadSocial,
  openDmWithFriend,
  regenerateFriendCode,
  removeFriend,
  reportUser,
  respondFriendRequest,
  sendFriendRequestByCode,
  sendFriendRequestToUser,
  unblockUser,
  useSocial,
} from '@/services/backend/social';
import { useAuth } from '@/store/useAuth';

type ReportReason = 'bullying' | 'profanity' | 'spam' | 'inappropriate' | 'other';
const REPORT_REASONS: ReportReason[] = ['bullying', 'profanity', 'spam', 'inappropriate', 'other'];

export default function FriendsScreen() {
  const { c, isNight } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const L = useL();
  const { code: routeCode } = useLocalSearchParams<{ code?: string }>();

  const profile = useAuth((s) => s.profile);
  const displayName = IS_PITCH ? 'Mika' : profile?.display_name?.trim() || 'Student';
  const displayGrade = IS_PITCH ? 8 : (profile?.grade ?? null);

  const loading = useSocial((s) => s.loading);
  const myCode = useSocial((s) => s.myCode);
  const socialEnabled = useSocial((s) => s.socialEnabled);
  const chatEnabled = useSocial((s) => s.chatEnabled);
  const friends = useSocial((s) => s.friends);
  const incomingRequests = useSocial((s) => s.incomingRequests);
  const outgoingRequests = useSocial((s) => s.outgoingRequests);
  const classmates = useSocial((s) => s.classmates);
  const blockedIds = useSocial((s) => s.blockedIds);
  const conversations = useSocial((s) => s.conversations);
  const archipelagos = useSocial((s) => s.archipelagos);

  const normalizedRouteCode = typeof routeCode === 'string' ? normalizeFriendCode(routeCode).slice(0, 6) : '';
  const [seenRouteCode, setSeenRouteCode] = useState(normalizedRouteCode);

  const scrollRef = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [codeInput, setCodeInput] = useState(normalizedRouteCode);
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeFeedback, setCodeFeedback] = useState<{ text: string; tone: 'danger' | 'success' } | null>(
    normalizedRouteCode.length >= 4 ? { text: t.friends.deepLinkBanner(normalizedRouteCode), tone: 'success' } : null,
  );
  const [actionErr, setActionErr] = useState<string | null>(null);

  // QR Pass, Share Sheet & Live Camera Scanner modals
  const [passTheme, setPassTheme] = useState<PassThemeId>(() => (isNight ? 'parola' : 'sunrise'));
  const [shareOpen, setShareOpen] = useState(false);
  const [fullQrOpen, setFullQrOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  const [selectedFriend, setSelectedFriend] = useState<FriendProfile | null>(null);
  const [confirmUnfriend, setConfirmUnfriend] = useState(false);
  const [inviteFriend, setInviteFriend] = useState<FriendProfile | null>(null);

  const [reportTarget, setReportTarget] = useState<{ id: string; name: string } | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>('profanity');
  const [reportDetails, setReportDetails] = useState('');
  const [reportDone, setReportDone] = useState(false);

  // Sync incoming deep-link friend code (`learnshift://friends?code=AM4GAU`) cleanly.
  if (normalizedRouteCode && normalizedRouteCode !== seenRouteCode) {
    setSeenRouteCode(normalizedRouteCode);
    setCodeInput(normalizedRouteCode);
    if (normalizedRouteCode.length >= 4) {
      setCodeFeedback({ text: t.friends.deepLinkBanner(normalizedRouteCode), tone: 'success' });
    }
  }

  useEffect(() => {
    void loadSocial(true);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSocial(false);
    setRefreshing(false);
  };

  const handleCopyCode = async () => {
    if (!myCode) return;
    await Clipboard.setStringAsync(myCode);
    haptic.success();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleSendByCode = async () => {
    const clean = normalizeFriendCode(codeInput);
    if (clean.length < 4) return;
    setCodeBusy(true);
    setCodeFeedback(null);
    try {
      const status = await sendFriendRequestByCode(clean);
      haptic.success();
      setCodeInput('');
      setCodeFeedback({
        text: status === 'accepted' ? t.friends.scannerAdded : t.friends.requestSent,
        tone: 'success',
      });
    } catch (e) {
      haptic.warning();
      setCodeFeedback({ text: e instanceof Error ? e.message : 'Could not send request.', tone: 'danger' });
    } finally {
      setCodeBusy(false);
    }
  };

  const handleScanAddCode = async (scannedCode: string): Promise<'pending' | 'accepted'> => {
    const status = await sendFriendRequestByCode(scannedCode);
    setCodeFeedback({
      text: status === 'accepted' ? t.friends.scannerAdded : t.friends.requestSent,
      tone: 'success',
    });
    return status;
  };

  const handleOpenDm = async (friendId: string) => {
    setActionErr(null);
    try {
      const cid = await openDmWithFriend(friendId);
      haptic.select();
      router.push(`/chat/${cid}`);
    } catch (e) {
      haptic.warning();
      setActionErr(e instanceof Error ? e.message : 'Could not open chat.');
    }
  };

  const handleInviteToArchipelago = async (archId: string) => {
    if (!inviteFriend) return;
    try {
      await inviteFriendToArchipelago(archId, inviteFriend.id);
      haptic.success();
      setInviteFriend(null);
      setCodeFeedback({ text: t.friends.requestSent, tone: 'success' });
    } catch (e) {
      haptic.warning();
      setActionErr(e instanceof Error ? e.message : 'Could not invite friend.');
    }
  };

  const handleSubmitReport = async () => {
    if (!reportTarget) return;
    try {
      await reportUser(reportTarget.id, reportReason, reportDetails);
      haptic.success();
      setReportDone(true);
      setTimeout(() => {
        setReportTarget(null);
        setReportDone(false);
        setReportDetails('');
      }, 1200);
    } catch (e) {
      haptic.warning();
      setActionErr(e instanceof Error ? e.message : 'Could not submit report.');
    }
  };

  const eligiblePacts = inviteFriend
    ? archipelagos.filter((a) => a.members.length < 5 && !a.members.some((m) => m.studentId === inviteFriend.id))
    : [];

  return (
    <View style={[styles.root, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      <NavBar
        title={t.friends.title}
        onBack={() => router.back()}
        backIcon={<CaretLeft size={18} weight="bold" color={c.text} />}
        backLabel={t.common.back}
        right={
          socialEnabled ? (
            <IconButton
              icon={<Scan size={20} weight="bold" color={c.accent} />}
              onPress={() => {
                haptic.select();
                setScannerOpen(true);
              }}
              accessibilityLabel={t.friends.scanQr}
            />
          ) : null
        }
      />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 36 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
      >
        {!socialEnabled ? (
          <Card>
            <EmptyState expression="sleepy" title={t.isla.socialPausedTitle} subtitle={t.isla.socialPausedSub} />
          </Card>
        ) : (
          <>
            {!chatEnabled ? <Notice text={t.friends.chatPausedBanner} tone="success" /> : null}
            {actionErr ? <Notice text={actionErr} tone="danger" /> : null}

            {/* Kapuluan Friend Pass (Live QR + 6-letter code + Scan & Share) */}
            <Stagger index={0}>
              <Card style={styles.gap}>
                <View style={styles.rowBetween}>
                  <View style={styles.flex}>
                    <Text variant="headline">{t.friends.myCode}</Text>
                    <Text variant="caption" color="textSecondary">
                      {t.friends.myCodeSub}
                    </Text>
                  </View>
                  <PressableScale
                    scaleTo={pressScale.button}
                    disabled={!myCode}
                    onPress={() => {
                      haptic.select();
                      setFullQrOpen(true);
                    }}
                    accessibilityLabel={t.friends.showFullQr}
                    hitSlop={8}
                    style={[styles.qrCornerBtn, { backgroundColor: c.accentTint }]}
                  >
                    <QrCode size={18} weight="fill" color={c.accent} />
                  </PressableScale>
                </View>

                {/* Centered Kapuluan QR Showcase: spacious on every phone from 360dp to 430pt */}
                <View style={[styles.passPanel, { backgroundColor: c.inset, borderColor: c.hairline }]}>
                  <PressableScale
                    scaleTo={pressScale.card}
                    disabled={!myCode}
                    onPress={() => {
                      haptic.select();
                      setFullQrOpen(true);
                    }}
                    accessibilityLabel={`${t.friends.myQr}. ${t.friends.tapToEnlarge}`}
                    style={[styles.qrPreviewTile, { borderColor: c.hairline }]}
                  >
                    {myCode ? (
                      <FriendQrCode code={myCode} size={156} eyeColor={c.accent} showCenterBadge />
                    ) : (
                      <Skeleton width={156} height={156} r={16} />
                    )}
                    <View style={[styles.enlargeTag, { backgroundColor: c.accentTint }]}>
                      <ArrowsOutSimple size={12} weight="bold" color={c.accent} />
                      <Text variant="caption" color="accent" style={styles.enlargeLabel} numberOfLines={1}>
                        {t.friends.tapToEnlarge}
                      </Text>
                    </View>
                  </PressableScale>

                  {/* Full-width code bar + instant copy & regenerate */}
                  <View style={styles.codeBarRow}>
                    <PressableScale
                      scaleTo={pressScale.card}
                      disabled={!myCode}
                      onPress={() => void handleCopyCode()}
                      accessibilityLabel={myCode ?? ''}
                      accessibilityHint={t.friends.copyCode}
                      style={[styles.codePill, { backgroundColor: c.card, borderColor: c.hairline }]}
                    >
                      <Text variant="largeTitle" color="accent" tabular style={styles.codePillText} numberOfLines={1}>
                        {myCode ?? (loading ? '······' : '------')}
                      </Text>
                      <View style={[styles.copyPillTag, { backgroundColor: copied ? c.accentTint : c.inset }]}>
                        {copied ? (
                          <Check size={14} weight="bold" color={c.accent} />
                        ) : (
                          <CopySimple size={14} weight="bold" color={c.textSecondary} />
                        )}
                      </View>
                    </PressableScale>

                    <PressableScale
                      scaleTo={pressScale.button}
                      onPress={() => {
                        haptic.select();
                        void regenerateFriendCode();
                      }}
                      accessibilityLabel={t.friends.newCode}
                      hitSlop={6}
                      style={[styles.regenBtn, { backgroundColor: c.card, borderColor: c.hairline }]}
                    >
                      <ArrowsClockwise size={18} weight="bold" color={c.text} />
                    </PressableScale>
                  </View>
                </View>

                {/* Primary Symmetrical Actions: Scan QR & Share (with QR option) */}
                <View style={styles.primaryPair}>
                  <PillButton
                    label={t.friends.scanQr}
                    size="md"
                    kind="primary"
                    icon={<Scan size={17} weight="bold" color={c.onAccent} />}
                    onPress={() => {
                      haptic.select();
                      setScannerOpen(true);
                    }}
                    style={styles.flex}
                  />
                  <PillButton
                    label={t.common.share}
                    size="md"
                    kind="secondary"
                    icon={<ShareNetwork size={17} weight="bold" color={c.accent} />}
                    onPress={() => {
                      haptic.select();
                      setShareOpen(true);
                    }}
                    disabled={!myCode}
                    style={styles.flex}
                  />
                </View>
              </Card>
            </Stagger>

            {/* Add by Friend Code */}
            <Stagger index={1}>
              <Card style={styles.gap}>
                <View style={styles.rowBetween}>
                  <Text variant="headline">{t.friends.addByCode}</Text>
                  <Chip
                    label={t.friends.scanQr}
                    kind="tinted"
                    icon={<Scan size={13} weight="bold" color={c.accent} />}
                    onPress={() => {
                      haptic.select();
                      setScannerOpen(true);
                    }}
                  />
                </View>
                <TextField
                  accessibilityLabel={t.friends.addByCode}
                  placeholder={t.friends.codePlaceholder}
                  value={codeInput}
                  onChangeText={(txt) => setCodeInput(normalizeFriendCode(txt).slice(0, 6))}
                  code
                  maxLength={6}
                  autoCapitalize="characters"
                  returnKeyType="send"
                  onSubmitEditing={() => void handleSendByCode()}
                />
                {codeFeedback ? <Notice text={codeFeedback.text} tone={codeFeedback.tone} /> : null}
                <PillButton
                  label={t.friends.sendRequest}
                  icon={<UserPlus size={18} weight="fill" color={c.onAccent} />}
                  onPress={() => void handleSendByCode()}
                  disabled={codeBusy || codeInput.trim().length < 4}
                  block
                />
              </Card>
            </Stagger>

            {/* Incoming Requests */}
            {incomingRequests.length > 0 ? (
              <Stagger index={2}>
                <Card style={styles.gap}>
                  <View style={styles.rowBetween}>
                    <Text variant="headline">{t.friends.requestsIn}</Text>
                    <Chip label={`${incomingRequests.length}`} kind="accent" />
                  </View>
                  {incomingRequests.map((req) => (
                    <View key={req.id} style={[styles.personRow, { borderColor: c.hairline }]}>
                      <PatyAvatar size={40} background={c.accentTint} />
                      <View style={styles.flex}>
                        <Text variant="headline" numberOfLines={1}>
                          {req.displayName}
                        </Text>
                        {req.grade ? <Text variant="caption">Grade {req.grade}</Text> : null}
                      </View>
                      <View style={styles.btnPair}>
                        <PillButton
                          label={t.friends.decline}
                          size="sm"
                          kind="neutral"
                          onPress={() => {
                            haptic.select();
                            void respondFriendRequest(req.id, false);
                          }}
                        />
                        <PillButton
                          label={t.friends.accept}
                          size="sm"
                          kind="primary"
                          onPress={() => {
                            haptic.success();
                            void respondFriendRequest(req.id, true);
                          }}
                        />
                      </View>
                    </View>
                  ))}
                </Card>
              </Stagger>
            ) : null}

            {/* Classmates Discovery */}
            {classmates.length > 0 ? (
              <Stagger index={3}>
                <Card style={styles.gap}>
                  <View>
                    <Text variant="headline">{t.friends.classmates}</Text>
                    <Text variant="caption">{t.friends.classmatesSub}</Text>
                  </View>
                  {classmates.map((cm) => (
                    <View key={cm.id} style={[styles.personRow, { borderColor: c.hairline }]}>
                      <View style={[styles.initialBadge, { backgroundColor: c.inset }]}>
                        <Text variant="headline" color="accent">
                          {cm.displayName.slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.flex}>
                        <Text variant="headline" numberOfLines={1}>
                          {cm.displayName}
                        </Text>
                        <Text variant="caption" numberOfLines={1}>
                          {cm.className}
                          {cm.grade ? ` · Grade ${cm.grade}` : ''}
                        </Text>
                      </View>
                      <PillButton
                        label={t.friends.add}
                        size="sm"
                        kind="secondary"
                        icon={<UserPlus size={14} weight="bold" color={c.accent} />}
                        onPress={() => {
                          haptic.select();
                          void sendFriendRequestToUser(cm.id).catch((e) =>
                            setActionErr(e instanceof Error ? e.message : 'Could not add classmate.'),
                          );
                        }}
                      />
                    </View>
                  ))}
                </Card>
              </Stagger>
            ) : null}

            {/* Outgoing Pending */}
            {outgoingRequests.length > 0 ? (
              <Card style={styles.gap}>
                <Text variant="overline">{t.friends.requestsOut}</Text>
                <View style={styles.chipRow}>
                  {outgoingRequests.map((req) => (
                    <Chip key={req.id} label={req.displayName} kind="outline" />
                  ))}
                </View>
              </Card>
            ) : null}

            {/* Recent Conversations */}
            {chatEnabled && conversations.length > 0 ? (
              <Stagger index={4}>
                <Card style={styles.gap}>
                  <Text variant="headline">{t.friends.chats}</Text>
                  {conversations.map((conv) => (
                    <PressableScale
                      key={conv.id}
                      scaleTo={pressScale.card}
                      onPress={() => {
                        haptic.select();
                        router.push(`/chat/${conv.id}`);
                      }}
                      style={[styles.personRow, { borderColor: c.hairline }]}
                    >
                      <View
                        style={[
                          styles.initialBadge,
                          { backgroundColor: conv.kind === 'archipelago' ? c.accentTint : c.inset },
                        ]}
                      >
                        {conv.kind === 'archipelago' ? (
                          <Island size={20} weight="fill" color={c.accent} />
                        ) : (
                          <ChatCircleDots size={20} weight="fill" color={c.tabInsights} />
                        )}
                      </View>
                      <View style={styles.flex}>
                        <Text variant="headline" numberOfLines={1}>
                          {conv.title}
                        </Text>
                        <Text variant="caption" numberOfLines={1}>
                          {conv.lastMessage
                            ? `${conv.lastSender ? `${conv.lastSender}: ` : ''}${conv.lastMessage}`
                            : t.chat.emptyChat}
                        </Text>
                      </View>
                      {conv.unread > 0 ? <Chip label={`${conv.unread}`} kind="accent" /> : null}
                    </PressableScale>
                  ))}
                </Card>
              </Stagger>
            ) : null}

            {/* Accepted Friends */}
            <Stagger index={5}>
              <Card style={styles.gap}>
                <View style={styles.rowBetween}>
                  <Text variant="headline">{t.friends.myFriends}</Text>
                  <UsersThree size={20} weight="fill" color={c.tabInsights} />
                </View>
                {friends.length === 0 ? (
                  <EmptyState expression="waving" title={t.friends.noFriends} subtitle={t.friends.noFriendsSub} />
                ) : (
                  friends.map((f) => (
                    <View key={f.id} style={[styles.personRow, { borderColor: c.hairline }]}>
                      <View style={[styles.initialBadge, { backgroundColor: c.accentTint }]}>
                        <Text variant="headline" color="accent">
                          {f.displayName.slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.flex}>
                        <Text variant="headline" numberOfLines={1}>
                          {f.displayName}
                        </Text>
                        {f.grade ? <Text variant="caption">Grade {f.grade}</Text> : null}
                      </View>
                      {chatEnabled ? (
                        <PillButton
                          label={t.friends.message}
                          size="sm"
                          kind="secondary"
                          icon={<ChatCircleDots size={14} weight="bold" color={c.accent} />}
                          onPress={() => void handleOpenDm(f.id)}
                        />
                      ) : null}
                      <PressableScale
                        onPress={() => {
                          haptic.select();
                          setConfirmUnfriend(false);
                          setSelectedFriend(f);
                        }}
                        accessibilityLabel={`${f.displayName} actions`}
                        hitSlop={8}
                        style={[styles.moreBtn, { backgroundColor: c.inset }]}
                      >
                        <DotsThree size={20} weight="bold" color={c.text} />
                      </PressableScale>
                    </View>
                  ))
                )}
              </Card>
            </Stagger>

            {/* Blocked users */}
            {blockedIds.length > 0 ? (
              <Card style={styles.gap}>
                <Text variant="overline">{t.friends.blockedUsers}</Text>
                {blockedIds.map((bid) => (
                  <View key={bid} style={[styles.personRow, { borderColor: c.hairline }]}>
                    <View style={[styles.initialBadge, { backgroundColor: c.inset }]}>
                      <Prohibit size={18} weight="bold" color={c.danger} />
                    </View>
                    <Text variant="subhead" style={styles.flex} numberOfLines={1}>
                      Account #{bid.slice(0, 6)}
                    </Text>
                    <PillButton
                      label={t.friends.unblock}
                      size="sm"
                      kind="neutral"
                      onPress={() => {
                        haptic.select();
                        void unblockUser(bid);
                      }}
                    />
                  </View>
                ))}
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* Share Sheet with Kapuluan QR Card Option */}
      {myCode ? (
        <FriendShareSheet
          visible={shareOpen}
          code={myCode}
          displayName={displayName}
          grade={displayGrade}
          themeId={passTheme}
          onThemeChange={setPassTheme}
          onClose={() => setShareOpen(false)}
          onShowFullQr={() => setFullQrOpen(true)}
        />
      ) : null}

      {/* Full-Screen Face-to-Face QR Pass Modal */}
      {myCode ? (
        <FullScreenQrModal
          visible={fullQrOpen}
          code={myCode}
          displayName={displayName}
          grade={displayGrade}
          themeId={passTheme}
          onThemeChange={setPassTheme}
          onClose={() => setFullQrOpen(false)}
          onOpenScanner={() => {
            setFullQrOpen(false);
            setScannerOpen(true);
          }}
        />
      ) : null}

      {/* Live Camera QR Scanner Modal */}
      <QrScannerModal
        visible={scannerOpen}
        myCode={myCode}
        onClose={() => setScannerOpen(false)}
        onOpenMyQr={() => {
          setScannerOpen(false);
          if (myCode) setFullQrOpen(true);
        }}
        onTypeCode={() => {
          setScannerOpen(false);
          scrollRef.current?.scrollTo({ y: 260, animated: true });
        }}
        onAddByCode={handleScanAddCode}
      />

      {/* Friend Actions BottomSheet */}
      <BottomSheet visible={!!selectedFriend} onClose={() => setSelectedFriend(null)}>
        <SheetHeader
          title={selectedFriend?.displayName}
          right={{ label: t.common.close, onPress: () => setSelectedFriend(null) }}
        />
        {selectedFriend ? (
          <View style={[styles.sheetBody, { paddingBottom: insets.bottom + 16 }]}>
            <PillButton
              label={t.friends.inviteToPact}
              icon={<Island size={18} weight="fill" color={c.accent} />}
              kind="secondary"
              block
              onPress={() => {
                const f = selectedFriend;
                setSelectedFriend(null);
                setInviteFriend(f);
              }}
            />
            <PillButton
              label={t.friends.report}
              icon={<Flag size={18} weight="fill" color={c.warning} />}
              kind="neutral"
              block
              onPress={() => {
                const f = selectedFriend;
                setSelectedFriend(null);
                setReportReason('profanity');
                setReportDetails('');
                setReportDone(false);
                setReportTarget({ id: f.id, name: f.displayName });
              }}
            />
            <PillButton
              label={confirmUnfriend ? `${t.friends.unfriend}?` : t.friends.unfriend}
              icon={<UserMinus size={18} weight="bold" color={c.text} />}
              kind="neutral"
              block
              onPress={() => {
                if (!confirmUnfriend) {
                  setConfirmUnfriend(true);
                  return;
                }
                const fid = selectedFriend.id;
                setSelectedFriend(null);
                void removeFriend(fid);
              }}
            />
            <PillButton
              label={t.friends.block}
              icon={<Prohibit size={18} weight="fill" color={c.danger} />}
              kind="destructive"
              block
              onPress={() => {
                const fid = selectedFriend.id;
                setSelectedFriend(null);
                haptic.warning();
                void blockUser(fid);
              }}
            />
          </View>
        ) : null}
      </BottomSheet>

      {/* Invite to Archipelago Sheet */}
      <BottomSheet visible={!!inviteFriend} onClose={() => setInviteFriend(null)}>
        <SheetHeader
          title={t.friends.inviteToPact}
          right={{ label: t.common.close, onPress: () => setInviteFriend(null) }}
        />
        <View style={[styles.sheetBody, { paddingBottom: insets.bottom + 16 }]}>
          {eligiblePacts.length === 0 ? (
            <View style={styles.gap}>
              <Text variant="subhead">{t.isla.maxIslandsHint}</Text>
              <PillButton
                label={t.isla.createPact}
                kind="primary"
                block
                onPress={() => {
                  setInviteFriend(null);
                  router.push('/isla');
                }}
              />
            </View>
          ) : (
            eligiblePacts.map((arch) => (
              <PillButton
                key={arch.id}
                label={`${arch.name} (${L({ en: `${arch.members.length}/5 islands`, fil: `${arch.members.length}/5 isla` })})`}
                icon={<Island size={18} weight="fill" color={c.accent} />}
                kind="secondary"
                block
                onPress={() => void handleInviteToArchipelago(arch.id)}
              />
            ))
          )}
        </View>
      </BottomSheet>

      {/* Report Modal Sheet */}
      <BottomSheet visible={!!reportTarget} onClose={() => setReportTarget(null)}>
        <SheetHeader
          title={`${t.friends.reportTitle}${reportTarget ? ` · ${reportTarget.name}` : ''}`}
          right={{ label: t.common.close, onPress: () => setReportTarget(null) }}
        />
        <View style={[styles.sheetBody, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.chipRow}>
            {REPORT_REASONS.map((r) => (
              <Chip
                key={r}
                label={t.friends.reportReasons[r]}
                kind={reportReason === r ? 'accent' : 'neutral'}
                onPress={() => {
                  haptic.select();
                  setReportReason(r);
                }}
              />
            ))}
          </View>
          <TextField
            label={t.friends.reportDetails}
            value={reportDetails}
            onChangeText={setReportDetails}
            placeholder="..."
            multiline
            maxLength={300}
          />
          {reportDone ? <Notice text={t.friends.reportSent} tone="success" /> : null}
          <PillButton
            label={t.friends.submitReport}
            kind="destructive"
            icon={<ShieldWarning size={18} weight="fill" color={c.danger} />}
            onPress={() => void handleSubmitReport()}
            block
          />
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  body: { padding: space.screen, gap: space.gap },
  gap: { gap: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  qrCornerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passPanel: {
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.inset,
    borderWidth: StyleSheet.hairlineWidth,
  },
  qrPreviewTile: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 10,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  enlargeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  enlargeLabel: {
    fontSize: 11,
    lineHeight: 14,
    ...fontFor(700),
  },
  codeBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  codePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: radius.inset - 4,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 50,
  },
  codePillText: {
    letterSpacing: 5,
    fontSize: 24,
    lineHeight: 30,
  },
  copyPillTag: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  regenBtn: {
    width: 50,
    height: 50,
    borderRadius: radius.inset - 4,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryPair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  initialBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPair: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  moreBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetBody: { paddingHorizontal: space.screen, paddingTop: 8, gap: 12 },
});
