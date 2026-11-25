import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Copy } from '@/components/ui/icons';

import { Card, ListGroup, ListRow, Notice, PillButton, PressableScale, Text, TextField } from '@/components/ui';
import { useTheme } from '@/design/theme';
import { fontFor } from '@/design/typography';
import { teacherStrings as T } from '@/i18n/staff';
import * as api from '@/services/backend/api';
import { loadClasses, useTeacher } from '@/services/backend/teacher';
import { useAuth } from '@/store/useAuth';

export function CreateClassCard({ first, onDone, onCancel }: { first: boolean; onDone: () => void; onCancel?: () => void }) {
  const { c } = useTheme();
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('8');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const cls = await api.createClass(name, Number(grade));
      await loadClasses();
      useTeacher.getState().select(cls.id);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={styles.gap}>
      {!first ? <Text variant="title">{T.newClass}</Text> : null}
      <Text variant="subhead">{T.createSub}</Text>
      {error ? <Notice text={error} /> : null}
      <TextField label={T.className} placeholder={T.classNamePh} value={name} onChangeText={setName} maxLength={60} />
      <Text variant="subhead" color="text">
        {T.grade}
      </Text>
      <View style={styles.grades}>
        {Array.from({ length: 10 }, (_, i) => String(i + 1)).map((g) => (
          <PressableScale
            key={g}
            accessibilityLabel={`Grade ${g}`}
            accessibilityState={{ selected: grade === g }}
            onPress={() => setGrade(g)}
            style={[styles.gradePill, { backgroundColor: grade === g ? c.accent : c.inset }]}
          >
            <Text color={grade === g ? c.onAccent : c.text}>{g}</Text>
          </PressableScale>
        ))}
      </View>
      <PillButton label={busy ? '…' : T.create} block disabled={busy || !name.trim()} onPress={create} />
      {onCancel ? <PillButton label="Cancel" kind="neutral" block onPress={onCancel} /> : null}
    </Card>
  );
}

export function JoinCodeCard({ code }: { code: string }) {
  const { c } = useTheme();
  const [copied, setCopied] = useState(false);
  return (
    <Card style={styles.joinCard}>
      <View style={styles.flex}>
        <Text variant="overline">{T.joinCode}</Text>
        <Text variant="title" style={[fontFor(800), styles.codeText]} selectable>
          {code}
        </Text>
        <Text variant="caption">{T.joinCodeSub}</Text>
      </View>
      <PillButton
        label={copied ? '✓' : 'Copy'}
        kind="secondary"
        size="sm"
        icon={copied ? undefined : <Copy size={15} weight="bold" color={c.accent} />}
        onPress={() => {
          Clipboard.setStringAsync(code).then(() => setCopied(true));
        }}
      />
    </Card>
  );
}

export function TeacherAccountCard({ classId }: { classId?: string }) {
  const me = useAuth((s) => s.profile);
  const [confirm, setConfirm] = useState<'class' | 'account' | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!me) return null;
  return (
    <View style={styles.gap}>
      <Text variant="overline" style={styles.label}>
        {T.account} · {me.email}
      </Text>
      {error ? <Notice text={error} /> : null}
      <ListGroup>
        {classId ? (
          <ListRow
            title={confirm === 'class' ? T.deleteConfirm : T.deleteClass}
            destructive
            chevron={false}
            onPress={() => {
              if (confirm !== 'class') return setConfirm('class');
              setConfirm(null);
              api
                .deleteClass(classId)
                .then(() => loadClasses())
                .catch((e: Error) => setError(e.message));
            }}
          />
        ) : null}
        <ListRow
          title={T.signOut}
          chevron={false}
          onPress={async () => {
            await api.signOut();
            router.replace('/onboarding');
          }}
        />
        <ListRow
          title={confirm === 'account' ? T.deleteAccountConfirm : T.deleteAccount}
          destructive
          chevron={false}
          onPress={async () => {
            if (confirm !== 'account') return setConfirm('account');
            try {
              await api.deleteAccount();
              router.replace('/onboarding');
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      </ListGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 12 },
  grades: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gradePill: { minWidth: 48, minHeight: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  joinCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  codeText: { letterSpacing: 4, fontSize: 30, lineHeight: 36 },
  label: { paddingHorizontal: 4, marginTop: 8 },
});
