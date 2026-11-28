import { Platform } from 'react-native';

import { IS_PITCH } from '@/lib/config';
import { supabase } from '@/lib/supabase';
import type { ModuleSource } from '@/services/ai/moduleGenerator';
import { pickModuleFile } from '@/services/monitor';
import { useAuth } from '@/store/useAuth';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const ALLOWED_MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  html: 'text/html',
  htm: 'text/html',
};

export function extensionOf(fileName: string): string {
  return fileName.toLowerCase().split('.').pop() ?? '';
}

export function resolveAllowedMime(fileName: string, rawMime?: string | null): string | null {
  const ext = extensionOf(fileName);
  if (ext in ALLOWED_MIME_BY_EXT) return ALLOWED_MIME_BY_EXT[ext];
  if (rawMime && Object.values(ALLOWED_MIME_BY_EXT).includes(rawMime)) return rawMime;
  return null;
}

export function validateSourceFile(fileName: string, sizeBytes: number, rawMime?: string | null): string | null {
  if (sizeBytes > MAX_UPLOAD_BYTES) return 'That file is over 20 MB';
  if (sizeBytes <= 0) return 'That file is empty';
  if (!resolveAllowedMime(fileName, rawMime)) return "We can't read this file type";
  return null;
}

/** Pure-JS SHA-256 fallback when WebCrypto (`crypto.subtle`) is unavailable (e.g. Hermes). */
function sha256Fallback(data: Uint8Array): string {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const bitLen = data.length * 8;
  const paddedLen = Math.ceil((data.length + 9) / 64) * 64;
  const buf = new Uint8Array(paddedLen);
  buf.set(data);
  buf[data.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  const W = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }
  return Array.from(H)
    .map((v) => v.toString(16).padStart(8, '0'))
    .join('');
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', copy.buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return sha256Fallback(bytes);
}

/** Uploads the teacher's original file to private Storage and records its `module_sources` row. */
export async function uploadModuleSource(input: {
  bytes: Uint8Array;
  fileName: string;
  mime: string;
  extractedText: string;
  onProgress?: (pct: number) => void;
}): Promise<ModuleSource> {
  const err = validateSourceFile(input.fileName, input.bytes.byteLength, input.mime);
  if (err) throw new Error(err);

  input.onProgress?.(15);
  const sha256 = await sha256Hex(input.bytes);
  input.onProgress?.(35);

  if (IS_PITCH) {
    input.onProgress?.(100);
    return {
      id: `src-pitch-${Date.now().toString(36)}`,
      storagePath: `pitch/${input.fileName}`,
      fileName: input.fileName,
      mime: input.mime,
      sizeBytes: input.bytes.byteLength,
      sha256,
      extractedText: input.extractedText.slice(0, 200000),
      createdAt: new Date().toISOString(),
    };
  }

  const teacherId = useAuth.getState().profile?.id;
  if (!teacherId) throw new Error('Sign in as a teacher first.');

  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'module.txt';
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const storagePath = `${teacherId}/${unique}-${safeName}`;

  input.onProgress?.(55);
  const { error: upErr } = await supabase.storage.from('module-sources').upload(storagePath, input.bytes, {
    contentType: input.mime,
    upsert: false,
  });
  if (upErr) throw new Error('Upload stopped, tap to try again');

  input.onProgress?.(85);
  const { data, error: rowErr } = await supabase
    .from('module_sources')
    .insert({
      storage_path: storagePath,
      file_name: input.fileName.slice(0, 255),
      mime: input.mime,
      size_bytes: input.bytes.byteLength,
      sha256,
      extracted_text: input.extractedText.slice(0, 200000),
    })
    .select('id, storage_path, file_name, mime, size_bytes, sha256, extracted_text, created_at')
    .single();
  if (rowErr || !data) {
    await supabase.storage.from('module-sources').remove([storagePath]).catch(() => {});
    throw new Error('Upload stopped, tap to try again');
  }

  input.onProgress?.(100);
  return {
    id: data.id,
    storagePath: data.storage_path,
    fileName: data.file_name,
    mime: data.mime,
    sizeBytes: data.size_bytes,
    sha256: data.sha256,
    extractedText: data.extracted_text ?? '',
    createdAt: data.created_at,
  };
}

export type NativePickedFile =
  | {
      cancelled: true;
    }
  | {
      cancelled: false;
      error: string;
    }
  | {
      cancelled: false;
      fileName: string;
      mime: string;
      bytes: Uint8Array;
      text: string;
      note: string | null;
      needsManualText?: boolean;
    };

/**
 * Picks a document on iOS/Android using `expo-document-picker` + `expo-file-system`
 * (keeping the original bytes for Storage). Falls back cleanly to `UsageMonitor.pickModuleFile`
 * on older APKs that don't include the native picker yet.
 */
export async function pickNativeLessonFile(): Promise<NativePickedFile> {
  if (Platform.OS === 'web') return { cancelled: true };

  let picker: typeof import('expo-document-picker') | null = null;
  let fsMod: typeof import('expo-file-system') | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    picker = require('expo-document-picker') as typeof import('expo-document-picker');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    fsMod = require('expo-file-system') as typeof import('expo-file-system');
  } catch {
    picker = null;
    fsMod = null;
  }

  if (picker?.getDocumentAsync && fsMod) {
    try {
      const res = await picker.getDocumentAsync({
        type: Object.values(ALLOWED_MIME_BY_EXT),
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return { cancelled: true };
      const asset = res.assets[0];
      const fileName = asset.name || 'lesson.txt';
      const size = asset.size ?? 0;
      const mime = resolveAllowedMime(fileName, asset.mimeType);
      if (size > MAX_UPLOAD_BYTES) return { cancelled: false, error: 'That file is over 20 MB' };
      if (!mime) return { cancelled: false, error: "We can't read this file type" };

      const fileObj = new fsMod.File(asset.uri);
      const bytes = await fileObj.bytes();
      if (bytes.byteLength > MAX_UPLOAD_BYTES) return { cancelled: false, error: 'That file is over 20 MB' };
      if (bytes.byteLength === 0) return { cancelled: false, error: 'That file is empty' };

      const ext = extensionOf(fileName);
      if (ext === 'pdf' || ext === 'docx') {
        return {
          cancelled: false,
          fileName,
          mime,
          bytes,
          text: '',
          note: 'Text from PDF/Word is extracted on the laptop app. Paste notes here, or open this on a laptop.',
          needsManualText: true,
        };
      }

      const text = await fileObj.text();
      if (text.trim().length === 0) return { cancelled: false, error: 'That file has no readable text.' };
      return { cancelled: false, fileName, mime, bytes, text, note: null };
    } catch {
      // Fall through to legacy Android picker if native module isn't linked in an older APK.
    }
  }

  // Fallback for older APKs without expo-document-picker.
  const legacy = await pickModuleFile();
  if (!legacy) return { cancelled: true };
  if (legacy.error) return { cancelled: false, error: legacy.error };
  const mime = resolveAllowedMime(legacy.name) ?? 'text/plain';
  const bytes = new TextEncoder().encode(legacy.text);
  const valErr = validateSourceFile(legacy.name, bytes.byteLength, mime);
  if (valErr) return { cancelled: false, error: valErr };
  return { cancelled: false, fileName: legacy.name, mime, bytes, text: legacy.text, note: null };
}
