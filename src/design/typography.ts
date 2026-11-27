import type { TextStyle } from 'react-native';

export type Weight = 500 | 600 | 700 | 800;

/**
 * Inter carries every label, control and paragraph. Bungee is reserved for
 * display moments (hero clocks, screen titles, big stats) and is opted into
 * per variant with `display: true`, never through a weight.
 */
const familyByWeight: Record<Weight, string> = {
  500: 'Inter_500Medium',
  600: 'Inter_600SemiBold',
  700: 'Inter_700Bold',
  800: 'Inter_800ExtraBold',
};

export const DISPLAY_FONT = 'Bungee_400Regular';

export function fontFor(weight: Weight): TextStyle {
  return { fontFamily: familyByWeight[weight], fontWeight: 'normal' };
}

type VariantSpec = {
  size: number;
  line: number;
  weight: Weight;
  tracking: number;
  /** Render in the Bungee display face. */
  display?: boolean;
  upper?: boolean;
  tabular?: boolean;
  /** Cap Dynamic Type growth for display sizes so heroes never wrap. */
  maxScale: number;
};

export const variants = {
  display: { size: 46, line: 54, weight: 800, display: true, tracking: 0.4, tabular: true, maxScale: 1.1 },
  displayUnit: { size: 19, line: 24, weight: 800, display: true, tracking: 0.2, tabular: true, maxScale: 1.1 },
  largeTitle: { size: 30, line: 38, weight: 800, display: true, tracking: 0.3, maxScale: 1.2 },
  title: { size: 21, line: 28, weight: 700, tracking: -0.2, maxScale: 1.25 },
  headline: { size: 16, line: 22, weight: 700, tracking: -0.1, maxScale: 1.35 },
  body: { size: 15, line: 22, weight: 500, tracking: 0, maxScale: 1.35 },
  subhead: { size: 13.5, line: 19, weight: 500, tracking: 0, maxScale: 1.35 },
  caption: { size: 12, line: 17, weight: 500, tracking: 0, maxScale: 1.35 },
  overline: { size: 11, line: 15, weight: 700, tracking: 0.8, upper: true, maxScale: 1.3 },
  statNumber: { size: 28, line: 34, weight: 800, display: true, tracking: 0.3, tabular: true, maxScale: 1.15 },
} as const satisfies Record<string, VariantSpec>;

export type Variant = keyof typeof variants;

const cache = new Map<Variant, TextStyle>();

export function textStyle(variant: Variant): TextStyle {
  const hit = cache.get(variant);
  if (hit) return hit;
  const v: VariantSpec = variants[variant];
  const style: TextStyle = {
    fontSize: v.size,
    lineHeight: v.line,
    letterSpacing: v.tracking,
    ...(v.display ? { fontFamily: DISPLAY_FONT, fontWeight: 'normal' } : fontFor(v.weight)),
    ...(v.upper ? { textTransform: 'uppercase' } : null),
    ...(v.tabular ? { fontVariant: ['tabular-nums'] } : null),
  };
  cache.set(variant, style);
  return style;
}

export function maxScaleFor(variant: Variant): number {
  return variants[variant].maxScale;
}
