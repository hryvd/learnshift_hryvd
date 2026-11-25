import { useState } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';

import { haptic } from '@/design/haptics';
import { nativeOnly } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n/useT';

import { Text } from './Text';

export type HeatmapDay = { title: string; body: string };

type Props = {
  /** Intensity 0–4 per day, oldest first. Length should be weeks × 7. */
  data: readonly number[];
  weeks: number;
  /** Month label positions: week index → label. */
  months?: readonly { week: number; label: string }[];
  /** Day row labels (Mon, Wed, Fri by default). */
  rowLabels?: readonly (string | null)[];
  legend?: boolean;
  accessibilityLabel?: string;
  /**
   * Makes days tappable: returns what the tooltip shows for a cell, or null for
   * cells that can't be selected (days after today).
   */
  describe?: (index: number) => HeatmapDay | null;
  /** Screen-reader hint when `describe` is set. */
  accessibilityHint?: string;
};

const LABEL_W = 16;
const GAP = 3;
const TIP_W = 176;
/** Rows above this open the tooltip below the cell so it stays inside the card. */
const FLIP_ROW = 3;

/** Contribution-style heatmap of learning days. Tap a day to see its details. */
export function Heatmap({
  data,
  weeks,
  months,
  rowLabels,
  legend = true,
  accessibilityLabel,
  describe,
  accessibilityHint,
}: Props) {
  const { c } = useTheme();
  const t = useT();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const labels = rowLabels ?? [null, t.days.narrow[1], null, t.days.narrow[3], null, t.days.narrow[5], null];
  const cell = width > 0 ? Math.min(16, (width - LABEL_W - GAP * (weeks - 1)) / weeks) : 0;
  const step = cell + GAP;
  const gridW = cell * weeks + GAP * (weeks - 1);
  const gridH = cell * 7 + GAP * 6;

  const info = selected !== null && describe ? describe(selected) : null;

  const onPress = (e: GestureResponderEvent) => {
    if (!describe || cell <= 0) return;
    const { locationX, locationY } = e.nativeEvent;
    const w = Math.floor(locationX / step);
    const d = Math.floor(locationY / step);
    // Taps in the gaps between cells, or outside the grid, close the tooltip.
    const onCell =
      w >= 0 && w < weeks && d >= 0 && d < 7 && locationX - w * step <= cell && locationY - d * step <= cell;
    const k = w * 7 + d;
    if (!onCell || k === selected || !describe(k)) {
      setSelected(null);
      return;
    }
    haptic.select();
    setSelected(k);
  };

  const grid = (
    <Svg width={gridW} height={gridH}>
      {Array.from({ length: weeks * 7 }, (_, k) => {
        const w = Math.floor(k / 7);
        const d = k % 7;
        const v = data[k] ?? 0;
        const isSel = k === selected;
        return (
          <Rect
            key={k}
            x={w * step + (isSel ? 0.75 : 0)}
            y={d * step + (isSel ? 0.75 : 0)}
            width={isSel ? cell - 1.5 : cell}
            height={isSel ? cell - 1.5 : cell}
            rx={cell * 0.28}
            fill={c.heat[Math.max(0, Math.min(4, v))]}
            stroke={isSel ? c.text : undefined}
            strokeWidth={isSel ? 1.5 : 0}
          />
        );
      })}
    </Svg>
  );

  let tooltip = null;
  if (info && selected !== null) {
    const w = Math.floor(selected / 7);
    const d = selected % 7;
    const cx = LABEL_W + w * step + cell / 2;
    const left = Math.max(0, Math.min(width - TIP_W, cx - TIP_W / 2));
    const below = d < FLIP_ROW;
    const place = below ? { top: (d + 1) * step + 4 } : { bottom: gridH - d * step + 6 };
    tooltip = (
      <Animated.View
        key={selected}
        entering={nativeOnly(FadeIn.duration(140))}
        pointerEvents="none"
        accessibilityLiveRegion="polite"
        style={[styles.tip, { left, backgroundColor: c.text, shadowColor: c.shadow }, place]}
      >
        <View
          style={[
            styles.caret,
            { left: cx - left - 5, backgroundColor: c.text },
            below ? styles.caretTop : styles.caretBottom,
          ]}
        />
        <Text variant="caption" color={c.bg} style={styles.tipTitle} numberOfLines={1}>
          {info.title}
        </Text>
        <Text variant="caption" color={c.bg} style={styles.tipBody}>
          {info.body}
        </Text>
      </Animated.View>
    );
  }

  return (
    <View
      onLayout={onLayout}
      accessible={!describe}
      accessibilityRole={describe ? undefined : 'image'}
      accessibilityLabel={describe ? undefined : accessibilityLabel}
    >
      {cell > 0 ? (
        <>
          <View style={[styles.months, { marginLeft: LABEL_W, width: gridW }]}>
            {(months ?? []).map((m) => (
              <Text key={m.label + m.week} variant="caption" style={[styles.month, { left: m.week * step }]}>
                {m.label}
              </Text>
            ))}
          </View>
          <View style={styles.body}>
            <View style={{ width: LABEL_W, height: gridH }}>
              {labels.map((l, i) =>
                l ? (
                  <Text key={i} variant="caption" style={[styles.rowLabel, { top: i * step + cell / 2 - 7 }]}>
                    {l}
                  </Text>
                ) : null,
              )}
            </View>
            {describe ? (
              <Pressable
                onPress={onPress}
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel}
                accessibilityHint={accessibilityHint}
              >
                {grid}
              </Pressable>
            ) : (
              grid
            )}
            {tooltip}
          </View>
          {legend ? (
            <View style={styles.legend}>
              <Text variant="caption">{t.common.less}</Text>
              {c.heat.map((h) => (
                <View key={h} style={[styles.legendCell, { backgroundColor: h }]} />
              ))}
              <Text variant="caption">{t.common.more}</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  months: { height: 16, marginBottom: 4 },
  month: { position: 'absolute', top: 0 },
  body: { flexDirection: 'row' },
  rowLabel: { position: 'absolute', left: 0 },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 12 },
  legendCell: { width: 10, height: 10, borderRadius: 3 },
  tip: {
    position: 'absolute',
    width: TIP_W,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 2,
    zIndex: 10,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  caret: { position: 'absolute', width: 10, height: 10, transform: [{ rotate: '45deg' }] },
  caretTop: { top: -4 },
  caretBottom: { bottom: -4 },
  tipTitle: { fontWeight: '700' },
  tipBody: { opacity: 0.85 },
});
