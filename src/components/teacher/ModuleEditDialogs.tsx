import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { FileText } from '@/components/ui/icons';

import { DesktopDialog } from '@/components/teacher/DesktopOverlay';
import { QuizEditor, validateQuizValue, type EditableQuizValue } from '@/components/teacher/QuizEditor';
import { Notice, PillButton, Text, Toggle } from '@/components/ui';
import { useTheme } from '@/design/theme';
import { IS_PITCH, PITCH_NAMES } from '@/lib/config';
import type { QuizDraft } from '@/services/ai/moduleGenerator';
import * as api from '@/services/backend/api';
import { assignDraftToClasses, saveDraft, useTeacher } from '@/services/backend/teacher';
import { useAppStore } from '@/store/useAppStore';

/** Opens a 10-minute signed URL for an uploaded original document. */
export async function openOriginalSource(input: { moduleId?: string; draftId?: string; sourceId?: string }) {
  if (IS_PITCH) return;
  const signed = await api.getSourceSignedUrl(input);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(signed.url, '_blank', 'noopener,noreferrer');
  } else {
    await Linking.openURL(signed.url);
  }
}

/**
 * Edits a private `QuizDraft` with debounced 800ms autosave and conflict recovery.
 * Never mutates already-assigned student snapshots until the teacher explicitly re-assigns.
 */
export function EditDraftDialog({
  draft,
  onClose,
  onAssign,
}: {
  draft: QuizDraft | null;
  onClose: () => void;
  onAssign?: (latest: QuizDraft) => void;
}) {
  if (!draft) return null;
  return <DraftEditorModal key={draft.id} initial={draft} onClose={onClose} onAssign={onAssign} />;
}

function DraftEditorModal({
  initial,
  onClose,
  onAssign,
}: {
  initial: QuizDraft;
  onClose: () => void;
  onAssign?: (latest: QuizDraft) => void;
}) {
  const { c } = useTheme();
  const [liveDraft, setLiveDraft] = useState<QuizDraft>(initial);
  const [value, setValue] = useState<EditableQuizValue>({
    title: initial.title,
    subject: initial.subject,
    summary: initial.summary,
    flashcards: initial.flashcards,
    questions: initial.questions,
  });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const versionRef = useRef(initial.version);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushSave = async (val: EditableQuizValue): Promise<QuizDraft | null> => {
    const vErr = validateQuizValue(val);
    if (vErr) {
      setError(vErr);
      return null;
    }
    setError(null);
    setSaveStatus('saving');
    try {
      const res = await saveDraft(initial.id, versionRef.current, val);
      if (res.conflict) {
        setConflictNotice('This draft changed on another device. Showing the latest version.');
        if (res.latest) {
          versionRef.current = res.latest.version;
          setLiveDraft(res.latest);
          setValue({
            title: res.latest.title,
            subject: res.latest.subject,
            summary: res.latest.summary,
            flashcards: res.latest.flashcards,
            questions: res.latest.questions,
          });
        }
        setSaveStatus('idle');
        dirtyRef.current = false;
        return res.latest;
      }
      versionRef.current = res.draft.version;
      setLiveDraft(res.draft);
      setConflictNotice(null);
      setSaveStatus('saved');
      dirtyRef.current = false;
      return res.draft;
    } catch {
      setSaveStatus('error');
      return null;
    }
  };

  const handleChange = (next: EditableQuizValue) => {
    setValue(next);
    dirtyRef.current = true;
    setSaveStatus('saving');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void flushSave(next);
    }, 800);
  };

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const handleSaveAndClose = async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!dirtyRef.current) {
      onClose();
      return;
    }
    setBusy(true);
    const saved = await flushSave(value);
    setBusy(false);
    if (saved) onClose();
  };

  const handleAssignClick = async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setBusy(true);
    const latest = dirtyRef.current ? await flushSave(value) : liveDraft;
    setBusy(false);
    if (latest) {
      onClose();
      onAssign?.(latest);
    }
  };

  return (
    <DesktopDialog
      visible
      onClose={() => void handleSaveAndClose()}
      locked={busy}
      title={`Edit draft · ${value.title.trim() || 'Untitled'}`}
      subtitle={`Private draft · v${liveDraft.version}`}
      maxWidth={860}
      footer={
        <>
          {liveDraft.sourceId && !IS_PITCH ? (
            <PillButton
              label="View original"
              kind="neutral"
              icon={<FileText size={15} weight="bold" color={c.text} />}
              onPress={() => void openOriginalSource({ draftId: liveDraft.id }).catch((e) => setError((e as Error).message))}
            />
          ) : null}
          <View style={styles.flex} />
          <PillButton label="Done" kind="neutral" onPress={() => void handleSaveAndClose()} disabled={busy} />
          {onAssign ? (
            <PillButton
              label="Assign to classes"
              onPress={() => void handleAssignClick()}
              disabled={busy || !!validateQuizValue(value)}
            />
          ) : null}
        </>
      }
    >
      {error ? <Notice text={error} /> : null}
      <QuizEditor
        value={value}
        onChange={handleChange}
        saveStatus={saveStatus}
        conflictNotice={conflictNotice}
      />
    </DesktopDialog>
  );
}

