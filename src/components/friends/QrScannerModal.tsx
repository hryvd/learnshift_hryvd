import { useEffect, useState } from 'react';
import { Linking, Modal, Platform, StyleSheet, View } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, CheckCircle, Flashlight, Keyboard, QrCode, UserPlus, WarningCircle, X } from '@/components/ui/icons';

import { Paty } from '@/components/mascot/Paty';
import { Card, IconButton, Notice, PillButton, Text, TextField } from '@/components/ui';
import { haptic } from '@/design/haptics';
import { ease, useReducedMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { fontFor } from '@/design/typography';
import { useT } from '@/i18n/useT';
import { router } from 'expo-router';
import { normalizeFriendCode, parseClassCodeFromScan, parseFriendCodeFromScan } from '@/lib/qr';

type ExpoCameraModule = typeof import('expo-camera');

function loadExpoCamera(): ExpoCameraModule | null {
  // Guard native require so older pre-built APKs receiving an OTA update never crash.
  if (Platform.OS !== 'web' && !requireOptionalNativeModule('ExpoCamera')) {
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-camera') as ExpoCameraModule;
  } catch {
    return null;
  }
}

const cameraModule = loadExpoCamera();

const WINDOW_SIZE = 246;
const CORNER_LEN = 30;
const CORNER_THICK = 4.5;

type ScanOutcome =
  | { kind: 'idle' }
  | { kind: 'found'; code: string }
  | { kind: 'own'; code: string }
  | { kind: 'invalid' }
  | { kind: 'added'; code: string; status: 'pending' | 'accepted' };

type Props = {
  visible: boolean;
  myCode: string | null;
  onClose: () => void;
  onOpenMyQr: () => void;
  onTypeCode: () => void;
  onAddByCode: (code: string) => Promise<'pending' | 'accepted'>;
};

/**
 * Full-screen live QR scanner modal for Kapuluan friend passes.
 * Uses `expo-camera` CameraView natively (and on supported browsers), with a
 * crash-safe fallback to manual code entry if camera access or native module is unavailable.
 */
export function QrScannerModal({ visible, myCode, onClose, onOpenMyQr, onTypeCode, onAddByCode }: Props) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      {visible ? (
        cameraModule ? (
          <LiveCameraScanner
            cameraMod={cameraModule}
            myCode={myCode}
            onClose={onClose}
            onOpenMyQr={onOpenMyQr}
            onTypeCode={onTypeCode}
            onAddByCode={onAddByCode}
          />
        ) : (
          <UnavailableCameraView onClose={onClose} onOpenMyQr={onOpenMyQr} onAddByCode={onAddByCode} />
        )
      ) : null}
    </Modal>
  );
}

