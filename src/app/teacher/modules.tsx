import { useState, type ChangeEvent } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookOpenText, CheckCircle, FileArrowUp, Sparkle, Trash } from 'phosphor-react-native';

import { TeacherTabBar } from '@/components/teacher/TeacherTabBar';
import {
  BottomSheet,
  Card,
  Chip,
  EmptyState,
  Notice,
  PillButton,
  PressableScale,
  SegmentedControl,
  Stagger,
  Text,
  TextField,
} from '@/components/ui';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { fontFor } from '@/design/typography';
import { usePullRefresh } from '@/hooks/useAutoRefresh';
import { teacherStrings as T } from '@/i18n/staff';
import { IS_PITCH, PITCH_NAMES } from '@/lib/config';
import {
  generateModuleDeck,
  SAMPLE_MODULE_TEXT,
  type ClassModule,
  type GeneratedModuleDeck,
} from '@/services/ai/moduleGenerator';
import * as api from '@/services/backend/api';
import { addLocalModule, refreshTeacher, removeLocalModule, useTeacher } from '@/services/backend/teacher';
import { pickModuleFile } from '@/services/monitor';
import { useAppStore } from '@/store/useAppStore';

const SUBJECTS = ['Math', 'Science', 'English', 'Filipino', 'General'] as const;
const EMPTY_MODULES: ClassModule[] = [];

