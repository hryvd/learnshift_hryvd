import { useRef, useState, type RefObject } from 'react';
import { Modal, Platform, ScrollView, Share, StyleSheet, useWindowDimensions, View } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';
import { ArrowsOutSimple, Check, CopySimple, Export, QrCode, Scan, ShareNetwork, X } from '@/components/ui/icons';

import { BottomSheet, IconButton, Notice, PillButton, PressableScale, SheetHeader, Text } from '@/components/ui';
import { haptic } from '@/design/haptics';
import { pressScale } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { fontFor } from '@/design/typography';
import { useT } from '@/i18n/useT';
import { buildFriendQrPayload, buildFriendShareMessage, generateQrMatrix } from '@/lib/qr';

import { FriendQrPassCard, PASS_THEMES, PassThemePicker, type PassThemeId } from './FriendQrPass';

/**
 * Generates a crisp PNG blob of the Kapuluan QR Boarding Pass on Web using 2D Canvas
 * so "Share QR code card" works on desktop/mobile browsers without extra libraries.
 */
async function renderWebPassPng(
  code: string,
  displayName: string,
  grade: number | null,
  themeId: PassThemeId,
): Promise<Blob | null> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
  const spec = PASS_THEMES[themeId];
  const W = 720;
  const H = 960;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  // Card background
  roundRect(0, 0, W, H, 56);
  ctx.fillStyle = spec.bodyBg;
  ctx.fill();
  ctx.save();
  ctx.clip();

  // Gradient header
  const grad = ctx.createLinearGradient(0, 0, W, 200);
  grad.addColorStop(0, spec.headerGradient[0]);
  grad.addColorStop(0.55, spec.headerGradient[1]);
  grad.addColorStop(1, spec.headerGradient[2]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 204);

  // Header text
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '700 22px sans-serif';
  ctx.fillText('KAPULUAN PASS', 52, 72);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 44px sans-serif';
  ctx.fillText(displayName.slice(0, 24), 52, 128);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '600 24px sans-serif';
  ctx.fillText(grade ? `Grade ${grade} · LearnShift` : 'LearnShift Kapuluan', 52, 168);

  // White QR stage plate
  const plateSize = 468;
  const plateX = (W - plateSize) / 2;
  const plateY = 248;
  roundRect(plateX, plateY, plateSize, plateSize, 40);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  // Render QR matrix cleanly onto the plate
  const matrix = generateQrMatrix(buildFriendQrPayload(code));
  const quiet = 3;
  const total = matrix.size + quiet * 2;
  const cell = (plateSize - 32) / total;
  const startX = plateX + 16;
  const startY = plateY + 16;

  for (let r = 0; r < matrix.size; r++) {
    for (let c = 0; c < matrix.size; c++) {
      if (!matrix.cells[r * matrix.size + c]) continue;
      const inFinder = (r < 7 && c < 7) || (r < 7 && c >= matrix.size - 7) || (r >= matrix.size - 7 && c < 7);
      const inInnerEye =
        (r >= 2 && r <= 4 && c >= 2 && c <= 4) ||
        (r >= 2 && r <= 4 && c >= matrix.size - 5 && c <= matrix.size - 3) ||
        (r >= matrix.size - 5 && r <= matrix.size - 3 && c >= 2 && c <= 4);
      ctx.fillStyle = inInnerEye ? spec.qrEyeColor : spec.qrInk;
      const x = startX + (c + quiet) * cell;
      const y = startY + (r + quiet) * cell;
      if (inFinder) {
        ctx.fillRect(x, y, cell + 0.4, cell + 0.4);
      } else {
        roundRect(x + cell * 0.06, y + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.28);
        ctx.fill();
      }
    }
  }

  // Perforation dashes
  ctx.strokeStyle = spec.dashColor;
  ctx.lineWidth = 4;
  ctx.setLineDash([12, 14]);
  ctx.beginPath();
  ctx.moveTo(44, 766);
  ctx.lineTo(W - 44, 766);
  ctx.stroke();
  ctx.setLineDash([]);

  // Friend code stub
  ctx.fillStyle = spec.codeColor;
  ctx.font = '800 68px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(code.split('').join(' '), W / 2, 856);
  ctx.fillStyle = spec.stubSubColor;
  ctx.font = '600 24px sans-serif';
  ctx.fillText('Scan with LearnShift or enter code', W / 2, 906);

  ctx.restore();

  return await new Promise<Blob | null>((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

async function sharePassCardImage({
  cardRef,
  code,
  displayName,
  grade,
  themeId,
  dialogTitle,
}: {
  cardRef: RefObject<ViewShotRef | null>;
  code: string;
  displayName: string;
  grade: number | null;
  themeId: PassThemeId;
  dialogTitle: string;
}): Promise<'shared' | 'downloaded' | 'fallback'> {
  if (Platform.OS === 'web') {
    const blob = await renderWebPassPng(code, displayName, grade, themeId);
    if (!blob) return 'fallback';
    const fileName = `learnshift-pass-${code}.png`;
    try {
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      if (nav && typeof File !== 'undefined' && typeof nav.canShare === 'function') {
        const file = new File([blob], fileName, { type: 'image/png' });
        if (nav.canShare({ files: [file] })) {
          await nav.share({
            files: [file],
            title: dialogTitle,
            text: buildFriendShareMessage(code, displayName),
          });
          return 'shared';
        }
      }
    } catch {
      // Fall through to clean PNG download if user cancels or Web Share declines files.
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return 'downloaded';
  }

  try {
    if (!requireOptionalNativeModule('ExpoSharing')) return 'fallback';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sharing = require('expo-sharing') as typeof import('expo-sharing');
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare || !cardRef.current?.capture) return 'fallback';
    const uri = await cardRef.current.capture();
    await Sharing.shareAsync(uri, {
      mimeType: 'image/png',
      UTI: 'public.png',
      dialogTitle,
    });
    return 'shared';
  } catch {
    return 'fallback';
  }
}

type ShareSheetProps = {
  visible: boolean;
  code: string;
  displayName: string;
  grade?: number | null;
  themeId: PassThemeId;
  onThemeChange: (id: PassThemeId) => void;
  onClose: () => void;
  onShowFullQr: () => void;
};

/**
 * Opened when tapping Share on the Friends screen.
 * Presents the live styled Kapuluan QR Pass plus options to share the QR card image,
 * enlarge it full-screen for face-to-face scanning, share text + link, or copy the code.
 */
export function FriendShareSheet({
  visible,
  code,
  displayName,
  grade = null,
  themeId,
  onThemeChange,
  onClose,
  onShowFullQr,
}: ShareSheetProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const t = useT();
  const captureWrapRef = useRef<ViewShotRef | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleShareQrCard = async () => {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    haptic.select();
    const res = await sharePassCardImage({
      cardRef: captureWrapRef,
      code,
      displayName,
      grade,
      themeId,
      dialogTitle: t.friends.shareQrOption,
    });
    setBusy(false);
    if (res === 'shared') {
      haptic.success();
    } else if (res === 'downloaded') {
      haptic.success();
      setFeedback(t.friends.shareCardReady);
    } else {
      setFeedback(t.friends.shareCardFallback);
    }
  };

  const handleShareText = async () => {
    haptic.select();
    await Share.share({
      message: buildFriendShareMessage(code, displayName),
    }).catch(() => {});
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(code);
    haptic.success();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel={t.friends.shareSheetTitle}>
      <SheetHeader
        title={t.friends.shareSheetTitle}
        right={{ label: t.common.close, onPress: onClose }}
        grabber={false}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ maxHeight: Math.max(360, winH - insets.top - 120) }}
        contentContainerStyle={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}
      >
        {/* Capturable Kapuluan QR Boarding Pass */}
        <ViewShot
          ref={captureWrapRef}
          options={{ format: 'png', quality: 1, result: 'tmpfile' }}
          style={[styles.captureSurface, { backgroundColor: c.card }]}
        >
          <FriendQrPassCard
            code={code}
            displayName={displayName}
            grade={grade}
            themeId={themeId}
            notchColor={c.card}
            qrSize={156}
          />
        </ViewShot>

        <PassThemePicker value={themeId} onChange={onThemeChange} />

        {feedback ? <Notice text={feedback} tone="success" /> : null}

        {/* Primary Option: Share QR Code Card */}
        <PillButton
          label={busy ? t.friends.sharingBusy : t.friends.shareQrOption}
          kind="primary"
          size="lg"
          block
          disabled={busy}
          icon={<Export size={18} weight="bold" color={c.onAccent} />}
          onPress={() => void handleShareQrCard()}
        />

        {/* Secondary Options List */}
        <View style={[styles.optionGroup, { backgroundColor: c.inset }]}>
          <PressableScale
            scaleTo={pressScale.card}
            onPress={() => {
              haptic.select();
              onClose();
              onShowFullQr();
            }}
            style={styles.optionRow}
            accessibilityLabel={t.friends.showFullQr}
          >
            <View style={[styles.optionIcon, { backgroundColor: c.accentTint }]}>
              <ArrowsOutSimple size={18} weight="bold" color={c.accent} />
            </View>
            <View style={styles.flex}>
              <Text variant="subhead" color="text" style={fontFor(700)}>
                {t.friends.showFullQr}
              </Text>
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                {t.friends.showFullQrSub}
              </Text>
            </View>
          </PressableScale>

          <View style={[styles.divider, { backgroundColor: c.hairline }]} />

          <PressableScale
            scaleTo={pressScale.card}
            onPress={() => void handleShareText()}
            style={styles.optionRow}
            accessibilityLabel={t.friends.shareTextOption}
          >
            <View style={[styles.optionIcon, { backgroundColor: c.card }]}>
              <ShareNetwork size={18} weight="bold" color={c.text} />
            </View>
            <View style={styles.flex}>
              <Text variant="subhead" color="text" style={fontFor(700)}>
                {t.friends.shareTextOption}
              </Text>
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                {t.friends.shareTextSub}
              </Text>
            </View>
          </PressableScale>

          <View style={[styles.divider, { backgroundColor: c.hairline }]} />

          <PressableScale
            scaleTo={pressScale.card}
            onPress={() => void handleCopy()}
            style={styles.optionRow}
            accessibilityLabel={t.friends.copyCode}
          >
            <View style={[styles.optionIcon, { backgroundColor: c.card }]}>
              {copied ? (
                <Check size={18} weight="bold" color={c.success} />
              ) : (
                <CopySimple size={18} weight="bold" color={c.text} />
              )}
            </View>
            <View style={styles.flex}>
              <Text variant="subhead" color={copied ? 'success' : 'text'} style={fontFor(700)}>
                {copied ? t.friends.copied : `${t.friends.copyCode} · ${code}`}
              </Text>
            </View>
          </PressableScale>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const MODAL_BG: Record<PassThemeId, readonly [string, string]> = {
  sunrise: ['#2A1610', '#160C0A'],
  lagoon: ['#0F2B38', '#091922'],
  parola: ['#121836', '#080B1A'],
};

const MODAL_NOTCH: Record<PassThemeId, string> = {
  sunrise: '#1E100C',
  lagoon: '#0C212C',
  parola: '#0C1127',
};

type FullScreenQrProps = {
  visible: boolean;
  code: string;
  displayName: string;
  grade?: number | null;
  themeId: PassThemeId;
  onThemeChange: (id: PassThemeId) => void;
  onClose: () => void;
  onOpenScanner: () => void;
};

/**
 * Uncluttered full-screen Kapuluan QR Pass modal for face-to-face classroom scanning,
 * with instant one-tap switching to the live QR scanner and PNG card sharing.
 */
export function FullScreenQrModal({
  visible,
  code,
  displayName,
  grade = null,
  themeId,
  onThemeChange,
  onClose,
  onOpenScanner,
}: FullScreenQrProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const passRef = useRef<ViewShotRef | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const handleShareCard = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    haptic.select();
    const res = await sharePassCardImage({
      cardRef: passRef,
      code,
      displayName,
      grade,
      themeId,
      dialogTitle: t.friends.shareQrOption,
    });
    setBusy(false);
    if (res === 'shared') haptic.success();
    else if (res === 'downloaded') {
      haptic.success();
      setNote(t.friends.shareCardReady);
    } else {
      await Share.share({ message: buildFriendShareMessage(code, displayName) }).catch(() => {});
    }
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(code);
    haptic.success();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <LinearGradient colors={MODAL_BG[themeId]} style={styles.fullRoot}>
        {/* Top bar */}
        <View style={[styles.fullTop, { paddingTop: insets.top + 8 }]}>
          <IconButton
            icon={<X size={20} weight="bold" color="#FFFFFF" />}
            tone="glass"
            onPress={onClose}
            accessibilityLabel={t.common.close}
          />
          <View style={styles.fullTitleRow}>
            <QrCode size={18} weight="fill" color="#FFB21E" />
            <Text variant="headline" color="#FFFFFF" numberOfLines={1}>
              {t.friends.myQr}
            </Text>
          </View>
          <PillButton
            label={t.friends.scanQr}
            size="sm"
            kind="primary"
            icon={<Scan size={15} weight="bold" color={c.onAccent} />}
            onPress={() => {
              haptic.select();
              onOpenScanner();
            }}
          />
        </View>

        {/* Centered Boarding Pass */}
        <ScrollView contentContainerStyle={styles.fullScroll} showsVerticalScrollIndicator={false}>
          <ViewShot
            ref={passRef}
            options={{ format: 'png', quality: 1, result: 'tmpfile' }}
            style={[styles.fullCapturePad, { backgroundColor: MODAL_NOTCH[themeId] }]}
          >
            <FriendQrPassCard
              code={code}
              displayName={displayName}
              grade={grade}
              themeId={themeId}
              notchColor={MODAL_NOTCH[themeId]}
              qrSize={212}
            />
          </ViewShot>

          <PassThemePicker value={themeId} onChange={onThemeChange} onDark />
          {note ? (
            <View style={styles.noteWrap}>
              <Notice text={note} tone="success" />
            </View>
          ) : null}
        </ScrollView>

        {/* Bottom quick actions */}
        <View style={[styles.fullFooter, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <PillButton
            label={copied ? t.friends.copied : t.friends.copyCode}
            kind="secondary"
            size="md"
            icon={
              copied ? (
                <Check size={16} weight="bold" color={c.accent} />
              ) : (
                <CopySimple size={16} weight="bold" color={c.accent} />
              )
            }
            onPress={() => void handleCopy()}
          />
          <PillButton
            label={busy ? t.friends.sharingBusy : t.friends.shareQrOption}
            kind="primary"
            size="md"
            disabled={busy}
            icon={<Export size={17} weight="bold" color={c.onAccent} />}
            onPress={() => void handleShareCard()}
            style={styles.flex}
          />
        </View>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sheetContent: {
    paddingTop: 8,
    gap: 14,
  },
  captureSurface: {
    borderRadius: radius.card,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  optionGroup: {
    borderRadius: radius.inset,
    overflow: 'hidden',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
  },
  optionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 64,
  },
  fullRoot: {
    flex: 1,
  },
  fullTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.screen,
    gap: 10,
  },
  fullTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fullScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space.screen,
    paddingVertical: 16,
    gap: 18,
  },
  fullCapturePad: {
    width: '100%',
    maxWidth: 344,
    borderRadius: radius.card + 6,
    padding: 6,
  },
  noteWrap: {
    width: '100%',
    maxWidth: 332,
  },
  fullFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: space.screen,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
});
