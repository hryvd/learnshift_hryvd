import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { ConfirmDialog } from '@/components/teacher/ConfirmDialog';
import { InviteDialog } from '@/components/teacher/InviteDialog';
import { useDesktop } from '@/hooks/useDesktop';
import { Copy, QrCode, Trash } from '@/components/ui/icons';

import { AccountManageSection } from '@/components/account/AccountManageSection';
import { DeleteAccountSheet } from '@/components/account/DeleteAccountSheet';

import { Card, ListGroup, ListRow, Notice, PillButton, PressableScale, Text, TextField } from '@/components/ui';
import { useTheme } from '@/design/theme';
import { FONT_MAIN, fontFor } from '@/design/typography';
import { teacherStrings as T } from '@/i18n/staff';
import { stringsFor } from '@/i18n/useT';
import * as api from '@/services/backend/api';
import { clearTeacherCache, loadClasses, useTeacher } from '@/services/backend/teacher';
import { useAuth } from '@/store/useAuth';

/** Teacher copy is English only. */
const MANAGE_EN = stringsFor('en').manage;

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

export function JoinCodeCard({ code, className, classId }: { code: string; className?: string; classId?: string }) {
  const { c } = useTheme();
  const [copied, setCopied] = useState(false);
  const [projecting, setProjecting] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <>
    <Card style={styles.joinCard}>
      <View style={styles.flex}>
        <Text variant="overline">{T.joinCode}</Text>
        <Text variant="title" style={[fontFor(800), styles.codeText]} selectable>
          {code}
        </Text>
        <Text variant="caption">{T.joinCodeSub}</Text>
      </View>
      <View style={styles.joinActions}>
        <PillButton
          label={copied ? 'Copied' : 'Copy'}
          kind="secondary"
          size="sm"
          icon={copied ? undefined : <Copy size={15} weight="bold" color={c.accent} />}
          onPress={() => {
            Clipboard.setStringAsync(code).then(() => setCopied(true));
          }}
        />
        <PillButton
          label="Invite"
          kind="neutral"
          size="sm"
          icon={<QrCode size={15} weight="bold" color={c.text} />}
          accessibilityLabel="Invite students with a QR code and link"
          onPress={() => setProjecting(true)}
        />
      </View>
    </Card>
    <InviteDialog visible={projecting} code={code} className={className} classId={classId} onClose={() => setProjecting(false)} />
    </>
  );
}

export function TeacherAccountCard({ classId }: { classId?: string }) {
  const { c } = useTheme();
  const me = useAuth((s) => s.profile);
  const [confirm, setConfirm] = useState<'class' | null>(null);
  const className = useTeacher((s) => s.classes.find((x) => x.id === classId)?.name);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deskDelete, setDeskDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isDesktop } = useDesktop();
  if (!me) return null;
  return (
    <View style={styles.gap}>
      <Text variant="overline" style={styles.label}>
        {T.account} · {me.email}
      </Text>
      <AccountManageSection copy={MANAGE_EN} />
      {error ? <Notice text={error} /> : null}
      <ListGroup>
        {classId && !isDesktop ? (
          <ListRow title={T.deleteClass} destructive chevron={false} onPress={() => setConfirm('class')} />
        ) : null}
        <ListRow
          title={T.signOut}
          chevron={false}
          onPress={async () => {
            setError(null);
            // Shared school laptops: leave no student data behind.
            clearTeacherCache();
            await api.signOut();
            router.replace('/onboarding');
          }}
        />
      </ListGroup>
      <ListGroup style={styles.danger}>
        <ListRow
          title={T.deleteAccount}
          icon={<Trash size={20} weight="bold" color={c.danger} />}
          destructive
          onPress={() => (isDesktop ? setDeskDelete(true) : setDeleteOpen(true))}
        />
      </ListGroup>
      <ConfirmDialog
        visible={confirm === 'class' && !!classId}
        title={`Delete ${className ?? 'this class'}?`}
        body="Students are removed from the class and its modules are deleted. Students keep their own learning history. This can't be undone."
        confirmLabel="Delete class"
        typeToConfirm={className}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          await api.deleteClass(classId!);
          await loadClasses();
        }}
      />
      <ConfirmDialog
        visible={deskDelete}
        title="Delete your teacher account?"
        body="This deletes your account, all your classes and their modules. Students keep their own learning history. This can't be undone."
        confirmLabel="Delete account"
        typeToConfirm={me.email ?? undefined}
        onClose={() => setDeskDelete(false)}
        onConfirm={async () => {
          await api.deleteAccount();
          clearTeacherCache();
          router.replace('/onboarding');
        }}
      />
      <DeleteAccountSheet
        portal
        visible={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        copy={MANAGE_EN}
        role="teacher"
        onConfirm={async () => {
          await api.deleteAccount();
          clearTeacherCache();
          setDeleteOpen(false);
          router.replace('/onboarding');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 12 },
  grades: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gradePill: { minWidth: 48, minHeight: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  joinCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  joinActions: { gap: 8 },
  projector: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 28,
    backgroundColor: '#0D1020',
  },
  projCode: { fontFamily: FONT_MAIN, fontSize: 120, lineHeight: 140, letterSpacing: 16 },
  projSub: { maxWidth: 760 },
  codeText: { letterSpacing: 4, fontSize: 30, lineHeight: 36 },
  label: { paddingHorizontal: 4, marginTop: 8 },
  danger: { marginTop: 8 },
});
