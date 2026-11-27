import { useState } from 'react';

import { useFocusTrap } from '@/components/teacher/DesktopOverlay';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Notice, PillButton, Text, TextField } from '@/components/ui';
import { useTheme } from '@/design/theme';

type Props = {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  /** When set, the teacher must type this exactly to enable the action. */
  typeToConfirm?: string;
  destructive?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
};

/**
 * Centered confirmation for actions that can't be undone. Esc and the
 * backdrop cancel; the action button locks while it runs.
 */
export function ConfirmDialog(props: Props) {
  if (!props.visible) return null;
  return <Dialog {...props} />;
}

function Dialog({ title, body, confirmLabel, typeToConfirm, destructive = true, onConfirm, onClose }: Props) {
  const { c } = useTheme();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = !typeToConfirm || typed.trim() === typeToConfirm.trim();
  const trap = useFocusTrap(true, () => {
    if (!busy) onClose();
  });

  const run = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal transparent visible animationType="fade" onRequestClose={busy ? () => {} : onClose}>
      <View style={styles.wrap}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}
          onPress={busy ? undefined : onClose}
          accessibilityLabel="Cancel"
        />
        <View
          ref={trap}
          style={[styles.card, { backgroundColor: c.card, borderColor: c.hairline }]}
          accessibilityViewIsModal
          role="alertdialog"
          aria-label={title}
        >
          <Text variant="title">{title}</Text>
          <Text variant="body">{body}</Text>
          {typeToConfirm ? (
            <TextField
              label={`Type "${typeToConfirm}" to confirm`}
              value={typed}
              onChangeText={setTyped}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={run}
            />
          ) : null}
          {error ? <Notice text={error} /> : null}
          <View style={styles.actions}>
            <PillButton label="Cancel" kind="neutral" onPress={onClose} disabled={busy} />
            <PillButton
              label={busy ? 'Working…' : confirmLabel}
              kind={destructive ? 'destructive' : 'primary'}
              onPress={run}
              disabled={!ready || busy}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 440, borderRadius: 20, borderWidth: 1, padding: 24, gap: 14 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
});
