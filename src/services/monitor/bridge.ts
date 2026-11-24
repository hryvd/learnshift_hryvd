/**
 * Keeps the native monitor in step with the app (bedtime, lock, root skill,
 * language) and brings the phone's live usage into the app for Home's gauge.
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import type { LiveSession, NativeDay } from '../../../modules/usage-monitor';
import { UsageMonitor } from '../../../modules/usage-monitor';
import { gapEngine } from '@/services/ai/gapEngine';
import { onPulled, pullStudent } from '@/services/backend/sync';
import { refreshProfile } from '@/store/useAuth';
import { todayKey, useAppStore } from '@/store/useAppStore';
import { useSession } from '@/store/useSession';

import { configure, getDays, getLive, platform, reportNow, status, stopMonitoring, type MonitorStatus } from './index';

type DeviceState = {
  status: MonitorStatus;
  live: LiveSession | null;
  today: NativeDay | null;
  refresh: () => Promise<void>;
};

export const useDevice = create<DeviceState>()((set) => ({
  status: status(),
  live: null,
  today: null,
  refresh: async () => {
    const s = status();
    const [live, days] = await Promise.all([
      s.access ? getLive() : Promise.resolve(null),
      s.access ? getDays(7) : platform === 'android' ? getDays(1) : Promise.resolve([]),
    ]);
    const today = todayKey();
    set({ status: s, live, today: days.find((d) => d.day === today) ?? days[0] ?? null });
    // Fold the phone's own totals and native breaks into synced usage right away.
    if (days.length > 0) {
      const app = useAppStore.getState();
      const usage = [...app.usage];
      let breaksIncreased = false;
      for (const t of days) {
        const i = usage.findIndex((u) => u.day === t.day);
        const prev = i >= 0 ? usage[i] : null;
        const localDayBreaks = t.day === today && app.breaksDay === today ? app.breaksToday : 0;
        const prevBreaks = Math.max(prev?.breaks ?? 0, localDayBreaks);
        const nextBreaks = Math.max(prevBreaks, t.breaks ?? 0);
        if (t.day === today && nextBreaks > prevBreaks) breaksIncreased = true;
        const row = {
          day: t.day,
          total: t.total,
          video: t.video,
          social: t.social,
          games: t.games,
          late: t.late,
          offAt: t.offAt,
          sessions: t.sessions,
          unlocks: t.unlocks,
          breaks: nextBreaks,
          learning: Math.max(prev?.learning ?? 0, t.study ?? 0),
        };
        if (i >= 0) usage[i] = row;
        else usage.push(row);
      }
      const todayRow = usage.find((u) => u.day === today);
      const mergedTodayBreaks = Math.max(todayRow?.breaks ?? 0, app.breaksDay === today ? app.breaksToday : 0);
      app.hydrate({
        usage,
        breaksToday: mergedTodayBreaks,
        breaksDay: today,
        ...(breaksIncreased ? { dirty: { ...app.dirty, usageToday: true, progress: true } } : {}),
      });
    }
  },
}));

/** Mount once for a signed-in student. */
export function useMonitorBridge(userId: string | null) {
  const s = useAppStore();
  const focusUntil = useSession((x) => x.focusUntil);
  const root = gapEngine.rootGap(s.mastery);
  const overlayIntervalSec = s.sentinel?.overlayIntervalSec ?? 15;
  const monitorAllApps = s.sentinel?.monitorAllApps ?? false;

  // Push config whenever something the monitor needs changes.
  useEffect(() => {
    if (platform === 'none') return;
    if (!userId) { stopMonitoring(); return; }
    configure({
      userId,
      enabled: true,
      lang: s.lang,
      bedtimeStart: s.bedtime.start,
      bedtimeEnd: s.bedtime.end,
      bedtimeDays: s.bedtimeDays,
      lockEnabled: s.guardian.lockEnabled,
      lockNow: s.guardian.lockNow,
      lockStart: s.lock.start,
      lockEnd: s.lock.end,
      unlockUntil: s.lock.unlockUntil ? Date.parse(s.lock.unlockUntil) : 0,
      paused: s.paused,
      focusUntil: focusUntil ?? 0,
      rootSkill: root,
      guardianName: s.guardian.name,
      scrollLimit: s.guardian.linked ? s.limits.scroll : null,
      gamesLimit: s.guardian.linked ? s.limits.games : null,
      parentBreakIntervalSec: s.guardian.linked ? s.limits.breakIntervalSec : null,
      overlayIntervalSec,
      monitorAllApps,
      grade: s.learningGrade,
      subject: s.learningSubject,
    })
      .then(() => useDevice.getState().refresh())
      .catch(() => {});
  }, [
    userId,
    s.lang,
    s.bedtime.start,
    s.bedtime.end,
    s.bedtimeDays,
    s.guardian.lockEnabled,
    s.guardian.lockNow,
    s.guardian.name,
    s.guardian.linked,
    s.lock.start,
    s.lock.end,
    s.lock.unlockUntil,
    s.paused,
    s.limits.scroll,
    s.limits.games,
    s.limits.breakIntervalSec,
    focusUntil,
    root,
    overlayIntervalSec,
    monitorAllApps,
    s.learningGrade,
    s.learningSubject,
  ]);

  // Live usage while the app is open; re-push config + report + re-sync when returning to front or waking the phone.
  useEffect(() => {
    if (!userId || platform === 'none') return;
    const { refresh } = useDevice.getState();
    const pushConfigAndRefresh = (withSync: boolean) => {
      const cur = useAppStore.getState();
      const curFocus = useSession.getState().focusUntil;
      const curRoot = gapEngine.rootGap(cur.mastery);
      configure({
        userId,
        enabled: true,
        lang: cur.lang,
        bedtimeStart: cur.bedtime.start,
        bedtimeEnd: cur.bedtime.end,
        bedtimeDays: cur.bedtimeDays,
        lockEnabled: cur.guardian.lockEnabled,
        lockNow: cur.guardian.lockNow,
        lockStart: cur.lock.start,
        lockEnd: cur.lock.end,
        unlockUntil: cur.lock.unlockUntil ? Date.parse(cur.lock.unlockUntil) : 0,
        paused: cur.paused,
        focusUntil: curFocus ?? 0,
        rootSkill: curRoot,
        guardianName: cur.guardian.name,
        scrollLimit: cur.guardian.linked ? cur.limits.scroll : null,
        gamesLimit: cur.guardian.linked ? cur.limits.games : null,
        parentBreakIntervalSec: cur.guardian.linked ? cur.limits.breakIntervalSec : null,
        overlayIntervalSec: cur.sentinel?.overlayIntervalSec ?? 15,
        monitorAllApps: cur.sentinel?.monitorAllApps ?? false,
        grade: cur.learningGrade,
        subject: cur.learningSubject,
      })
        .then(() => refresh())
        .catch(() => {});
      if (withSync) {
        reportNow().then(() => {
          pullStudent(userId).catch(() => {});
          refreshProfile().catch(() => {});
        });
      }
    };

    refresh();
    const id = setInterval(refresh, 30_000);
    const pulled = onPulled(() => pushConfigAndRefresh(false));
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      pushConfigAndRefresh(true);
    });
    const wakeSub = UsageMonitor?.addListener?.('onWakeRefresh', () => {
      pushConfigAndRefresh(true);
    });
    return () => {
      clearInterval(id);
      pulled();
      sub.remove();
      wakeSub?.remove();
    };
  }, [userId]);
}
