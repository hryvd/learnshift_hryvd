import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookOpenText, Plus, WifiHigh } from '@/components/ui/icons';

import { ConfirmDialog } from '@/components/teacher/ConfirmDialog';
import { CopyModuleDialog, EditModuleDialog } from '@/components/teacher/ModuleEditDialogs';
import {
  BottomSheet,
  Card,
  Chip,
  EmptyState,
  IconButton,
  Notice,
  PillButton,
  SegmentedControl,
  Skeleton,
  Stagger,
  Text,
} from '@/components/ui';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { fontFor } from '@/design/typography';
import { usePullRefresh } from '@/hooks/useAutoRefresh';
import { useDesktop } from '@/hooks/useDesktop';
import { teacherStrings as T } from '@/i18n/staff';
import { IS_PITCH, PITCH_NAMES } from '@/lib/config';
import type { ClassModule } from '@/services/ai/moduleGenerator';
import * as api from '@/services/backend/api';
import { getPeerLanBaseUrl } from '@/services/backend/peerModuleSync';
import { addLocalModule, refreshTeacher, removeLocalModule, useTeacher } from '@/services/backend/teacher';
import { useAppStore } from '@/store/useAppStore';

const EMPTY_MODULES: ClassModule[] = [];

export default function TeacherModules() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { contentWidth: width, isDesktop } = useDesktop();
  const wide = width >= 900;
  const pull = usePullRefresh(refreshTeacher);

  const classes = useTeacher((s) => s.classes);
  const selected = useTeacher((s) => s.selected);
  const setUploadOpen = useTeacher((s) => s.setUploadOpen);
  const selectedModules = useTeacher((s) => (s.selected ? s.modules[s.selected] : undefined));
  const realModules = selectedModules ?? EMPTY_MODULES;
  // Modules for this class haven't arrived yet: show skeletons, not "No modules yet".
  const modulesLoading = !IS_PITCH && !!selected && selectedModules === undefined;
  const pitchModules = useAppStore((s) => s.classModules);

  const activeClassId = IS_PITCH ? 'sampaguita' : (selected ?? classes[0]?.id ?? '');
  const activeClassName = IS_PITCH
    ? `Grade 8 - ${PITCH_NAMES.section}`
    : (classes.find((x) => x.id === activeClassId)?.name ?? T.classes);
  const modules = IS_PITCH ? pitchModules : realModules;
  const lanUrl = getPeerLanBaseUrl();

  const [error, setError] = useState<string | null>(null);
  const [previewMod, setPreviewMod] = useState<ClassModule | null>(null);
  const [toDelete, setToDelete] = useState<ClassModule | null>(null);
  const [editing, setEditing] = useState<ClassModule | null>(null);
  const [copying, setCopying] = useState<ClassModule | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<string>('All');
  const subjects = ['All', ...Array.from(new Set(modules.map((m) => m.subject)))];
  const listed = subjectFilter === 'All' ? modules : modules.filter((m) => m.subject === subjectFilter);
  // Laptop: the first module previews in the right pane until one is picked.
  const selectedMod = isDesktop ? (modules.find((m) => m.id === previewMod?.id) ?? modules[0] ?? null) : null;

  const handleDelete = async (mod: ClassModule) => {
    setError(null);
    if (IS_PITCH) {
      useAppStore.getState().deletePitchModule(mod.id);
      return;
    }
    removeLocalModule(mod.classId, mod.id);
    if (mod.id.startsWith('local-')) return;
    try {
      await api.deleteClassModule(mod.id);
    } catch (e) {
      addLocalModule(mod); // put it back: students still have it
      throw new Error(`Could not delete "${mod.title}". ${(e as Error).message}`);
    }
  };

  return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.root, { backgroundColor: c.bg, paddingTop: insets.top }]}
      >
          <ScrollView
            contentContainerStyle={[
              styles.body,
              { maxWidth: isDesktop ? 1400 : wide ? 1100 : 560, paddingBottom: insets.bottom + (isDesktop ? 40 : 110) },
              isDesktop && styles.bodyDesktop,
            ]}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              IS_PITCH ? undefined : (
                <RefreshControl
                  refreshing={pull.refreshing}
                  onRefresh={pull.onRefresh}
                  tintColor={c.accent}
                  colors={[c.accent]}
                />
              )
            }
          >
            {!isDesktop ? (
              <Stagger index={0} style={styles.header}>
                <View style={[styles.badge, { backgroundColor: c.tabInsights }]}>
                  <BookOpenText size={22} weight="fill" color="#FFFFFF" />
                </View>
                <View style={styles.flex}>
                  <Text variant="largeTitle">{T.modules}</Text>
                  <Text variant="subhead">{activeClassName}</Text>
                </View>
              </Stagger>
            ) : null}

            {!IS_PITCH && classes.length === 0 ? (
              <Card style={styles.gap}>
                <Text variant="title">Create a class first</Text>
                <Text variant="subhead">
                  Create at least one class so you can publish AI flashcards and quiz modules to your students.
                </Text>
                <PillButton label={T.createTitle} block onPress={() => router.replace('/teacher')} />
              </Card>
            ) : null}

            {!IS_PITCH && classes.length > 1 && !isDesktop ? (
              <SegmentedControl
                options={classes.map((cl) => ({ value: cl.id, label: cl.name }))}
                value={activeClassId}
                onChange={(id) => useTeacher.getState().select(id)}
              />
            ) : null}

            {error ? <Notice text={error} /> : null}

            <Stagger index={1}>
              <Card style={styles.centerCard}>
                <Text variant="title" align="center">
                  {T.uploadModule}
                </Text>
                <Text variant="subhead" align="center">
                  {isDesktop
                    ? 'Drop a PDF, Word file or text, review the flashcards and quiz, then publish to your classes.'
                    : 'Tap the centered + button below to flip open the drag-and-drop card, approve flashcards & quizzes, and pick classes.'}
                </Text>
                <PillButton
                  label={isDesktop ? 'Upload module  (U)' : 'Open Upload Card'}
                  icon={<Plus size={18} weight="bold" color={c.onAccent} />}
                  size="lg"
                  onPress={() => setUploadOpen(true)}
                />
                <View style={[styles.syncRow, { backgroundColor: c.inset }]}>
                  <WifiHigh size={16} weight="bold" color={c.success} />
                  <Text variant="caption" color="success" style={styles.flex}>
                    {Platform.OS === 'web'
                      ? 'Published modules sync to students through LearnShift cloud.'
                      : lanUrl
                        ? `Direct phone sync live (${lanUrl}) — students download straight from your phone`
                        : 'Phone-to-phone sync ready — minimizes cloud storage usage'}
                  </Text>
                </View>
              </Card>
            </Stagger>

            <Stagger index={2} style={isDesktop ? styles.columns : undefined}>
              <Card style={[styles.gap, isDesktop && styles.listCol]}>
                <Text variant="title">{T.publishedModules}</Text>
                {isDesktop && subjects.length > 2 ? (
                  <View style={styles.chipRow}>
                    {subjects.map((s) => (
                      <Chip key={s} label={s} kind={subjectFilter === s ? 'tinted' : 'neutral'} selected={subjectFilter === s} onPress={() => setSubjectFilter(s)} />
                    ))}
                  </View>
                ) : null}
                {modulesLoading ? (
                  <View style={styles.gap} accessibilityLabel="Loading modules">
                    {[0, 1, 2].map((k) => (
                      <Skeleton key={k} height={92} r={14} />
                    ))}
                  </View>
                ) : modules.length === 0 ? (
                  <EmptyState title={T.noModules} subtitle={T.noModulesSub} expression="curious" />
                ) : (
                  listed.map((m) => (
                    <Card
                      key={m.id}
                      onPress={() => setPreviewMod(m)}
                      accessibilityLabel={`${m.title}, ${m.flashcards.length} flashcards, ${m.questions.length} quiz questions`}
                      style={[
                        styles.modRow,
                        { backgroundColor: c.inset },
                        selectedMod?.id === m.id && { borderWidth: 2, borderColor: c.accent },
                      ]}
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
                          <Text variant="caption" color="accent" style={[fontFor(600), styles.flex]}>
                            {m.flashcards.length} {T.flashcards.toLowerCase()} · {m.questions.length} quiz Qs
                            {isDesktop ? (
                              <Text variant="caption">
                                {'  ·  '}
                                {new Date(m.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                              </Text>
                            ) : null}
                          </Text>
                          {isDesktop ? (
                            <>
                              <PillButton label="Edit" kind="neutral" size="sm" onPress={() => setEditing(m)} accessibilityLabel={`Edit ${m.title}`} />
                              {!IS_PITCH && classes.length > 1 ? (
                                <PillButton label="Copy" kind="neutral" size="sm" onPress={() => setCopying(m)} accessibilityLabel={`Copy ${m.title} to another class`} />
                              ) : null}
                            </>
                          ) : null}
                          <IconButton
                            kind="remove"
                            tone="danger"
                            size={32}
                            accessibilityLabel={T.deleteModule}
                            onPress={() => setToDelete(m)}
                          />
                        </View>
                      </View>
                    </Card>
                  ))
                )}
              </Card>
              {isDesktop && selectedMod ? <ModulePreview mod={selectedMod} /> : null}
            </Stagger>
          </ScrollView>

        <EditModuleDialog mod={editing} onClose={() => setEditing(null)} />
        <CopyModuleDialog mod={copying} onClose={() => setCopying(null)} />

        <ConfirmDialog
          visible={!!toDelete}
          title={`Delete "${toDelete?.title ?? ''}"?`}
          body="Students in this class lose these flashcards and quiz questions. This can't be undone."
          confirmLabel="Delete module"
          onClose={() => setToDelete(null)}
          onConfirm={() => (toDelete ? handleDelete(toDelete) : undefined)}
        />

        <BottomSheet
          visible={!isDesktop && !!previewMod}
          onClose={() => setPreviewMod(null)}
          accessibilityLabel={previewMod?.title ?? ''}
        >
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

      </KeyboardAvoidingView>
  );
}

