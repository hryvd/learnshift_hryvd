import { memo, useMemo } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Ellipse, Path, Polygon, Rect } from 'react-native-svg';

import { PatyAvatar } from '@/components/mascot/Paty';
import { PressableScale, Text } from '@/components/ui';
import { haptic } from '@/design/haptics';
import { pressScale } from '@/design/motion';
import { radius } from '@/design/tokens';
import { fontFor } from '@/design/typography';
import { useT } from '@/i18n/useT';
import { buildFriendQrPayload, generateQrMatrix } from '@/lib/qr';

export type PassThemeId = 'sunrise' | 'lagoon' | 'parola';

export type PassThemeSpec = {
  id: PassThemeId;
  headerGradient: readonly [string, string, string];
  swatch: string;
  bodyBg: string;
  bodyBorder: string;
  codeColor: string;
  stubSubColor: string;
  qrEyeColor: string;
  qrInk: string;
  badgeBg: string;
  badgeText: string;
  dashColor: string;
  islandHill: string;
  islandRoof: string;
  seaFill: string;
  dark: boolean;
};

export const PASS_THEMES: Record<PassThemeId, PassThemeSpec> = {
  sunrise: {
    id: 'sunrise',
    headerGradient: ['#ED6F3C', '#C8400F', '#9E2E08'],
    swatch: '#C8400F',
    bodyBg: '#FFFDF9',
    bodyBorder: 'rgba(200,64,15,0.14)',
    codeColor: '#C8400F',
    stubSubColor: '#6E645C',
    qrEyeColor: '#C8400F',
    qrInk: '#1A1410',
    badgeBg: 'rgba(255,255,255,0.22)',
    badgeText: '#FFFFFF',
    dashColor: 'rgba(200,64,15,0.22)',
    islandHill: '#63B867',
    islandRoof: '#FFE3B0',
    seaFill: 'rgba(255,232,198,0.28)',
    dark: false,
  },
  lagoon: {
    id: 'lagoon',
    headerGradient: ['#48C0D6', '#1F8AA8', '#145D78'],
    swatch: '#1F8AA8',
    bodyBg: '#FAFDFE',
    bodyBorder: 'rgba(20,93,120,0.14)',
    codeColor: '#145D78',
    stubSubColor: '#5B6C75',
    qrEyeColor: '#145D78',
    qrInk: '#101B22',
    badgeBg: 'rgba(255,255,255,0.22)',
    badgeText: '#FFFFFF',
    dashColor: 'rgba(20,93,120,0.22)',
    islandHill: '#6EC873',
    islandRoof: '#FFD199',
    seaFill: 'rgba(210,247,255,0.28)',
    dark: false,
  },
  parola: {
    id: 'parola',
    headerGradient: ['#2B3C73', '#19224A', '#101632'],
    swatch: '#263464',
    bodyBg: '#171C32',
    bodyBorder: 'rgba(242,166,90,0.24)',
    codeColor: '#F2A65A',
    stubSubColor: '#A6AEC9',
    qrEyeColor: '#C8400F',
    qrInk: '#141724',
    badgeBg: 'rgba(242,166,90,0.22)',
    badgeText: '#FDE6B8',
    dashColor: 'rgba(242,166,90,0.28)',
    islandHill: '#40744D',
    islandRoof: '#F2A65A',
    seaFill: 'rgba(130,165,245,0.22)',
    dark: true,
  },
};

export const PASS_THEME_IDS: readonly PassThemeId[] = ['sunrise', 'lagoon', 'parola'];

const QUIET = 2;

function isFinderCell(r: number, c: number, size: number): boolean {
  const inTop = r < 7;
  const inLeft = c < 7;
  const inRight = c >= size - 7;
  const inBottom = r >= size - 7;
  return (inTop && inLeft) || (inTop && inRight) || (inBottom && inLeft);
}

