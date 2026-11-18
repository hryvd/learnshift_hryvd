import { requireOptionalNativeModule } from 'expo';

export type LiveSession = { category: 'video' | 'social' | 'games' | 'study' | 'other'; sessionMinutes: number; unlocksLastHour: number };
export type NativeDay = {
  day: string;
  total: number;
  video: number;
  social: number;
  games: number;
  late: number;
  sessions: number;
  unlocks: number;
  offAt: number | null;
};

type UsageMonitorNative = {
  hasUsageAccess(): boolean;
  openUsageAccessSettings(): void;
  hasScrollAccess?(): boolean;
  openScrollSettings?(): void;
  canDrawOverlays(): boolean;
  openOverlaySettings(): void;
  isIgnoringBatteryOptimizations(): boolean;
  openBatterySettings(): void;
  openAppSettings(): void;
  deviceBrand(): string;
  /** Missing on APKs built before this was added. */
  notificationsEnabled?(): boolean;
  openNotificationSettings?(): void;
  configure(json: string): boolean;
  isRunning(): boolean;
  getLive(): Promise<LiveSession | null>;
  getDays(count: number): Promise<NativeDay[]>;
  reportNow(): Promise<boolean>;
  status(): {
    running: boolean;
    queued: number;
    lastReport: number;
    lastNudge: number;
    lastNotifyFailed: number;
    notifications: boolean;
    scrollAccess?: boolean;
    awaitingSwipe?: boolean;
  };
  testNudge(level: 'checkin' | 'break' | 'winddown' | 'lock'): boolean;
  showOverlayNow?(appLabel: string, mode: 'pill' | 'quiz', delayMs: number): boolean;
  launchProtectedApp?(pkg: string, appLabel: string, delaySeconds: number): boolean;
  returnToLastApp?(): boolean;
  lastUsedApp?(): string;
  openHomeSettings?(): void;
  lastConfig(): string;
};

/** Android only; null on iOS, web and Expo Go. */
export const UsageMonitor = requireOptionalNativeModule<UsageMonitorNative>('UsageMonitor');
