import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { pressScale } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius } from '@/design/tokens';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

type Props = {
  title: string;
  status?: string;
  /** Status in accent (e.g. "On") instead of gray. */
  statusAccent?: boolean;
  /** Illustration that bleeds off the bottom-right corner. */
  art?: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  height?: number;
};

/**
 * Feature tile with a two-line label and corner illustration.
 * Day theme: crisp white card surface with hairline edge and subtle shadow.
 * Night theme: elevated dark surface (`tileDark`) for low-glare reading.
 */
export function FeatureTile({ title, status, statusAccent, art, onPress, style, height = 120 }: Props) {
  const { c, isNight } = useTheme();
  const titleColor = isNight ? c.tileDarkText : c.text;
  const statusColor = isNight
    ? statusAccent
      ? c.accentLight
      : c.tileDarkSecondary
    : statusAccent
      ? c.accent
      : c.textSecondary;

  const content = (
    <>
      <View style={styles.label}>
        <Text variant="headline" color={titleColor} numberOfLines={1}>
          {title}
        </Text>
        {status ? (
          <Text variant="subhead" color={statusColor} numberOfLines={1}>
            {status}
          </Text>
        ) : null}
      </View>
      {art ? (
        <View style={styles.art} pointerEvents="none">
          {art}
        </View>
      ) : null}
    </>
  );
  const s = [
    styles.tile,
    Platform.OS === 'ios' && ({ borderCurve: 'continuous' } as const),
    isNight
      ? { backgroundColor: c.tileDark, height }
      : [styles.daySurface, { backgroundColor: c.card, borderColor: c.hairline, height }],
    style,
  ];
  if (onPress) {
    return (
      <PressableScale
        scaleTo={pressScale.card}
        onPress={onPress}
        style={s}
        accessibilityLabel={[title, status].filter(Boolean).join(', ')}
      >
        {content}
      </PressableScale>
    );
  }
  return <View style={s}>{content}</View>;
}

/** Backwards-compatible alias for `FeatureTile`. */
export const DarkTile = FeatureTile;

const styles = StyleSheet.create({
  tile: { borderRadius: radius.tile, overflow: 'hidden', padding: 16 },
  daySurface: {
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 0,
  },
  label: { gap: 2, maxWidth: '70%', zIndex: 1 },
  art: { position: 'absolute', right: -8, bottom: -8 },
});
