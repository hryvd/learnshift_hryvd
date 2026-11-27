import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { useFocusTrap } from '@/components/teacher/DesktopOverlay';
import { Text } from '@/components/ui';

/**
 * Full-screen join code for a classroom projector. Light by default (bright
 * rooms wash out dark screens); the code is selectable and sized to the window.
 */
export function ProjectorDialog({
  visible,
  code,
  className,
  onClose,
}: {
  visible: boolean;
  code: string;
  className?: string;
  onClose: () => void;
}) {
  if (!visible) return null;
  return <Projector code={code} className={className} onClose={onClose} />;
}

function Projector({ code, className, onClose }: { code: string; className?: string; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const [dark, setDark] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useFocusTrap(true, onClose);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  // Six characters plus spacing must fit the window at any zoom.
  const size = Math.max(48, Math.min(160, (width - 80) / 7.2, height * 0.22));
  const bg = dark ? '#0D1020' : '#FFFFFF';
  const fg = dark ? '#ECE8E1' : '#1F2328';
  const code_ = dark ? '#F2A65A' : '#B5370B';
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View ref={ref} style={[styles.root, { backgroundColor: bg }]} role="dialog" aria-modal aria-label="Class join code">
        <Text variant="title" color={fg} align="center" style={{ fontSize: Math.max(22, size * 0.24) }}>
          {className ? `Join ${className}` : 'Join our class'}
        </Text>
        <Text
          color={code_}
          align="center"
          selectable
          style={[styles.code, { fontSize: size, lineHeight: size * 1.15, letterSpacing: size * 0.12 }]}
          accessibilityLabel={`Join code ${code.split('').join(' ')}`}
        >
          {code}
        </Text>
        <Text variant="title" color={fg} align="center" style={[styles.sub, { fontSize: Math.max(18, size * 0.17) }]}>
          Open LearnShift › Profile › Join a class, then type this code.
        </Text>
        <View style={styles.actions}>
          <Btn label={copied ? 'Copied' : 'Copy code'} fg={fg} onPress={() => Clipboard.setStringAsync(code).then(() => setCopied(true))} />
          <Btn label={dark ? 'Light screen' : 'Dark screen'} fg={fg} onPress={() => setDark((d) => !d)} />
          <Btn label="Close (Esc)" fg={fg} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function Btn({ label, fg, onPress }: { label: string; fg: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ hovered }) => [styles.btn, { borderColor: fg, opacity: hovered ? 0.75 : 1 }]}
    >
      <Text variant="headline" color={fg}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 24 },
  code: { fontFamily: 'Bungee_400Regular' },
  sub: { maxWidth: 900 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 12 },
  btn: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 },
});
