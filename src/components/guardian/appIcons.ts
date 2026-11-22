import type { ImageSourcePropType } from 'react-native';

import type { AppCategory } from '@/services/backend/guardian';

const I = {
  youtube: require('../../../assets/images/apps/youtube.png'),
  tiktok: require('../../../assets/images/apps/tiktok.png'),
  instagram: require('../../../assets/images/apps/instagram.png'),
  facebook: require('../../../assets/images/apps/facebook.png'),
  messenger: require('../../../assets/images/apps/messenger.png'),
  twitter: require('../../../assets/images/apps/twitter.png'),
  threads: require('../../../assets/images/apps/threads.png'),
  discord: require('../../../assets/images/apps/discord.png'),
  snapchat: require('../../../assets/images/apps/snapchat.png'),
  reddit: require('../../../assets/images/apps/reddit.png'),
  pinterest: require('../../../assets/images/apps/pinterest.png'),
  twitch: require('../../../assets/images/apps/twitch.png'),
  whatsapp: require('../../../assets/images/apps/whatsapp.png'),
  telegram: require('../../../assets/images/apps/telegram.png'),
  chrome: require('../../../assets/images/apps/chrome.png'),
  drive: require('../../../assets/images/apps/drive.png'),
  classroom: require('../../../assets/images/apps/classroom.png'),
  playstore: require('../../../assets/images/apps/playstore.png'),
  google: require('../../../assets/images/apps/google.png'),
  mobilelegends: require('../../../assets/images/apps/mobilelegends.png'),
  security: require('../../../assets/images/apps/cat-security.png'),
} satisfies Record<string, ImageSourcePropType>;

type Key = keyof typeof I;

/** Real app logos for the guardian's app list, keyed by Android package. */
const BY_PACKAGE: Record<string, Key> = {
  'com.google.android.youtube': 'youtube',
  'com.google.android.apps.youtube.music': 'youtube',
  'com.zhiliaoapp.musically': 'tiktok',
  'com.ss.android.ugc.trill': 'tiktok',
  'com.zhiliaoapp.musically.go': 'tiktok',
  'com.instagram.android': 'instagram',
  'com.instagram.lite': 'instagram',
  'com.facebook.katana': 'facebook',
  'com.facebook.lite': 'facebook',
  'com.facebook.orca': 'messenger',
  'com.facebook.mlite': 'messenger',
  'com.twitter.android': 'twitter',
  'com.instagram.barcelona': 'threads',
  'com.discord': 'discord',
  'com.snapchat.android': 'snapchat',
  'com.reddit.frontpage': 'reddit',
  'com.pinterest': 'pinterest',
  'tv.twitch.android.app': 'twitch',
  'com.whatsapp': 'whatsapp',
  'org.telegram.messenger': 'telegram',
  'com.android.chrome': 'chrome',
  'com.google.android.apps.docs': 'drive',
  'com.google.android.apps.classroom': 'classroom',
  'com.android.vending': 'playstore',
  'com.google.android.googlequicksearchbox': 'google',
  'com.mobile.legends': 'mobilelegends',
  'com.miui.securitycenter': 'security',
  'com.samsung.android.lool': 'security',
  'com.coloros.safecenter': 'security',
};

const BY_LABEL: Record<string, Key> = {
  youtube: 'youtube',
  'youtube music': 'youtube',
  tiktok: 'tiktok',
  'tiktok lite': 'tiktok',
  instagram: 'instagram',
  facebook: 'facebook',
  'facebook lite': 'facebook',
  messenger: 'messenger',
  twitter: 'twitter',
  x: 'twitter',
  threads: 'threads',
  discord: 'discord',
  snapchat: 'snapchat',
  reddit: 'reddit',
  pinterest: 'pinterest',
  twitch: 'twitch',
  whatsapp: 'whatsapp',
  telegram: 'telegram',
  chrome: 'chrome',
  drive: 'drive',
  'google drive': 'drive',
  classroom: 'classroom',
  'google classroom': 'classroom',
  'google play store': 'playstore',
  'play store': 'playstore',
  google: 'google',
  'mobile legends': 'mobilelegends',
  'mobile legends: bang bang': 'mobilelegends',
  security: 'security',
};

const BY_CATEGORY: Partial<Record<AppCategory, ImageSourcePropType>> = {
  games: require('../../../assets/images/apps/cat-games.png'),
  study: require('../../../assets/images/apps/cat-study.png'),
  other: require('../../../assets/images/apps/cat-other.png'),
};

export function appIcon(
  pkg: string | null | undefined,
  label?: string | null,
  category?: AppCategory | null,
): ImageSourcePropType | null {
  const k = (pkg && BY_PACKAGE[pkg]) || (label ? BY_LABEL[label.trim().toLowerCase()] : undefined);
  if (k) return I[k];
  return category ? (BY_CATEGORY[category] ?? null) : null;
}
