import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BookOpen,
  CaretLeft,
  Flag,
  PaperPlaneTilt,
  Prohibit,
  ShieldWarning,
  Smiley,
  Sparkle,
} from 'phosphor-react-native';

import { Paty, type Expression } from '@/components/mascot/Paty';
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
  Text,
  TextField,
} from '@/components/ui';
import { PATY_STICKERS, QUICK_PHRASES, type ChatMessage } from '@/data/kapuluan';
import { haptic } from '@/design/haptics';
import { pressScale } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { fontFor } from '@/design/typography';
import { useL, useT } from '@/i18n/useT';
import { IS_PITCH } from '@/lib/config';
import { checkProfanity } from '@/lib/profanity';
import {
  blockUser,
  loadConversationMessages,
  reportUser,
  sendConversationMessage,
  useSocial,
} from '@/services/backend/social';
import { useAuth } from '@/store/useAuth';

type DrawerTab = 'stickers' | 'phrases' | null;
type ReportReason = 'bullying' | 'profanity' | 'spam' | 'inappropriate' | 'other';
const REPORT_REASONS: ReportReason[] = ['bullying', 'profanity', 'spam', 'inappropriate', 'other'];

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const convId = typeof id === 'string' ? id : '';
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const L = useL();

  const profileId = useAuth((s) => s.profile?.id);
  const myId = IS_PITCH ? 'pitch-me' : (profileId ?? 'me');

  const socialEnabled = useSocial((s) => s.socialEnabled);
  const chatEnabled = useSocial((s) => s.chatEnabled);
  const conv = useSocial((s) => s.conversations.find((x) => x.id === convId));
  const messages = useSocial((s) => s.messagesByConv[convId] ?? []);

  const [draft, setDraft] = useState('');
  const [drawer, setDrawer] = useState<DrawerTab>('stickers');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [safetyOpen, setSafetyOpen] = useState(false);
  const [reportMsg, setReportMsg] = useState<ChatMessage | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>('profanity');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSent, setReportSent] = useState(false);

  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    if (!convId) return;
    void loadConversationMessages(convId).catch(() => {});
  }, [convId]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length]);

  const sendText = async () => {
    const clean = draft.trim();
    if (!clean || !convId || sending) return;
    if (!checkProfanity(clean).ok) {
      haptic.warning();
      setErrorText(t.chat.profanityError);
      return;
    }
    setErrorText(null);
    setDraft('');
    setSending(true);
    try {
      await sendConversationMessage(convId, clean, 'text');
      haptic.select();
    } catch (e) {
      haptic.warning();
      setDraft(clean);
      setErrorText(e instanceof Error ? e.message : t.chat.profanityError);
    } finally {
      setSending(false);
    }
  };

  const sendSticker = async (expression: Expression, body: string, stickerId: string) => {
    if (!convId || sending) return;
    setErrorText(null);
    setSending(true);
    try {
      await sendConversationMessage(convId, body, 'sticker', { expression, stickerId });
      haptic.select();
    } catch (e) {
      haptic.warning();
      setErrorText(e instanceof Error ? e.message : 'Could not send sticker.');
    } finally {
      setSending(false);
    }
  };

  const sendPhrase = async (body: string) => {
    if (!convId || sending) return;
    setErrorText(null);
    setSending(true);
    try {
      await sendConversationMessage(convId, body, 'phrase');
      haptic.select();
    } catch (e) {
      haptic.warning();
      setErrorText(e instanceof Error ? e.message : 'Could not send cheer.');
    } finally {
      setSending(false);
    }
  };

  const sendStudyInvite = async () => {
    if (!convId || sending) return;
    setErrorText(null);
    setSending(true);
    try {
      await sendConversationMessage(convId, t.chat.studyInviteBody, 'study_invite', { route: '/feed' });
      haptic.success();
    } catch (e) {
      haptic.warning();
      setErrorText(e instanceof Error ? e.message : 'Could not send study invite.');
    } finally {
      setSending(false);
    }
  };

  const targetUserId = reportMsg?.senderId ?? conv?.otherUserId ?? null;

  const submitReport = async () => {
    if (!targetUserId && !reportMsg) return;
    try {
      await reportUser(targetUserId, reportReason, reportDetails, reportMsg?.id ?? null);
      haptic.success();
      setReportSent(true);
      setTimeout(() => {
        setSafetyOpen(false);
        setReportMsg(null);
        setReportSent(false);
        setReportDetails('');
      }, 1100);
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : 'Could not submit report.');
    }
  };

  const handleBlock = async () => {
    if (!targetUserId) return;
    setSafetyOpen(false);
    await blockUser(targetUserId);
    haptic.warning();
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: c.bg, paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <NavBar
        title={conv?.title ?? t.friends.chats}
        onBack={() => router.back()}
        backIcon={<CaretLeft size={18} weight="bold" color={c.text} />}
        backLabel={t.common.back}
        right={
          conv?.otherUserId ? (
            <IconButton
              icon={<ShieldWarning size={18} weight="fill" color={c.text} />}
              onPress={() => {
                setReportMsg(null);
                setReportSent(false);
                setSafetyOpen(true);
              }}
              accessibilityLabel={t.friends.report}
            />
          ) : null
        }
      />

      {!socialEnabled || !chatEnabled ? (
        <View style={styles.disabledWrap}>
          <Card>
            <EmptyState expression="sleepy" title={t.chat.chatDisabledTitle} subtitle={t.chat.chatDisabledSub} />
          </Card>
        </View>
      ) : (
        <>
          <ScrollView ref={scrollRef} contentContainerStyle={styles.msgList} keyboardShouldPersistTaps="handled">
            {messages.length === 0 ? (
              <EmptyState expression="waving" title={t.friends.chats} subtitle={t.chat.emptyChat} />
            ) : null}

            {messages.map((m) => {
              if (m.kind === 'system') {
                return (
                  <View key={m.id} style={[styles.sysPill, { backgroundColor: c.inset }]}>
                    <Sparkle size={13} weight="fill" color={c.accent} />
                    <Text variant="caption" color="textSecondary" align="center">
                      {m.body}
                    </Text>
                  </View>
                );
              }

              const mine = m.senderId === myId;
              const senderText = m.senderLabel === 'Former student' ? t.chat.formerStudent : m.senderLabel;
              const stickerExpr = (m.meta?.expression as Expression | undefined) ?? 'cheering';

              return (
                <View key={m.id} style={[styles.msgRow, mine ? styles.msgMine : styles.msgTheirs]}>
                  {!mine ? (
                    <View style={styles.senderHead}>
                      <Text variant="caption" color="textSecondary" style={fontFor(600)}>
                        {senderText}
                      </Text>
                      {m.senderId ? (
                        <PressableScale
                          onPress={() => {
                            setReportMsg(m);
                            setReportSent(false);
                            setSafetyOpen(true);
                          }}
                          accessibilityLabel={t.chat.reportMessage}
                          hitSlop={10}
                          style={styles.flagTap}
                        >
                          <Flag size={12} weight="bold" color={c.textTertiary} />
                        </PressableScale>
                      ) : null}
                    </View>
                  ) : null}

                  {m.kind === 'sticker' ? (
                    <View
                      style={[
                        styles.stickerCard,
                        { backgroundColor: mine ? c.accentTint : c.card, borderColor: c.hairline },
                      ]}
                    >
                      <Paty expression={stickerExpr} size={68} alive={false} />
                      <Text variant="subhead" color="text" style={fontFor(700)}>
                        {m.body}
                      </Text>
                    </View>
                  ) : m.kind === 'study_invite' ? (
                    <View style={[styles.inviteBubble, { backgroundColor: c.card, borderColor: c.accent }]}>
                      <View style={styles.inviteHead}>
                        <BookOpen size={18} weight="fill" color={c.accent} />
                        <Text variant="headline" color="text" style={styles.flex}>
                          {m.body}
                        </Text>
                      </View>
                      <PillButton
                        label={t.chat.studyNow}
                        size="sm"
                        kind="primary"
                        onPress={() => {
                          haptic.select();
                          router.push('/feed');
                        }}
                      />
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.bubble,
                        {
                          backgroundColor: mine ? c.accent : c.card,
                          opacity: m.pending ? 0.72 : 1,
                        },
                      ]}
                    >
                      {m.kind === 'phrase' ? (
                        <View style={styles.phraseRow}>
                          <Sparkle size={14} weight="fill" color={mine ? c.onAccent : c.spark} />
                          <Text variant="body" color={mine ? 'onAccent' : 'text'} style={[styles.flex, fontFor(600)]}>
                            {m.body}
                          </Text>
                        </View>
                      ) : (
                        <Text variant="body" color={mine ? 'onAccent' : 'text'}>
                          {m.body}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>

          {errorText ? (
            <View style={styles.errWrap}>
              <Notice text={errorText} tone="danger" />
            </View>
          ) : null}

          {/* Quick Sticker / Cheer / Study Together Strip */}
          <View
            style={[
              styles.composerWrap,
              { borderColor: c.hairline, backgroundColor: c.bg, paddingBottom: Math.max(insets.bottom, 12) },
            ]}
          >
            <View style={styles.drawerTabs}>
              <Chip
                label={t.chat.stickers}
                kind={drawer === 'stickers' ? 'accent' : 'neutral'}
                icon={<Smiley size={14} weight="fill" color={drawer === 'stickers' ? c.onAccent : c.text} />}
                onPress={() => {
                  haptic.select();
                  setDrawer(drawer === 'stickers' ? null : 'stickers');
                }}
              />
              <Chip
                label={t.chat.phrases}
                kind={drawer === 'phrases' ? 'accent' : 'neutral'}
                icon={<Sparkle size={14} weight="fill" color={drawer === 'phrases' ? c.onAccent : c.spark} />}
                onPress={() => {
                  haptic.select();
                  setDrawer(drawer === 'phrases' ? null : 'phrases');
                }}
              />
              <Chip
                label={t.chat.studyInvite}
                kind="tinted"
                icon={<BookOpen size={14} weight="fill" color={c.accent} />}
                onPress={() => void sendStudyInvite()}
              />
            </View>

            {drawer === 'stickers' ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.drawerScroll}>
                {PATY_STICKERS.map((st) => (
                  <PressableScale
                    key={st.id}
                    scaleTo={pressScale.card}
                    onPress={() => void sendSticker(st.expression, L(st.label), st.id)}
                    style={[styles.stickerPick, { backgroundColor: c.card, borderColor: c.hairline }]}
                  >
                    <Paty expression={st.expression} size={42} alive={false} />
                    <Text variant="caption" color="text" numberOfLines={1} style={fontFor(600)}>
                      {L(st.label)}
                    </Text>
                  </PressableScale>
                ))}
              </ScrollView>
            ) : drawer === 'phrases' ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.drawerScroll}>
                {QUICK_PHRASES.map((p, idx) => (
                  <Chip key={idx} label={L(p)} kind="outline" onPress={() => void sendPhrase(L(p))} />
                ))}
              </ScrollView>
            ) : null}

            <View style={styles.inputRow}>
              <TextInput
                value={draft}
                onChangeText={(txt) => {
                  setDraft(txt);
                  if (errorText) setErrorText(null);
                }}
                placeholder={t.chat.placeholder}
                placeholderTextColor={c.textTertiary}
                maxLength={500}
                returnKeyType="send"
                onSubmitEditing={() => void sendText()}
                style={[
                  styles.input,
                  fontFor(500),
                  { backgroundColor: c.card, borderColor: c.hairline, color: c.text },
                ]}
              />
              <IconButton
                size={46}
                tone="onAccent"
                style={{ backgroundColor: draft.trim() ? c.accent : c.inset }}
                disabled={!draft.trim() || sending}
                onPress={() => void sendText()}
                accessibilityLabel={t.chat.send}
                icon={<PaperPlaneTilt size={20} weight="fill" color={draft.trim() ? c.onAccent : c.textTertiary} />}
              />
            </View>
          </View>
        </>
      )}

      {/* Safety Sheet (Report / Block) */}
      <BottomSheet visible={safetyOpen} onClose={() => setSafetyOpen(false)}>
        <SheetHeader
          title={reportMsg ? t.chat.reportMessage : t.friends.reportTitle}
          right={{ label: t.common.close, onPress: () => setSafetyOpen(false) }}
        />
        <View style={[styles.sheetBody, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.drawerTabs}>
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
            maxLength={300}
          />
          {reportSent ? <Notice text={t.friends.reportSent} tone="success" /> : null}
          <PillButton
            label={t.friends.submitReport}
            kind="secondary"
            icon={<Flag size={18} weight="fill" color={c.accent} />}
            onPress={() => void submitReport()}
            block
          />
          {targetUserId ? (
            <PillButton
              label={t.chat.blockFriend}
              kind="destructive"
              icon={<Prohibit size={18} weight="fill" color={c.danger} />}
              onPress={() => void handleBlock()}
              block
            />
          ) : null}
        </View>
      </BottomSheet>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  disabledWrap: { flex: 1, padding: space.screen, justifyContent: 'center' },
  msgList: { padding: space.screen, gap: 10 },
  sysPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  msgRow: { maxWidth: '82%', gap: 3 },
  msgMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  msgTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  senderHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  flagTap: { padding: 4 },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  phraseRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stickerCard: {
    borderRadius: radius.inset,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 4,
  },
  inviteBubble: {
    borderRadius: radius.inset,
    borderWidth: 1.5,
    padding: 12,
    gap: 10,
    minWidth: 210,
  },
  inviteHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  errWrap: { paddingHorizontal: space.screen, paddingBottom: 6 },
  composerWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.screen,
    paddingTop: 10,
    gap: 8,
  },
  drawerTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  drawerScroll: { gap: 8, paddingVertical: 2 },
  stickerPick: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    gap: 2,
    minWidth: 84,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 100,
    borderRadius: 23,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
  },
  sheetBody: { paddingHorizontal: space.screen, paddingTop: 8, gap: 12 },
});
