import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import {
  ArrowSquareOut,
  HouseLine,
  Lightning,
  MonitorPlay,
  ShieldCheck,
  Stack,
} from '@/components/ui/icons';

import { BottomSheet, Card, Chip, PillButton, PressableScale, Text } from '@/components/ui';
import { MIRRORED_APPS, type MirroredApp } from '@/data/mirroredApps';
import { haptic } from '@/design/haptics';
import { pressScale } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius } from '@/design/tokens';
import {
  launchProtectedApp,
  openHomeSettings,
  openOverlaySettings,
  platform,
  showOverlayNow,
  status as monitorStatus,
} from '@/services/monitor';
import { DEFAULT_SENTINEL, useAppStore } from '@/store/useAppStore';

import { useTabInset } from './Screen';

function formatInterval(sec: number): string {
  return sec >= 60 ? `${Math.round(sec / 60)}m` : `${sec}s`;
}

export function LauncherDock({
  onSelectApp,
  onStatusMessage,
}: {
  onSelectApp: (app: MirroredApp) => void;
  onStatusMessage?: (msg: string) => void;
}) {
  const { c } = useTheme();
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const report = (msg: string) => {
    setStatusMsg(msg);
    onStatusMessage?.(msg);
  };

  const testNativeOverlay = () => {
    haptic.light();
    if (platform === 'android') {
      const s = monitorStatus();
      if (!s.overlay) {
        report('Allow "Display over other apps" first so overlays can appear over TikTok or YouTube.');
        openOverlaySettings();
        return;
      }
      const ok = showOverlayNow('Opened App', 'quiz', 3000);
      if (ok) {
        report('Overlay armed (3s) — open TikTok, YouTube, or any app to see the white swipe-up feed.');
      } else {
        router.push({ pathname: '/simulate', params: { app: 'tiktok', start: 'quiz' } });
      }
      return;
    }
    router.push({ pathname: '/simulate', params: { app: 'tiktok', start: 'quiz' } });
  };

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <View style={styles.titleRow}>
            <Text variant="headline">App Launcher</Text>
            <Chip
              label="Shielded"
              icon={<ShieldCheck size={12} weight="fill" color={c.success} />}
              tint={{ bg: c.inset, fg: c.success }}
              style={styles.smallChip}
            />
          </View>
          <Text variant="subhead">
            Open any app from here. LearnShift watches scroll speed and overlays a quiz when you doomscroll.
          </Text>
        </View>
      </View>

      <View style={styles.grid}>
        {MIRRORED_APPS.map((app) => (
          <PressableScale
            key={app.id}
            scaleTo={pressScale.button}
            onPress={() => {
              haptic.select();
              onSelectApp(app);
            }}
            accessibilityLabel={`Launch ${app.name} with LearnShift Shield`}
            style={[styles.appTile, { backgroundColor: c.inset }]}
          >
            <View style={styles.iconWrap}>
              <Image source={app.icon} style={styles.appIcon} resizeMode="cover" />
              <View style={[styles.shieldDot, { backgroundColor: c.success, borderColor: c.inset }]} />
            </View>
            <Text variant="subhead" color="text" numberOfLines={1} style={styles.appName}>
              {app.shortName}
            </Text>
            <Text variant="caption" numberOfLines={1}>
              {app.category}
            </Text>
          </PressableScale>
        ))}
      </View>

      {statusMsg ? (
        <View style={[styles.notice, { backgroundColor: c.accentTint }]}>
          <Text variant="caption" color="accent">
            {statusMsg}
          </Text>
        </View>
      ) : null}

      <View style={styles.actionBar}>
        <PillButton
          label={platform === 'android' ? 'Launch Overlay (3s)' : 'Open Swipe Feed'}
          size="sm"
          icon={<Stack size={14} weight="fill" color={c.onAccent} />}
          onPress={testNativeOverlay}
        />
        {platform === 'android' ? (
          <PillButton
            label="Set as Launcher"
            kind="neutral"
            size="sm"
            icon={<HouseLine size={14} weight="bold" color={c.text} />}
            onPress={() => {
              haptic.select();
              openHomeSettings();
            }}
          />
        ) : null}
      </View>
    </Card>
  );
}

