import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookOpenText, Plus, WifiHigh } from '@/components/ui/icons';

import { TeacherTabBar } from '@/components/teacher/TeacherTabBar';
import { BarBlurHost, BarBlurTarget } from '@/components/ui/FloatingBar';
import {
  BottomSheet,
  Card,
  Chip,
  EmptyState,
  IconButton,
  Notice,
  PillButton,
  SegmentedControl,
  Stagger,
  Text,
} from '@/components/ui';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { fontFor } from '@/design/typography';
import { usePullRefresh } from '@/hooks/useAutoRefresh';
import { teacherStrings as T } from '@/i18n/staff';
import { IS_PITCH, PITCH_NAMES } from '@/lib/config';
import type { ClassModule } from '@/services/ai/moduleGenerator';
import * as api from '@/services/backend/api';
import { getPeerLanBaseUrl } from '@/services/backend/peerModuleSync';
import { refreshTeacher, removeLocalModule, useTeacher } from '@/services/backend/teacher';
import { useAppStore } from '@/store/useAppStore';

const EMPTY_MODULES: ClassModule[] = [];

export default function TeacherModules() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const pull = usePullRefresh(refreshTeacher);

  const classes = useTeacher((s) => s.classes);
  const selected = useTeacher((s) => s.selected);
  const setUploadOpen = useTeacher((s) => s.setUploadOpen);
  const selectedModules = useTeacher((s) => (s.selected ? s.modules[s.selected] : undefined));
  const realModules = selectedModules ?? EMPTY_MODULES;
  const pitchModules = useAppStore((s) => s.classModules);

  const activeClassId = IS_PITCH ? 'sampaguita' : (selected ?? classes[0]?.id ?? '');
  const activeClassName = IS_PITCH
    ? `Grade 8 - ${PITCH_NAMES.section}`
    : (classes.find((x) => x.id === activeClassId)?.name ?? T.classes);
  const modules = IS_PITCH ? pitchModules : realModules;
  const lanUrl = getPeerLanBaseUrl();

  const [error, setError] = useState<string | null>(null);
  const [previewMod, setPreviewMod] = useState<ClassModule | null>(null);

  const handleDelete = async (mod: ClassModule) => {
    try {
      if (IS_PITCH) {
        useAppStore.getState().deletePitchModule(mod.id);
      } else {
        removeLocalModule(mod.classId, mod.id);
        await api.deleteClassModule(mod.id).catch(() => {});
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <BarBlurHost>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.root, { backgroundColor: c.bg, paddingTop: insets.top }]}
      >
        <BarBlurTarget>
          <ScrollView
            contentContainerStyle={[styles.body, { maxWidth: wide ? 1100 : 560, paddingBottom: insets.bottom + 110 }]}
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
                <Text variant="subhead">
                  Create at least one class so you can publish AI flashcards and quiz modules to your students.
                </Text>
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

            <Stagger index={1}>
              <Card style={styles.centerCard}>
                <Text variant="title" align="center">
                  {T.uploadModule}
                </Text>
                <Text variant="subhead" align="center">
                  Tap the centered + button below to flip open the drag-and-drop card, approve flashcards & quizzes, and
                  pick classes.
                </Text>
                <PillButton
                  label="Open Upload Card"
                  icon={<Plus size={18} weight="bold" color={c.onAccent} />}
                  size="lg"
                  onPress={() => setUploadOpen(true)}
                />
                <View style={[styles.syncRow, { backgroundColor: c.inset }]}>
                  <WifiHigh size={16} weight="bold" color={c.success} />
                  <Text variant="caption" color="success" style={styles.flex}>
                    {lanUrl
                      ? `Direct phone sync live (${lanUrl}) — students download straight from your phone`
                      : 'Phone-to-phone sync ready — minimizes cloud storage usage'}
                  </Text>
                </View>
              </Card>
            </Stagger>

            <Stagger index={2}>
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
                          <IconButton
                            kind="remove"
                            tone="danger"
                            size={32}
                            accessibilityLabel={T.deleteModule}
                            onPress={() => void handleDelete(m)}
                          />
                        </View>
                      </View>
                    </Card>
                  ))
                )}
              </Card>
            </Stagger>
          </ScrollView>
        </BarBlurTarget>

        <BottomSheet
          visible={!!previewMod}
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

        <TeacherTabBar active="modules" />
      </KeyboardAvoidingView>
    </BarBlurHost>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
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
