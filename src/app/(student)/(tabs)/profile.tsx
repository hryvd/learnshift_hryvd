import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ChalkboardTeacher, Clock, FileText, HouseLine, Info, Lifebuoy, ListChecks, ShieldCheck, UserCircle } from 'phosphor-react-native';

import { PatyAvatar } from '@/components/mascot/Paty';
import { Screen } from '@/components/student/Screen';
import { BooksArt, LanguageArt, MoonArt, ShieldArt } from '@/components/student/TileArt';
import { Card, DarkTile, LargeTitleHeader, ListGroup, ListRow, PressableScale, SegmentedControl, Stagger, Text, Toggle } from '@/components/ui';
import { haptic } from '@/design/haptics';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { fontFor } from '@/design/typography';
import { formatClock, useT } from '@/i18n/useT';
import { IS_PITCH } from '@/lib/config';
import { openBatterySettings, openOverlaySettings, platform, requestAccess } from '@/services/monitor';
import { useDevice } from '@/services/monitor/bridge';
import { useAuth } from '@/store/useAuth';
import { DEFAULT_SENTINEL, useAppStore, type ThemePref } from '@/store/useAppStore';
import { useSession } from '@/store/useSession';

const FREQ_OPTIONS = [
  { sec: 15, label: '15s' },
  { sec: 30, label: '30s' },
  { sec: 60, label: '1m' },
  { sec: 180, label: '3m' },
  { sec: 300, label: '5m' },
  { sec: 600, label: '10m' },
  { sec: 900, label: '15m' },
] as const;