/** Builds one combined SVG path for all rounded data modules (fast on low-end Android). */
function buildModulesPath(size: number, cells: readonly boolean[], clearCenterHalf: number): string {
  const mid = Math.floor(size / 2);
  const parts: string[] = [];
  const pad = 0.06;
  const w = 1 - pad * 2;
  const rad = 0.3;
  const span = w - rad * 2;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!cells[r * size + c]) continue;
      if (isFinderCell(r, c, size)) continue;
      if (clearCenterHalf > 0 && Math.abs(r - mid) <= clearCenterHalf && Math.abs(c - mid) <= clearCenterHalf) {
        continue;
      }
      const x = c + QUIET + pad;
      const y = r + QUIET + pad;
      parts.push(
        `M${(x + rad).toFixed(2)} ${y.toFixed(2)}h${span.toFixed(2)}q${rad} 0 ${rad} ${rad}v${span.toFixed(2)}q0 ${rad} -${rad} ${rad}h-${span.toFixed(2)}q-${rad} 0 -${rad} -${rad}v-${span.toFixed(2)}q0 -${rad} ${rad} -${rad}Z`,
      );
    }
  }
  return parts.join('');
}

type FriendQrCodeProps = {
  code: string;
  size?: number;
  inkColor?: string;
  eyeColor?: string;
  showCenterBadge?: boolean;
};

/**
 * Stylized, ISO/IEC 18004 standards-compliant QR code rendered in react-native-svg.
 * Uses ECC Level H (30% redundancy), crisp dark ink on pure white quiet zone,
 * rounded finder eyes, and an optional tiny Paty medallion (<2.5% symbol area).
 */
