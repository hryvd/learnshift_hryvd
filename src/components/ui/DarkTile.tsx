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
 * Day: warm paper (#E9E7E2) lifted by a layered contact + ambient shadow and a
 * thin top highlight; no border. Night: `tileDark` with the same layered depth.
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
        <Text variant="headline" color={titleColor} numberOfLines={2}>
          {title}
        </Text>
        {status ? (
          <Text variant="subhead" color={statusColor} numberOfLines={2}>
            {status}
          </Text>
        ) : null}
      </View>
      {art ? (
        // Clip the bleeding art on an inner layer, so the tile itself never clips its own shadow (iOS).
        <View style={styles.artClip} pointerEvents="none">
          <View style={styles.art}>{art}</View>
        </View>
      ) : null}
    </>
  );
  const s = [
    styles.tile,
    Platform.OS === 'ios' && ({ borderCurve: 'continuous' } as const),
    { backgroundColor: isNight ? c.tileDark : PAPER, boxShadow: isNight ? NIGHT_SHADOW : DAY_SHADOW, height },
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

/** Warm "dirty white" paper, a step below the #F6F5F1 canvas so tiles read as objects. */
const PAPER = '#E9E7E2';
/** Contact shadow + soft ambient lift + a 1px top highlight. */
const DAY_SHADOW =
  '0 1px 3px rgba(28,25,20,0.10), 0 12px 28px -10px rgba(28,25,20,0.26), inset 0 1px 0 rgba(255,255,255,0.7)';
const NIGHT_SHADOW =
  '0 1px 2px rgba(0,0,0,0.30), 0 10px 24px -10px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)';

const styles = StyleSheet.create({
  tile: { borderRadius: radius.tile, padding: 16 },
  artClip: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: radius.tile, overflow: 'hidden' },
  label: { gap: 2, maxWidth: '78%', zIndex: 1 },
  art: { position: 'absolute', right: -8, bottom: -8, transform: [{ scale: 0.8 }], transformOrigin: 'right bottom' },
});
