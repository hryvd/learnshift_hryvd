import { useTheme } from '@/design/theme';
import type { Palette } from '@/design/tokens';

import { BarTab, CenterPlusButton, FloatingBarShell, type WindowRect } from './FloatingBar';
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
  onMeasureShift?: (rect: WindowRect) => void;
  /** True while the Shift morph card is open and covering the bar. */
  shiftOpen?: boolean;
  /** True while the center button is hidden because the morph card owns it. */
  shiftHidden?: boolean;
  labels?: Partial<Record<TabKey | 'shift', string>>;
  /** Render inline (gallery) instead of floating over the screen. */
  inline?: boolean;
};

/**
 * Floating five-slot bar: four tinted tabs (only the current one shows its name)
 * and the raised Shift button in the middle.
 */
export function TabBar({
  active,
  onTab,
  onShift,
  onMeasureShift,
  shiftOpen,
  shiftHidden,
  labels,
  inline,
}: Props) {
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
    <FloatingBarShell inline={inline} blocked={!!shiftOpen}>
      {TABS.slice(0, 2).map(tab)}
      <CenterPlusButton
        open={!!shiftOpen}
        hidden={!!shiftHidden}
        onPress={onShift}
        onMeasure={onMeasureShift}
        label={labels?.shift ?? 'Shift'}
      />
      {TABS.slice(2).map(tab)}
    </FloatingBarShell>
  );
}
