import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { FileText } from '@/components/ui/icons';

import { DesktopDialog } from '@/components/teacher/DesktopOverlay';
import { openOriginalSource } from '@/components/teacher/ModuleEditDialogs';
import { EditorField, QUIZ_SUBJECTS, QuizEditor, validateQuizValue, type EditableQuizValue } from '@/components/teacher/QuizEditor';
import { UploadDropCard, type UploadCardState } from '@/components/teacher/UploadDropCard';
import { Chip, Notice, PillButton, Text, Toggle } from '@/components/ui';
import { useTheme } from '@/design/theme';
import { useOnline } from '@/hooks/useDesktop';
import { teacherStrings as T } from '@/i18n/staff';
import { IS_PITCH, PITCH_NAMES } from '@/lib/config';
import {
  generateModuleDeck,
  SAMPLE_MODULE_TEXT,
  type ModuleSource,
  type QuizDraft,
} from '@/services/ai/moduleGenerator';
import { assignDraftToClasses, createDraft, saveDraft, useTeacher } from '@/services/backend/teacher';
import { extractLessonFile, LESSON_FILE_ACCEPT } from '@/services/teacher/extractLessonFile';
import { resolveAllowedMime, uploadModuleSource, validateSourceFile } from '@/services/teacher/uploadSource';
import { useAppStore } from '@/store/useAppStore';

const MIN_CHARS = 30;

/**
 * Laptop Module Studio:
 * 1. Upload/drop file on the card (original stored privately in Storage)
 * 2. Generate → saves a PRIVATE draft (never immediately visible to students)
 * 3. Review & edit draft (800ms autosave) → explicitly Assign snapshot to chosen classes
 */
export function TeacherUploadDialog() {
  const open = useTeacher((s) => s.uploadOpen);
  if (!open) return null;
  return <Studio />;
}

