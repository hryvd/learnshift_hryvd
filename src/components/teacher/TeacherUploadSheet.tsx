import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { BookOpenText, CheckCircle, FileText, Sparkle } from '@/components/ui/icons';

import { openOriginalSource } from '@/components/teacher/ModuleEditDialogs';
import { QUIZ_SUBJECTS, QuizEditor, validateQuizValue, type EditableQuizValue } from '@/components/teacher/QuizEditor';
import { UploadDropCard, type UploadCardState } from '@/components/teacher/UploadDropCard';
import { Chip, IconButton, Notice, PillButton, PressableScale, Text, Toggle } from '@/components/ui';
import { haptic } from '@/design/haptics';
import { spring } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius } from '@/design/tokens';
import { FONT_SECONDARY } from '@/design/typography';
import { IS_PITCH, PITCH_NAMES } from '@/lib/config';
import {
  generateModuleDeck,
  SAMPLE_MODULE_TEXT,
  type ModuleSource,
  type QuizDraft,
} from '@/services/ai/moduleGenerator';
import { assignDraftToClasses, createDraft, saveDraft, useTeacher } from '@/services/backend/teacher';
import { extractLessonFile, LESSON_FILE_ACCEPT } from '@/services/teacher/extractLessonFile';
import {
  pickNativeLessonFile,
  resolveAllowedMime,
  uploadModuleSource,
  validateSourceFile,
} from '@/services/teacher/uploadSource';
import { useAppStore } from '@/store/useAppStore';

/**
 * Mobile Teacher Upload Sheet:
 * Uses the cohesive light-card `UploadDropCard` (whole card is tap/drop target, no separate Upload button),
 * creates a private draft, lets the teacher review & edit with autosave, then explicitly assign to classes.
 */