export default function Profile() {
  const { c } = useTheme();
  const t = useT();
  const lang = useAppStore((s) => s.lang);
  const bedtime = useAppStore((s) => s.bedtime);
  const guardian = useAppStore((s) => s.guardian);
  const offline = useAppStore((s) => s.offline);
  const themePref = useAppStore((s) => s.themePref);
  const nudges = useAppStore((s) => s.nudges.length);
  const [confirm, setConfirm] = useState(false);
  const [cleared, setCleared] = useState(false);
  const name = useAppStore((s) => s.studentName);
  const classes = useAppStore((s) => s.classes);
  const grade = useAuth((s) => s.profile?.grade ?? null);
  const overlayIntervalSec = useAppStore((s) => s.sentinel?.overlayIntervalSec ?? DEFAULT_SENTINEL.overlayIntervalSec);
  const monitorAllApps = useAppStore((s) => s.sentinel?.monitorAllApps ?? DEFAULT_SENTINEL.monitorAllApps);
  const devStatus = useDevice((s) => s.status);
  const pitchGrade = IS_PITCH ? 8 : grade;

  let i = 0;
  return (
    <Screen tabs header={<LargeTitleHeader title={t.profile.title} />}>
      <Stagger index={i++}>
        <Card style={styles.me}>
          <PatyAvatar size={58} />
          <View style={styles.flex}>
            <Text variant="title" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="subhead">{t.profile.grade(pitchGrade, classes[0]?.name ?? '')}</Text>
          </View>
        </Card>
      </Stagger>

      <Stagger index={i++} style={styles.grid}>
        <DarkTile
          title={t.profile.bedtime}
          status={formatClock(bedtime.start)}
          style={styles.tile}
          onPress={() => router.push('/bedtime')}
          art={<MoonArt />}
        />
        <DarkTile
          title={t.profile.language}
          status={lang === 'en' ? t.common.english : t.common.filipino}
          style={styles.tile}
          onPress={() => useAppStore.getState().setLang(lang === 'en' ? 'fil' : 'en')}
          art={<LanguageArt />}
        />
        <DarkTile
          title={t.profile.guardian}
          status={guardian.linked ? `${t.profile.linked} · ${guardian.name}` : t.acct.linkTitle}
          statusAccent
          style={styles.tile}
          onPress={() => router.push(IS_PITCH ? '/privacy' : '/account')}
          art={<ShieldArt />}
        />
        <DarkTile
          title={t.profile.offline}
          status={t.learn.offlineStatus(offline.length)}
          style={styles.tile}
          onPress={() => router.push('/offline')}
          art={<BooksArt />}
        />
      </Stagger>

      <Stagger index={i++}>
        <Card style={styles.gap}>
          <Text variant="headline">{t.profile.appearance}</Text>
          <SegmentedControl<ThemePref>
            options={[
              { value: 'auto', label: t.profile.auto },
              { value: 'day', label: t.profile.day },
              { value: 'night', label: t.profile.night },
            ]}
            value={themePref}
            onChange={(p) => useAppStore.getState().setThemePref(p)}
          />
        </Card>
      </Stagger>

      <Stagger index={i++}>
        <Card style={styles.gap}>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text variant="headline">Overlay Frequency & Shield</Text>
              <Text variant="subhead">Show white swipe-up feed while using other apps every:</Text>
            </View>
            <Clock size={20} weight="fill" color={c.accent} />
          </View>
          <View style={styles.freqRow}>
            {FREQ_OPTIONS.map((opt) => {
              const active = overlayIntervalSec === opt.sec;
              return (
                <PressableScale
                  key={opt.sec}
                  onPress={() => {
                    haptic.select();
                    useAppStore.getState().setOverlayInterval(opt.sec);
                  }}
                  style={[styles.freqPill, { backgroundColor: active ? c.accent : c.inset }]}
                >
                  <Text variant="caption" color={active ? c.onAccent : c.text} style={fontFor(700)}>
                    {opt.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text variant="subhead" color="text">
                Watch all opened apps
              </Text>
              <Text variant="caption">Include browsers & extra apps beyond video/social</Text>
            </View>
            <Toggle
              value={monitorAllApps}
              onChange={(v) => useAppStore.getState().setMonitorAllApps(v)}
              accessibilityLabel="Watch all opened apps"
            />
          </View>
        </Card>
      </Stagger>

      {platform === 'android' ? (
        <Stagger index={i++}>
          <ListGroup>
            <ListRow
              title="Usage Access Permission"
              value={devStatus.access ? 'On' : 'Tap to grant'}
              icon={<ShieldCheck size={20} weight="fill" color={devStatus.access ? c.success : c.accent} />}
              onPress={() => void requestAccess()}
            />
            <ListRow
              title="Display Over Other Apps"
              value={devStatus.overlay ? 'On' : 'Tap to grant'}
              icon={<ShieldCheck size={20} weight="fill" color={devStatus.overlay ? c.success : c.accent} />}
              onPress={openOverlaySettings}
            />
            <ListRow
              title="Keep Service Active (Battery)"
              value={devStatus.battery ? 'Unrestricted' : 'Optimize'}
              icon={<Info size={20} weight="fill" color={devStatus.battery ? c.success : c.textSecondary} />}
              onPress={openBatterySettings}
            />
          </ListGroup>
        </Stagger>
      ) : null}

      <Stagger index={i++}>
        <ListGroup>
          <ListRow
            title="Guardian Dashboard"
            icon={<ShieldCheck size={20} weight="fill" color={c.tabInsights} />}
            onPress={() => router.push('/guardian')}
          />
          <ListRow
            title="Teacher Class Heatmap"
            icon={<ChalkboardTeacher size={20} weight="fill" color={c.tabLearn} />}
            onPress={() => router.push('/teacher')}
          />
          <ListRow
            title="Setup Wizard (Onboarding)"
            icon={<HouseLine size={20} weight="fill" color={c.accent} />}
            onPress={() => router.push('/onboarding')}
          />
        </ListGroup>
      </Stagger>

      <Stagger index={i++}>
        <ListGroup>
          {!IS_PITCH ? (
            <ListRow
              title="Account"
              icon={<UserCircle size={20} weight="fill" color={c.accent} />}
              onPress={() => router.push('/account')}
            />
          ) : null}
          <ListRow
            title={t.profile.privacy}
            icon={<ShieldCheck size={20} weight="fill" color={c.success} />}
            onPress={() => router.push('/privacy')}
          />
          <ListRow
            title={t.profile.nudges}
            value={String(nudges)}
            icon={<ListChecks size={20} weight="fill" color={c.accent} />}
            onPress={() => router.push('/nudges')}
          />
          <ListRow
            title={t.profile.help}
            icon={<Lifebuoy size={20} weight="fill" color={c.tabInsights} />}
            onPress={() => router.push('/tutor')}
          />
          <ListRow
            title={t.profile.terms}
            icon={<FileText size={20} weight="fill" color={c.textSecondary} />}
            onPress={() => router.push('/privacy')}
          />
          <ListRow
            title={t.profile.version}
            value="1.0.0"
            icon={<Info size={20} weight="fill" color={c.textSecondary} />}
            chevron={false}
          />
        </ListGroup>
      </Stagger>

      <Stagger index={i++}>
        <ListGroup>
          <ListRow
            title={IS_PITCH ? (cleared ? t.profile.delDone : confirm ? t.profile.delConfirm : t.profile.del) : t.profile.del}
            destructive
            chevron={false}
            onPress={() => {
              if (!IS_PITCH) {
                router.push('/account');
                return;
              }
              if (!confirm) {
                setConfirm(true);
                return;
              }
              useAppStore.getState().reset();
              useSession.getState().setSimMinutes(0);
              setConfirm(false);
              setCleared(true);
            }}
          />
        </ListGroup>
      </Stagger>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  freqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  freqPill: { paddingHorizontal: 12, height: 32, borderRadius: radius.pill, justifyContent: 'center', alignItems: 'center' },
  me: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gap },
  tile: { flexBasis: '47%', flexGrow: 1 },
});
