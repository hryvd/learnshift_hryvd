import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DesktopDialog } from '@/components/teacher/DesktopOverlay';
import { Field, ItemHead } from '@/components/teacher/TeacherUploadDialog';
import { Notice, PillButton, SegmentedControl, Text } from '@/components/ui';
import { useTheme } from '@/design/theme';
import { radius } from '@/design/tokens';
import { teacherStrings as T } from '@/i18n/staff';
import { IS_PITCH } from '@/lib/config';
import type { ClassModule, ModuleQuestion } from '@/services/ai/moduleGenerator';
import { copyModuleToClasses, updateModule, useTeacher } from '@/services/backend/teacher';
import { useAppStore } from '@/store/useAppStore';

/** Fix a published module in place: students get the corrected version on their next sync. */
export function EditModuleDialog({ mod, onClose }: { mod: ClassModule | null; onClose: () => void }) {
  if (!mod) return null;
  return <Editor key={mod.id} mod={mod} onClose={onClose} />;
}

function Editor({ mod, onClose }: { mod: ClassModule; onClose: () => void }) {
  const { c } = useTheme();
  const [draft, setDraft] = useState(mod);
  const [tab, setTab] = useState<'cards' | 'quiz'>('cards');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ClassModule>) => setDraft((d) => ({ ...d, ...patch }));
  const setQ = (id: string, patch: Partial<ModuleQuestion>) =>
    set({ questions: draft.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) });

  const save = async () => {
    if (!draft.title.trim()) return setError('Give the module a title.');
    if (draft.flashcards.some((f) => !f.front.trim() || !f.back.trim())) return setError('Every flashcard needs a front and a back.');
    if (draft.questions.some((q) => !q.prompt.trim() || q.options.some((o) => !o.trim())))
      return setError('Every quiz question needs a prompt and four answers.');
    setBusy(true);
    setError(null);
    try {
      if (IS_PITCH) useAppStore.getState().addPitchModule(draft);
      else await updateModule(draft);
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
      title={`Edit "${mod.title}"`}
      subtitle="Published module"
      maxWidth={820}
      footer={
        <>
          <PillButton label="Cancel" kind="neutral" onPress={onClose} disabled={busy} />
          <PillButton label={busy ? 'Saving…' : 'Save changes'} onPress={save} disabled={busy} />
        </>
      }
    >
      {error ? <Notice text={error} /> : null}
      <Field label="Title" value={draft.title} onChange={(v) => set({ title: v })} max={120} />
      <Field label="Summary" value={draft.summary} onChange={(v) => set({ summary: v })} multiline minHeight={80} />
      <SegmentedControl
        options={[
          { value: 'cards', label: `${T.flashcards} (${draft.flashcards.length})` },
          { value: 'quiz', label: `Quiz (${draft.questions.length})` },
        ]}
        value={tab}
        onChange={(v) => setTab(v as 'cards' | 'quiz')}
      />
      {tab === 'cards'
        ? draft.flashcards.map((f, i) => (
            <View key={f.id} style={[styles.item, { backgroundColor: c.inset }]}>
              <ItemHead n={i + 1} kind="Flashcard" onDelete={() => set({ flashcards: draft.flashcards.filter((x) => x.id !== f.id) })} />
              <Field label="Front" value={f.front} onChange={(v) => set({ flashcards: draft.flashcards.map((x) => (x.id === f.id ? { ...x, front: v } : x)) })} />
              <Field label="Back" value={f.back} multiline onChange={(v) => set({ flashcards: draft.flashcards.map((x) => (x.id === f.id ? { ...x, back: v } : x)) })} />
            </View>
          ))
        : draft.questions.map((q, i) => (
            <View key={q.id} style={[styles.item, { backgroundColor: c.inset }]}>
              <ItemHead n={i + 1} kind="Question" onDelete={() => set({ questions: draft.questions.filter((x) => x.id !== q.id) })} />
              <Field label="Question" value={q.prompt} multiline onChange={(v) => setQ(q.id, { prompt: v })} />
              {q.options.map((o, k) => (
                <View key={k} style={styles.opt}>
                  <Pressable
                    role="radio"
                    aria-checked={q.answer === k}
                    accessibilityLabel={`Mark answer ${k + 1} correct`}
                    onPress={() => setQ(q.id, { answer: k })}
                    style={[styles.radio, { borderColor: q.answer === k ? c.success : c.textTertiary }]}
                  >
                    {q.answer === k ? <View style={[styles.dot, { backgroundColor: c.success }]} /> : null}
                  </Pressable>
                  <View style={styles.flex}>
                    <Field
                      label={`Answer ${k + 1}`}
                      hideLabel
                      value={o}
                      onChange={(v) => {
                        const opts = [...q.options] as ModuleQuestion['options'];
                        opts[k] = v;
                        setQ(q.id, { options: opts });
                      }}
                    />
                  </View>
                </View>
              ))}
              <Field label="Explanation" value={q.explanation} multiline onChange={(v) => setQ(q.id, { explanation: v })} />
            </View>
          ))}
    </DesktopDialog>
  );
}

/** Publish the same module to other sections in one step. */
export function CopyModuleDialog({ mod, onClose }: { mod: ClassModule | null; onClose: () => void }) {
  const { c } = useTheme();
  const classes = useTeacher((s) => s.classes);
  const [targets, setTargets] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  if (!mod) return null;
  const others = classes.filter((x) => x.id !== mod.classId);
  const close = () => {
    setTargets([]);
    setDone(null);
    setError(null);
    onClose();
  };
  const copy = async () => {
    setBusy(true);
    setError(null);
    try {
      const { saved } = await copyModuleToClasses(mod, targets);
      setDone(`Copied to ${saved.length} ${saved.length === 1 ? 'class' : 'classes'}.`);
      setTimeout(close, 1200);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <DesktopDialog
      visible
      onClose={close}
      locked={busy}
      title={`Copy "${mod.title}"`}
      subtitle="Publish to other classes"
      maxWidth={480}
      footer={
        <>
          <PillButton label="Cancel" kind="neutral" onPress={close} disabled={busy} />
          <PillButton
            label={busy ? 'Copying…' : `Copy to ${targets.length || ''} ${targets.length === 1 ? 'class' : 'classes'}`.replace('  ', ' ')}
            onPress={copy}
            disabled={busy || !targets.length || !!done}
          />
        </>
      }
    >
      {error ? <Notice text={error} /> : null}
      {done ? <Notice tone="success" text={done} /> : null}
      {others.length === 0 ? (
        <Text variant="body">You have no other classes yet. Create one in Settings.</Text>
      ) : (
        others.map((cl) => {
          const on = targets.includes(cl.id);
          return (
            <Pressable
              key={cl.id}
              role="checkbox"
              aria-checked={on}
              onPress={() => setTargets((t) => (on ? t.filter((x) => x !== cl.id) : [...t, cl.id]))}
              style={({ hovered }) => [styles.check, { borderColor: on ? c.accent : c.hairline }, hovered && { backgroundColor: c.inset }]}
            >
              <View style={[styles.box, { borderColor: on ? c.accent : c.textTertiary, backgroundColor: on ? c.accent : 'transparent' }]} />
              <Text variant="subhead" color="text">
                {cl.name} · Grade {cl.grade}
              </Text>
            </Pressable>
          );
        })
      )}
    </DesktopDialog>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  item: { borderRadius: radius.inset, padding: 14, gap: 8 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, padding: 12 },
  box: { width: 18, height: 18, borderRadius: 5, borderWidth: 2 },
});
