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
import { BookOpenText, FileText, Plus, WifiHigh } from '@/components/ui/icons';

import { ConfirmDialog } from '@/components/teacher/ConfirmDialog';
import { AssignDraftDialog, EditDraftDialog, openOriginalSource } from '@/components/teacher/ModuleEditDialogs';
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
import type { ClassModule, QuizDraft } from '@/services/ai/moduleGenerator';
import * as api from '@/services/backend/api';
import { getPeerLanBaseUrl } from '@/services/backend/peerModuleSync';
import {
  addLocalModule,
  archiveDraft,
  assignDraftToClasses,
  refreshTeacher,
  removeLocalModule,
  useTeacher,
} from '@/services/backend/teacher';
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
  const drafts = useTeacher((s) => s.drafts);
  const realModules = selectedModules ?? EMPTY_MODULES;
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
  const [toArchive, setToArchive] = useState<QuizDraft | null>(null);
  const [editingDraft, setEditingDraft] = useState<QuizDraft | null>(null);
  const [assigningDraft, setAssigningDraft] = useState<{ draft: QuizDraft; defaultClassIds?: string[] } | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<string>('All');

  const subjects = ['All', ...Array.from(new Set(modules.map((m) => m.subject)))];
  const listed = subjectFilter === 'All' ? modules : modules.filter((m) => m.subject === subjectFilter);
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
      addLocalModule(mod);
      throw new Error(`Could not unassign "${mod.title}". ${(e as Error).message}`);
    }
  };

  const handleUpdateStudents = async (mod: ClassModule, draft: QuizDraft) => {
    setError(null);
    setUpdatingId(mod.id);
    try {
      const res = await assignDraftToClasses(draft, [mod.classId], !!mod.shareSource);
      if (res.status === 'conflict') {
        setError('This draft changed on another device. Reloaded latest version — tap Update again.');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleViewOriginal = async (input: { moduleId?: string; draftId?: string }) => {
    setError(null);
    try {
      await openOriginalSource(input);
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
              Create at least one class so you can build private drafts and assign approved quizzes to your students.
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
              Upload a lesson to build a private draft, review and edit every question, then assign the approved version to your classes.
            </Text>
            <PillButton
              label={isDesktop ? 'Upload module  (U)' : 'Upload module'}
              icon={<Plus size={18} weight="bold" color={c.onAccent} />}
              size="lg"
              onPress={() => setUploadOpen(true)}
            />
            <View style={[styles.syncRow, { backgroundColor: c.inset }]}>
              <WifiHigh size={16} weight="bold" color={c.success} />
              <Text variant="caption" color="success" style={styles.flex}>
                {Platform.OS === 'web'
                  ? 'Drafts stay private. Assigned snapshots sync to enrolled students.'
                  : lanUrl
                    ? `Direct phone sync live (${lanUrl}) — only assigned snapshots are shared`
                    : 'Drafts stay private; only assigned snapshots sync to students'}
              </Text>
            </View>
          </Card>
        </Stagger>

        {/* Section 1: Private Drafts */}
        <Stagger index={2}>
          <Card style={styles.gap}>
            <View style={styles.rowBetween}>
              <View style={styles.flex}>
                <Text variant="title">Drafts</Text>
                <Text variant="caption" color="textSecondary">
                  Private to you — students never see drafts until you assign them.
                </Text>
              </View>
              <Chip label={`${drafts.length}`} kind="neutral" style={styles.smallChip} />
            </View>
            {drafts.length === 0 ? (
              <Text variant="subhead" color="textSecondary">
                No drafts yet. Upload a lesson file to generate one.
              </Text>
            ) : (
              drafts.map((d) => (
                <View key={d.id} style={[styles.modRowInner, styles.modRow, { backgroundColor: c.inset }]}>
                  <View style={styles.rowBetween}>
                    <Text variant="headline" style={styles.flex} numberOfLines={1}>
                      {d.title}
                    </Text>
                    <Chip label={`v${d.version}`} kind="tinted" style={styles.smallChip} />
                    <Chip label={d.subject} kind="neutral" style={styles.smallChip} />
                  </View>
                  {d.summary ? (
                    <Text variant="caption" numberOfLines={2}>
                      {d.summary}
                    </Text>
                  ) : null}
                  <Text variant="caption" color="textSecondary">
                    {d.flashcards.length} flashcards · {d.questions.length} quiz Qs
                    {d.sourceName ? ` · ${d.sourceName}` : ''}
                  </Text>
                  <View style={styles.actionRow}>
                    <PillButton
                      label="Edit draft"
                      kind="secondary"
                      size="sm"
                      onPress={() => setEditingDraft(d)}
                    />
                    <PillButton
                      label="Assign"
                      size="sm"
                      onPress={() => setAssigningDraft({ draft: d })}
                    />
                    {d.sourceId && !IS_PITCH ? (
                      <PillButton
                        label="View original"
                        kind="neutral"
                        size="sm"
                        icon={<FileText size={14} weight="bold" color={c.text} />}
                        onPress={() => void handleViewOriginal({ draftId: d.id })}
                      />
                    ) : null}
                    <View style={styles.flex} />
                    <IconButton
                      kind="remove"
                      tone="danger"
                      size={32}
                      accessibilityLabel={`Archive draft ${d.title}`}
                      onPress={() => setToArchive(d)}
                    />
                  </View>
                </View>
              ))
            )}
          </Card>
        </Stagger>

        {/* Section 2: Assigned Snapshots */}
        <Stagger index={3} style={isDesktop ? styles.columns : undefined}>
          <Card style={[styles.gap, isDesktop && styles.listCol]}>
            <View style={styles.rowBetween}>
              <Text variant="title">Assigned · {activeClassName}</Text>
              <Chip label={`${modules.length}`} kind="neutral" style={styles.smallChip} />
            </View>
            {isDesktop && subjects.length > 2 ? (
              <View style={styles.chipRow}>
                {subjects.map((s) => (
                  <Chip
                    key={s}
                    label={s}
                    kind={subjectFilter === s ? 'tinted' : 'neutral'}
                    selected={subjectFilter === s}
                    onPress={() => setSubjectFilter(s)}
                  />
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
              listed.map((m) => {
                const matchingDraft = m.quizId ? drafts.find((d) => d.id === m.quizId) : undefined;
                const hasNewerDraft =
                  !!matchingDraft && m.quizVersion != null && matchingDraft.version > m.quizVersion;
                return (
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
                        {m.quizVersion != null ? (
                          <Chip label={`v${m.quizVersion}`} kind="tinted" style={styles.smallChip} />
                        ) : null}
                        <Chip label={m.subject} kind="neutral" style={styles.smallChip} />
                      </View>
                      <Text variant="caption" numberOfLines={2}>
                        {m.summary}
                      </Text>

                      {hasNewerDraft && matchingDraft ? (
                        <View style={[styles.updateBanner, { backgroundColor: c.accentTint }]}>
                          <Text variant="caption" color="accent" style={[styles.flex, fontFor(600)]}>
                            Edited since assigning (v{matchingDraft.version} ready). Update students?
                          </Text>
                          <PillButton
                            label={updatingId === m.id ? 'Updating…' : 'Update students'}
                            size="sm"
                            disabled={updatingId === m.id}
                            onPress={() => void handleUpdateStudents(m, matchingDraft)}
                          />
                        </View>
                      ) : null}

                      <View style={styles.actionRow}>
                        <Text variant="caption" color="accent" style={[fontFor(600), styles.flex]}>
                          {m.flashcards.length} flashcards · {m.questions.length} quiz Qs
                        </Text>
                        {matchingDraft ? (
                          <PillButton
                            label="Edit draft"
                            kind="neutral"
                            size="sm"
                            onPress={() => setEditingDraft(matchingDraft)}
                          />
                        ) : null}
                        {m.sourceId && !IS_PITCH ? (
                          <PillButton
                            label="View original"
                            kind="neutral"
                            size="sm"
                            onPress={() => void handleViewOriginal({ moduleId: m.id })}
                          />
                        ) : null}
                        {matchingDraft && !IS_PITCH && classes.length > 1 ? (
                          <PillButton
                            label="Assign"
                            kind="neutral"
                            size="sm"
                            onPress={() => setAssigningDraft({ draft: matchingDraft })}
                          />
                        ) : null}
                        <IconButton
                          kind="remove"
                          tone="danger"
                          size={32}
                          accessibilityLabel={`Unassign ${m.title}`}
                          onPress={() => setToDelete(m)}
                        />
                      </View>
                    </View>
                  </Card>
                );
              })
            )}
          </Card>
          {isDesktop && selectedMod ? (
            <ModulePreview
              mod={selectedMod}
              onViewOriginal={
                selectedMod.sourceId && !IS_PITCH
                  ? () => void handleViewOriginal({ moduleId: selectedMod.id })
                  : undefined
              }
            />
          ) : null}
        </Stagger>
      </ScrollView>

      <EditDraftDialog
        draft={editingDraft}
        onClose={() => setEditingDraft(null)}
        onAssign={(latest) => setAssigningDraft({ draft: latest })}
      />
      <AssignDraftDialog
        draft={assigningDraft?.draft ?? null}
        defaultClassIds={assigningDraft?.defaultClassIds}
        onClose={() => setAssigningDraft(null)}
      />

      <ConfirmDialog
        visible={!!toDelete}
        title={`Unassign "${toDelete?.title ?? ''}"?`}
        body="Students in this class will no longer see this module. Your private draft stays safe."
        confirmLabel="Unassign"
        onClose={() => setToDelete(null)}
        onConfirm={() => (toDelete ? handleDelete(toDelete) : undefined)}
      />

      <ConfirmDialog
        visible={!!toArchive}
        title={`Archive draft "${toArchive?.title ?? ''}"?`}
        body="This hides the draft from your workspace. Already-assigned student snapshots stay intact."
        confirmLabel="Archive draft"
        onClose={() => setToArchive(null)}
        onConfirm={() => (toArchive ? archiveDraft(toArchive.id) : undefined)}
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
            {previewMod.sourceId && !IS_PITCH ? (
              <PillButton
                label="View original file"
                kind="secondary"
                block
                onPress={() => void handleViewOriginal({ moduleId: previewMod.id })}
              />
            ) : null}
            <PillButton label="Close" kind="neutral" block onPress={() => setPreviewMod(null)} />
          </View>
        ) : null}
      </BottomSheet>
    </KeyboardAvoidingView>
  );
}

/** Laptop: everything students receive in this assigned snapshot. */
function ModulePreview({ mod, onViewOriginal }: { mod: ClassModule; onViewOriginal?: () => void }) {
  const { c } = useTheme();
  const [tab, setTab] = useState<'cards' | 'quiz'>('quiz');
  return (
    <Card style={[styles.gap, styles.previewCol]}>
      <View style={styles.rowBetween}>
        <Text variant="title" style={styles.flex}>
          {mod.title}
        </Text>
        {mod.quizVersion != null ? <Chip label={`v${mod.quizVersion}`} kind="tinted" style={styles.smallChip} /> : null}
        <Chip label={mod.subject} kind="neutral" style={styles.smallChip} />
      </View>
      <View style={styles.rowBetween}>
        {mod.sourceName ? <Text variant="caption">From {mod.sourceName}</Text> : <View />}
        {onViewOriginal ? (
          <PillButton
            label="View original"
            kind="secondary"
            size="sm"
            icon={<FileText size={14} weight="bold" color={c.accent} />}
            onPress={onViewOriginal}
          />
        ) : null}
      </View>
      <Text variant="body">{mod.summary}</Text>
      <SegmentedControl
        options={[
          { value: 'quiz', label: `Quiz (${mod.questions.length})` },
          { value: 'cards', label: `${T.flashcards} (${mod.flashcards.length})` },
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
                <Text
                  key={k}
                  variant="subhead"
                  color={k === q.answer ? 'success' : 'textSecondary'}
                  style={k === q.answer ? fontFor(700) : undefined}
                >
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
  listCol: { flex: 0.95, minWidth: 0 },
  previewCol: { flex: 1.35, minWidth: 0 },
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
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  updateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: radius.sm,
  },
  modRow: { borderRadius: radius.inset },
  modRowInner: { padding: 14, gap: 8 },
  smallChip: { height: 26, paddingHorizontal: 10 },
});
