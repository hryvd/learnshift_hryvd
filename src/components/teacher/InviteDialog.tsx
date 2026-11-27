import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';

import { PatyAvatar } from '@/components/mascot/Paty';
import { useFocusTrap } from '@/components/teacher/DesktopOverlay';
import { Pop, Rise } from '@/components/teacher/Motion';
import { Text } from '@/components/ui';
import { Check, Copy, DownloadSimple, Monitor, Moon, X } from '@/components/ui/icons';
import { useReducedMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { DISPLAY_FONT } from '@/design/typography';
import { buildClassInviteMessage, buildClassJoinUrl, generateQrMatrix, type QrMatrix } from '@/lib/qr';
import { useTeacher, type LiveStudent } from '@/services/backend/teacher';

const EMPTY: LiveStudent[] = [];

type Props = { visible: boolean; code: string; className?: string; classId?: string; onClose: () => void };

/** Invite students: a scannable QR, the code, share actions, and a full-screen classroom mode. */
export function InviteDialog(props: Props) {
  if (!props.visible) return null;
  return <Invite {...props} />;
}

function Invite({ code, className, classId, onClose }: Props) {
  const { c } = useTheme();
  const { width, height } = useWindowDimensions();
  const [present, setPresent] = useState(false);
  const [dark, setDark] = useState(false);
  const url = buildClassJoinUrl(code);
  const matrix = useMemo(() => generateQrMatrix(url), [url]);
  const ref = useFocusTrap(true, () => (present ? setPresent(false) : onClose()));
  const roster = useTeacher((s) => (classId ? s.students[classId] : undefined)) ?? EMPTY;
  const joined = useNewJoins(roster);

  if (present) {
    const bg = dark ? '#0D1020' : '#FFFBF5';
    const fg = dark ? '#ECE8E1' : '#1F2328';
    const qr = Math.min(600, width * 0.38, height * 0.66);
    return (
      <Modal visible transparent animationType="fade" onRequestClose={() => setPresent(false)}>
        <View ref={ref} style={[styles.present, { backgroundColor: bg }]} role="dialog" aria-modal aria-label="Join code for the class">
          <View style={styles.presentTop}>
            <Text style={[styles.presentTitle, { color: fg }]}>{className ? `Join ${className}` : 'Join our class'}</Text>
            <View style={styles.row}>
              <IconBtn label={dark ? 'Light screen' : 'Dark screen'} onPress={() => setDark((d) => !d)} fg={fg}>
                <Moon size={18} weight={dark ? 'fill' : 'bold'} color={fg} />
              </IconBtn>
              <IconBtn label="Close full screen (Esc)" onPress={() => setPresent(false)} fg={fg}>
                <X size={18} weight="bold" color={fg} />
              </IconBtn>
            </View>
          </View>
          <View style={styles.presentBody}>
            <QrCard matrix={matrix} size={qr} />
            <View style={styles.presentSide}>
              <Steps fg={fg} />
              <CodeTiles code={code} size={Math.min(104, width * 0.066)} />
              <JoinedTicker count={roster.length} fresh={joined} fg={fg} big />
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.center}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} onPress={onClose} accessibilityLabel="Close" />
        <View
          ref={ref}
          role="dialog"
          aria-modal
          aria-label="Invite students"
          style={[styles.dialog, { backgroundColor: c.card, borderColor: c.hairline }]}
        >
          <View style={styles.head}>
            <View style={styles.flex}>
              <Text variant="overline">Invite students</Text>
              <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
                {className ?? 'Your class'}
              </Text>
            </View>
            <IconBtn label="Close (Esc)" onPress={onClose} fg={c.textSecondary}>
              <X size={18} weight="bold" color={c.textSecondary} />
            </IconBtn>
          </View>

          <View style={styles.body}>
            <Rise delay={40}>
              <QrCard matrix={matrix} size={248} />
            </Rise>
            <View style={styles.side}>
              <Rise delay={100}>
                <Text variant="subhead">Students scan with their phone camera, or type the code in LearnShift › Profile › Join a class.</Text>
              </Rise>
              <CodeTiles code={code} size={46} />
              <Rise delay={420} style={styles.actions}>
                <Action label="Copy code" done="Code copied" onPress={() => Clipboard.setStringAsync(code)} icon="copy" />
                <Action label="Copy link" done="Link copied" onPress={() => Clipboard.setStringAsync(url)} icon="copy" />
                <Action
                  label="Copy invite message"
                  done="Message copied"
                  onPress={() => Clipboard.setStringAsync(buildClassInviteMessage(code, className))}
                  icon="copy"
                />
                {Platform.OS === 'web' ? (
                  <Action label="Download QR" done="Saved" onPress={async () => downloadQr(matrix, code, className)} icon="download" />
                ) : null}
              </Rise>
            </View>
          </View>

          <View style={[styles.foot, { borderTopColor: c.hairline }]}>
            <JoinedTicker count={roster.length} fresh={joined} fg={c.text} />
            <Pressable
              onPress={() => setPresent(true)}
              accessibilityRole="button"
              style={({ hovered, pressed }) => [
                styles.presentBtn,
                { backgroundColor: c.accent, transform: [{ scale: pressed ? 0.97 : 1 }, { translateY: hovered && !pressed ? -1 : 0 }] },
              ]}
            >
              <Monitor size={16} weight="bold" color={c.onAccent} />
              <Text variant="headline" color="onAccent">
                Show on classroom screen
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Names of students who joined while this dialog is open (newest first). */
function useNewJoins(roster: LiveStudent[]) {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  useEffect(() => {
    if (!seen.current) {
      seen.current = new Set(roster.map((s) => s.id));
      return;
    }
    const added = roster.filter((s) => !seen.current!.has(s.id));
    if (!added.length) return;
    added.forEach((s) => seen.current!.add(s.id));
    setFresh((f) => [...added.map((s) => s.name), ...f].slice(0, 5));
  }, [roster]);
  return fresh;
}

function JoinedTicker({ count, fresh, fg, big }: { count: number; fresh: string[]; fg: string; big?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={styles.ticker} accessibilityLiveRegion="polite">
      <View style={[styles.liveDot, { backgroundColor: c.success }]} />
      <Text style={{ color: fg, fontSize: big ? 22 : 14, fontWeight: '700' }}>
        {count} {count === 1 ? 'student' : 'students'} in this class
      </Text>
      {fresh.map((n) => (
        <Pop key={n}>
          <View style={[styles.joinPill, { backgroundColor: c.accentTint }]}>
            <Text style={{ color: c.accent, fontSize: big ? 18 : 12, fontWeight: '700' }}>{n.split(' ')[0]} joined</Text>
          </View>
        </Pop>
      ))}
    </View>
  );
}

function Steps({ fg }: { fg: string }) {
  const steps = ['Open your phone camera', 'Point it at the code', 'Tap the link, then Join'];
  return (
    <View style={styles.steps}>
      {steps.map((s, i) => (
        <Rise key={s} delay={120 + i * 90} style={styles.step}>
          <View style={[styles.stepNum, { borderColor: fg }]}>
            <Text style={{ color: fg, fontWeight: '800', fontSize: 18 }}>{i + 1}</Text>
          </View>
          <Text style={{ color: fg, fontSize: 24, fontWeight: '700' }}>{s}</Text>
        </Rise>
      ))}
    </View>
  );
}

/** One tile per character, popping in one after another. */
function CodeTiles({ code, size }: { code: string; size: number }) {
  const { c } = useTheme();
  return (
    <View style={styles.tiles} accessible accessibilityLabel={`Class code ${code.split('').join(' ')}`}>
      {code.split('').map((ch, i) => (
        <Pop key={`${ch}${i}`} delay={180 + i * 60}>
          <View
            style={[
              styles.tile,
              { width: size, height: size * 1.18, borderRadius: size * 0.22, backgroundColor: c.accentTint, borderColor: c.accent + '55' },
            ]}
          >
            <Text style={{ fontFamily: DISPLAY_FONT, fontSize: size * 0.5, color: c.accent }}>{ch}</Text>
          </View>
        </Pop>
      ))}
    </View>
  );
}

/** The QR, with Paty in the middle (error correction H keeps it scannable) and a one-time scan sweep. */
function QrCard({ matrix, size }: { matrix: QrMatrix; size: number }) {
  const reduced = useReducedMotion();
  const sweep = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    // One sweep on open, like a scanner reading it.
    sweep.set(withDelay(250, withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.cubic) })));
  }, [reduced, sweep]);
  const line = useAnimatedStyle(() => ({
    opacity: sweep.get() > 0 && sweep.get() < 1 ? 0.85 : 0,
    transform: [{ translateY: sweep.get() * (size - 4) }],
  }));
  const quiet = 2;
  const n = matrix.size + quiet * 2;
  const centre = Math.floor(matrix.size * 0.22);
  const lo = Math.floor((matrix.size - centre) / 2);
  return (
    <View style={[styles.qrCard, { width: size + 32, height: size + 32 }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} accessibilityLabel="Class join QR code">
        <Rect x={0} y={0} width={n} height={n} fill="#FFFFFF" />
        {matrix.cells.map((on, i) => {
          if (!on) return null;
          const r = Math.floor(i / matrix.size);
          const col = i % matrix.size;
          if (r >= lo && r < lo + centre && col >= lo && col < lo + centre) return null;
          // Solid, slightly overlapping squares: crisp finder patterns that scan from the back of a room.
          return <Rect key={i} x={col + quiet} y={r + quiet} width={1.02} height={1.02} fill="#1B1410" />;
        })}
      </Svg>
      <View style={[styles.qrBadge, { width: size * 0.2, height: size * 0.2, borderRadius: size * 0.06 }]}>
        <PatyAvatar size={size * 0.15} background="#FDF1E2" />
      </View>
      <Animated.View pointerEvents="none" style={[styles.sweep, { width: size, left: 16, top: 16, pointerEvents: 'none' }, line]} />
    </View>
  );
}

