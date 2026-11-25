import { StyleSheet, Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useTheme } from '@/design/theme';
import type { Palette } from '@/design/tokens';
import { FONT_MAIN, FONT_SECONDARY, maxScaleFor, textStyle, type Variant } from '@/design/typography';

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
  caption: 'textSecondary',
  subhead: 'textSecondary',
};

function familyForWeight(weight: string | number | undefined): string | undefined {
  if (weight === undefined) return undefined;
  const normalized = String(weight);
  if (normalized === '800' || normalized === '900') return FONT_MAIN;
  if (
    normalized === '500' ||
    normalized === '600' ||
    normalized === '700' ||
    normalized === 'bold'
  ) {
    return FONT_SECONDARY;
  }
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