export default function TeacherModules() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const pull = usePullRefresh(refreshTeacher);

  const classes = useTeacher((s) => s.classes);
  const selected = useTeacher((s) => s.selected);
  const selectedModules = useTeacher((s) => (s.selected ? s.modules[s.selected] : undefined));
  const realModules = selectedModules ?? EMPTY_MODULES;
  const pitchModules = useAppStore((s) => s.classModules);

  const activeClassId = IS_PITCH ? 'sampaguita' : (selected ?? classes[0]?.id ?? '');
  const activeClassName = IS_PITCH
    ? `Grade 8 – ${PITCH_NAMES.section}`
    : (classes.find((x) => x.id === activeClassId)?.name ?? T.classes);
  const modules = IS_PITCH ? pitchModules : realModules;

  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState<string>('Math');
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [deck, setDeck] = useState<GeneratedModuleDeck | null>(null);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [previewMod, setPreviewMod] = useState<ClassModule | null>(null);
  const [webInputKey, setWebInputKey] = useState(0);

  const applyUploadedText = (fileName: string, rawText: string) => {
    setError(null);
    setSavedNotice(null);
    // Reject binary streams (e.g. compressed PDF/DOCX bytes) honestly instead of garbling cards.
    if (/[\u0000-\u0008\u000E-\u001F]/.test(rawText.slice(0, 800))) {
      setError('This file looks binary. Export it as plain text (.txt / .md) or paste the lesson notes below.');
      return;
    }
    const clean = rawText.trim().slice(0, 10000);
    if (clean.length < 30) {
      setError('The selected file had almost no readable text. Please paste the lesson text below.');
      return;
    }
    setSourceName(fileName);
    if (!title.trim()) {
      setTitle(fileName.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 80));
    }
    setContent(clean);
  };

  const handleWebFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setWebInputKey((k) => k + 1);
    if (!file) return;
    try {
      const text = await file.text();
      applyUploadedText(file.name, text);
    } catch {
      setError('Could not read the selected file.');
    }
  };

  const handlePickNative = async () => {
    setError(null);
    const picked = await pickModuleFile();
    if (!picked) return;
    if (picked.error) {
      setError(picked.error);
      return;
    }
    applyUploadedText(picked.name, picked.text);
  };

  const handleGenerate = async () => {
    setError(null);
    setSavedNotice(null);
    if (title.trim().length < 2 || content.trim().length < 30) {
      setError('Enter a module title and upload or paste at least a few sentences of lesson content.');
      return;
    }
    setGenerating(true);
    try {
      const out = await generateModuleDeck({ title: title.trim(), subject, content: content.trim() });
      setDeck(out);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const handlePublish = async () => {
    if (!deck || publishing) return;
    if (!IS_PITCH && !activeClassId) {
      setError('Create or select a class first on the Settings tab.');
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      if (IS_PITCH) {
        const mod: ClassModule = {
          id: `mod-${Date.now().toString(36)}`,
          classId: activeClassId,
          title: title.trim(),
          subject,
          sourceName,
          summary: deck.summary,
          flashcards: deck.flashcards,
          questions: deck.questions,
          published: true,
          createdAt: new Date().toISOString(),
        };
        useAppStore.getState().addPitchModule(mod);
      } else {
        const saved = await api.saveClassModule({
          classId: activeClassId,
          title: title.trim(),
          subject,
          sourceName,
          sourceExcerpt: content.trim(),
          summary: deck.summary,
          flashcards: deck.flashcards,
          questions: deck.questions,
        });
        addLocalModule(saved);
      }
      setSavedNotice(`Published "${title.trim()}" (${deck.flashcards.length} flashcards, ${deck.questions.length} quiz questions)`);
      setTitle('');
      setContent('');
      setSourceName(null);
      setDeck(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  const handleDelete = async (mod: ClassModule) => {
    try {
      if (IS_PITCH) {
        useAppStore.getState().deletePitchModule(mod.id);
      } else {
        removeLocalModule(mod.classId, mod.id);
        await api.deleteClassModule(mod.id);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { backgroundColor: c.bg, paddingTop: insets.top }]}
    >
      <ScrollView
        contentContainerStyle={[styles.body, { maxWidth: wide ? 1100 : 560, paddingBottom: insets.bottom + 110 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          IS_PITCH ? undefined : (
            <RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={c.accent} colors={[c.accent]} />
          )
        }
      >
        <Stagger index={0} style={styles.header}>
          <View style={[styles.badge, { backgroundColor: c.tabInsights }]}>
            <BookOpenText size={22} weight="fill" color="#FFFFFF" />
          </View>
          <View style={styles.flex}>
            <Text variant="largeTitle">{T.modules}</Text>
            <Text variant="subhead">{activeClassName}</Text>
          </View>
        </Stagger>

        {!IS_PITCH && classes.length === 0 ? (
          <Card style={styles.gap}>
            <Text variant="title">Create a class first</Text>
            <Text variant="subhead">Create at least one class so you can publish AI flashcards and quiz modules to your students.</Text>
            <PillButton label={T.createTitle} block onPress={() => router.replace('/teacher')} />
          </Card>
        ) : null}

        {!IS_PITCH && classes.length > 1 ? (
          <SegmentedControl
            options={classes.map((cl) => ({ value: cl.id, label: cl.name }))}
            value={activeClassId}
            onChange={(id) => useTeacher.getState().select(id)}
          />
        ) : null}

        {error ? <Notice text={error} /> : null}
        {savedNotice ? (
          <View style={[styles.successBanner, { backgroundColor: c.success + '1A' }]}>
            <CheckCircle size={18} weight="fill" color={c.success} />
            <Text variant="subhead" color="success" style={styles.flex}>
              {savedNotice}
            </Text>
          </View>
        ) : null}

        <Stagger index={1}>
          <Card style={styles.gap}>
            <Text variant="title">{T.uploadModule}</Text>
            <Text variant="subhead">{T.modulesSub}</Text>

            <View style={styles.rowWrap}>
              {Platform.OS === 'web' ? (
                <label style={{ cursor: 'pointer', flex: 1 }}>
                  <input
                    key={webInputKey}
                    type="file"
                    accept=".txt,.md,.csv,.json,.html,text/*"
                    onChange={handleWebFile}
                    style={{ display: 'none' }}
                  />
                  <View style={[styles.uploadBox, { backgroundColor: c.accentTint, borderColor: c.accent + '55' }]}>
                    <FileArrowUp size={20} weight="fill" color={c.accent} />
                    <Text variant="headline" color="accent">
                      {sourceName ? `File: ${sourceName}` : T.uploadModule}
                    </Text>
                  </View>
                </label>
              ) : (
                <PillButton
                  label={sourceName ? `File: ${sourceName}` : T.uploadModule}
                  kind="secondary"
                  icon={<FileArrowUp size={18} weight="fill" color={c.accent} />}
                  style={styles.flex}
                  block
                  onPress={handlePickNative}
                />
              )}
              <PillButton
                label={T.sampleModule}
                kind="neutral"
                onPress={() => {
                  setError(null);
                  setSavedNotice(null);
                  setTitle('Linear Equations & Slope');
                  setSubject('Math');
                  setSourceName('sample-linear-equations.txt');
                  setContent(SAMPLE_MODULE_TEXT);
                }}
              />
            </View>
            <Text variant="caption">{T.uploadHint}</Text>

            <TextField
              label={T.moduleTitle}
              placeholder={T.moduleTitlePh}
              value={title}
              onChangeText={setTitle}
              maxLength={120}
            />

            <Text variant="subhead" color="text">
              {T.moduleSubject}
            </Text>
            <View style={styles.rowWrap}>
              {SUBJECTS.map((subj) => {
                const active = subject === subj;
                return (
                  <PressableScale
                    key={subj}
                    onPress={() => setSubject(subj)}
                    style={[styles.subjPill, { backgroundColor: active ? c.accent : c.inset }]}
                  >
                    <Text variant="caption" color={active ? c.onAccent : c.text} style={fontFor(700)}>
                      {subj}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>

            <Text variant="subhead" color="text">
              {T.moduleText}
            </Text>
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder={T.moduleTextPh}
              placeholderTextColor={c.textTertiary}
              multiline
              textAlignVertical="top"
              style={[styles.textArea, { color: c.text, backgroundColor: c.inset, borderColor: c.hairline }]}
              accessibilityLabel={T.moduleText}
            />

            <PillButton
              label={generating ? T.generating : T.generateAi}
              icon={<Sparkle size={18} weight="fill" color={c.onAccent} />}
              block
              disabled={generating || !title.trim() || content.trim().length < 20}
              onPress={handleGenerate}
            />
          </Card>
        </Stagger>

        {deck ? (
          <Stagger index={2}>
            <Card style={styles.gap}>
              <View style={styles.rowBetween}>
                <Text variant="title">{title.trim() || 'Generated deck'}</Text>
                <Chip
                  label={deck.source === 'ai' ? 'AI Generated' : 'Smart Local'}
                  kind="tinted"
                />
              </View>
              <Text variant="body" color="textSecondary">
                {deck.summary}
              </Text>

              <Text variant="headline">
                {T.flashcards} ({deck.flashcards.length})
              </Text>
              {deck.flashcards.map((fc, idx) => (
                <View key={fc.id} style={[styles.previewItem, { backgroundColor: c.inset }]}>
                  <View style={styles.rowBetween}>
                    <Text variant="subhead" color="accent" style={fontFor(700)}>
                      #{idx + 1} · {fc.front}
                    </Text>
                    {deck.flashcards.length > 1 ? (
                      <PressableScale
                        accessibilityLabel="Remove flashcard"
                        onPress={() =>
                          setDeck((d) =>
                            d ? { ...d, flashcards: d.flashcards.filter((x) => x.id !== fc.id) } : null,
                          )
                        }
                      >
                        <Trash size={15} color={c.textTertiary} />
                      </PressableScale>
                    ) : null}
                  </View>
                  <Text variant="body">{fc.back}</Text>
                </View>
              ))}

              <Text variant="headline">
                {T.quizzes} ({deck.questions.length})
              </Text>
              {deck.questions.map((q, idx) => (
                <View key={q.id} style={[styles.previewItem, { backgroundColor: c.inset }]}>
                  <View style={styles.rowBetween}>
                    <Text variant="subhead" color="text" style={[styles.flex, fontFor(700)]}>
                      Q{idx + 1}. {q.prompt}
                    </Text>
                    {deck.questions.length > 1 ? (
                      <PressableScale
                        accessibilityLabel="Remove question"
                        onPress={() =>
                          setDeck((d) =>
                            d ? { ...d, questions: d.questions.filter((x) => x.id !== q.id) } : null,
                          )
                        }
                      >
                        <Trash size={15} color={c.textTertiary} />
                      </PressableScale>
                    ) : null}
                  </View>
                  {q.options.map((opt, oi) => (
                    <Text key={oi} variant="caption" color={oi === q.answer ? 'success' : 'textSecondary'}>
                      {String.fromCharCode(65 + oi)}. {opt}
                      {oi === q.answer ? '  ✓' : ''}
                    </Text>
                  ))}
                </View>
              ))}

              <PillButton
                label={publishing ? T.publishing : T.publishModule}
                block
                size="lg"
                disabled={publishing}
                onPress={handlePublish}
              />
            </Card>
          </Stagger>
        ) : null}

        <Stagger index={3}>
          <Card style={styles.gap}>
            <Text variant="title">{T.publishedModules}</Text>
            {modules.length === 0 ? (
              <EmptyState title={T.noModules} subtitle={T.noModulesSub} expression="curious" />
            ) : (
              modules.map((m) => (
                <Card
                  key={m.id}
                  onPress={() => setPreviewMod(m)}
                  style={[styles.modRow, { backgroundColor: c.inset }]}
                  padded={false}
                >
                  <View style={styles.modRowInner}>
                    <View style={styles.rowBetween}>
                      <Text variant="headline" style={styles.flex} numberOfLines={1}>
                        {m.title}
                      </Text>
                      <Chip label={m.subject} kind="neutral" style={styles.smallChip} />
                    </View>
                    <Text variant="caption" numberOfLines={2}>
                      {m.summary}
                    </Text>
                    <View style={styles.rowBetween}>
                      <Text variant="caption" color="accent" style={fontFor(600)}>
                        {m.flashcards.length} {T.flashcards.toLowerCase()} · {m.questions.length} quiz Qs
                      </Text>
                      <PressableScale
                        accessibilityLabel={T.deleteModule}
                        onPress={() => void handleDelete(m)}
                        style={styles.trashBtn}
                      >
                        <Trash size={16} color={c.danger} />
                      </PressableScale>
                    </View>
                  </View>
                </Card>
              ))
            )}
          </Card>
        </Stagger>
      </ScrollView>

      <BottomSheet visible={!!previewMod} onClose={() => setPreviewMod(null)} accessibilityLabel={previewMod?.title ?? ''}>
        {previewMod ? (
          <View style={styles.gap}>
            <Text variant="title">{previewMod.title}</Text>
            <Text variant="subhead">{previewMod.summary}</Text>
            <Text variant="overline">
              {previewMod.flashcards.length} {T.flashcards} · {previewMod.questions.length} {T.quizzes}
            </Text>
            <PillButton label="Close" kind="neutral" block onPress={() => setPreviewMod(null)} />
          </View>
        ) : null}
      </BottomSheet>

      <TeacherTabBar active="modules" />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  body: { paddingHorizontal: space.screen, gap: space.gap, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8 },
  badge: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  gap: { gap: 12 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  uploadBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  subjPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill },
  textArea: {
    minHeight: 140,
    borderRadius: radius.inset,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    fontSize: 15,
    lineHeight: 21,
  },
  previewItem: { borderRadius: radius.inset, padding: 12, gap: 6 },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: radius.inset,
  },
  modRow: { borderRadius: radius.inset },
  modRowInner: { padding: 14, gap: 6 },
  smallChip: { height: 26, paddingHorizontal: 10 },
  trashBtn: { padding: 6 },
});