export function TeacherUploadSheet() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const visible = useTeacher((s) => s.uploadOpen);
  const setUploadOpen = useTeacher((s) => s.setUploadOpen);
  const classes = useTeacher((s) => s.classes);
  const selectedClass = useTeacher((s) => s.selected);

  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(visible ? 1 : 0);

  const [step, setStep] = useState<'upload' | 'edit' | 'assign'>('upload');
  const [uploadState, setUploadState] = useState<UploadCardState>({ status: 'idle' });
  const [source, setSource] = useState<ModuleSource | null>(null);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState<string>('Math');
  const [content, setContent] = useState('');
  const [showPaste, setShowPaste] = useState(false);

  const [draft, setDraft] = useState<QuizDraft | null>(null);
  const [editVal, setEditVal] = useState<EditableQuizValue | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);
  const versionRef = useRef(1);
  const dirtyRef = useRef(false);
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pickedTargetIds, setPickedTargetIds] = useState<string[] | null>(null);
  const [shareSource, setShareSource] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const assignLockRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [doneBanner, setDoneBanner] = useState<string | null>(null);

  const webInputRef = useRef<HTMLInputElement | null>(null);
  const defaultTargetId = IS_PITCH ? 'sampaguita' : (selectedClass ?? classes[0]?.id ?? '');
  const targetIds = pickedTargetIds ?? (defaultTargetId ? [defaultTargetId] : []);

  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      progress.set(withSpring(1, spring.smooth));
    } else {
      progress.set(
        withSpring(0, { ...spring.snappy, overshootClamping: true }, (finished) => {
          if (finished) scheduleOnRN(setMounted, false);
        }),
      );
    }
  }, [visible, mounted, progress]);

  useEffect(
    () => () => {
      if (autosaveRef.current) clearTimeout(autosaveRef.current);
    },
    [],
  );

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
  }));

  const cardAnimStyle = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: interpolate(p, [0, 0.25], [0, 1], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(p, [0, 1], [140, 0], Extrapolation.CLAMP) },
        { scale: interpolate(p, [0, 1], [0.88, 1], Extrapolation.CLAMP) },
      ],
    };
  });

  const resetForm = () => {
    setStep('upload');
    setUploadState({ status: 'idle' });
    setSource(null);
    setTitle('');
    setSubject('Math');
    setContent('');
    setShowPaste(false);
    setDraft(null);
    setEditVal(null);
    setSaveStatus('idle');
    setConflictNotice(null);
    setPickedTargetIds(null);
    setShareSource(false);
    setError(null);
    setDoneBanner(null);
    assignLockRef.current = false;
  };

  const closeSheet = () => {
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    haptic.select();
    setUploadOpen(false);
  };

  const readWebFile = async (file: File) => {
    setError(null);
    setDoneBanner(null);
    const valErr = validateSourceFile(file.name, file.size, file.type);
    if (valErr) {
      setUploadState({ status: 'failed', reason: valErr });
      return;
    }
    setUploadState({ status: 'reading', fileName: file.name });
    const res = await extractLessonFile(file);
    if ('error' in res) {
      setUploadState({ status: 'failed', reason: res.error });
      return;
    }
    const clean = res.text.trim().slice(0, 10000);
    if (clean.length < 30) {
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
        extractedText: clean,
        onProgress: (pct) => setUploadState({ status: 'uploading', fileName: file.name, pct }),
      });
      setSource(uploaded);
      if (!title.trim()) setTitle(file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 80));
      setContent(clean);
      setUploadState({ status: 'ready', fileName: file.name, charCount: clean.length, note: res.note });
      haptic.success();
    } catch (e) {
      setUploadState({ status: 'failed', reason: (e as Error).message || 'Upload stopped, tap to try again' });
    }
  };

  const handleWebInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void readWebFile(file);
  };

  const pickFile = async () => {
    haptic.select();
    setError(null);
    if (Platform.OS === 'web') {
      webInputRef.current?.click();
      return;
    }
    const picked = await pickNativeLessonFile();
    if (picked.cancelled) return;
    if ('error' in picked) {
      setUploadState({ status: 'failed', reason: picked.error });
      return;
    }
    setUploadState({ status: 'uploading', fileName: picked.fileName, pct: 15 });
    try {
      const uploaded = await uploadModuleSource({
        bytes: picked.bytes,
        fileName: picked.fileName,
        mime: picked.mime,
        extractedText: picked.text.trim().slice(0, 10000),
        onProgress: (pct) => setUploadState({ status: 'uploading', fileName: picked.fileName, pct }),
      });
      setSource(uploaded);
      if (!title.trim()) setTitle(picked.fileName.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 80));
      if (picked.needsManualText) {
        setShowPaste(true);
        setUploadState({ status: 'ready', fileName: picked.fileName, charCount: 0, note: picked.note });
      } else {
        const clean = picked.text.trim().slice(0, 10000);
        setContent(clean);
        setUploadState({ status: 'ready', fileName: picked.fileName, charCount: clean.length, note: picked.note });
      }
      haptic.success();
    } catch (e) {
      setUploadState({ status: 'failed', reason: (e as Error).message || 'Upload stopped, tap to try again' });
    }
  };

  const handleGenerate = async () => {
    setError(null);
    setDoneBanner(null);
    const effectiveTitle = title.trim() || source?.fileName.replace(/\.[^/.]+$/, '') || 'Lesson Module';
    if (content.trim().length < 30) {
      setError('Upload a lesson file, load the sample lesson, or paste at least 2 sentences first.');
      return;
    }
    if (!title.trim()) setTitle(effectiveTitle);
    setGenerating(true);
    try {
      const generated = await generateModuleDeck({ title: effectiveTitle, subject, content: content.trim() });
      const created = await createDraft({
        sourceId: source?.id ?? null,
        sourceName: source?.fileName ?? null,
        title: effectiveTitle,
        subject,
        summary: generated.summary,
        flashcards: generated.flashcards,
        questions: generated.questions,
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
      setStep('edit');
      haptic.success();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const flushSave = async (val: EditableQuizValue): Promise<QuizDraft | null> => {
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
      void flushSave(next);
    }, 800);
  };

  const proceedToAssign = async () => {
    if (!editVal || !draft) return;
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    const vErr = validateQuizValue(editVal);
    if (vErr) {
      setError(vErr);
      return;
    }
    if (dirtyRef.current) {
      const saved = await flushSave(editVal);
      if (!saved) return;
    }
    setStep('assign');
  };

  const toggleClass = (id: string) => {
    haptic.select();
    setPickedTargetIds((prev) => {
      const cur = prev ?? targetIds;
      return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    });
  };

  const handleAssign = async () => {
    if (!draft || assigning || assignLockRef.current) return;
    const chosenIds = IS_PITCH ? ['sampaguita'] : targetIds;
    if (chosenIds.length === 0) {
      setError('Select at least one class.');
      return;
    }
    assignLockRef.current = true;
    setAssigning(true);
    setError(null);
    try {
      const res = await assignDraftToClasses(draft, chosenIds, shareSource);
      if (res.status === 'conflict') {
        assignLockRef.current = false;
        setConflictNotice('This draft changed on another device. Showing the latest version.');
        setStep('edit');
        return;
      }
      if (IS_PITCH) res.saved.forEach((m) => useAppStore.getState().addPitchModule(m));
      haptic.success();
      const clsWord = res.saved.length === 1 ? '1 class' : `${res.saved.length} classes`;
      setDoneBanner(`Assigned v${res.version} to ${clsWord}.`);
      setTimeout(() => {
        resetForm();
        setUploadOpen(false);
      }, 1100);
    } catch (e) {
      assignLockRef.current = false;
      setError((e as Error).message);
    } finally {
      setAssigning(false);
    }
  };

  if (!mounted) return null;

  const availableClasses = IS_PITCH
    ? [{ id: 'sampaguita', name: `Grade 8 - ${PITCH_NAMES.section}`, grade: 8, join_code: 'SAMP8' }]
    : classes;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      {Platform.OS === 'web' ? (
        <input
          ref={webInputRef}
          type="file"
          accept={LESSON_FILE_ACCEPT}
          onChange={handleWebInput}
          style={{ display: 'none' }}
        />
      ) : null}

      <Animated.View style={[styles.scrim, { backgroundColor: c.scrim }, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} accessibilityLabel="Close upload card" />
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.centerWrap, { paddingBottom: Math.max(insets.bottom + 16, 20), paddingTop: insets.top + 16 }]}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            styles.sheetCard,
            { backgroundColor: c.bg, borderColor: c.hairline },
            cardAnimStyle,
          ]}
        >
          <View style={styles.topRow}>
            <View style={styles.flex}>
              <Text variant="title" color="text" numberOfLines={1}>
                {step === 'upload' ? 'Upload module' : step === 'edit' ? 'Review & edit draft' : 'Assign to classes'}
              </Text>
              <Text variant="caption" color="textSecondary">
                {step === 'upload'
                  ? 'Drafts stay private until you assign them'
                  : step === 'edit'
                    ? `Private draft · v${draft?.version ?? 1}`
                    : `Publishes snapshot v${draft?.version ?? 1}`}
              </Text>
            </View>
            <IconButton kind="close" size={34} accessibilityLabel="Close upload sheet" onPress={closeSheet} />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollInner}
          >
            {error ? <Notice text={error} /> : null}
            {doneBanner ? (
              <View style={[styles.doneBanner, { backgroundColor: c.success + '18' }]}>
                <CheckCircle size={18} weight="fill" color={c.success} />
                <Text variant="subhead" color="text" style={styles.flex}>
                  {doneBanner}
                </Text>
              </View>
            ) : null}

            {step === 'upload' ? (
              <>
                <UploadDropCard
                  compact
                  state={uploadState}
                  onPress={() => void pickFile()}
                  onDropFile={(f) => void readWebFile(f)}
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

                <View style={styles.helperRow}>
                  <Chip
                    label={showPaste ? 'Hide notes box' : 'Paste lesson notes'}
                    kind="neutral"
                    onPress={() => {
                      haptic.select();
                      setShowPaste((v) => !v);
                    }}
                  />
                  <Chip
                    label="Load sample lesson"
                    kind="neutral"
                    onPress={() => {
                      haptic.select();
                      setError(null);
                      setTitle('Linear Equations & Slope');
                      setSubject('Math');
                      setSource(null);
                      setContent(SAMPLE_MODULE_TEXT);
                      setUploadState({
                        status: 'ready',
                        fileName: 'sample-linear-equations.txt',
                        charCount: SAMPLE_MODULE_TEXT.length,
                      });
                    }}
                  />
                </View>

                {content || showPaste ? (
                  <View style={[styles.metaPanel, { backgroundColor: c.card, borderColor: c.hairline }]}>
                    <TextInput
                      value={title}
                      onChangeText={setTitle}
                      placeholder="Module title (e.g. Linear Equations)"
                      placeholderTextColor={c.textTertiary}
                      style={[styles.input, { backgroundColor: c.inset, color: c.text }]}
                      maxLength={120}
                    />
                    <View style={styles.subjRow}>
                      {QUIZ_SUBJECTS.map((subj) => (
                        <Chip
                          key={subj}
                          label={subj}
                          kind={subject === subj ? 'tinted' : 'neutral'}
                          selected={subject === subj}
                          onPress={() => setSubject(subj)}
                        />
                      ))}
                    </View>
                    {showPaste ? (
                      <TextInput
                        value={content}
                        onChangeText={setContent}
                        placeholder="Paste definitions, formulas, or reading notes..."
                        placeholderTextColor={c.textTertiary}
                        multiline
                        textAlignVertical="top"
                        style={[styles.input, styles.pasteInput, { backgroundColor: c.inset, color: c.text }]}
                      />
                    ) : null}
                    <PillButton
                      label={generating ? 'Building private draft…' : 'Generate draft quiz'}
                      icon={<Sparkle size={17} weight="fill" color={c.onAccent} />}
                      block
                      size="lg"
                      disabled={generating || content.trim().length < 30}
                      onPress={() => void handleGenerate()}
                    />
                  </View>
                ) : null}
              </>
            ) : step === 'edit' && editVal && draft ? (
              <View style={[styles.metaPanel, { backgroundColor: c.card, borderColor: c.hairline }]}>
                <QuizEditor
                  value={editVal}
                  onChange={handleEditChange}
                  saveStatus={saveStatus}
                  conflictNotice={conflictNotice}
                />
                {draft.sourceId && !IS_PITCH ? (
                  <PillButton
                    label="View original file"
                    kind="neutral"
                    size="sm"
                    icon={<FileText size={15} weight="bold" color={c.text} />}
                    onPress={() => void openOriginalSource({ draftId: draft.id }).catch((e) => setError((e as Error).message))}
                  />
                ) : null}
                <View style={styles.btnRow}>
                  <PillButton
                    label="Keep private"
                    kind="neutral"
                    style={styles.flex}
                    block
                    onPress={() => {
                      resetForm();
                      closeSheet();
                    }}
                  />
                  <PillButton
                    label="Assign"
                    style={styles.flex}
                    block
                    disabled={!!validateQuizValue(editVal)}
                    onPress={() => void proceedToAssign()}
                  />
                </View>
              </View>
            ) : step === 'assign' && draft ? (
              <View style={[styles.metaPanel, { backgroundColor: c.card, borderColor: c.hairline }]}>
                <View style={styles.rowBetween}>
                  <Text variant="headline" style={styles.flex} numberOfLines={2}>
                    {draft.title}
                  </Text>
                  <Chip label="Back" kind="neutral" onPress={() => setStep('edit')} />
                </View>

                <Text variant="overline" color="accent">
                  Select classes to receive v{draft.version}
                </Text>
                <View style={styles.classWrap}>
                  {availableClasses.map((cl) => {
                    const picked = targetIds.includes(cl.id);
                    return (
                      <PressableScale
                        key={cl.id}
                        onPress={() => toggleClass(cl.id)}
                        accessibilityState={{ selected: picked }}
                        style={[
                          styles.classPill,
                          { backgroundColor: picked ? c.accent : c.inset },
                        ]}
                      >
                        {picked ? (
                          <CheckCircle size={15} weight="fill" color={c.onAccent} />
                        ) : (
                          <BookOpenText size={15} color={c.textSecondary} />
                        )}
                        <Text variant="caption" color={picked ? c.onAccent : c.text}>
                          {cl.name}
                        </Text>
                      </PressableScale>
                    );
                  })}
                </View>

                {draft.sourceId ? (
                  <View style={[styles.shareRow, { backgroundColor: c.inset }]}>
                    <View style={styles.flex}>
                      <Text variant="subhead" color="text">
                        Also share the original file
                      </Text>
                      <Text variant="caption" color="textSecondary">
                        Off by default.
                      </Text>
                    </View>
                    <Toggle value={shareSource} onChange={setShareSource} accessibilityLabel="Also share the original file" />
                  </View>
                ) : null}

                <PillButton
                  label={assigning ? 'Assigning…' : 'Assign to selected classes'}
                  block
                  size="lg"
                  disabled={assigning || targetIds.length === 0}
                  onPress={() => void handleAssign()}
                />
              </View>
            ) : null}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  centerWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  sheetCard: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '88%',
    borderRadius: radius.sheet,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 18,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  flex: { flex: 1 },
  scrollInner: { gap: 12, paddingBottom: 4 },
  helperRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap' },
  metaPanel: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 12,
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    fontFamily: FONT_SECONDARY,
  },
  pasteInput: { minHeight: 96 },
  subjRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  btnRow: { flexDirection: 'row', gap: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  classWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  classPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, padding: 10 },
  doneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    padding: 12,
  },
});
