import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { CheckCircle, FileArrowUp, WarningCircle } from '@/components/ui/icons';

import { ProgressBar, Skeleton, Text } from '@/components/ui';
import { useTheme } from '@/design/theme';
import { radius } from '@/design/tokens';
import { fontFor } from '@/design/typography';

export type UploadCardState =
  | { status: 'idle' }
  | { status: 'dragging' }
  | { status: 'reading'; fileName: string }
  | { status: 'uploading'; fileName: string; pct: number }
  | { status: 'ready'; fileName: string; charCount: number; note?: string | null }
  | { status: 'failed'; reason: string };

type Props = {
  state: UploadCardState;
  onPress: () => void;
  onDropFile?: (file: File) => void;
  onDragChange?: (dragging: boolean) => void;
  compact?: boolean;
};

/**
 * Shared module upload card for mobile and laptop teachers.
 * The entire card is the tap/click/drop target (no separate Upload button).
 */
export function UploadDropCard({ state, onPress, onDropFile, onDragChange, compact = false }: Props) {
  const { c } = useTheme();
  const busy = state.status === 'reading' || state.status === 'uploading';
  const isDragging = state.status === 'dragging';
  const isFailed = state.status === 'failed';
  const isReady = state.status === 'ready';

  const webProps =
    Platform.OS === 'web'
      ? ({
          role: 'button',
          tabIndex: busy ? -1 : 0,
          onKeyDown: (e: { key: string; preventDefault: () => void }) => {
            if (busy) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onPress();
            }
          },
          onDragEnter: (e: { preventDefault: () => void }) => {
            e.preventDefault();
            if (!busy) onDragChange?.(true);
          },
          onDragOver: (e: { preventDefault: () => void }) => {
            e.preventDefault();
            if (!busy) onDragChange?.(true);
          },
          onDragLeave: (e: { preventDefault: () => void }) => {
            e.preventDefault();
            onDragChange?.(false);
          },
          onDrop: (e: { preventDefault: () => void; dataTransfer?: { files?: FileList } }) => {
            e.preventDefault();
            onDragChange?.(false);
            if (busy) return;
            const f = e.dataTransfer?.files?.[0];
            if (f) onDropFile?.(f);
          },
        } as Record<string, unknown>)
      : null;

  const borderColor = isFailed ? c.danger : isReady ? c.success : c.accent;
  const zoneBg = isFailed
    ? c.danger + '12'
    : isReady
      ? c.success + '12'
      : isDragging
        ? c.accent + '22'
        : c.accentTint;

  const a11yLabel =
    state.status === 'reading'
      ? `Reading ${state.fileName}`
      : state.status === 'uploading'
        ? `Uploading ${state.fileName}, ${state.pct}%`
        : state.status === 'ready'
          ? `${state.fileName} ready. Tap to replace`
          : state.status === 'failed'
            ? `${state.reason}. Tap to try again`
            : 'Tap or drop a lesson file to upload';

  return (
    <View
      {...(webProps ?? {})}
      style={[
        styles.outerCard,
        {
          backgroundColor: c.card,
          borderColor: c.hairline,
        },
      ]}
    >
      <Pressable
        disabled={busy}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityState={{ disabled: busy, busy }}
        style={({ pressed, hovered }) => [
          styles.dropZone,
          compact && styles.dropZoneCompact,
          {
            backgroundColor: zoneBg,
            borderColor,
            opacity: busy ? 0.92 : pressed ? 0.9 : 1,
            transform: [{ scale: pressed && !busy ? 0.99 : 1 }],
          },
          hovered && !busy && !isDragging && { borderColor: c.accent },
        ]}
      >
        {state.status === 'reading' ? (
          <View style={styles.stateWrap}>
            <Text variant="headline" color="accent" align="center" numberOfLines={1}>
              Reading {state.fileName}…
            </Text>
            <Skeleton height={10} r={5} style={styles.progressBar} />
            <Text variant="caption" color="textSecondary" align="center">
              Extracting lesson text
            </Text>
          </View>
        ) : state.status === 'uploading' ? (
          <View style={styles.stateWrap}>
            <Text variant="headline" color="accent" align="center" numberOfLines={1}>
              Uploading {state.fileName}…
            </Text>
            <View style={styles.progressBar}>
              <ProgressBar progress={state.pct / 100} color={c.accent} height={8} />
            </View>
            <Text variant="caption" color="textSecondary" align="center" tabular>
              {Math.round(state.pct)}% · Saving original privately
            </Text>
          </View>
        ) : state.status === 'ready' ? (
          <View style={styles.stateWrap}>
            <View style={[styles.iconDisc, { backgroundColor: c.success + '1F' }]}>
              <CheckCircle size={28} weight="fill" color={c.success} />
            </View>
            <Text variant="headline" color="text" align="center" numberOfLines={1}>
              {state.fileName}
            </Text>
            <Text variant="caption" color="textSecondary" align="center">
              {state.charCount > 0
                ? `${state.charCount.toLocaleString('en-US')} characters ready${state.note ? ` · ${state.note}` : ''}`
                : (state.note ?? 'Original uploaded')}
            </Text>
            <Text variant="caption" color="accent" style={fontFor(600)} align="center">
              Tap to replace
            </Text>
          </View>
        ) : state.status === 'failed' ? (
          <View style={styles.stateWrap}>
            <View style={[styles.iconDisc, { backgroundColor: c.danger + '1F' }]}>
              <WarningCircle size={28} weight="fill" color={c.danger} />
            </View>
            <Text variant="headline" color="danger" align="center">
              {state.reason}
            </Text>
            <Text variant="caption" color="accent" style={fontFor(600)} align="center">
              Tap to try again
            </Text>
          </View>
        ) : (
          <View style={styles.stateWrap}>
            <View style={[styles.iconDisc, { backgroundColor: c.card }]}>
              <FileArrowUp size={28} weight="fill" color={c.accent} />
            </View>
            <Text variant="headline" color="accent" align="center">
              {isDragging ? 'Drop your file to upload' : Platform.OS === 'web' ? 'Drop a lesson file or click to browse' : 'Tap to choose a lesson file'}
            </Text>
            <Text variant="caption" color="textSecondary" align="center">
              PDF, Word (.docx), .txt, .md, .csv or .html · up to 20 MB
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  outerCard: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  dropZone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: radius.inset,
    minHeight: 168,
    paddingHorizontal: 20,
    paddingVertical: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropZoneCompact: {
    minHeight: 148,
    paddingVertical: 18,
  },
  stateWrap: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: 8,
  },
  iconDisc: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  progressBar: {
    width: '100%',
    maxWidth: 260,
  },
});