function Studio() {
  const { c } = useTheme();
  const online = useOnline();
  const setOpen = useTeacher((s) => s.setUploadOpen);
  const classes = useTeacher((s) => s.classes);
  const selected = useTeacher((s) => s.selected);
  const available = IS_PITCH ? [{ id: 'sampaguita', name: `Grade 8 – ${PITCH_NAMES.section}` }] : classes;

  const [step, setStep] = useState<'source' | 'review' | 'assign'>('source');
  const [uploadState, setUploadState] = useState<UploadCardState>({ status: 'idle' });
  const [source, setSource] = useState<ModuleSource | null>(null);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState<string>('Math');
  const [content, setContent] = useState('');
  const [generating, setGenerating] = useState(false);

  // Step 2: Private draft + autosave state
  const [draft, setDraft] = useState<QuizDraft | null>(null);
  const [editVal, setEditVal] = useState<EditableQuizValue | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);
  const versionRef = useRef(1);
  const dirtyRef = useRef(false);
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 3: Explicit assignment state
  const [targets, setTargets] = useState<string[]>(() =>
    IS_PITCH ? ['sampaguita'] : selected ? [selected] : classes[0] ? [classes[0].id] : [],
  );
  const [shareSource, setShareSource] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const assignLockRef = useRef(false);

  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  const uploading = uploadState.status === 'reading' || uploadState.status === 'uploading';
  const busy = uploading || generating || assigning;
  const close = () => setOpen(false);

  useEffect(
    () => () => {
      if (autosaveRef.current) clearTimeout(autosaveRef.current);
    },
    [],
  );

  const handleFile = async (file: File) => {
    setError(null);
    const valErr = validateSourceFile(file.name, file.size, file.type);
    if (valErr) {
      setUploadState({ status: 'failed', reason: valErr });
      return;
    }

    setUploadState({ status: 'reading', fileName: file.name });
    const extracted = await extractLessonFile(file);
    if ('error' in extracted) {
      setUploadState({ status: 'failed', reason: extracted.error });
      return;
    }
    const text = extracted.text.trim().slice(0, 10000);
    if (text.length < MIN_CHARS) {
      setUploadState({ status: 'failed', reason: 'That file has very little text. Try a fuller lesson file.' });
      return;
    }

    const mime = resolveAllowedMime(file.name, file.type) ?? 'text/plain';
    try {
      setUploadState({ status: 'uploading', fileName: file.name, pct: 10 });
      const bytes = new Uint8Array(await file.arrayBuffer());
      const uploaded = await uploadModuleSource({
        bytes,
        fileName: file.name,
        mime,
        extractedText: text,
        onProgress: (pct) => setUploadState({ status: 'uploading', fileName: file.name, pct }),
      });
      setSource(uploaded);
      setContent(text);
      if (!title.trim()) setTitle(file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 80));
      setUploadState({ status: 'ready', fileName: file.name, charCount: text.length, note: extracted.note });
    } catch (e) {
      setUploadState({ status: 'failed', reason: (e as Error).message || 'Upload stopped, tap to try again' });
    }
  };

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) void handleFile(f);
  };

  const generateDraft = async () => {
    setError(null);
    if (content.trim().length < MIN_CHARS) {
      setError('Upload a lesson file, paste notes, or load the sample lesson first (at least 2 sentences).');
      return;
    }
    const effectiveTitle = title.trim() || source?.fileName.replace(/\.[^/.]+$/, '') || 'Lesson module';
    setTitle(effectiveTitle);
    setGenerating(true);
    try {
      const deck = await generateModuleDeck({ title: effectiveTitle, subject, content: content.trim() });
      const created = await createDraft({
        sourceId: source?.id ?? null,
        sourceName: source?.fileName ?? null,
        title: effectiveTitle,
        subject,
        summary: deck.summary,
        flashcards: deck.flashcards,
        questions: deck.questions,
      });
      setDraft(created);
      versionRef.current = created.version;
      dirtyRef.current = false;
      setEditVal({
        title: created.title,
        subject: created.subject,
        summary: created.summary,
        flashcards: created.flashcards,
        questions: created.questions,
      });
      setSaveStatus('saved');
      setStep('review');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const flushDraftSave = async (val: EditableQuizValue): Promise<QuizDraft | null> => {
    if (!draft) return null;
    const vErr = validateQuizValue(val);
    if (vErr) {
      setError(vErr);
      return null;
    }
    setError(null);
    setSaveStatus('saving');
    try {
      const res = await saveDraft(draft.id, versionRef.current, val);
      if (res.conflict) {
        setConflictNotice('This draft changed on another device. Showing the latest version.');
        if (res.latest) {
          versionRef.current = res.latest.version;
          setDraft(res.latest);
          setEditVal({
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
      setDraft(res.draft);
      setConflictNotice(null);
      setSaveStatus('saved');
      dirtyRef.current = false;
      return res.draft;
    } catch {
      setSaveStatus('error');
      return null;
    }
  };

  const handleEditChange = (next: EditableQuizValue) => {
    setEditVal(next);
    dirtyRef.current = true;
    setSaveStatus('saving');
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => {
      void flushDraftSave(next);
    }, 800);
  };

  const goToAssign = async () => {
    if (!editVal || !draft) return;
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    const vErr = validateQuizValue(editVal);
    if (vErr) {
      setError(vErr);
      return;
    }
    if (dirtyRef.current) {
      const saved = await flushDraftSave(editVal);
      if (!saved) return;
    }
    setError(null);
    setStep('assign');
  };

  const savePrivateAndClose = async () => {
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    if (draft && editVal && dirtyRef.current) {
      await flushDraftSave(editVal);
    }
    close();
  };

  const confirmAssign = async () => {
    if (!draft || assigning || assignLockRef.current) return;
    if (!targets.length) {
      setError('Choose at least one class.');
      return;
    }
    assignLockRef.current = true;
    setAssigning(true);
    setError(null);
    try {
      const res = await assignDraftToClasses(draft, targets, shareSource);
      if (res.status === 'conflict') {
        assignLockRef.current = false;
        setConflictNotice('This draft changed on another device. Showing the latest version.');
        setStep('review');
        return;
      }
      if (IS_PITCH) res.saved.forEach((m) => useAppStore.getState().addPitchModule(m));
      setDone(
        `Assigned v${res.version} to ${res.saved.length} ${res.saved.length === 1 ? 'class' : 'classes'}. Students receive this approved version.`,
      );
      setTimeout(close, 1200);
    } catch (e) {
      assignLockRef.current = false;
      setError((e as Error).message);
    } finally {
      setAssigning(false);
    }
  };

  if (!IS_PITCH && classes.length === 0) {
    return (
      <DesktopDialog
        visible
        onClose={close}
        title="Create a class first"
        maxWidth={460}
        footer={
          <>
            <PillButton label="Cancel" kind="neutral" onPress={close} />
            <PillButton
              label={T.createTitle}
              onPress={() => {
                close();
                router.replace('/teacher');
              }}
            />
          </>
        }
      >
        <Text variant="body">Create a class first, then upload a lesson to build and assign quizzes.</Text>
      </DesktopDialog>
    );
  }

  const footer =
    step === 'source' ? (
      <>
        <PillButton label="Cancel" kind="neutral" onPress={close} disabled={busy} />
        <PillButton
          label={generating ? 'Building private draft…' : 'Generate draft quiz'}
          onPress={() => void generateDraft()}
          disabled={busy || content.trim().length < MIN_CHARS}
        />
      </>
    ) : step === 'review' ? (
      <>
        {draft?.sourceId && !IS_PITCH ? (
          <PillButton
            label="View original"
            kind="neutral"
            icon={<FileText size={15} weight="bold" color={c.text} />}
            onPress={() => void openOriginalSource({ draftId: draft.id }).catch((e) => setError((e as Error).message))}
          />
        ) : null}
        <View style={styles.flex} />
        <PillButton label="Save private draft" kind="neutral" onPress={() => void savePrivateAndClose()} />
        <PillButton
          label="Assign to classes"
          onPress={() => void goToAssign()}
          disabled={!editVal || !!validateQuizValue(editVal)}
        />
      </>
    ) : (
      <>
        <PillButton label="Back to editor" kind="neutral" onPress={() => setStep('review')} disabled={assigning} />
        <View style={styles.flex} />
        {!online ? (
          <Text variant="caption" color="warning" style={styles.offline}>
            Reconnect to assign; your private draft is saved.
          </Text>
        ) : null}
        <PillButton
          label={
            assigning
              ? 'Assigning…'
              : done
                ? 'Assigned'
                : `Assign to ${targets.length} ${targets.length === 1 ? 'class' : 'classes'}`
          }
          onPress={() => void confirmAssign()}
          disabled={assigning || !!done || !online || !targets.length}
        />
      </>
    );

  return (
    <DesktopDialog
      visible
      onClose={() => void savePrivateAndClose()}
      locked={assigning}
      title={
        step === 'source'
          ? 'Upload a lesson'
          : step === 'review'
            ? 'Review & edit draft'
            : 'Assign to classes'
      }
      subtitle={
        step === 'source'
          ? 'Step 1 of 3 · Private until you assign'
          : step === 'review'
            ? `Step 2 of 3 · Private draft v${draft?.version ?? 1}`
            : `Step 3 of 3 · Publishes snapshot v${draft?.version ?? 1}`
      }
      maxWidth={step === 'review' ? 920 : 700}
      footer={footer}
    >
      <input ref={input} type="file" accept={LESSON_FILE_ACCEPT} onChange={onInput} style={{ display: 'none' }} />
      {error ? <Notice text={error} /> : null}
      {done ? <Notice tone="success" text={done} /> : null}

      {step === 'source' ? (
        <>
          <UploadDropCard
            state={uploadState}
            onPress={() => input.current?.click()}
            onDropFile={(f) => void handleFile(f)}
            onDragChange={(dragging) =>
              setUploadState((prev) =>
                dragging
                  ? { status: 'dragging' }
                  : prev.status === 'dragging'
                    ? source
                      ? { status: 'ready', fileName: source.fileName, charCount: content.length }
                      : { status: 'idle' }
                    : prev,
              )
            }
          />
          <View style={styles.rowStart}>
            <PillButton
              label="Load sample lesson"
              kind="neutral"
              size="sm"
              onPress={() => {
                setContent(SAMPLE_MODULE_TEXT);
                setSource(null);
                setUploadState({
                  status: 'ready',
                  fileName: 'sample-linear-equations.txt',
                  charCount: SAMPLE_MODULE_TEXT.length,
                });
                if (!title.trim()) setTitle('Linear Equations & Slope');
              }}
            />
          </View>
          <EditorField label={T.moduleTitle} value={title} onChange={setTitle} placeholder={T.moduleTitlePh} max={120} />
          <View style={styles.gapSm}>
            <Text variant="subhead" color="text">
              {T.moduleSubject}
            </Text>
            <View style={styles.rowStart}>
              {QUIZ_SUBJECTS.map((s) => (
                <Chip
                  key={s}
                  label={s}
                  kind={subject === s ? 'tinted' : 'neutral'}
                  selected={subject === s}
                  onPress={() => setSubject(s)}
                />
              ))}
            </View>
          </View>
          <EditorField
            label={`${T.moduleText} (edit to clean up before generating your draft)`}
            value={content}
            onChange={(v) => setContent(v.slice(0, 10000))}
            placeholder={T.moduleTextPh}
            multiline
            minHeight={180}
          />
          <Text variant="caption">{content.length.toLocaleString('en-US')} / 10,000 characters</Text>
        </>
      ) : step === 'review' && editVal ? (
        <QuizEditor
          value={editVal}
          onChange={handleEditChange}
          saveStatus={saveStatus}
          conflictNotice={conflictNotice}
        />
      ) : step === 'assign' && draft ? (
        <View style={styles.gap}>
          <Text variant="subhead" color="textSecondary">
            Choose which classes receive “{draft.title}” (v{draft.version}). Students only see what you explicitly assign.
          </Text>
          {available.map((cl) => {
            const on = targets.includes(cl.id);
            return (
              <Pressable
                key={cl.id}
                role="checkbox"
                aria-checked={on}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={cl.name}
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
                  {cl.name}
                </Text>
              </Pressable>
            );
          })}
          {draft.sourceId ? (
            <View style={[styles.shareRow, { backgroundColor: c.inset }]}>
              <View style={styles.flex}>
                <Text variant="subhead" color="text">
                  Also share the original file
                </Text>
                <Text variant="caption" color="textSecondary">
                  Default off. Lets enrolled students view {draft.sourceName ?? 'your original file'}.
                </Text>
              </View>
              <Toggle value={shareSource} onChange={setShareSource} accessibilityLabel="Also share the original file" />
            </View>
          ) : null}
        </View>
      ) : null}
    </DesktopDialog>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 12 },
  gapSm: { gap: 6 },
  rowStart: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-start' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, padding: 12 },
  box: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tick: { fontSize: 12, lineHeight: 14, fontWeight: '800' },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, padding: 12 },
  offline: { maxWidth: 240 },
});