/** Explicitly assigns an immutable snapshot of a `QuizDraft` to selected classes. */
export function AssignDraftDialog({
  draft,
  defaultClassIds,
  onClose,
}: {
  draft: QuizDraft | null;
  defaultClassIds?: string[];
  onClose: () => void;
}) {
  if (!draft) return null;
  return <AssignModal key={`${draft.id}-${draft.version}`} draft={draft} defaultClassIds={defaultClassIds} onClose={onClose} />;
}

function AssignModal({
  draft,
  defaultClassIds,
  onClose,
}: {
  draft: QuizDraft;
  defaultClassIds?: string[];
  onClose: () => void;
}) {
  const { c } = useTheme();
  const classes = useTeacher((s) => s.classes);
  const selected = useTeacher((s) => s.selected);
  const available = IS_PITCH
    ? [{ id: 'sampaguita', name: `Grade 8 – ${PITCH_NAMES.section}`, grade: 8 }]
    : classes;

  const [targets, setTargets] = useState<string[]>(() => {
    if (defaultClassIds?.length) return defaultClassIds;
    if (IS_PITCH) return ['sampaguita'];
    return selected ? [selected] : classes[0] ? [classes[0].id] : [];
  });
  const [shareSource, setShareSource] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const submittedRef = useRef(false);

  const assign = async () => {
    if (busy || submittedRef.current || !targets.length) return;
    submittedRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await assignDraftToClasses(draft, targets, shareSource);
      if (res.status === 'conflict') {
        submittedRef.current = false;
        setError('This draft changed on another device. Showing the latest version — please review and assign again.');
        return;
      }
      if (IS_PITCH) res.saved.forEach((m) => useAppStore.getState().addPitchModule(m));
      setDone(
        `Assigned v${res.version} to ${res.saved.length} ${res.saved.length === 1 ? 'class' : 'classes'}. Students receive this exact snapshot.`,
      );
      setTimeout(onClose, 1100);
    } catch (e) {
      submittedRef.current = false;
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
      title={`Assign "${draft.title}"`}
      subtitle={`Publishes immutable snapshot v${draft.version}`}
      maxWidth={500}
      footer={
        <>
          <PillButton label="Cancel" kind="neutral" onPress={onClose} disabled={busy} />
          <PillButton
            label={
              busy
                ? 'Assigning…'
                : done
                  ? 'Assigned'
                  : `Assign to ${targets.length} ${targets.length === 1 ? 'class' : 'classes'}`
            }
            onPress={() => void assign()}
            disabled={busy || !targets.length || !!done}
          />
        </>
      }
    >
      {error ? <Notice text={error} /> : null}
      {done ? <Notice tone="success" text={done} /> : null}

      <Text variant="subhead" color="textSecondary">
        Later edits to your draft stay private until you choose to update students again.
      </Text>

      {available.length === 0 ? (
        <Text variant="body">Create a class first before assigning a quiz.</Text>
      ) : (
        available.map((cl) => {
          const on = targets.includes(cl.id);
          return (
            <Pressable
              key={cl.id}
              role="checkbox"
              aria-checked={on}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => setTargets((prev) => (on ? prev.filter((x) => x !== cl.id) : [...prev, cl.id]))}
              style={({ hovered }) => [
                styles.check,
                { borderColor: on ? c.accent : c.hairline },
                hovered && { backgroundColor: c.inset },
              ]}
            >
              <View
                style={[
                  styles.box,
                  { borderColor: on ? c.accent : c.textTertiary, backgroundColor: on ? c.accent : 'transparent' },
                ]}
              >
                {on ? (
                  <Text variant="caption" color="onAccent" style={styles.tick}>
                    ✓
                  </Text>
                ) : null}
              </View>
              <Text variant="subhead" color="text" style={styles.flex}>
                {cl.name} · Grade {cl.grade}
              </Text>
            </Pressable>
          );
        })
      )}

      {draft.sourceId ? (
        <View style={[styles.shareRow, { backgroundColor: c.inset }]}>
          <View style={styles.flex}>
            <Text variant="subhead" color="text">
              Also share the original file
            </Text>
            <Text variant="caption" color="textSecondary">
              Off by default. Lets enrolled students open {draft.sourceName ?? 'your uploaded document'}.
            </Text>
          </View>
          <Toggle value={shareSource} onChange={setShareSource} accessibilityLabel="Also share the original file" />
        </View>
      ) : null}
    </DesktopDialog>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, padding: 12 },
  box: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tick: { fontSize: 12, lineHeight: 14, fontWeight: '800' },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, padding: 12, marginTop: 4 },
});
