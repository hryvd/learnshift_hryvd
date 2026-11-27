import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LockKey } from '@/components/ui/icons';

import { AnimatedReveal, Card, Notice, PillButton, Text, TextField } from '@/components/ui';
import { haptic } from '@/design/haptics';
import { useTheme } from '@/design/theme';
import type { Strings } from '@/i18n/en';
import { getPasswordChangeSupport } from '@/lib/authCapabilities';
import { IS_PITCH } from '@/lib/config';
import { errorText } from '@/lib/supabase';
import * as api from '@/services/backend/api';
import { useAppStore } from '@/store/useAppStore';
import { patchProfile, useAuth } from '@/store/useAuth';

type Copy = Strings['manage'];

const NAME_MAX = 60;
const PASSWORD_MIN = 8;

/** Edit display name and, when the sign-in method allows it, the password. */
export function AccountManageSection({ copy }: { copy: Copy }) {
  return (
    <View style={styles.stack}>
      <NameCard copy={copy} />
      <PasswordCard copy={copy} />
    </View>
  );
}

type Status = { tone: 'danger' | 'success'; text: string } | null;

function NameCard({ copy }: { copy: Copy }) {
  const profile = useAuth((s) => s.profile);
  const saved = profile?.display_name ?? '';
  const [name, setName] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const trimmed = name.trim().replace(/\s+/g, ' ');
  const error = !trimmed ? copy.nameEmpty : trimmed.length > NAME_MAX ? copy.nameTooLong : null;
  const unchanged = trimmed === saved.trim();

  const save = async () => {
    if (busy || error || unchanged || !profile) return;
    setBusy(true);
    setStatus(null);
    try {
      await api.updateProfile({ display_name: trimmed });
      patchProfile({ display_name: trimmed });
      if (profile.role === 'student') useAppStore.getState().hydrate({ studentName: trimmed });
      setName(trimmed);
      setStatus({ tone: 'success', text: copy.nameSaved });
      haptic.success();
    } catch (e) {
      // Keep what they typed so they can retry.
      setStatus({ tone: 'danger', text: errorText(e) });
      haptic.warning();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text variant="headline">{copy.nameTitle}</Text>
        <Text variant="subhead">{copy.nameHelp}</Text>
      </View>
      <TextField
        label={copy.nameLabel}
        value={name}
        onChangeText={(v) => {
          setName(v);
          if (status) setStatus(null);
        }}
        error={unchanged ? null : error}
        maxLength={NAME_MAX + 10}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="done"
        onSubmitEditing={() => void save()}
        editable={!busy}
      />
      {status ? <Notice text={status.text} tone={status.tone} /> : null}
      <PillButton
        label={busy ? copy.saving : copy.saveName}
        disabled={busy || !!error || unchanged}
        onPress={() => void save()}
        block
      />
    </Card>
  );
}

function PasswordCard({ copy }: { copy: Copy }) {
  const { c } = useTheme();
  const session = useAuth((s) => s.session);
  const support = getPasswordChangeSupport(session, IS_PITCH);
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  if (!support.supported) {
    const text =
      support.reason === 'demo'
        ? copy.unsupportedDemo
        : support.reason === 'external_provider'
          ? copy.unsupportedProvider(support.providerLabel)
          : copy.unsupportedUnknown;
    return (
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.badge, { backgroundColor: c.inset }]}>
            <LockKey size={18} weight="fill" color={c.textSecondary} />
          </View>
          <View style={styles.flex}>
            <Text variant="headline">{copy.passwordTitle}</Text>
            <Text variant="subhead">{text}</Text>
          </View>
        </View>
      </Card>
    );
  }

  const short = pw.length > 0 && pw.length < PASSWORD_MIN;
  const mismatch = confirm.length > 0 && confirm !== pw;
  const valid = pw.length >= PASSWORD_MIN && confirm === pw;

  const reset = () => {
    setPw('');
    setConfirm('');
    setTouched(false);
  };

  const save = async () => {
    setTouched(true);
    if (busy || !valid) return;
    setBusy(true);
    setStatus(null);
    try {
      await api.updatePassword(pw);
      reset();
      setOpen(false);
      setStatus({ tone: 'success', text: copy.passwordSaved });
      haptic.success();
    } catch (e) {
      setStatus({ tone: 'danger', text: errorText(e) });
      haptic.warning();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={[styles.badge, { backgroundColor: c.accentTint }]}>
          <LockKey size={18} weight="fill" color={c.accent} />
        </View>
        <View style={styles.flex}>
          <Text variant="headline">{copy.passwordTitle}</Text>
          <Text variant="subhead">{copy.passwordSub}</Text>
        </View>
      </View>
      {status ? <Notice text={status.text} tone={status.tone} /> : null}
      {!open ? (
        <PillButton
          label={copy.changePassword}
          kind="secondary"
          block
          onPress={() => {
            setStatus(null);
            setOpen(true);
          }}
        />
      ) : null}
      <AnimatedReveal visible={open} gap={12}>
        <View style={styles.form}>
          <TextField
            label={copy.newPassword}
            value={pw}
            onChangeText={setPw}
            secret
            autoComplete="new-password"
            textContentType="newPassword"
            autoCapitalize="none"
            error={short && touched ? copy.passwordShort : null}
            onBlur={() => setTouched(true)}
            editable={!busy}
          />
          <TextField
            label={copy.confirmPassword}
            value={confirm}
            onChangeText={setConfirm}
            secret
            autoComplete="new-password"
            textContentType="newPassword"
            autoCapitalize="none"
            error={mismatch && (touched || confirm.length >= pw.length) ? copy.passwordMismatch : null}
            returnKeyType="done"
            onSubmitEditing={() => void save()}
            editable={!busy}
          />
          <View style={styles.actions}>
            <PillButton
              label={copy.cancel}
              kind="neutral"
              style={styles.flex}
              block
              disabled={busy}
              onPress={() => {
                reset();
                setStatus(null);
                setOpen(false);
              }}
            />
            <PillButton
              label={busy ? copy.saving : copy.savePassword}
              style={styles.flex}
              block
              disabled={busy || !valid}
              onPress={() => void save()}
            />
          </View>
        </View>
      </AnimatedReveal>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  card: { gap: 12 },
  head: { gap: 2 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  form: { gap: 12 },
  actions: { flexDirection: 'row', gap: 10 },
});
