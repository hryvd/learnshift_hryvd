/**
 * Bilingual EN + FIL profanity & harassment filter (mirrors private.contains_profanity in Postgres).
 * Used on the client for instant, friendly feedback before server validation.
 */

const EXACT_PATTERNS: RegExp[] = [
  /(^|[^a-z])(fuck|fucker|fucking|shit|bitch|asshole|bastard|motherfucker|cunt|slut|whore|faggot|nigger|nigga|retard|kys|putangina|putang\s*ina|tangina|tang\s*ina|gago|gaga|tarantado|tarantada|ulol|bobo|inutil|kupal|punyeta|pakyu|hindot|kantot|pokpok|hayop\s+ka|tanga\s+ka)([^a-z]|$)/i,
];

const COLLAPSED_PATTERN =
  /(putangina|tangina|motherfucker|faggot|nigger|nigga|tarantado|punyeta|kantot|hindot|fuckyou|pakyu)/i;

function normalizeLeet(text: string): string {
  return text
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's');
}

export function checkProfanity(raw: string): { ok: boolean } {
  const clean = normalizeLeet(raw.trim());
  if (!clean) return { ok: true };
  if (EXACT_PATTERNS.some((rx) => rx.test(clean))) return { ok: false };
  const collapsed = clean.replace(/[^a-z]/g, '');
  if (COLLAPSED_PATTERN.test(collapsed)) return { ok: false };
  return { ok: true };
}
