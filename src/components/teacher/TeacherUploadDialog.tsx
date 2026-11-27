import { useRef, useState, type ChangeEvent } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { DesktopDialog } from '@/components/teacher/DesktopOverlay';
import { Chip, Notice, PillButton, SegmentedControl, Text } from '@/components/ui';
import { FileArrowUp, Plus, Trash } from '@/components/ui/icons';
import { useTheme } from '@/design/theme';
import { radius } from '@/design/tokens';
import { useOnline } from '@/hooks/useDesktop';
import { teacherStrings as T } from '@/i18n/staff';
import { IS_PITCH, PITCH_NAMES } from '@/lib/config';
import {
  generateModuleDeck,
  SAMPLE_MODULE_TEXT,
  type GeneratedModuleDeck,
  type ModuleFlashcard,
  type ModuleQuestion,
} from '@/services/ai/moduleGenerator';
import { publishModulesToClasses, useTeacher } from '@/services/backend/teacher';
import { extractLessonFile, LESSON_FILE_ACCEPT } from '@/services/teacher/extractLessonFile';
import { useAppStore } from '@/store/useAppStore';

const SUBJECTS = ['Math', 'Science', 'English', 'Filipino', 'General'] as const;
const MIN_CHARS = 40;
const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * Laptop Module Studio: drop a lesson (PDF, Word, text) → review and edit every
 * flashcard and quiz question → publish to one or more classes.
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

  const [step, setStep] = useState<'source' | 'review'>('source');
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState<string>('Math');
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deck, setDeck] = useState<GeneratedModuleDeck | null>(null);
  const [summary, setSummary] = useState('');
  const [cards, setCards] = useState<ModuleFlashcard[]>([]);
  const [questions, setQuestions] = useState<ModuleQuestion[]>([]);
  const [tab, setTab] = useState<'cards' | 'quiz'>('cards');
  const [targets, setTargets] = useState<string[]>(() =>
    IS_PITCH ? ['sampaguita'] : selected ? [selected] : classes[0] ? [classes[0].id] : [],
  );
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  const busy = reading || generating || publishing;
  const close = () => setOpen(false);

  const readFile = async (file: File) => {
    setError(null);
    setNote(null);
    setReading(true);
    const res = await extractLessonFile(file);
    setReading(false);
    if ('error' in res) {
      setError(res.error);
      return;
    }
    const text = res.text.trim().slice(0, 10000);
    if (text.length < MIN_CHARS) {
      setError('That file has very little text. Try a fuller lesson file or paste your notes.');
      return;
    }
    setSourceName(file.name);
    setContent(text);
    setNote(res.note);
    if (!title.trim()) setTitle(file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 80));
  };

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) void readFile(f);
  };

  const dropProps = {
    onDragOver: (e: { preventDefault: () => void }) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e: { preventDefault: () => void; dataTransfer?: { files?: FileList } }) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) void readFile(f);
    },
  } as Record<string, unknown>;

  const generate = async () => {
    setError(null);
    if (content.trim().length < MIN_CHARS) {
      setError('Add a lesson file, paste notes, or load the sample lesson first (at least 2 sentences).');
      return;
    }
    const t = title.trim() || 'Lesson module';
    setTitle(t);
    setGenerating(true);
    try {
      const d = await generateModuleDeck({ title: t, subject, content: content.trim() });
      setDeck(d);
      setSummary(d.summary);
      setCards(d.flashcards);
      setQuestions(d.questions);
      setStep('review');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const validate = (): string | null => {
    if (!title.trim()) return 'Give the module a title.';
    if (!targets.length) return 'Choose at least one class.';
    if (!cards.length && !questions.length) return 'Keep at least one flashcard or quiz question.';
    if (cards.some((f) => !f.front.trim() || !f.back.trim())) return 'Every flashcard needs a front and a back.';
    if (questions.some((q) => !q.prompt.trim() || q.options.some((o) => !o.trim())))
      return 'Every quiz question needs a prompt and four answers.';
    return null;
  };

  const publish = async () => {
    if (publishing) return;
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setPublishing(true);
    try {
      const { saved } = await publishModulesToClasses(targets, {
        title: title.trim(),
        subject,
        sourceName,
        summary: summary.trim(),
        flashcards: cards,
        questions,
      });
      if (IS_PITCH) saved.forEach((m) => useAppStore.getState().addPitchModule(m));
      setDone(`Published to ${saved.length} ${saved.length === 1 ? 'class' : 'classes'}. Students get it on their next sync.`);
      setTimeout(close, 1400);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  // No classes yet: say so before any work is done.
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
        <Text variant="body">Modules are published to a class. Create one, then upload your lesson.</Text>
      </DesktopDialog>
    );
  }

  const footer =
    step === 'source' ? (
      <>
        <PillButton label="Cancel" kind="neutral" onPress={close} disabled={busy} />
        <PillButton
          label={generating ? 'Building flashcards & quiz…' : 'Create flashcards & quiz'}
          onPress={generate}
          disabled={busy || content.trim().length < MIN_CHARS}
        />
      </>
    ) : (
      <>
        <PillButton label="Back" kind="neutral" onPress={() => setStep('source')} disabled={publishing} />
        <View style={styles.flex} />
        {!online ? (
          <Text variant="caption" color="warning" style={styles.offline}>
            Reconnect to publish; your draft stays open.
          </Text>
        ) : null}
        <PillButton
          label={publishing ? 'Publishing…' : done ? 'Published' : `Publish to ${targets.length} ${targets.length === 1 ? 'class' : 'classes'}`}
          onPress={publish}
          disabled={publishing || !!done || !online || !targets.length}
        />
      </>
    );

  return (
    <DesktopDialog
      visible
      onClose={close}
      locked={publishing}
      title={step === 'source' ? 'Upload a lesson' : 'Review and publish'}
      subtitle={step === 'source' ? 'Step 1 of 2' : 'Step 2 of 2'}
      maxWidth={step === 'source' ? 760 : 1040}
      footer={footer}
    >
      <input ref={input} type="file" accept={LESSON_FILE_ACCEPT} onChange={onInput} style={{ display: 'none' }} />
      {error ? <Notice text={error} /> : null}
      {done ? <Notice tone="success" text={done} /> : null}

      {step === 'source' ? (
        <>
          <View
            {...dropProps}
            style={[
              styles.drop,
              { borderColor: dragging ? c.accent : c.hairline, backgroundColor: dragging ? c.accentTint : c.inset },
            ]}
          >
            {reading ? (
              <>
                <ActivityIndicator color={c.accent} />
                <Text variant="subhead">Reading your file…</Text>
              </>
            ) : (
              <>
                <FileArrowUp size={28} weight="bold" color={c.accent} />
                <Text variant="headline" align="center">
                  {sourceName ?? 'Drop a lesson file here'}
                </Text>
                <Text variant="caption" align="center">
                  {sourceName
                    ? `${content.length.toLocaleString('en-US')} characters ready${note ? ` · ${note}` : ''}`
                    : 'PDF, Word (.docx), .txt, .md, .csv or .html · up to 15 MB'}
                </Text>
                <View style={styles.row}>
                  <PillButton label="Choose file" kind="secondary" size="sm" onPress={() => input.current?.click()} />
                  <PillButton
                    label="Load sample lesson"
                    kind="neutral"
                    size="sm"
                    onPress={() => {
                      setContent(SAMPLE_MODULE_TEXT);
                      setSourceName(null);
                      setNote(null);
                      if (!title.trim()) setTitle('Linear Equations & Slope');
                    }}
                  />
                </View>
              </>
            )}
          </View>
          <Field label={T.moduleTitle} value={title} onChange={setTitle} placeholder={T.moduleTitlePh} max={120} />
          <View style={styles.gapSm}>
            <Text variant="subhead" color="text">
              {T.moduleSubject}
            </Text>
            <View style={styles.row}>
              {SUBJECTS.map((s) => (
                <Chip key={s} label={s} kind={subject === s ? 'tinted' : 'neutral'} selected={subject === s} onPress={() => setSubject(s)} />
              ))}
            </View>
          </View>
          <Field
            label={`${T.moduleText} (edit to remove headers, page numbers or anything students shouldn't see)`}
            value={content}
            onChange={(v) => setContent(v.slice(0, 10000))}
            placeholder={T.moduleTextPh}
            multiline
            minHeight={200}
          />
          <Text variant="caption">{content.length.toLocaleString('en-US')} / 10,000 characters</Text>
        </>
      ) : (
        <View style={styles.cols}>
          <View style={[styles.gap, styles.left]}>
            <Chip
              label={deck?.source === 'ai' ? 'Generated by AI — check every card' : 'Built offline from your text — check every card'}
              kind={deck?.source === 'ai' ? 'tinted' : 'outline'}
            />
            <Field label="Title" value={title} onChange={setTitle} max={120} />
            <Field label="Summary students see" value={summary} onChange={setSummary} multiline minHeight={110} />
            <Text variant="subhead" color="text">
              Publish to
            </Text>
            {available.map((cl) => {
              const on = targets.includes(cl.id);
              return (
                <Pressable
                  key={cl.id}
                  role="checkbox"
                  aria-checked={on}
                  accessibilityLabel={cl.name}
                  onPress={() => setTargets((t) => (on ? t.filter((x) => x !== cl.id) : [...t, cl.id]))}
                  style={({ hovered }) => [styles.check, { borderColor: on ? c.accent : c.hairline }, hovered && { backgroundColor: c.inset }]}
                >
                  <View style={[styles.box, { borderColor: on ? c.accent : c.textTertiary, backgroundColor: on ? c.accent : 'transparent' }]}>
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
          </View>
          <View style={[styles.gap, styles.right]}>
            <SegmentedControl
              options={[
                { value: 'cards', label: `${T.flashcards} (${cards.length})` },
                { value: 'quiz', label: `Quiz (${questions.length})` },
              ]}
              value={tab}
              onChange={(v) => setTab(v as 'cards' | 'quiz')}
            />
            {tab === 'cards' ? (
              <>
                {cards.map((f, i) => (
                  <View key={f.id} style={[styles.item, { backgroundColor: c.inset }]}>
                    <ItemHead n={i + 1} kind="Flashcard" onDelete={() => setCards((x) => x.filter((y) => y.id !== f.id))} />
                    <Field label="Front" value={f.front} onChange={(v) => setCards((x) => x.map((y) => (y.id === f.id ? { ...y, front: v } : y)))} />
                    <Field label="Back" value={f.back} multiline onChange={(v) => setCards((x) => x.map((y) => (y.id === f.id ? { ...y, back: v } : y)))} />
                    <Field label="Hint (optional)" value={f.hint ?? ''} onChange={(v) => setCards((x) => x.map((y) => (y.id === f.id ? { ...y, hint: v } : y)))} />
                  </View>
                ))}
                <PillButton
                  label="Add flashcard"
                  kind="secondary"
                  size="sm"
                  icon={<Plus size={14} weight="bold" color={c.accent} />}
                  onPress={() => setCards((x) => [...x, { id: `fc-${uid()}`, front: '', back: '' }])}
                />
              </>
            ) : (
              <>
                {questions.map((q, i) => (
                  <View key={q.id} style={[styles.item, { backgroundColor: c.inset }]}>
                    <ItemHead n={i + 1} kind="Question" onDelete={() => setQuestions((x) => x.filter((y) => y.id !== q.id))} />
                    <Field label="Question" value={q.prompt} multiline onChange={(v) => setQuestions((x) => x.map((y) => (y.id === q.id ? { ...y, prompt: v } : y)))} />
                    <Text variant="caption">Answers — select the correct one</Text>
                    {q.options.map((o, k) => (
                      <View key={k} style={styles.optRow}>
                        <Pressable
                          role="radio"
                          aria-checked={q.answer === k}
                          accessibilityLabel={`Mark answer ${k + 1} correct`}
                          onPress={() => setQuestions((x) => x.map((y) => (y.id === q.id ? { ...y, answer: k } : y)))}
                          style={[styles.radio, { borderColor: q.answer === k ? c.success : c.textTertiary }]}
                        >
                          {q.answer === k ? <View style={[styles.dot, { backgroundColor: c.success }]} /> : null}
                        </Pressable>
                        <View style={styles.flex}>
                          <Field
                            label={`Answer ${k + 1}`}
                            hideLabel
                            value={o}
                            onChange={(v) =>
                              setQuestions((x) =>
                                x.map((y) => {
                                  if (y.id !== q.id) return y;
                                  const opts = [...y.options] as ModuleQuestion['options'];
                                  opts[k] = v;
                                  return { ...y, options: opts };
                                }),
                              )
                            }
                          />
                        </View>
                      </View>
                    ))}
                    <Field label="Explanation" value={q.explanation} multiline onChange={(v) => setQuestions((x) => x.map((y) => (y.id === q.id ? { ...y, explanation: v } : y)))} />
                  </View>
                ))}
                <PillButton
                  label="Add question"
                  kind="secondary"
                  size="sm"
                  icon={<Plus size={14} weight="bold" color={c.accent} />}
                  onPress={() =>
                    setQuestions((x) => [
                      ...x,
                      { id: `q-${uid()}`, prompt: '', options: ['', '', '', ''], answer: 0, explanation: '', topic: subject },
                    ])
                  }
                />
              </>
            )}
          </View>
        </View>
      )}
    </DesktopDialog>
  );
}

export function ItemHead({ n, kind, onDelete }: { n: number; kind: string; onDelete: () => void }) {
  const { c } = useTheme();
  return (
    <View style={styles.optRow}>
      <Text variant="overline" style={styles.flex}>
        {kind} {n}
      </Text>
      <Pressable
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${kind.toLowerCase()} ${n}`}
        style={({ hovered }) => [styles.del, hovered && { backgroundColor: c.accentTint }]}
      >
        <Trash size={16} weight="bold" color={c.danger} />
      </Pressable>
    </View>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  minHeight,
  max,
  hideLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  minHeight?: number;
  max?: number;
  hideLabel?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.gapSm}>
      {!hideLabel ? (
        <Text variant="caption" color="text">
          {label}
        </Text>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.textTertiary}
        multiline={multiline}
        maxLength={max}
        accessibilityLabel={label}
        style={[
          styles.input,
          { color: c.text, backgroundColor: c.card, borderColor: c.hairline },
          multiline ? { minHeight: minHeight ?? 64, textAlignVertical: 'top' } : null,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 12 },
  gapSm: { gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  drop: { borderWidth: 2, borderStyle: 'dashed', borderRadius: radius.inset, padding: 28, alignItems: 'center', gap: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15 },
  cols: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  left: { flex: 0.85, minWidth: 0 },
  right: { flex: 1.5, minWidth: 0 },
  item: { borderRadius: radius.inset, padding: 14, gap: 8 },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  del: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, padding: 10 },
  box: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tick: { fontSize: 12, lineHeight: 14, fontWeight: '800' },
  offline: { maxWidth: 220 },
});
