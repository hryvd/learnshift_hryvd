import { StyleSheet, Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useTheme } from '@/design/theme';
import type { Palette } from '@/design/tokens';
import { familyFor, maxScaleFor, textStyle, type Variant } from '@/design/typography';

type ColorKey = { [K in keyof Palette]: Palette[K] extends string ? K : never }[keyof Palette];

export type TextProps = RNTextProps & {
  variant?: Variant;
  /** A palette key (`textSecondary`) or a raw color. */
  color?: ColorKey | (string & {});
  align?: 'left' | 'center' | 'right';
  tabular?: boolean;
};

const defaultColor: Partial<Record<Variant, ColorKey>> = {
  overline: 'textSecondary',
  caption: 'textTertiary',
  subhead: 'textSecondary',
};

/** A `fontWeight` in a style override picks the matching Inter face. */
function familyForWeight(weight: string | number | undefined): string | undefined {
  if (weight === undefined) return undefined;
  const w = String(weight);
  if (w === '800' || w === '900') return familyFor(800);
  if (w === '700' || w === 'bold') return familyFor(700);
  if (w === '600') return familyFor(600);
  if (w === '500') return familyFor(500);
  return undefined;
}

export function Text({ variant = 'body', color, align, tabular, style, ...rest }: TextProps) {
  const { c } = useTheme();
  const base = textStyle(variant);
  const key = color ?? defaultColor[variant] ?? 'text';
  const resolved = key in c ? (c[key as ColorKey] as string) : key;
  const flat = style ? StyleSheet.flatten(style) : undefined;
  const overrideFamily =
    flat && !flat.fontFamily ? familyForWeight(flat.fontWeight) : undefined;
  const resolvedFamily = flat?.fontFamily ?? overrideFamily ?? base.fontFamily;

  return (
    <RNText
      maxFontSizeMultiplier={maxScaleFor(variant)}
      {...rest}
      style={[
        base,
        { color: resolved },
        align ? { textAlign: align } : null,
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        style,
        { fontFamily: resolvedFamily, fontWeight: 'normal' },
      ]}
    />
  );
}
