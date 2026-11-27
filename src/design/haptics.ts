import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

function safe(fn: () => Promise<void>) {
  if (!enabled) return;
  try {
    fn().catch(() => {});
  } catch {
    // A missing native method on an older binary must never break the UI.
  }
}

/** Android system haptic with an impact fallback (no VIBRATE permission needed). */
function android(type: Haptics.AndroidHaptics, fallback: () => Promise<void>) {
  safe(() => {
    const perform = Haptics.performAndroidHapticsAsync as typeof Haptics.performAndroidHapticsAsync | undefined;
    return perform ? perform(type).catch(fallback) : fallback();
  });
}

const medium = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
const light = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

/** Thin wrapper so haptics are silent no-ops on web. */
export const haptic = {
  select: () => safe(() => Haptics.selectionAsync()),
  light: () => safe(light),
  medium: () => safe(medium),
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** One pulse the moment a press-and-hold begins. */
  holdStart: () =>
    Platform.OS === 'android' ? android(Haptics.AndroidHaptics.Gesture_Start, medium) : safe(medium),
  /** Switch flip; Android uses the system on/off feel. */
  toggle: (on: boolean) =>
    Platform.OS === 'android'
      ? android(on ? Haptics.AndroidHaptics.Toggle_On : Haptics.AndroidHaptics.Toggle_Off, light)
      : safe(light),
};
