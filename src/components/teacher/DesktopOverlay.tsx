import { useEffect, useRef, type ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { X } from '@/components/ui/icons';
import { useTheme } from '@/design/theme';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), [role="button"]:not([aria-disabled="true"])';

/**
 * Web dialog behavior: Esc closes, Tab stays inside, focus starts on the
 * first control (or `[data-autofocus]`) and returns to the opener on close.
 */
export function useFocusTrap(open: boolean, onClose: () => void) {
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const opener = document.activeElement as HTMLElement | null;
    const root = () => ref.current as unknown as HTMLElement | null;
    const items = () => [...(root()?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((n) => n.offsetParent !== null);
    const t = setTimeout(() => {
      const el = root();
      const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? items()[0];
      first?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = items();
      if (!list.length) return;
      const i = list.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && (i <= 0 || i === -1)) {
        e.preventDefault();
        list[list.length - 1].focus();
      } else if (!e.shiftKey && i === list.length - 1) {
        e.preventDefault();
        list[0].focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
      opener?.focus?.();
    };
  }, [open]);
  return ref;
}

type DialogProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
  /** Block closing while work is in flight. */
  locked?: boolean;
};

/** Centered laptop dialog with header, scrolling body and pinned footer. */
export function DesktopDialog({ visible, onClose, title, subtitle, children, footer, maxWidth = 560, locked }: DialogProps) {
  const { c } = useTheme();
  const safeClose = () => {
    if (!locked) onClose();
  };
  const ref = useFocusTrap(visible, safeClose);
  if (!visible) return null;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={safeClose}>
      <View style={styles.center}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} onPress={safeClose} accessibilityLabel="Close" />
        <View
          ref={ref}
          role="dialog"
          aria-modal
          aria-label={title}
          style={[styles.dialog, { maxWidth, backgroundColor: c.card, borderColor: c.hairline }]}
        >
          <Header title={title} subtitle={subtitle} onClose={safeClose} />
          <ScrollView style={styles.flex} contentContainerStyle={styles.body}>
            {children}
          </ScrollView>
          {footer ? <View style={[styles.footer, { borderTopColor: c.hairline }]}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

/** Right-hand inspector that keeps the page in view (laptop detail panels). */
export function RightDrawer({ visible, onClose, title, subtitle, children, footer }: Omit<DialogProps, 'maxWidth' | 'locked'>) {
  const { c } = useTheme();
  const ref = useFocusTrap(visible, onClose);
  if (!visible) return null;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.row}>
        <Pressable style={[styles.flex, { backgroundColor: c.scrim }]} onPress={onClose} accessibilityLabel="Close" />
        <View
          ref={ref}
          role="dialog"
          aria-modal
          aria-label={title}
          style={[styles.drawer, { backgroundColor: c.card, borderLeftColor: c.hairline }]}
        >
          <Header title={title} subtitle={subtitle} onClose={onClose} />
          <ScrollView style={styles.flex} contentContainerStyle={styles.body}>
            {children}
          </ScrollView>
          {footer ? <View style={[styles.footer, { borderTopColor: c.hairline }]}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

function Header({ title, subtitle, onClose }: { title: string; subtitle?: string; onClose: () => void }) {
  const { c } = useTheme();
  return (
    <View style={[styles.header, { borderBottomColor: c.hairline }]}>
      <View style={styles.flex}>
        {subtitle ? <Text variant="overline">{subtitle}</Text> : null}
        <Text variant="title" numberOfLines={2}>
          {title}
        </Text>
      </View>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close (Esc)"
        style={({ hovered }) => [styles.close, hovered && { backgroundColor: c.inset }]}
      >
        <X size={18} weight="bold" color={c.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  row: { flex: 1, flexDirection: 'row' },
  dialog: { width: '100%', maxHeight: '88%', borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  drawer: { width: 400, maxWidth: '92%', height: '100%', borderLeftWidth: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  body: { padding: 20, gap: 14 },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, padding: 16, borderTopWidth: 1 },
  close: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
