import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Trash, WarningCircle } from '@/components/ui/icons';

import { AnimatedReveal, BottomSheet, HoldButton, Notice, PillButton, Text, TextField } from '@/components/ui';
import { useTheme } from '@/design/theme';
import type { Strings } from '@/i18n/en';
import { errorText } from '@/lib/supabase';

type Copy = Strings['manage'];

type Props = {
  visible: boolean;
  onClose: () => void;
  copy: Copy;
  role: 'student' | 'guardian' | 'teacher';
  /** Linked students ask their guardian instead of deleting outright. */
  request?: { guardianName: string; pending: boolean };
  /** Does the deletion (or sends the request). Throw to show an error. */
  onConfirm: () => Promise<void>;
  /** Render in a native modal layer, for callers nested inside a ScrollView. */
  portal?: boolean;
};

/**
 * Deliberate account deletion: a 1.5 s press-and-hold, with a typed
 * "DELETE" fallback for anyone who can't hold. A tap alone never deletes.
 */
export function DeleteAccountSheet({ visible, onClose, portal, ...rest }: Props) {
  const [key, setKey] = useState(0);
  // Keep the modal layer up until the sheet's exit spring has finished.
  const [layer, setLayer] = useState(visible);
  if (visible && !layer) setLayer(true);
  useEffect(() => {
    if (visible || !layer) return;
    const id = setTimeout(() => setLayer(false), 420);
    return () => clearTimeout(id);
  }, [visible, layer]);

  const sheet = (
    <BottomSheet
      visible={visible}
      onClose={() => {
        onClose();
        setKey((k) => k + 1);
      }}
      accessibilityLabel={rest.request ? rest.copy.requestTitle : rest.copy.deleteTitle}
    >
      <Body
        key={key}
        onClose={() => {
          onClose();
          setKey((k) => k + 1);
        }}
        {...rest}
      />
    </BottomSheet>
  );
  if (!portal) return sheet;
  return (
    <Modal visible={layer} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      {sheet}
    </Modal>
  );
}

function Body({ onClose, copy, role, request, onConfirm }: Omit<Props, 'visible'>) {
  const { c } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');

  const isRequest = !!request;
  const pending = !!request?.pending;
  const title = isRequest ? copy.requestTitle : copy.deleteTitle;
  const body = isRequest
    ? pending
      ? copy.requestPending(request.guardianName)
      : copy.requestBody(request.guardianName)
    : role === 'guardian'
      ? copy.deleteBodyGuardian
      : role === 'teacher'
        ? copy.deleteBodyTeacher
        : copy.deleteBody;
  const typedOk = typed.trim().toUpperCase() === copy.typeWord;

  const go = async () => {
    if (busy || pending) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <View style={styles.body}>
      <View style={styles.head}>
        <View style={[styles.badge, { backgroundColor: c.accentTint }]}>
          <WarningCircle size={22} weight="fill" color={c.danger} />
        </View>
        <Text variant="title" style={styles.flex} accessibilityRole="header">
          {title}
        </Text>
      </View>
      <Text variant="body" color="textSecondary">
        {body}
      </Text>
      {error ? <Notice text={error} /> : null}

      {!pending ? (
        <>
          <HoldButton
            label={isRequest ? copy.holdRequest : copy.hold}
            holdingLabel={copy.holding}
            busyLabel={isRequest ? copy.sending : copy.deleting}
            durationMs={1500}
            kind="destructive"
            busy={busy}
            icon={<Trash size={18} weight="bold" color={c.danger} />}
            accessibilityHint={copy.holdHint}
            onTapShort={() => setHint(true)}
            onComplete={() => void go()}
          />
          <Text variant="caption" align="center" color={hint ? 'accent' : 'textTertiary'} accessibilityLiveRegion="polite">
            {copy.holdHint}
          </Text>

          <Pressable
            onPress={() => setTyping((x) => !x)}
            accessibilityRole="button"
            accessibilityState={{ expanded: typing }}
            hitSlop={8}
            style={styles.link}
          >
            <Text variant="subhead" color="textSecondary" style={styles.underline}>
              {copy.cantHold}
            </Text>
          </Pressable>
          <AnimatedReveal visible={typing} gap={14}>
            <View style={styles.typed}>
              <TextField
                label={copy.typeLabel}
                placeholder={copy.typeWord}
                value={typed}
                onChangeText={setTyped}
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                editable={!busy}
              />
              <PillButton
                label={busy ? (isRequest ? copy.sending : copy.deleting) : isRequest ? copy.typeConfirmRequest : copy.typeConfirm}
                kind="destructive"
                block
                disabled={busy || !typedOk}
                onPress={() => void go()}
              />
            </View>
          </AnimatedReveal>
        </>
      ) : null}

      <PillButton label={copy.keep} kind="neutral" block disabled={busy} onPress={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: 14, paddingBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  link: { alignSelf: 'center', minHeight: 32, justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
  typed: { gap: 12 },
});
