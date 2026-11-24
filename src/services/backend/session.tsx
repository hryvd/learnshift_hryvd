/**
 * Glue between the signed-in account and the app: keeps the local store on
 * the right user, starts student sync, registers for push, and routes
 * notification taps. Renders nothing.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';

import { IS_PITCH } from '@/lib/config';
import * as api from '@/services/backend/api';
import { resetGuardian } from '@/services/backend/guardian';
import { resetTeacher } from '@/services/backend/teacher';
import { forgetDevice } from '@/services/monitor';
import { useMonitorBridge } from '@/services/monitor/bridge';
import { configureNotifications, registerForPush, routeNotificationTaps } from '@/services/notifications';
import { initialState, useAppStore } from '@/store/useAppStore';
import { refreshProfile, startAuth, useAuth } from '@/store/useAuth';

import { startStudentPeerSync } from './peerModuleSync';
import { startStudentSync } from './sync';

export function SessionEffects() {
  const profile = useAuth((s) => s.profile);
  const storeRole = useAppStore((s) => s.role);
  const classes = useAppStore((s) => s.classes);
  const accountRequests = useAppStore((s) => s.accountRequests);
  const id = profile?.id ?? null;
  const role = profile?.role ?? null;
  const classIdsKey = classes.map((c) => c.id).join(',');
  const signingOutReq = useRef<string | null>(null);
  useMonitorBridge(IS_PITCH ? (storeRole === 'student' ? 'local-student' : null) : role === 'student' ? id : null);

  useEffect(() => {
    if (IS_PITCH) return;
    configureNotifications();
    startAuth();
    return routeNotificationTaps();
  }, []);

  // Keep the store on the signed-in user; a different user starts clean.
  useEffect(() => {
    if (IS_PITCH) return;
    resetTeacher();
    resetGuardian();
    const s = useAppStore.getState();
    if (!id) {
      if (s.userId) s.hydrate({ ...initialState(), lang: s.lang, themePref: s.themePref });
      forgetDevice().catch(() => {});
      return;
    }
    if (s.userId !== id) s.hydrate({ ...initialState(), lang: s.lang, themePref: s.themePref, userId: id });
    const p = useAuth.getState().profile!;
    useAppStore.getState().hydrate({
      role: p.role,
      lang: p.lang,
      studentName: p.role === 'student' ? p.display_name : '',
      ...(p.grade && s.userId !== id ? { learningGrade: Math.max(1, Math.min(10, p.grade)) } : {}),
      // Guardians and teachers finish setup inside their own home screens.
      ...(p.role !== 'student' ? { onboarded: true } : {}),
    });
  }, [id]);

  // Execute guardian-approved sign-out requests automatically.
  useEffect(() => {
    if (IS_PITCH || !id || role !== 'student') return;
    const approvedSignOut = accountRequests.find((r) => r.kind === 'sign_out' && r.status === 'approved');
    if (!approvedSignOut || signingOutReq.current === approvedSignOut.id) return;
    signingOutReq.current = approvedSignOut.id;
    (async () => {
      await api.completeAccountRequest(approvedSignOut.id).catch(() => {});
      await forgetDevice().catch(() => {});
      await api.signOut();
      router.replace('/onboarding');
    })();
  }, [id, role, accountRequests]);

  // Re-verify profile existence on foreground (e.g., if guardian removed the student account).
  useEffect(() => {
    if (IS_PITCH || !id) return;
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') refreshProfile().catch(() => {});
    });
    return () => sub.remove();
  }, [id]);

  useEffect(() => {
    if (IS_PITCH || !id || role !== 'student') return;
    return startStudentSync(id);
  }, [id, role]);

  useEffect(() => {
    if (IS_PITCH || !id || role !== 'student' || !classIdsKey) return;
    return startStudentPeerSync(classIdsKey.split(',').filter(Boolean));
  }, [id, role, classIdsKey]);

  useEffect(() => {
    if (IS_PITCH || !id) return;
    registerForPush();
  }, [id]);

  return null;
}
