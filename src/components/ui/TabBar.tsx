import { useTheme } from '@/design/theme';
import type { Palette } from '@/design/tokens';

import { BarTab, CenterPlusButton, FloatingBarShell } from './FloatingBar';
import { BookOpen, ChartBar, House, UserCircle, type IconProps } from './icons';

export type TabKey = 'home' | 'learn' | 'insights' | 'profile';

type TabDef = { key: TabKey; label: string; Icon: React.ComponentType<IconProps>; tint: keyof Palette };

const TABS: TabDef[] = [
  { key: 'home', label: 'Home', Icon: House, tint: 'tabHome' },
  { key: 'learn', label: 'Learn', Icon: BookOpen, tint: 'tabLearn' },
  { key: 'insights', label: 'Insights', Icon: ChartBar, tint: 'tabInsights' },
  { key: 'profile', label: 'Profile', Icon: UserCircle, tint: 'tabProfile' },
];

type Props = {
  active: TabKey;
  onTab: (key: TabKey) => void;
  onShift: () => void;
  /** Center button rotated to × while its sheet is open. */
  shiftOpen?: boolean;
  labels?: Partial<Record<TabKey | 'shift', string>>;
  /** Render inline (gallery) instead of floating over the screen. */
  inline?: boolean;
};

/**
 * Floating five-slot bar: four tinted tabs (only the current one shows its name)
 * and the raised Shift button in the middle.
 */
export function TabBar({ active, onTab, onShift, shiftOpen, labels, inline }: Props) {
  const { c } = useTheme();
  const tab = (t: TabDef) => (
    <BarTab
      key={t.key}
      label={labels?.[t.key] ?? t.label}
      Icon={t.Icon}
      tint={c[t.tint] as string}
      active={active === t.key}
      onPress={() => onTab(t.key)}
    />
  );

  return (
    <FloatingBarShell inline={inline}>
      {TABS.slice(0, 2).map(tab)}
      <CenterPlusButton open={!!shiftOpen} onPress={onShift} label={labels?.shift ?? 'Shift'} />
      {TABS.slice(2).map(tab)}
    </FloatingBarShell>
  );
}
