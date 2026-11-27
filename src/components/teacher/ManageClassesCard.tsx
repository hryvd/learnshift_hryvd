import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ConfirmDialog } from '@/components/teacher/ConfirmDialog';
import { DesktopDialog } from '@/components/teacher/DesktopOverlay';
import { Card, Notice, PillButton, Text, TextField } from '@/components/ui';
import { useTheme } from '@/design/theme';
import * as api from '@/services/backend/api';
import { loadClasses, useTeacher, type TeacherClass } from '@/services/backend/teacher';

/** Laptop: every class in one place — rename, change grade (1–10), delete. */
export function ManageClassesCard() {
  const { c } = useTheme();
  const classes = useTeacher((s) => s.classes);
  const students = useTeacher((s) => s.students);
  const [editing, setEditing] = useState<TeacherClass | null>(null);
  const [deleting, setDeleting] = useState<TeacherClass | null>(null);
  return (
    <Card style={styles.gap}>
      <Text variant="headline">Manage classes</Text>
      {classes.length === 0 ? <Text variant="subhead">No classes yet.</Text> : null}
      {classes.map((cl) => (
        <View key={cl.id} style={[styles.row, { borderColor: c.hairline }]}>
          <View style={styles.flex}>
            <Text variant="subhead" color="text" numberOfLines={1}>
              {cl.name}
            </Text>
            <Text variant="caption">
              Grade {cl.grade}
              {students[cl.id] ? ` · ${students[cl.id].length} ${students[cl.id].length === 1 ? 'student' : 'students'}` : ''} · code {cl.join_code}
            </Text>
          </View>
          <PillButton label="Edit" kind="neutral" size="sm" onPress={() => setEditing(cl)} accessibilityLabel={`Edit ${cl.name}`} />
          <PillButton label="Delete" kind="destructive" size="sm" onPress={() => setDeleting(cl)} accessibilityLabel={`Delete ${cl.name}`} />
        </View>
      ))}
      <EditClassDialog cls={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        visible={!!deleting}
        title={`Delete ${deleting?.name ?? 'this class'}?`}
        body="Students are removed from the class and its modules are deleted. Students keep their own learning history. This can't be undone."
        confirmLabel="Delete class"
        typeToConfirm={deleting?.name}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          const id = deleting?.id;
          if (!id) return;
          await api.deleteClass(id);
          await loadClasses();
        }}
      />
    </Card>
  );
}

function EditClassDialog({ cls, onClose }: { cls: TeacherClass | null; onClose: () => void }) {
  if (!cls) return null;
  return <EditForm key={cls.id} cls={cls} onClose={onClose} />;
}

function EditForm({ cls, onClose }: { cls: TeacherClass; onClose: () => void }) {
  const { c } = useTheme();
  const [name, setName] = useState(cls.name);
  const [grade, setGrade] = useState(cls.grade);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!name.trim()) return setError('Class name is required.');
    setBusy(true);
    setError(null);
    try {
      await api.updateClass(cls.id, { name, grade });
      await loadClasses();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <DesktopDialog
      visible
      onClose={onClose}
      locked={busy}
      title="Edit class"
      maxWidth={480}
      footer={
        <>
          <PillButton label="Cancel" kind="neutral" onPress={onClose} disabled={busy} />
          <PillButton label={busy ? 'Saving…' : 'Save'} onPress={save} disabled={busy || !name.trim()} />
        </>
      }
    >
      {error ? <Notice text={error} /> : null}
      <TextField label="Class name" value={name} onChangeText={setName} maxLength={60} onSubmitEditing={save} />
      <Text variant="subhead" color="text">
        Grade
      </Text>
      <View style={styles.grades} role="radiogroup" aria-label="Grade">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((g) => (
          <Pressable
            key={g}
            role="radio"
            aria-checked={grade === g}
            accessibilityLabel={`Grade ${g}`}
            onPress={() => setGrade(g)}
            style={[styles.grade, { backgroundColor: grade === g ? c.accent : c.inset }]}
          >
            <Text color={grade === g ? c.onAccent : c.text}>{g}</Text>
          </Pressable>
        ))}
      </View>
      <Text variant="caption">The join code stays the same, so students don&apos;t need to rejoin.</Text>
    </DesktopDialog>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  gap: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: 1 },
  grades: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  grade: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
