import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GearSix, Plus } from '@/components/ui/icons';

import { CreateClassCard, JoinCodeCard, TeacherAccountCard } from '@/components/teacher/TeacherPanels';
import { Card, PillButton, SegmentedControl, Stagger, Text, Toggle } from '@/components/ui';
import { useTheme } from '@/design/theme';
import { space } from '@/design/tokens';
import { useDesktop, useInstallPrompt, useOnline } from '@/hooks/useDesktop';
import { teacherStrings as T } from '@/i18n/staff';
import { IS_PITCH, PITCH_NAMES } from '@/lib/config';
import { ManageClassesCard } from '@/components/teacher/ManageClassesCard';
import { clearTeacherCache, useTeacher } from '@/services/backend/teacher';
import { setSharedLaptop, useSharedLaptop } from '@/services/teacher/sharedLaptop';
import { useAppStore } from '@/store/useAppStore';
import { useAuth } from '@/store/useAuth';

export default function TeacherSettings() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const me = useAuth((s) => s.profile);
  const classes = useTeacher((s) => s.classes);
  const selected = useTeacher((s) => s.selected);
  const [creating, setCreating] = useState(false);
  const { isDesktop } = useDesktop();

  const active = classes.find((x) => x.id === selected) ?? classes[0] ?? null;

  return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.root, { backgroundColor: c.bg, paddingTop: insets.top }]}
      >
          <ScrollView
            contentContainerStyle={[
              styles.body,
              { paddingBottom: insets.bottom + (isDesktop ? 40 : 110) },
              isDesktop && styles.bodyDesktop,
            ]}
            keyboardShouldPersistTaps="handled"
          >
            {!isDesktop ? (
              <Stagger index={0} style={styles.header}>
                <View style={[styles.badge, { backgroundColor: c.tabInsights }]}>
                  <GearSix size={22} weight="fill" color="#FFFFFF" />
                </View>
                <View style={styles.flex}>
                  <Text variant="largeTitle">{T.settings}</Text>
                  <Text variant="subhead">{T.settingsSub}</Text>
                </View>
              </Stagger>
            ) : null}

            {!IS_PITCH ? (
              <View style={isDesktop ? styles.columns : styles.stack}>
              <View style={[styles.stack, isDesktop && styles.col]}>
                {classes.length > 1 && !isDesktop ? (
                  <SegmentedControl
                    options={classes.map((cl) => ({ value: cl.id, label: cl.name }))}
                    value={active?.id ?? ''}
                    onChange={(id) => useTeacher.getState().select(id)}
                  />
                ) : null}

                {active ? <JoinCodeCard code={active.join_code} className={active.name} classId={active.id} /> : null}
                {isDesktop ? <ManageClassesCard /> : null}

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

              </View>
              <View style={[styles.stack, isDesktop && styles.col]}>
                <AppearanceCard />
                {isDesktop ? <LaptopAppCard /> : null}
                {isDesktop ? <SharedLaptopCard /> : null}
                <TeacherAccountCard classId={active?.id} />
              </View>
              </View>
            ) : (
              <View style={styles.stack}>
                <Card style={styles.gap}>
                  <Text variant="title">Grade 8 – {PITCH_NAMES.section}</Text>
                  <Text variant="subhead">
                    {me?.display_name ?? T.teacher} · {T.learningOnly}
                  </Text>
                </Card>
                <AppearanceCard />
              </View>
            )}
          </ScrollView>
      </KeyboardAvoidingView>
  );
}

function SharedLaptopCard() {
  const on = useSharedLaptop();
  return (
    <Card style={styles.gap}>
      <View style={styles.rowBetween}>
        <View style={styles.flex}>
          <Text variant="headline">Shared laptop mode</Text>
          <Text variant="subhead">
            For faculty rooms and labs: no class data is saved on this laptop, and you&apos;re signed out after 20
            minutes without activity.
          </Text>
        </View>
        <Toggle
          value={on}
          onChange={(v: boolean) => {
            setSharedLaptop(v);
            if (v) clearTeacherCache();
          }}
          accessibilityLabel="Shared laptop mode"
        />
      </View>
    </Card>
  );
}

function AppearanceCard() {
  const pref = useAppStore((s) => s.themePref);
  return (
    <Card style={styles.gap}>
      <Text variant="headline">Appearance</Text>
      <Text variant="subhead">Day suits a bright classroom. Night is easier on the eyes in the evening.</Text>
      <SegmentedControl
        options={[
          { value: 'day', label: 'Day' },
          { value: 'night', label: 'Night' },
          { value: 'auto', label: 'Auto' },
        ]}
        value={pref}
        onChange={(v) => useAppStore.getState().setThemePref(v as 'day' | 'night' | 'auto')}
      />
    </Card>
  );
}

/** Install as a laptop app (Chrome/Edge), plus the offline copy controls. */
function LaptopAppCard() {
  const online = useOnline();
  const syncedAt = useTeacher((s) => s.syncedAt);
  const { canInstall, installed, install } = useInstallPrompt();
  const [cleared, setCleared] = useState(false);
  const mac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform ?? '');
  return (
    <Card style={styles.gap}>
      <Text variant="headline">LearnShift on this laptop</Text>
      <Text variant="subhead">
        {online ? 'Online' : 'Offline'}
        {syncedAt
          ? ` · last synced ${new Date(syncedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
          : ''}
      </Text>
      {installed ? (
        <Text variant="caption">Installed. Open LearnShift from your Start menu, Dock or desktop.</Text>
      ) : canInstall ? (
        <PillButton label="Install LearnShift app" kind="secondary" onPress={() => void install()} />
      ) : (
        <Text variant="caption">
          {mac
            ? 'To install: in Safari choose File › Add to Dock; in Chrome or Edge use the install icon in the address bar.'
            : 'To install: use the install icon at the right of the Chrome or Edge address bar.'}
        </Text>
      )}
      <Text variant="caption">
        Your classes stay readable if the internet drops. Signing out removes the saved copy from this laptop.
      </Text>
      <PillButton
        label={cleared ? 'Saved copy cleared' : 'Clear saved classroom data'}
        kind="neutral"
        size="sm"
        disabled={cleared}
        onPress={() => {
          clearTeacherCache();
          setCleared(true);
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bodyDesktop: { maxWidth: 1120, paddingHorizontal: 28, paddingTop: 12 },
  columns: { flexDirection: 'row', gap: space.gap, alignItems: 'flex-start' },
  col: { flex: 1, minWidth: 0 },
  stack: { gap: space.gap },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  flex: { flex: 1 },
  gap: { gap: 12 },
  body: { paddingHorizontal: space.screen, gap: space.gap, width: '100%', maxWidth: 680, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8 },
  badge: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