export const FriendQrCode = memo(function FriendQrCode({
  code,
  size = 180,
  inkColor = '#161616',
  eyeColor = '#C8400F',
  showCenterBadge = true,
}: FriendQrCodeProps) {
  const payload = buildFriendQrPayload(code);
  const clearHalf = showCenterBadge ? 2 : 0;

  const { viewSize, moduleSize, dataPath } = useMemo(() => {
    const matrix = generateQrMatrix(payload);
    return {
      viewSize: matrix.size + QUIET * 2,
      moduleSize: matrix.size,
      dataPath: buildModulesPath(matrix.size, matrix.cells, clearHalf),
    };
  }, [payload, clearHalf]);

  const finderOrigins = [
    [QUIET, QUIET],
    [QUIET + moduleSize - 7, QUIET],
    [QUIET, QUIET + moduleSize - 7],
  ] as const;

  const badgeDiameter = Math.round(size * 0.21);

  return (
    <View
      style={[styles.qrWrap, { width: size, height: size }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`QR code for friend code ${code}`}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${viewSize} ${viewSize}`}>
        <Rect x={0} y={0} width={viewSize} height={viewSize} fill="#FFFFFF" />
        <Path d={dataPath} fill={inkColor} />
        {finderOrigins.map(([ox, oy], idx) => (
          <ReactSvgFinder key={idx} x={ox} y={oy} ink={inkColor} eye={eyeColor} />
        ))}
      </Svg>

      {showCenterBadge ? (
        <View pointerEvents="none" style={styles.badgeCenter}>
          <View
            style={[
              styles.badgePlate,
              {
                width: badgeDiameter,
                height: badgeDiameter,
                borderRadius: Math.round(badgeDiameter * 0.34),
                borderColor: eyeColor,
              },
            ]}
          >
            <PatyAvatar size={Math.max(18, badgeDiameter - 8)} background="#FFF4E8" />
          </View>
        </View>
      ) : null}
    </View>
  );
});

function ReactSvgFinder({ x, y, ink, eye }: { x: number; y: number; ink: string; eye: string }) {
  return (
    <>
      <Rect x={x + 0.5} y={y + 0.5} width={6} height={6} rx={1.65} fill="#FFFFFF" stroke={ink} strokeWidth={1} />
      <Rect x={x + 2} y={y + 2} width={3} height={3} rx={0.95} fill={eye} />
    </>
  );
}

/** Decorative coastal island silhouette for the Kapuluan Pass header. */
function PassHeaderArt({ theme }: { theme: PassThemeSpec }) {
  return (
    <Svg
      width="100%"
      height={78}
      viewBox="0 0 320 78"
      preserveAspectRatio="xMaxYMax slice"
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      {theme.dark ? (
        <>
          <Circle cx={274} cy={22} r={13} fill="#F7E7BE" opacity={0.9} />
          <Circle cx={280} cy={18} r={12} fill="#19224A" />
          <Circle cx={210} cy={16} r={1.6} fill="#FFF5D6" opacity={0.85} />
          <Circle cx={236} cy={28} r={1.2} fill="#FFF5D6" opacity={0.7} />
          <Circle cx={178} cy={22} r={1.4} fill="#FFF5D6" opacity={0.65} />
          <Circle cx={302} cy={32} r={1.4} fill="#FFF5D6" opacity={0.8} />
        </>
      ) : (
        <>
          <Circle cx={278} cy={20} r={24} fill="#FFF4D2" opacity={0.22} />
          <Circle cx={278} cy={20} r={13} fill="#FFE8A8" opacity={0.55} />
          <Ellipse cx={224} cy={22} rx={22} ry={7} fill="#FFFFFF" opacity={0.2} />
        </>
      )}
      {/* Distant islet & tiny bahay silhouette */}
      <Path d="M188 78 C210 56, 238 50, 266 56 C288 52, 308 58, 326 78 Z" fill={theme.seaFill} />
      <Polygon points="242,66 266,57 290,66 266,74" fill={theme.islandHill} opacity={0.9} />
      <Rect x={259} y={50} width={14} height={10} rx={1.5} fill="#F2DEC1" opacity={0.95} />
      <Polygon points="256,51 266,43 276,51" fill={theme.islandRoof} />
      {/* Gentle horizon shimmer */}
      <Rect x={196} y={71} width={34} height={2} rx={1} fill="#FFFFFF" opacity={0.35} />
      <Rect x={286} y={73} width={22} height={2} rx={1} fill="#FFFFFF" opacity={0.25} />
    </Svg>
  );
}

const DASH_INDICES = Array.from({ length: 18 }, (_, i) => i);

export type FriendQrPassCardProps = {
  code: string;
  displayName: string;
  grade?: number | null;
  themeId: PassThemeId;
  /** Backdrop color behind the card so ticket side-notches punch cleanly. */
  notchColor: string;
  qrSize?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Collectible Kapuluan Friend Boarding Pass: illustrated coastal header,
 * high-contrast white QR stage, perforated ticket notches, and bold friend code stub.
 */
export function FriendQrPassCard({
  code,
  displayName,
  grade,
  themeId,
  notchColor,
  qrSize = 188,
  style,
}: FriendQrPassCardProps) {
  const t = useT();
  const theme = PASS_THEMES[themeId];
  const continuous = Platform.OS === 'ios' ? ({ borderCurve: 'continuous' } as const) : null;

  return (
    <View
      style={[
        styles.passCard,
        continuous,
        {
          backgroundColor: theme.bodyBg,
          borderColor: theme.bodyBorder,
        },
        style,
      ]}
    >
      {/* Coastal Header */}
      <LinearGradient
        colors={theme.headerGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.passHeader}
      >
        <PassHeaderArt theme={theme} />
        <View style={styles.headerRow}>
          <View style={styles.avatarRing}>
            <PatyAvatar size={42} background="#FFF4E8" />
          </View>
          <View style={styles.headerText}>
            <View style={[styles.stampPill, { backgroundColor: theme.badgeBg }]}>
              <Text variant="overline" color={theme.badgeText} style={styles.stampText}>
                {t.friends.passStamp}
              </Text>
            </View>
            <Text variant="title" color="#FFFFFF" numberOfLines={1}>
              {displayName}
            </Text>
            {grade ? (
              <Text variant="caption" color="rgba(255,255,255,0.85)" numberOfLines={1}>
                Grade {grade} · LearnShift
              </Text>
            ) : (
              <Text variant="caption" color="rgba(255,255,255,0.85)" numberOfLines={1}>
                LearnShift Kapuluan
              </Text>
            )}
          </View>
        </View>
      </LinearGradient>

      {/* Pure-white scannable QR stage */}
      <View style={styles.qrStage}>
        <View style={[styles.qrPlate, continuous, theme.dark && styles.qrPlateDark]}>
          <FriendQrCode code={code} size={qrSize} inkColor={theme.qrInk} eyeColor={theme.qrEyeColor} showCenterBadge />
        </View>
      </View>

      {/* Perforated ticket tear line */}
      <View style={styles.perfRow} pointerEvents="none">
        <View style={[styles.notchLeft, { backgroundColor: notchColor, borderColor: theme.bodyBorder }]} />
        <View style={styles.dashLine}>
          {DASH_INDICES.map((i) => (
            <View key={i} style={[styles.dash, { backgroundColor: theme.dashColor }]} />
          ))}
        </View>
        <View style={[styles.notchRight, { backgroundColor: notchColor, borderColor: theme.bodyBorder }]} />
      </View>

      {/* Ticket stub: bold 6-char friend code */}
      <View style={styles.stub}>
        <Text
          variant="largeTitle"
          color={theme.codeColor}
          tabular
          align="center"
          style={styles.stubCode}
          accessibilityLabel={code}
        >
          {code}
        </Text>
        <Text variant="caption" color={theme.stubSubColor} align="center" style={fontFor(600)}>
          {t.friends.passHint}
        </Text>
      </View>
    </View>
  );
}

/** Tactile 3-option pass style selector (Sunrise, Lagoon, Parola). */
export function PassThemePicker({
  value,
  onChange,
  onDark = false,
}: {
  value: PassThemeId;
  onChange: (next: PassThemeId) => void;
  onDark?: boolean;
}) {
  const t = useT();
  return (
    <View style={styles.pickerRow} accessibilityRole="radiogroup" accessibilityLabel={t.friends.passThemeLabel}>
      {PASS_THEME_IDS.map((id) => {
        const spec = PASS_THEMES[id];
        const active = value === id;
        return (
          <PressableScale
            key={id}
            scaleTo={pressScale.button}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t.friends.passThemes[id]}
            onPress={() => {
              if (!active) {
                haptic.select();
                onChange(id);
              }
            }}
            style={[
              styles.swatchPill,
              {
                backgroundColor: active
                  ? onDark
                    ? 'rgba(255,255,255,0.18)'
                    : 'rgba(200,64,15,0.12)'
                  : onDark
                    ? 'rgba(255,255,255,0.08)'
                    : 'rgba(0,0,0,0.04)',
                borderColor: active ? spec.swatch : 'transparent',
              },
            ]}
          >
            <View style={[styles.swatchDot, { backgroundColor: spec.swatch }]} />
            <Text
              variant="caption"
              color={onDark ? '#FFFFFF' : active ? spec.swatch : 'textSecondary'}
              style={fontFor(700)}
              numberOfLines={1}
            >
              {t.friends.passThemes[id]}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  qrWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  badgeCenter: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgePlate: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  passCard: {
    width: '100%',
    maxWidth: 332,
    alignSelf: 'center',
    borderRadius: radius.card,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  passHeader: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 15,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  headerText: {
    flex: 1,
    gap: 1,
  },
  stampPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    marginBottom: 2,
  },
  stampText: {
    fontSize: 9.5,
    lineHeight: 13,
    letterSpacing: 1.1,
  },
  qrStage: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 18,
    paddingBottom: 12,
    paddingHorizontal: 18,
  },
  qrPlate: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  qrPlateDark: {
    borderColor: 'rgba(255,255,255,0.2)',
    shadowOpacity: 0.28,
  },
  perfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 22,
    position: 'relative',
  },
  notchLeft: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: -10,
    borderWidth: 1,
  },
  notchRight: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: -10,
    borderWidth: 1,
  },
  dashLine: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 8,
  },
  dash: {
    width: 6,
    height: 2,
    borderRadius: 1,
  },
  stub: {
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 18,
    alignItems: 'center',
    gap: 2,
  },
  stubCode: {
    letterSpacing: 7,
    fontSize: 28,
    lineHeight: 34,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  swatchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  swatchDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
});