export function AppLaunchSheet({
  app,
  onClose,
}: {
  app: MirroredApp | null;
  onClose: () => void;
}) {
  const { c } = useTheme();
  const inset = useTabInset();
  const overlayIntervalSec = useAppStore((s) => s.sentinel?.overlayIntervalSec ?? DEFAULT_SENTINEL.overlayIntervalSec);
  const [feedback, setFeedback] = useState<string | null>(null);

  const launchReal = () => {
    if (!app) return;
    if (platform === 'android') {
      const s = monitorStatus();
      if (!s.overlay) {
        setFeedback('Enable "Display over other apps" first so LearnShift can overlay this app.');
        openOverlaySettings();
        return;
      }
      const launched = launchProtectedApp(app.packageName, app.name, overlayIntervalSec);
      if (launched) {
        onClose();
        return;
      }
      setFeedback(`Opening ${app.shortName} in browser with active LearnShift overlay.`);
    }
    const id = app.id;
    onClose();
    router.push({ pathname: '/simulate', params: { app: id } });
  };

  return (
    <BottomSheet
      visible={app != null}
      onClose={() => {
        setFeedback(null);
        onClose();
      }}
      surface={c.bg}
      style={{ paddingBottom: inset - 8 }}
      accessibilityLabel={app ? `Launch ${app.name}` : 'Launch App'}
    >
      {app ? (
        <View style={styles.sheetBody}>
          <View style={styles.sheetHead}>
            <Image source={app.icon} style={styles.sheetIcon} resizeMode="cover" />
            <View style={styles.flex}>
              <Text variant="title">{app.name}</Text>
              <Text variant="subhead">Choose how to open {app.shortName} with LearnShift Shield</Text>
            </View>
          </View>

          {feedback ? (
            <View style={[styles.notice, { backgroundColor: c.accentTint }]}>
              <Text variant="caption" color="accent">
                {feedback}
              </Text>
            </View>
          ) : null}

          <PressableScale
            onPress={launchReal}
            style={[styles.launchOption, { backgroundColor: c.accent }]}
          >
            <View style={[styles.optBadge, { backgroundColor: c.card }]}>
              <ArrowSquareOut size={20} weight="bold" color={c.accent} />
            </View>
            <View style={styles.flex}>
              <Text variant="headline" color={c.onAccent}>
                Open Real {app.shortName} with Active Overlay
              </Text>
              <Text variant="caption" color="rgba(255,255,255,0.88)">
                {platform === 'android'
                  ? `Opens the real ${app.shortName} app · White swipe-up feed every ${formatInterval(overlayIntervalSec)}`
                  : `Android builds open real ${app.shortName}; web opens mirrored view`}
              </Text>
            </View>
          </PressableScale>

          <PressableScale
            onPress={() => {
              const id = app.id;
              onClose();
              router.push({ pathname: '/simulate', params: { app: id } });
            }}
            style={[styles.launchOption, { backgroundColor: c.card }]}
          >
            <View style={[styles.optBadge, { backgroundColor: c.inset }]}>
              <MonitorPlay size={20} weight="fill" color={c.accent} />
            </View>
            <View style={styles.flex}>
              <Text variant="headline">
                Open {app.shortName} Feed + White Overlay
              </Text>
              <Text variant="caption">
                Shows unwanted scroll behind the white swipe-up feed overlay
              </Text>
            </View>
          </PressableScale>

          <PressableScale
            onPress={() => {
              const id = app.id;
              onClose();
              router.push({ pathname: '/simulate', params: { app: id, start: 'quiz' } });
            }}
            style={[styles.launchOption, { backgroundColor: c.card }]}
          >
            <View style={[styles.optBadge, { backgroundColor: c.inset }]}>
              <Lightning size={20} weight="fill" color={c.success} />
            </View>
            <View style={styles.flex}>
              <Text variant="headline">Take Quick Quiz First (20m Quiet)</Text>
              <Text variant="caption">Earn 20 minutes of uninterrupted scroll time before opening</Text>
            </View>
          </PressableScale>
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: 14 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  smallChip: { height: 24, paddingHorizontal: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  appTile: {
    flexBasis: '30%',
    flexGrow: 1,
    borderRadius: radius.inset,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 4,
  },
  iconWrap: { position: 'relative', marginBottom: 2 },
  appIcon: { width: 44, height: 44, borderRadius: 13 },
  shieldDot: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
  },
  appName: { fontWeight: '700' },
  notice: { borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8 },
  actionBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sheetBody: { gap: 10, paddingBottom: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  sheetIcon: { width: 48, height: 48, borderRadius: 14 },
  launchOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.inset,
  },
  optBadge: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});