function LiveCameraScanner({
  cameraMod,
  myCode,
  onClose,
  onOpenMyQr,
  onTypeCode,
  onAddByCode,
}: Omit<Props, 'visible'> & { cameraMod: ExpoCameraModule }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const reduced = useReducedMotion();

  const [permission, requestPermission] = cameraMod.useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [mountError, setMountError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ScanOutcome>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const beam = useSharedValue(0);
  const scanning = outcome.kind === 'idle' && Boolean(permission?.granted) && !mountError;

  useEffect(() => {
    if (!scanning || reduced) {
      cancelAnimation(beam);
      beam.set(0.5);
      return;
    }
    beam.set(0);
    beam.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1900, easing: ease.inOut }),
          withTiming(0, { duration: 1900, easing: ease.inOut }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(beam);
  }, [scanning, reduced, beam]);

  const beamStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: beam.get() * (WINDOW_SIZE - 26) }],
    opacity: scanning ? 0.92 : 0,
  }));

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (outcome.kind !== 'idle') return;
    // A teacher's class invite: hand off to the join page.
    const classCode = parseClassCodeFromScan(data);
    if (classCode) {
      haptic.success();
      onClose();
      router.push({ pathname: '/join/[code]', params: { code: classCode } });
      return;
    }
    const parsed = parseFriendCodeFromScan(data);
    setSubmitErr(null);
    if (!parsed) {
      haptic.warning();
      setOutcome({ kind: 'invalid' });
      return;
    }
    if (myCode && normalizeFriendCode(myCode) === parsed) {
      haptic.warning();
      setOutcome({ kind: 'own', code: parsed });
      return;
    }
    haptic.success();
    setOutcome({ kind: 'found', code: parsed });
  };

  const handleConfirmAdd = async () => {
    if (outcome.kind !== 'found' || busy) return;
    setBusy(true);
    setSubmitErr(null);
    try {
      const status = await onAddByCode(outcome.code);
      haptic.success();
      setOutcome({ kind: 'added', code: outcome.code, status });
      setTimeout(() => {
        onClose();
      }, 950);
    } catch (e) {
      haptic.warning();
      setSubmitErr(e instanceof Error ? e.message : 'Could not send request.');
    } finally {
      setBusy(false);
    }
  };

  const resetScan = () => {
    haptic.select();
    setSubmitErr(null);
    setOutcome({ kind: 'idle' });
  };

  if (mountError) {
    return <UnavailableCameraView onClose={onClose} onOpenMyQr={onOpenMyQr} onAddByCode={onAddByCode} />;
  }

  // Permission prompt state
  if (!permission || !permission.granted) {
    const blocked = permission != null && !permission.canAskAgain;
    return (
      <View
        style={[
          styles.permRoot,
          { backgroundColor: c.bg, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <View style={styles.topRow}>
          <IconButton
            icon={<X size={20} weight="bold" color={c.text} />}
            onPress={onClose}
            accessibilityLabel={t.common.close}
          />
          <Text variant="headline" style={styles.flex} align="center">
            {t.friends.scannerTitle}
          </Text>
          <View style={styles.spacer40} />
        </View>

        <View style={styles.permCenter}>
          <Card style={styles.permCard}>
            <View style={[styles.permBadge, { backgroundColor: c.accentTint }]}>
              <Camera size={30} weight="fill" color={c.accent} />
            </View>
            <Paty expression="curious" size={88} alive={!reduced} interactive={false} />
            <Text variant="title" align="center">
              {t.friends.scannerPermissionTitle}
            </Text>
            <Text variant="subhead" color="textSecondary" align="center">
              {t.friends.scannerPermissionSub}
            </Text>
            <PillButton
              label={blocked ? t.friends.scannerOpenSettings : t.friends.scannerAllow}
              kind="primary"
              size="lg"
              block
              icon={<Camera size={18} weight="fill" color={c.onAccent} />}
              onPress={() => {
                haptic.select();
                if (blocked) {
                  void Linking.openSettings();
                } else {
                  void requestPermission();
                }
              }}
            />
            <PillButton
              label={t.friends.scannerTypeInstead}
              kind="neutral"
              block
              icon={<Keyboard size={18} weight="bold" color={c.text} />}
              onPress={() => {
                haptic.select();
                onTypeCode();
              }}
            />
          </Card>
        </View>
      </View>
    );
  }

  const CameraView = cameraMod.CameraView;

  return (
    <View style={styles.cameraRoot}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={outcome.kind === 'idle' ? handleBarcodeScanned : undefined}
        onMountError={(ev) => setMountError(ev.message || 'Camera unavailable')}
      />

      {/* Viewfinder scrim + sculpted scan window */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.maskTop} />
        <View style={styles.maskMiddle}>
          <View style={styles.maskSide} />
          <View style={styles.windowBox}>
            {/* Four corner brackets */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />

            {/* Smooth scanning beam */}
            {scanning ? (
              <Animated.View style={[styles.beamWrap, beamStyle]}>
                <LinearGradient
                  colors={['rgba(255,178,30,0)', 'rgba(255,178,30,0.9)', 'rgba(200,64,15,0.9)', 'rgba(255,178,30,0)']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.beamLine}
                />
              </Animated.View>
            ) : null}
          </View>
          <View style={styles.maskSide} />
        </View>
        <View style={styles.maskBottom} />
      </View>

      {/* Floating Top Bar */}
      <View style={[styles.topOverlay, { paddingTop: insets.top + 8 }]}>
        <IconButton
          icon={<X size={20} weight="bold" color="#FFFFFF" />}
          tone="glass"
          onPress={onClose}
          accessibilityLabel={t.common.close}
        />
        <Text variant="headline" color="#FFFFFF" align="center" style={styles.flex}>
          {t.friends.scannerTitle}
        </Text>
        {Platform.OS !== 'web' ? (
          <IconButton
            icon={<Flashlight size={20} weight={torch ? 'fill' : 'bold'} color={torch ? '#FFB21E' : '#FFFFFF'} />}
            tone="glass"
            onPress={() => {
              haptic.select();
              setTorch((v) => !v);
            }}
            accessibilityLabel={torch ? t.friends.scannerFlashOn : t.friends.scannerFlashOff}
          />
        ) : (
          <View style={styles.spacer40} />
        )}
      </View>

      {/* Bottom Interactive Dock / Scan Outcome Sheet */}
      <View style={[styles.bottomOverlay, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        {outcome.kind === 'idle' ? (
          <View style={styles.idleDock}>
            <View style={styles.hintPill}>
              <Text variant="subhead" color="#FFFFFF" align="center" style={fontFor(600)}>
                {t.friends.scannerHint}
              </Text>
            </View>
            <View style={styles.dockActions}>
              <PillButton
                label={t.friends.myQr}
                kind="secondary"
                icon={<QrCode size={17} weight="bold" color={c.accent} />}
                onPress={() => {
                  haptic.select();
                  onOpenMyQr();
                }}
              />
              <PillButton
                label={t.friends.scannerTypeInstead}
                kind="neutral"
                icon={<Keyboard size={17} weight="bold" color={c.text} />}
                onPress={() => {
                  haptic.select();
                  onTypeCode();
                }}
              />
            </View>
          </View>
        ) : null}

        {outcome.kind === 'found' ? (
          <Card style={styles.resultCard}>
            <View style={styles.resultHead}>
              <Paty expression="cheering" size={62} alive={!reduced} interactive={false} />
              <View style={styles.flex}>
                <Text variant="headline">{t.friends.scannerFoundTitle}</Text>
                <Text variant="caption" color="textSecondary">
                  {t.friends.scannerFoundSub}
                </Text>
              </View>
            </View>
            <View style={[styles.foundCodeBox, { backgroundColor: c.inset, borderColor: c.hairline }]}>
              <Text variant="largeTitle" color="accent" tabular style={styles.foundCode}>
                {outcome.code}
              </Text>
            </View>
            {submitErr ? <Notice text={submitErr} tone="danger" /> : null}
            <View style={styles.resultBtns}>
              <PillButton label={t.friends.scannerScanAgain} kind="neutral" onPress={resetScan} disabled={busy} />
              <PillButton
                label={t.friends.scannerAddNow}
                kind="primary"
                icon={<UserPlus size={17} weight="fill" color={c.onAccent} />}
                onPress={() => void handleConfirmAdd()}
                disabled={busy}
                style={styles.flex}
              />
            </View>
          </Card>
        ) : null}

        {outcome.kind === 'added' ? (
          <Card style={styles.resultCard}>
            <View style={styles.addedRow}>
              <CheckCircle size={32} weight="fill" color={c.success} />
              <View style={styles.flex}>
                <Text variant="headline" color="success">
                  {outcome.status === 'accepted' ? t.friends.scannerAdded : t.friends.requestSent}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {outcome.code}
                </Text>
              </View>
            </View>
          </Card>
        ) : null}

        {outcome.kind === 'own' || outcome.kind === 'invalid' ? (
          <Card style={styles.resultCard}>
            <View style={styles.resultHead}>
              <View style={[styles.warnIcon, { backgroundColor: c.accentTint }]}>
                <WarningCircle size={26} weight="fill" color={c.accent} />
              </View>
              <Text variant="subhead" style={styles.flex}>
                {outcome.kind === 'own' ? t.friends.scannerOwnCode : t.friends.scannerInvalidQr}
              </Text>
            </View>
            <View style={styles.resultBtns}>
              <PillButton label={t.friends.scannerScanAgain} kind="primary" onPress={resetScan} block />
            </View>
          </Card>
        ) : null}
      </View>
    </View>
  );
}

/** Graceful manual fallback when running on an older binary without native ExpoCamera. */
function UnavailableCameraView({
  onClose,
  onOpenMyQr,
  onAddByCode,
}: {
  onClose: () => void;
  onOpenMyQr: () => void;
  onAddByCode: (code: string) => Promise<'pending' | 'accepted'>;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; tone: 'danger' | 'success' } | null>(null);

  const submit = async () => {
    const clean = normalizeFriendCode(input);
    if (clean.length < 4) return;
    setBusy(true);
    setFeedback(null);
    try {
      const status = await onAddByCode(clean);
      haptic.success();
      setFeedback({ text: status === 'accepted' ? t.friends.scannerAdded : t.friends.requestSent, tone: 'success' });
      setTimeout(() => onClose(), 850);
    } catch (e) {
      haptic.warning();
      setFeedback({ text: e instanceof Error ? e.message : 'Could not send request.', tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      style={[
        styles.permRoot,
        { backgroundColor: c.bg, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={styles.topRow}>
        <IconButton
          icon={<X size={20} weight="bold" color={c.text} />}
          onPress={onClose}
          accessibilityLabel={t.common.close}
        />
        <Text variant="headline" style={styles.flex} align="center">
          {t.friends.scannerTitle}
        </Text>
        <View style={styles.spacer40} />
      </View>

      <View style={styles.permCenter}>
        <Card style={styles.permCard}>
          <Paty expression="waving" size={84} alive={false} interactive={false} />
          <Text variant="title" align="center">
            {t.friends.scannerUnavailableTitle}
          </Text>
          <Text variant="subhead" color="textSecondary" align="center">
            {t.friends.scannerUnavailableSub}
          </Text>
          <View style={styles.fullWidth}>
            <TextField
              label={t.friends.addByCode}
              placeholder={t.friends.codePlaceholder}
              value={input}
              onChangeText={(txt) => setInput(normalizeFriendCode(txt).slice(0, 6))}
              code
              maxLength={6}
              autoCapitalize="characters"
              returnKeyType="send"
              onSubmitEditing={() => void submit()}
            />
          </View>
          {feedback ? (
            <View style={styles.fullWidth}>
              <Notice text={feedback.text} tone={feedback.tone} />
            </View>
          ) : null}
          <PillButton
            label={t.friends.sendRequest}
            kind="primary"
            block
            icon={<UserPlus size={18} weight="fill" color={c.onAccent} />}
            onPress={() => void submit()}
            disabled={busy || input.length < 4}
          />
          <PillButton
            label={t.friends.myQr}
            kind="secondary"
            block
            icon={<QrCode size={17} weight="bold" color={c.accent} />}
            onPress={onOpenMyQr}
          />
        </Card>
      </View>
    </View>
  );
}

const SCRIM = 'rgba(7, 10, 20, 0.62)';

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fullWidth: { width: '100%' },
  spacer40: { width: 40 },
  cameraRoot: {
    flex: 1,
    backgroundColor: '#070A14',
  },
  maskTop: {
    flex: 1,
    backgroundColor: SCRIM,
  },
  maskMiddle: {
    flexDirection: 'row',
    height: WINDOW_SIZE,
  },
  maskSide: {
    flex: 1,
    backgroundColor: SCRIM,
  },
  maskBottom: {
    flex: 1.25,
    backgroundColor: SCRIM,
  },
  windowBox: {
    width: WINDOW_SIZE,
    height: WINDOW_SIZE,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 24,
  },
  corner: {
    position: 'absolute',
    width: CORNER_LEN,
    height: CORNER_LEN,
    borderColor: '#FFB21E',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_THICK,
    borderLeftWidth: CORNER_THICK,
    borderTopLeftRadius: 22,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICK,
    borderRightWidth: CORNER_THICK,
    borderTopRightRadius: 22,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICK,
    borderLeftWidth: CORNER_THICK,
    borderBottomLeftRadius: 22,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICK,
    borderRightWidth: CORNER_THICK,
    borderBottomRightRadius: 22,
  },
  beamWrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 12,
    height: 3,
  },
  beamLine: {
    width: '100%',
    height: 3,
    borderRadius: 2,
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.screen,
    gap: 12,
  },
  bottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.screen,
  },
  idleDock: {
    alignItems: 'center',
    gap: 14,
  },
  hintPill: {
    backgroundColor: 'rgba(15, 20, 36, 0.78)',
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  dockActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  resultCard: {
    gap: 12,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  resultHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  addedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  warnIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foundCodeBox: {
    borderRadius: radius.inset,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    alignItems: 'center',
  },
  foundCode: {
    letterSpacing: 7,
  },
  resultBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  permRoot: {
    flex: 1,
    paddingHorizontal: space.screen,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  permCenter: {
    flex: 1,
    justifyContent: 'center',
  },
  permCard: {
    alignItems: 'center',
    gap: 12,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  permBadge: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