/** Laptop: everything students receive, so the teacher can audit it. */
function ModulePreview({ mod }: { mod: ClassModule }) {
  const { c } = useTheme();
  const [tab, setTab] = useState<'cards' | 'quiz'>('cards');
  return (
    <Card style={[styles.gap, styles.previewCol]}>
      <View style={styles.rowBetween}>
        <Text variant="title" style={styles.flex}>
          {mod.title}
        </Text>
        <Chip label={mod.subject} kind="neutral" style={styles.smallChip} />
      </View>
      {mod.sourceName ? <Text variant="caption">From {mod.sourceName}</Text> : null}
      <Text variant="body">{mod.summary}</Text>
      <SegmentedControl
        options={[
          { value: 'cards', label: `${T.flashcards} (${mod.flashcards.length})` },
          { value: 'quiz', label: `Quiz (${mod.questions.length})` },
        ]}
        value={tab}
        onChange={(v) => setTab(v as 'cards' | 'quiz')}
      />
      {tab === 'cards'
        ? mod.flashcards.map((f, i) => (
            <View key={i} style={[styles.previewItem, { backgroundColor: c.inset }]}>
              <Text variant="headline">{f.front}</Text>
              <Text variant="body">{f.back}</Text>
              {f.hint ? <Text variant="caption">Hint: {f.hint}</Text> : null}
            </View>
          ))
        : mod.questions.map((q, i) => (
            <View key={i} style={[styles.previewItem, { backgroundColor: c.inset }]}>
              <Text variant="headline">
                {i + 1}. {q.prompt}
              </Text>
              {q.options.map((o, k) => (
                <Text key={k} variant="subhead" color={k === q.answer ? 'success' : 'textSecondary'} style={k === q.answer ? fontFor(700) : undefined}>
                  {k === q.answer ? '✓ ' : '• '}
                  {o}
                </Text>
              ))}
              {q.explanation ? <Text variant="caption">{q.explanation}</Text> : null}
            </View>
          ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  bodyDesktop: { paddingHorizontal: 28, paddingTop: 12 },
  columns: { flexDirection: 'row', gap: space.gap, alignItems: 'flex-start' },
  listCol: { flex: 0.9, minWidth: 0 },
  previewCol: { flex: 1.4, minWidth: 0 },
  previewItem: { borderRadius: radius.inset, padding: 14, gap: 6 },
  flex: { flex: 1 },
  body: { paddingHorizontal: space.screen, gap: space.gap, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8 },
  badge: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  gap: { gap: 12 },
  centerCard: { gap: 12, alignItems: 'center' },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: radius.inset,
    width: '100%',
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  modRow: { borderRadius: radius.inset },
  modRowInner: { padding: 14, gap: 6 },
  smallChip: { height: 26, paddingHorizontal: 10 },
});
