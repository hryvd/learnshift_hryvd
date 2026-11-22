/**
 * Bedtime can start between 6:00 PM and 12:00 AM, in 15-minute steps.
 * Midnight is stored as 0 (minutes after midnight), like every other clock value.
 */
export const BEDTIME_EARLIEST = 18 * 60;
export const BEDTIME_DEFAULT = 22 * 60;
const STEP = 15;

/** 6:00 PM, 6:15 PM, ... 11:45 PM, 12:00 AM. */
export const BEDTIME_STARTS: readonly number[] = [
  ...Array.from({ length: (24 * 60 - BEDTIME_EARLIEST) / STEP }, (_, i) => BEDTIME_EARLIEST + i * STEP),
  0,
];

/** Snaps any saved start (old data, guardian edits, bad input) into the allowed window. */
export function clampBedtimeStart(minutes: number): number {
  if (!Number.isFinite(minutes)) return BEDTIME_DEFAULT;
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  if (m === 0) return 0;
  // Early morning (after midnight) is closest to 12:00 AM; afternoon is closest to 6:00 PM.
  if (m < 12 * 60) return 0;
  if (m < BEDTIME_EARLIEST) return BEDTIME_EARLIEST;
  const snapped = Math.round(m / STEP) * STEP;
  return snapped >= 24 * 60 ? 0 : snapped;
}

/** Index of a start time in `BEDTIME_STARTS` (after clamping). */
export function bedtimeStartIndex(minutes: number): number {
  return Math.max(0, BEDTIME_STARTS.indexOf(clampBedtimeStart(minutes)));
}
