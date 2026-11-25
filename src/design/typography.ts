import type { TextStyle } from 'react-native';

export type Weight = 500 | 600 | 700 | 800;

export const FONT_MAIN = 'Bungee-Regular';
export const FONT_SECONDARY = 'Poppins-Bold';

/**
 * Main display headings use Bungee; secondary labels and body use Poppins Bold
 * consistently across iOS, Android, and web.
 */
const familyByWeight: Record<Weight, string> = {
  500: FONT_SECONDARY,
  600: FONT_SECONDARY,
  700: FONT_SECONDARY,
  800: FONT_MAIN,
};

export function fontFor(weight: Weight): TextStyle {
  return { fontFamily: familyByWeight[weight], fontWeight: 'normal' };
}

type VariantSpec = {
  size: number;
  line: number;
  weight: Weight;
  tracking: number;
  upper?: boolean;
  tabular?: boolean;
  /** Cap Dynamic Type growth for display sizes so heroes never wrap. */
  maxScale: number;
};

export const variants = {
  display: { size: 46, line: 54, weight: 800, tracking: 0.4, tabular: true, maxScale: 1.1 },
  displayUnit: { size: 19, line: 24, weight: 800, tracking: 0.2, tabular: true, maxScale: 1.1 },
  largeTitle: { size: 30, line: 38, weight: 800, tracking: 0.3, maxScale: 1.2 },
  title: { size: 20, line: 27, weight: 800, tracking: 0.2, maxScale: 1.25 },
  headline: { size: 16, line: 22, weight: 700, tracking: 0, maxScale: 1.35 },
  body: { size: 15, line: 22, weight: 600, tracking: 0, maxScale: 1.35 },
  subhead: { size: 13.5, line: 19, weight: 600, tracking: 0, maxScale: 1.35 },
  caption: { size: 12, line: 17, weight: 500, tracking: 0, maxScale: 1.35 },
  overline: { size: 11, line: 15, weight: 700, tracking: 0.8, upper: true, maxScale: 1.3 },
  statNumber: { size: 28, line: 34, weight: 800, tracking: 0.3, tabular: true, maxScale: 1.15 },
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
    ...fontFor(v.weight),
    ...(v.upper ? { textTransform: 'uppercase' } : null),
    ...(v.tabular ? { fontVariant: ['tabular-nums'] } : null),
  };
  cache.set(variant, style);
  return style;
}

export function maxScaleFor(variant: Variant): number {
  return variants[variant].maxScale;
}
