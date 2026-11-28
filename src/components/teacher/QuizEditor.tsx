import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ArrowDown, ArrowUp, Plus, Trash } from '@/components/ui/icons';

import { Chip, Notice, PillButton, SegmentedControl, Text } from '@/components/ui';
import { useTheme } from '@/design/theme';
import { radius } from '@/design/tokens';
import { FONT_SECONDARY } from '@/design/typography';
import { teacherStrings as T } from '@/i18n/staff';
import type { ModuleFlashcard, ModuleQuestion } from '@/services/ai/moduleGenerator';

export const QUIZ_SUBJECTS = ['Math', 'Science', 'English', 'Filipino', 'General'] as const;

export type EditableQuizValue = {
  title: string;
  subject: string;
  summary: string;
  flashcards: ModuleFlashcard[];
  questions: ModuleQuestion[];
};

const uid = () => Math.random().toString(36).slice(2, 10);

/** Validates quiz content and returns an exact field-specific message when invalid. */
export function validateQuizValue(v: EditableQuizValue): string | null {
  if (!v.title.trim()) return 'Title is required.';
  if (v.title.trim().length > 120) return 'Title must be 120 characters or fewer.';
  if (v.questions.length < 1) return 'Add at least 1 quiz question.';
  if (v.questions.length > 30) return 'Quizzes can have at most 30 questions.';
  for (let i = 0; i < v.flashcards.length; i++) {
    const f = v.flashcards[i];
    if (!f.front.trim()) return `Flashcard ${i + 1}: Front cannot be empty.`;
    if (!f.back.trim()) return `Flashcard ${i + 1}: Back cannot be empty.`;
  }
  for (let i = 0; i < v.questions.length; i++) {
    const q = v.questions[i];
    if (!q.prompt.trim()) return `Question ${i + 1}: Prompt is required.`;
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      return `Question ${i + 1}: Needs 4 answer options.`;
    }
    for (let k = 0; k < 4; k++) {
      if (!q.options[k]?.trim()) {
        return `Question ${i + 1}: Answer ${String.fromCharCode(65 + k)} cannot be empty.`;
      }
    }
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) {
      return `Question ${i + 1}: Select a correct answer (A–D).`;
    }
  }
  return null;
}

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

/**
 * Shared quiz + flashcard editor for mobile and laptop teachers.
 * Supports editing, adding, deleting, reordering, and inline field validation.
 */
