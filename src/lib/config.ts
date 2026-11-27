/**
 * Build flavours:
 *   real (default) — accounts, Supabase, real usage data.
 *   pitch          — EXPO_PUBLIC_PITCH=1: the offline Mika demo with the Demo
 *                    panel, for showing all four scenarios on stage in minutes.
 */
export const IS_PITCH = process.env.EXPO_PUBLIC_PITCH === '1';

/**
 * LearnShift for Teachers: EXPO_PUBLIC_APP=teacher builds the teacher-only
 * desktop app (no role picker, no student or guardian screens, no phone frame).
 */
export const IS_TEACHER_APP = process.env.EXPO_PUBLIC_APP === 'teacher';
export const TEACHER_APP_NAME = 'LearnShift for Teachers';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';

/** Names used in pitch mode copy. */
export const PITCH_NAMES = { student: 'Mika', guardian: 'Mom', section: 'Sampaguita' };

export const HAS_BACKEND_CONFIG = /^https:\/\//.test(SUPABASE_URL) && SUPABASE_KEY.length > 0;
