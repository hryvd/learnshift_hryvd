import QRCode from 'qrcode';

export const FRIEND_CODE_LENGTH = 6;

const CODE_RE = /^[A-Z0-9]{4,8}$/;
const STRICT_CODE_RE = /^[A-Z0-9]{6}$/;

/** Normalizes user or scanned input to an uppercase alphanumeric friend code. */
export function normalizeFriendCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Compact deep-link payload encoded in every Kapuluan friend QR code.
 * 32 chars for a 6-char code — fits cleanly in a Version 4 ECC-H matrix
 * so cameras scan fast even from across a desk with a centered Paty badge.
 */
export function buildFriendQrPayload(code: string): string {
  const clean = normalizeFriendCode(code);
  return `learnshift://friends?code=${clean}`;
}

/** Shareable text message that includes both the 6-char code and deep link. */
export function buildFriendShareMessage(code: string, name?: string | null): string {
  const clean = normalizeFriendCode(code);
  const who = name?.trim() ? `${name.trim()} invited you` : 'Add me';
  return `${who} on LearnShift Kapuluan!\nFriend code: ${clean}\n${buildFriendQrPayload(clean)}`;
}

/** Site students open from a class invite QR (the student app's web build). */
export const STUDENT_SITE = 'https://learnshift.expo.app';

/** The link a class QR encodes: opens the join page with the code filled in. */
export function buildClassJoinUrl(code: string): string {
  return `${STUDENT_SITE}/join/${normalizeFriendCode(code)}`;
}

/** Invite text a teacher can paste into a group chat. */
export function buildClassInviteMessage(code: string, className?: string | null): string {
  const clean = normalizeFriendCode(code);
  const cls = className?.trim() ? ` ${className.trim()}` : ' our class';
  return `Join${cls} on LearnShift!
Class code: ${clean}
Open: ${buildClassJoinUrl(clean)}
Or in the app: Profile › Join a class.`;
}

/** A class code from a scanned class invite (`…/join/CODE` or `learnshift://join?code=`), else null. */
export function parseClassCodeFromScan(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    const host = u.hostname.toLowerCase();
    const ours =
      u.protocol === 'learnshift:' ||
      ((u.protocol === 'https:' || u.protocol === 'http:') &&
        (host === 'learnshift.expo.app' || /^learnshift--[a-z0-9-]+\.expo\.app$/.test(host)));
    if (!ours) return null;
    const segs = `${host}${u.pathname}`.split('/').filter(Boolean);
    const i = segs.findIndex((s) => s.toLowerCase() === 'join');
    if (i < 0) return null;
    const code = normalizeFriendCode(u.searchParams.get('code') ?? segs[i + 1] ?? '');
    return STRICT_CODE_RE.test(code) ? code : null;
  } catch {
    return null;
  }
}

/**
 * Extracts a valid LearnShift friend code from any scanned QR payload:
 * - `learnshift://friends?code=AM4GAU`
 * - `https://learnshift.expo.app/friends?code=AM4GAU`
 * - `LS:AM4GAU` or `LEARNSHIFT:AM4GAU`
 * - Plain 6-character code (`AM4GAU` or `AM4-GAU` / `AM4 GAU`)
 *
 * Rejects unrelated URLs (e.g. youtube.com) so random QR codes never trigger false adds.
 */
export function parseFriendCodeFromScan(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 1. URL / deep link form
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const scheme = parsed.protocol.toLowerCase();
      const host = parsed.hostname.toLowerCase();
      const isLearnShiftScheme = scheme === 'learnshift:';
      const isLearnShiftWeb =
        (scheme === 'https:' || scheme === 'http:') &&
        (host === 'learnshift.expo.app' || host.endsWith('.learnshift.app') || host === 'learnshift.app');

      if (!isLearnShiftScheme && !isLearnShiftWeb) return null;

      // Class invites (…/join/CODE) are not friend codes.
      if (/(^|\/)join(\/|$)/i.test(`${parsed.hostname}${parsed.pathname}`)) return null;
      const param = parsed.searchParams.get('code') ?? parsed.searchParams.get('friendCode');
      if (param) {
        const clean = normalizeFriendCode(param);
        return CODE_RE.test(clean) ? clean : null;
      }

      // Also support learnshift://friends/AM4GAU
      const segments = parsed.pathname
        .split('/')
        .map((s) => s.trim())
        .filter(Boolean);
      const last = segments[segments.length - 1];
      if (last && last.toLowerCase() !== 'friends') {
        const clean = normalizeFriendCode(last);
        return STRICT_CODE_RE.test(clean) ? clean : null;
      }
      return null;
    } catch {
      return null;
    }
  }

  // 2. Compact prefix form (LS:AM4GAU or LEARNSHIFT:AM4GAU)
  const prefixMatch = trimmed.match(/^(?:LS|LEARNSHIFT)\s*[:#-]\s*([A-Z0-9\s-]{4,10})$/i);
  if (prefixMatch) {
    const clean = normalizeFriendCode(prefixMatch[1]);
    return CODE_RE.test(clean) ? clean : null;
  }

  // 3. Plain 6-character friend code (allow optional single space or hyphen separator)
  if (/^[A-Z0-9]{3}[\s-]?[A-Z0-9]{3}$/i.test(trimmed)) {
    const clean = normalizeFriendCode(trimmed);
    return STRICT_CODE_RE.test(clean) ? clean : null;
  }

  return null;
}

export type QrMatrix = {
  size: number;
  version: number;
  /** Row-major boolean grid (`size * size`). */
  cells: readonly boolean[];
};

/**
 * Generates an ISO/IEC 18004 QR matrix at Error Correction Level H (30% recovery)
 * so stylized rounded modules + a tiny centered Paty medallion scan reliably.
 */
export function generateQrMatrix(payload: string): QrMatrix {
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'H' });
  const size = qr.modules.size;
  const cells: boolean[] = new Array(size * size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      cells[r * size + c] = Boolean(qr.modules.get(r, c));
    }
  }
  return { size, version: qr.version, cells };
}
