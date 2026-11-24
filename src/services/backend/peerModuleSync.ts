/**
 * Direct teacher-phone-to-student-phone module delivery.
 *
 * Full generated flashcards and quiz questions are persisted locally on the teacher's
 * phone (`AsyncStorage`) and hosted directly via:
 *   1. Android's embedded local Wi-Fi / hotspot HTTP server (`PeerModuleServer`), and
 *   2. Ephemeral Supabase Realtime P2P broadcasts (`ls-p2p:<classId>`) so students can
 *      seamlessly download modules directly from the teacher's phone without bloating
 *      cloud object storage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';
import type { ClassModule } from '@/services/ai/moduleGenerator';
import { stopPeerModuleServer, syncPeerModules } from '@/services/monitor';
import { useAppStore } from '@/store/useAppStore';

const TEACHER_LOCAL_MODULES_KEY = 'learnshift:teacher-local-modules:v1';

export type PeerModulesByClass = Record<string, ClassModule[]>;

let latestLanUrl = '';

export function getPeerLanBaseUrl(): string {
  return latestLanUrl;
}

export async function loadTeacherLocalModules(): Promise<PeerModulesByClass> {
  try {
    const raw = await AsyncStorage.getItem(TEACHER_LOCAL_MODULES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PeerModulesByClass;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function persistTeacherLocalModules(map: PeerModulesByClass): Promise<string> {
  await AsyncStorage.setItem(TEACHER_LOCAL_MODULES_KEY, JSON.stringify(map)).catch(() => {});
  latestLanUrl = syncPeerModules(JSON.stringify(map));
  return latestLanUrl;
}

export async function broadcastClassModules(classId: string, modules: ClassModule[], lanBaseUrl?: string): Promise<void> {
  const ch = supabase.channel(`ls-p2p:${classId}`, { config: { broadcast: { self: false } } });
  try {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1600);
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    await ch.send({
      type: 'broadcast',
      event: 'module_pack',
      payload: { classId, lanBaseUrl: lanBaseUrl ?? latestLanUrl, modules },
    });
  } catch {
    // Offline or realtime temporarily unavailable; LAN server and local cache retain the pack.
  } finally {
    supabase.removeChannel(ch);
  }
}

export function startTeacherPeerHost(classIds: string[], getModulesForClass: (classId: string) => ClassModule[]): () => void {
  const uniqueIds = Array.from(new Set(classIds.filter(Boolean)));
  if (uniqueIds.length === 0) return () => {};

  const initialMap: PeerModulesByClass = {};
  for (const cid of uniqueIds) initialMap[cid] = getModulesForClass(cid);
  latestLanUrl = syncPeerModules(JSON.stringify(initialMap));

  const channels = uniqueIds.map((classId) => {
    const ch = supabase
      .channel(`ls-p2p:${classId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'request_modules' }, async () => {
        const mods = getModulesForClass(classId);
        const snapshot: PeerModulesByClass = {};
        for (const cid of uniqueIds) snapshot[cid] = getModulesForClass(cid);
        const lanBaseUrl = syncPeerModules(JSON.stringify(snapshot));
        latestLanUrl = lanBaseUrl || latestLanUrl;
        await ch
          .send({
            type: 'broadcast',
            event: 'module_pack',
            payload: { classId, lanBaseUrl: latestLanUrl, modules: mods },
          })
          .catch(() => {});
      })
      .subscribe();
    return ch;
  });

  return () => {
    for (const ch of channels) supabase.removeChannel(ch);
  };
}

export function shutdownTeacherPeerHost(): void {
  latestLanUrl = '';
  stopPeerModuleServer();
}

function mergeDownloadedClassModules(classId: string, incoming: ClassModule[]) {
  if (!Array.isArray(incoming) || incoming.length === 0) return;
  const current = useAppStore.getState().classModules;
  const others = current.filter((m) => m.classId !== classId);
  const byId = new Map<string, ClassModule>();
  for (const m of current.filter((x) => x.classId === classId)) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, { ...m, classId });
  const merged = [...byId.values(), ...others].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 40);
  useAppStore.getState().hydrate({ classModules: merged });
}

async function fetchFromTeacherLan(lanBaseUrl: string, classId: string): Promise<ClassModule[] | null> {
  if (!lanBaseUrl) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2400);
  try {
    const res = await fetch(`${lanBaseUrl.replace(/\/+$/, '')}/modules/${encodeURIComponent(classId)}.json`, {
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ClassModule[];
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function startStudentPeerSync(classIds: string[]): () => void {
  const uniqueIds = Array.from(new Set(classIds.filter(Boolean)));
  if (uniqueIds.length === 0) return () => {};

  const channels = uniqueIds.map((classId) => {
    const ch = supabase
      .channel(`ls-p2p:${classId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'module_pack' }, async (msg) => {
        const payload = (msg?.payload ?? {}) as {
          classId?: string;
          lanBaseUrl?: string;
          modules?: ClassModule[];
        };
        if (payload.classId && payload.classId !== classId) return;
        const fromLan = payload.lanBaseUrl ? await fetchFromTeacherLan(payload.lanBaseUrl, classId) : null;
        const resolved = fromLan ?? (Array.isArray(payload.modules) ? payload.modules : []);
        mergeDownloadedClassModules(classId, resolved);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void ch.send({ type: 'broadcast', event: 'request_modules', payload: { classId } }).catch(() => {});
        }
      });
    return ch;
  });

  return () => {
    for (const ch of channels) supabase.removeChannel(ch);
  };
}