function Action({ label, done, onPress, icon }: { label: string; done: string; onPress: () => Promise<unknown> | void; icon: 'copy' | 'download' }) {
  const { c } = useTheme();
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (!ok) return;
    const t = setTimeout(() => setOk(false), 1800);
    return () => clearTimeout(t);
  }, [ok]);
  return (
    <Pressable
      onPress={async () => {
        await onPress();
        setOk(true);
      }}
      accessibilityRole="button"
      accessibilityLabel={ok ? done : label}
      style={({ hovered, pressed }) => [
        styles.action,
        { borderColor: ok ? c.success : c.hairline, backgroundColor: hovered ? c.inset : 'transparent', transform: [{ scale: pressed ? 0.97 : 1 }] },
      ]}
    >
      {ok ? (
        <Pop>
          <Check size={16} weight="bold" color={c.success} />
        </Pop>
      ) : icon === 'copy' ? (
        <Copy size={16} weight="bold" color={c.textSecondary} />
      ) : (
        <DownloadSimple size={16} weight="bold" color={c.textSecondary} />
      )}
      <Text variant="subhead" color={ok ? 'success' : 'text'}>
        {ok ? done : label}
      </Text>
    </Pressable>
  );
}

function IconBtn({ label, onPress, fg, children }: { label: string; onPress: () => void; fg: string; children: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ hovered }) => [styles.iconBtn, hovered && { backgroundColor: fg + '14' }]}
    >
      {children}
    </Pressable>
  );
}