export function QuizEditor({
  value,
  onChange,
  saveStatus,
  conflictNotice,
  defaultTab = 'quiz',
}: {
  value: EditableQuizValue;
  onChange: (next: EditableQuizValue) => void;
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error';
  conflictNotice?: string | null;
  defaultTab?: 'cards' | 'quiz';
}) {
  const { c } = useTheme();
  const [tab, setTab] = useState<'cards' | 'quiz'>(defaultTab);
  const validationError = validateQuizValue(value);

  const patch = (p: Partial<EditableQuizValue>) => onChange({ ...value, ...p });

  const updateCard = (id: string, p: Partial<ModuleFlashcard>) =>
    patch({ flashcards: value.flashcards.map((f) => (f.id === id ? { ...f, ...p } : f)) });

  const updateQuestion = (id: string, p: Partial<ModuleQuestion>) =>
    patch({ questions: value.questions.map((q) => (q.id === id ? { ...q, ...p } : q)) });

  return (
    <View style={styles.root}>
      {conflictNotice ? <Notice text={conflictNotice} /> : null}

      <View style={styles.metaRow}>
        <Text variant="overline" color="textSecondary" style={styles.flex}>
          QUIZ DETAILS
        </Text>
        {saveStatus === 'saving' ? (
          <Text variant="caption" color="textSecondary">
            Saving…
          </Text>
        ) : saveStatus === 'saved' ? (
          <Text variant="caption" color="success">
            Saved · just now
          </Text>
        ) : saveStatus === 'error' ? (
          <Text variant="caption" color="danger">
            Saved locally · offline
          </Text>
        ) : null}
      </View>

      <EditorField
        label="Title"
        value={value.title}
        onChange={(title) => patch({ title })}
        placeholder="e.g. Linear Equations & Slope"
        max={120}
      />

      <View style={styles.gapSm}>
        <Text variant="caption" color="text">
          {T.moduleSubject}
        </Text>
        <View style={styles.subjRow}>
          {QUIZ_SUBJECTS.map((s) => (
            <Chip
              key={s}
              label={s}
              kind={value.subject === s ? 'tinted' : 'neutral'}
              selected={value.subject === s}
              onPress={() => patch({ subject: s })}
            />
          ))}
        </View>
      </View>

      <EditorField
        label="Summary students see"
        value={value.summary}
        onChange={(summary) => patch({ summary })}
        multiline
        minHeight={72}
      />

      {validationError ? <Notice text={validationError} /> : null}

      <SegmentedControl
        options={[
          { value: 'quiz', label: `Quiz (${value.questions.length})` },
          { value: 'cards', label: `${T.flashcards} (${value.flashcards.length})` },
        ]}
        value={tab}
        onChange={(v) => setTab(v as 'cards' | 'quiz')}
      />

      {tab === 'quiz' ? (
        <View style={styles.list}>
          {value.questions.map((q, idx) => (
            <View key={q.id} style={[styles.itemCard, { backgroundColor: c.inset }]}>
              <ItemToolbar
                label={`Question ${idx + 1}`}
                canUp={idx > 0}
                canDown={idx < value.questions.length - 1}
                canDelete={value.questions.length > 1}
                onUp={() => patch({ questions: moveItem(value.questions, idx, idx - 1) })}
                onDown={() => patch({ questions: moveItem(value.questions, idx, idx + 1) })}
                onDelete={() => patch({ questions: value.questions.filter((x) => x.id !== q.id) })}
              />
              <EditorField
                label={`Question ${idx + 1} prompt`}
                value={q.prompt}
                multiline
                onChange={(prompt) => updateQuestion(q.id, { prompt })}
              />
              <Text variant="caption" color="textSecondary">
                Answers — select the correct one
              </Text>
              {q.options.map((opt, k) => (
                <View key={k} style={styles.optRow}>
                  <Pressable
                    role="radio"
                    aria-checked={q.answer === k}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: q.answer === k }}
                    accessibilityLabel={`Mark answer ${String.fromCharCode(65 + k)} correct`}
                    onPress={() => updateQuestion(q.id, { answer: k })}
                    style={[styles.radio, { borderColor: q.answer === k ? c.success : c.textTertiary }]}
                  >
                    {q.answer === k ? <View style={[styles.radioDot, { backgroundColor: c.success }]} /> : null}
                  </Pressable>
                  <View style={styles.flex}>
                    <EditorField
                      label={`Question ${idx + 1} answer ${String.fromCharCode(65 + k)}`}
                      hideLabel
                      value={opt}
                      placeholder={`Option ${String.fromCharCode(65 + k)}`}
                      onChange={(text) => {
                        const opts = [...q.options] as ModuleQuestion['options'];
                        opts[k] = text;
                        updateQuestion(q.id, { options: opts });
                      }}
                    />
                  </View>
                </View>
              ))}
              <EditorField
                label="Explanation"
                value={q.explanation}
                multiline
                onChange={(explanation) => updateQuestion(q.id, { explanation })}
              />
            </View>
          ))}
          {value.questions.length < 30 ? (
            <PillButton
              label="Add question"
              kind="secondary"
              size="sm"
              icon={<Plus size={14} weight="bold" color={c.accent} />}
              onPress={() =>
                patch({
                  questions: [
                    ...value.questions,
                    {
                      id: `q-${uid()}`,
                      prompt: '',
                      options: ['', '', '', ''],
                      answer: 0,
                      explanation: '',
                      topic: value.subject,
                    },
                  ],
                })
              }
            />
          ) : null}
        </View>
      ) : (
        <View style={styles.list}>
          {value.flashcards.map((fc, idx) => (
            <View key={fc.id} style={[styles.itemCard, { backgroundColor: c.inset }]}>
              <ItemToolbar
                label={`Flashcard ${idx + 1}`}
                canUp={idx > 0}
                canDown={idx < value.flashcards.length - 1}
                canDelete={value.flashcards.length > 0}
                onUp={() => patch({ flashcards: moveItem(value.flashcards, idx, idx - 1) })}
                onDown={() => patch({ flashcards: moveItem(value.flashcards, idx, idx + 1) })}
                onDelete={() => patch({ flashcards: value.flashcards.filter((x) => x.id !== fc.id) })}
              />
              <EditorField
                label="Front"
                value={fc.front}
                onChange={(front) => updateCard(fc.id, { front })}
              />
              <EditorField
                label="Back"
                value={fc.back}
                multiline
                onChange={(back) => updateCard(fc.id, { back })}
              />
              <EditorField
                label="Hint (optional)"
                value={fc.hint ?? ''}
                onChange={(hint) => updateCard(fc.id, { hint })}
              />
            </View>
          ))}
          <PillButton
            label="Add flashcard"
            kind="secondary"
            size="sm"
            icon={<Plus size={14} weight="bold" color={c.accent} />}
            onPress={() =>
              patch({
                flashcards: [...value.flashcards, { id: `fc-${uid()}`, front: '', back: '' }],
              })
            }
          />
        </View>
      )}
    </View>
  );
}

function ItemToolbar({
  label,
  canUp,
  canDown,
  canDelete,
  onUp,
  onDown,
  onDelete,
}: {
  label: string;
  canUp: boolean;
  canDown: boolean;
  canDelete: boolean;
  onUp: () => void;
  onDown: () => void;
  onDelete: () => void;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.toolbar}>
      <Text variant="overline" style={styles.flex}>
        {label}
      </Text>
      <Pressable
        disabled={!canUp}
        onPress={onUp}
        accessibilityRole="button"
        accessibilityLabel={`Move ${label} up`}
        style={[styles.iconBtn, !canUp && styles.dim]}
      >
        <ArrowUp size={15} weight="bold" color={c.textSecondary} />
      </Pressable>
      <Pressable
        disabled={!canDown}
        onPress={onDown}
        accessibilityRole="button"
        accessibilityLabel={`Move ${label} down`}
        style={[styles.iconBtn, !canDown && styles.dim]}
      >
        <ArrowDown size={15} weight="bold" color={c.textSecondary} />
      </Pressable>
      {canDelete ? (
        <Pressable
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          style={styles.iconBtn}
        >
          <Trash size={15} weight="bold" color={c.danger} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function EditorField({
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
  root: { gap: 12 },
  flex: { flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  gapSm: { gap: 6 },
  subjRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  list: { gap: 10 },
  itemCard: { borderRadius: radius.inset, padding: 14, gap: 8 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.3 },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
    fontFamily: FONT_SECONDARY,
  },
});
