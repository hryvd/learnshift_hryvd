import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GearSix, Plus } from 'phosphor-react-native';

import { CreateClassCard, JoinCodeCard, TeacherAccountCard } from '@/components/teacher/TeacherPanels';
import { TeacherTabBar } from '@/components/teacher/TeacherTabBar';
import { Card, PillButton, SegmentedControl, Stagger, Text } from '@/components/ui';
import { useTheme } from '@/design/theme';
import { space } from '@/design/tokens';
import { teacherStrings as T } from '@/i18n/staff';
import { IS_PITCH, PITCH_NAMES } from '@/lib/config';
import { useTeacher } from '@/services/backend/teacher';
import { useAuth } from '@/store/useAuth';

export default function TeacherSettings() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const me = useAuth((s) => s.profile);
  const classes = useTeacher((s) => s.classes);
  const selected = useTeacher((s) => s.selected);
  const [creating, setCreating] = useState(false);

  const active = classes.find((x) => x.id === selected) ?? classes[0] ?? null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { backgroundColor: c.bg, paddingTop: insets.top }]}
    >
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 110 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Stagger index={0} style={styles.header}>
          <View style={[styles.badge, { backgroundColor: c.tabInsights }]}>
            <GearSix size={22} weight="fill" color="#FFFFFF" />
          </View>
          <View style={styles.flex}>
            <Text variant="largeTitle">{T.settings}</Text>
            <Text variant="subhead">{T.settingsSub}</Text>
          </View>
        </Stagger>

        {!IS_PITCH ? (
          <>
            {classes.length > 1 ? (
              <SegmentedControl
                options={classes.map((cl) => ({ value: cl.id, label: cl.name }))}
                value={active?.id ?? ''}
                onChange={(id) => useTeacher.getState().select(id)}
              />
            ) : null}

            {active ? <JoinCodeCard code={active.join_code} /> : null}

            {creating ? (
              <CreateClassCard
                first={classes.length === 0}
                onDone={() => setCreating(false)}
                onCancel={() => setCreating(false)}
              />
            ) : (
              <PillButton
                label={T.newClass}
                kind="secondary"
                icon={<Plus size={18} weight="bold" color={c.accent} />}
                block
                onPress={() => setCreating(true)}
              />
            )}

            <TeacherAccountCard classId={active?.id} />
          </>
        ) : (
          <Card style={styles.gap}>
            <Text variant="title">Grade 8 – {PITCH_NAMES.section}</Text>
            <Text variant="subhead">
              {me?.display_name ?? T.teacher} · {T.learningOnly}
            </Text>
          </Card>
        )}
      </ScrollView>
      <TeacherTabBar active="settings" />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  gap: { gap: 12 },
  body: { paddingHorizontal: space.screen, gap: space.gap, width: '100%', maxWidth: 680, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8 },
  badge: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
