import { router } from 'expo-router';

import { returnToLastApp } from '@/services/monitor';

/**
 * Leaves a finished break or feed and lands on LearnShift Home.
 * The finished screen is removed from the stack, so reopening LearnShift
 * later opens Home instead of the same "break complete" screen.
 */
export function exitToHome() {
  router.dismissTo('/home');
}

/**
 * Goes back to the app the student was using, after first resetting
 * LearnShift to Home (so returning to LearnShift never loops back here).
 * Falls back to Home if there is no app to return to.
 */
export function exitToLastApp() {
  exitToHome();
  returnToLastApp();
}
