import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { CaretLeft, Clock, Eye, HouseLine, Info, ShieldCheck, GearSix, Trash } from '@/components/ui/icons';

import { Screen } from '@/components/student/Screen';
import {
  Card,
  LargeTitleHeader,
  ListGroup,
  ListRow,
  NavBar,
  PressableScale,
  Stagger,
  Text,
  Toggle,
} from '@/components/ui';
import { haptic } from '@/design/haptics';
import { useTheme } from '@/design/theme';
import { radius } from '@/design/tokens';
import { fontFor } from '@/design/typography';
import { useT } from '@/i18n/useT';
import { IS_PITCH } from '@/lib/config';
import { flushStudent } from '@/services/backend/sync';
import { BREAK_INTERVAL_PRESETS, snapBreakIntervalSec } from '@/services/learningBreak';
import { openBatterySettings, openOverlaySettings, openScrollSettings, platform, requestAccess } from '@/services/monitor';
import { useDevice } from '@/services/monitor/bridge';
import { useAuth } from '@/store/useAuth';
import { DEFAULT_SENTINEL, useAppStore } from '@/store/useAppStore';
import { useSession } from '@/store/useSession';

/** Technical settings: phone permissions, break pacing, tools and demo controls. */
export default function Advanced() {
  const { c } = useTheme();
  const t = useT();
  const a = t.advanced;
  const userId = useAuth((s) => s.profile?.id ?? null);
  const guardianName = useAppStore((s) => s.guardian.name);
  const overlayIntervalSec = useAppStore((s) => s.sentinel?.overlayIntervalSec ?? DEFAULT_SENTINEL.overlayIntervalSec);
  const guardianBreakSec = useAppStore((s) => (s.guardian.linked ? s.limits.breakIntervalSec : null));
  const effectiveIntervalSec = snapBreakIntervalSec(guardianBreakSec ?? overlayIntervalSec);
  const monitorAllApps = useAppStore((s) => s.sentinel?.monitorAllApps ?? DEFAULT_SENTINEL.monitorAllApps);
  const devStatus = useDevice((s) => s.status);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const locked = guardianBreakSec != null;

  const syncSettingNow = () => {
    void useDevice.getState().refresh();
    if (!IS_PITCH && userId) void flushStudent(userId).catch(() => {});
  };

  let i = 0;
  return (
    <Screen
      header={
        <NavBar
          onBack={() => router.back()}
          backIcon={<CaretLeft size={20} weight="bold" color={c.text} />}
          backLabel={t.common.back}
        />
      }
    >
      <LargeTitleHeader title={a.title} style={styles.title} />

      {platform === 'android' ? (
        <Stagger index={i++} style={styles.section}>
          <View style={styles.sectionHead}>
            <Text variant="headline">{a.permissions}</Text>
            <Text variant="subhead">{a.permissionsSub}</Text>
          </View>
          <ListGroup>
            <ListRow
              title={a.usageAccess}
              value={devStatus.access ? a.on : a.grant}
              icon={<ShieldCheck size={20} weight="fill" color={devStatus.access ? c.success : c.accent} />}
              onPress={() => void requestAccess()}
            />
            <ListRow
              title={a.overlay}
              value={devStatus.overlay ? a.on : a.grant}
              icon={<ShieldCheck size={20} weight="fill" color={devStatus.overlay ? c.success : c.accent} />}
              onPress={openOverlaySettings}
            />
            <ListRow
              title={a.scroll}
              value={devStatus.scrollAccess ? a.on : a.setUp}
              icon={<ShieldCheck size={20} weight="fill" color={devStatus.scrollAccess ? c.success : c.accent} />}
              onPress={openScrollSettings}
            />
            <ListRow
              title={a.battery}
              value={devStatus.battery ? a.unrestricted : a.optimize}
              icon={<Info size={20} weight="fill" color={devStatus.battery ? c.success : c.textSecondary} />}
              onPress={openBatterySettings}
            />
          </ListGroup>
        </Stagger>
      ) : null}

      <Stagger index={i++}>
        <Card style={styles.gap}>
          <View style={styles.cardHead}>
            <Text variant="headline">{a.pacing}</Text>
            <Text variant="subhead">{locked ? a.pacingSetBy(guardianName) : a.pacingAuto}</Text>
          </View>
          <View style={styles.freqRow}>
            {BREAK_INTERVAL_PRESETS.map((opt) => {
              const active = effectiveIntervalSec === opt.sec;
              return (
                <PressableScale
                  key={opt.sec}
                  disabled={locked}
                  accessibilityRole="radio"
                  accessibilityLabel={a.breakAfter(opt.label)}
                  accessibilityState={{ selected: active, disabled: locked }}
                  onPress={() => {
                    haptic.select();
                    useAppStore.getState().setOverlayInterval(opt.sec);
                    syncSettingNow();
                  }}
                  style={[
                    styles.freqPill,
                    { backgroundColor: active ? c.accent : c.inset, opacity: locked && !active ? 0.45 : 1 },
                  ]}
                >
                  <Text variant="subhead" color={active ? c.onAccent : c.text} style={fontFor(700)}>
                    {opt.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
          <View style={[styles.rowBetween, styles.hair, { borderColor: c.hairline }]}>
            <View style={styles.flex}>
              <Text variant="body">{a.includeOther}</Text>
              <Text variant="caption">{a.includeOtherSub}</Text>
            </View>
            <Toggle
              value={monitorAllApps}
              onChange={(v) => {
                useAppStore.getState().setMonitorAllApps(v);
                syncSettingNow();
              }}
              accessibilityLabel={a.includeOther}
            />
          </View>
        </Card>
      </Stagger>

      <Stagger index={i++} style={styles.section}>
        <Text variant="headline" style={styles.sectionHead}>
          {a.tools}
        </Text>
        <ListGroup>
          {!IS_PITCH ? (
            <ListRow
              title={a.setupBreaks}
              icon={<HouseLine size={20} weight="fill" color={c.accent} />}
              onPress={() => router.push('/account')}
            />
          ) : null}
          <ListRow
            title={a.mirror}
            value="Mode C"
            icon={<Eye size={20} weight="fill" color={c.accent} />}
            onPress={() => router.push('/mirror' as unknown as Href)}
          />
          <ListRow
            title={a.swipeDemo}
            value={a.preview}
            icon={<Clock size={20} weight="fill" color={c.accent} />}
            onPress={() => router.push({ pathname: '/simulate', params: { app: 'tiktok' } })}
          />
          {IS_PITCH ? (
            <ListRow
              title={a.demoControls}
              icon={<GearSix size={20} weight="fill" color={c.accent} />}
              onPress={() => router.push('/demo')}
            />
          ) : null}
        </ListGroup>
      </Stagger>

      {IS_PITCH ? (
        <Stagger index={i++}>
          <ListGroup>
            <ListRow
              title={resetDone ? t.profile.delDone : confirmReset ? a.resetConfirm : a.resetDemo}
              icon={<Trash size={20} weight="bold" color={c.danger} />}
              destructive
              chevron={false}
              onPress={() => {
                if (!confirmReset) {
                  haptic.light();
                  setConfirmReset(true);
                  return;
                }
                useAppStore.getState().reset();
                useSession.getState().setSimMinutes(0);
                haptic.success();
                setConfirmReset(false);
                setResetDone(true);
              }}
            />
          </ListGroup>
        </Stagger>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: 4 },
  flex: { flex: 1 },
  gap: { gap: 14 },
  section: { gap: 10 },
  sectionHead: { gap: 2, paddingHorizontal: 4 },
  cardHead: { gap: 2 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  hair: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14 },
  freqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  freqPill: {
    paddingHorizontal: 16,
    minHeight: 48,
    minWidth: 56,
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
