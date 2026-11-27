import { requireOptionalNativeModule } from 'expo';

export type LiveSession = {
  category: 'video' | 'social' | 'games' | 'messaging' | 'study' | 'other';
  sessionMinutes: number;
  unlocksLastHour: number;
};
export type NativeDay = {
  day: string;
  total: number;
  video: number;
  social: number;
  games: number;
  study?: number;
  breaks?: number;
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
  pickModuleFile?(): Promise<{ name: string; text: string; error?: string } | null>;
  syncPeerModules?(modulesByClassJson: string): string;
  stopPeerModuleServer?(): void;
  getMirrorStatus?(): {
    workProfileStatus: 'ACTIVE_AND_READY' | 'CAN_PROVISION' | 'BLOCKED_EXISTING_OR_UNSUPPORTED';
    tierAReady: boolean;
    studyGuardEnabled: boolean;
    studyGuardRunning: boolean;
    mirrorAutoEnabled: boolean;
    swipesPerMin: number;
    riskScore: number;
    batteryExempt: boolean;
    lastStrategy: string;
    lastVideoId?: string;
    lastVideoTitle?: string;
    catalogCount?: number;
  };
  provisionMirrorWorkProfile?(): boolean;
  openOemAutostart?(): void;
  requestSmartStudyGuard?(enabled: boolean): Promise<boolean>;
  setMirrorAutoEnabled?(enabled: boolean): boolean;
  triggerMirrorIntervention?(targetPkg: string): string;
  triggerMirrorLearningShift?(targetPkg: string): Promise<{
    tier: string;
    videoId: string;
    title: string;
    creatorName: string;
    platform: string;
    pacingMode: string;
    deepLinkUrl: string;
    badge: string;
  }>;
  openNeutralSeed?(url: string): void;
  openLearningSeedInWorkSpace?(targetPkg: string, url: string, badgeText: string): boolean;
  exportMirrorPilotCsv?(): Promise<string>;
  addListener?(eventName: 'onWakeRefresh', listener: () => void): { remove(): void };
  lastConfig(): string;
};

/** Android only; null on iOS, web and Expo Go. */
export const UsageMonitor = requireOptionalNativeModule<UsageMonitorNative>('UsageMonitor');