/** Web: a printable PNG of the QR with the code and class name under it. */
function downloadQr(matrix: QrMatrix, code: string, className?: string) {
  if (typeof document === 'undefined') return;
  const cell = 16;
  const quiet = 4;
  const side = (matrix.size + quiet * 2) * cell;
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side + 150;
  const g = canvas.getContext('2d');
  if (!g) return;
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#1B1410';
  matrix.cells.forEach((on, i) => {
    if (on) g.fillRect(((i % matrix.size) + quiet) * cell, (Math.floor(i / matrix.size) + quiet) * cell, cell, cell);
  });
  g.textAlign = 'center';
  g.fillStyle = '#B5370B';
  g.font = `64px ${DISPLAY_FONT}, Inter, sans-serif`;
  g.fillText(code, side / 2, side + 70);
  g.fillStyle = '#3A2A20';
  g.font = '600 26px Inter, sans-serif';
  g.fillText(className ? `Join ${className} on LearnShift` : 'Join our class on LearnShift', side / 2, side + 120);
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `${(className ?? 'class').replace(/[^\w\- ]+/g, '').trim() || 'class'} join QR.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 760, borderRadius: 24, borderWidth: 1, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 28, paddingTop: 22, paddingBottom: 8 },
  title: { fontFamily: 'Inter_800ExtraBold', fontSize: 24, letterSpacing: -0.5 },
  body: { flexDirection: 'row', gap: 28, paddingHorizontal: 28, paddingVertical: 16, alignItems: 'center', flexWrap: 'wrap' },
  side: { flex: 1, minWidth: 280, gap: 18 },
  tiles: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tile: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, height: 38 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 16, justifyContent: 'space-between', paddingHorizontal: 28, paddingVertical: 16, borderTopWidth: 1, flexWrap: 'wrap' },
  presentBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, paddingHorizontal: 20, borderRadius: 999 },
  ticker: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 1 },
  liveDot: { width: 9, height: 9, borderRadius: 5 },
  joinPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  qrCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 16, shadowColor: '#3A2A20', shadowOpacity: 0.14, shadowRadius: 28, shadowOffset: { width: 0, height: 14 } },
  qrBadge: { position: 'absolute', left: '50%', top: '50%', transform: [{ translateX: '-50%' }, { translateY: '-50%' }], backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  sweep: { position: 'absolute', height: 3, borderRadius: 2, backgroundColor: '#F2A65A', shadowColor: '#F2A65A', shadowOpacity: 0.9, shadowRadius: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  present: { flex: 1, padding: 48, gap: 24 },
  presentTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  presentTitle: { fontFamily: 'Inter_800ExtraBold', fontSize: 40, letterSpacing: -1 },
  presentBody: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 64 },
  presentSide: { gap: 32, maxWidth: 640 },
  steps: { gap: 14 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepNum: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
