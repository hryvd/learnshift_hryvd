import type { ImageSourcePropType } from 'react-native';

export type MirroredAppId = 'tiktok' | 'instagram' | 'youtube' | 'facebook' | 'mlbb' | 'twitter';

export type MirroredClip = {
  id: string;
  colors: [string, string, string];
  user: string;
  caption: string;
  loopWarning: string;
  sound: string;
  likes: string;
  comments: string;
  shares: string;
};

export type MirroredApp = {
  id: MirroredAppId;
  name: string;
  shortName: string;
  packageName: string;
  icon: ImageSourcePropType;
  brandColor: string;
  feedHeaderLeft: string;
  feedHeaderRight: string;
  badgeText: string;
  category: string;
  clips: MirroredClip[];
};

export const MIRRORED_APPS: MirroredApp[] = [
  {
    id: 'tiktok',
    name: 'TikTok',
    shortName: 'TikTok',
    packageName: 'com.zhiliaoapp.musically',
    icon: require('../../assets/images/apps/tiktok.png'),
    brandColor: '#FF2C55',
    feedHeaderLeft: 'Following',
    feedHeaderRight: 'For You',
    badgeText: 'FYP Autoplay Loop',
    category: 'Short Video',
    clips: [
      {
        id: 'tt-1',
        colors: ['#261428', '#831843', '#4C1D95'],
        user: 'dance.trend.ph',
        caption: 'Wait for the beat drop #fyp #manila #trending',
        loopWarning: "You've seen 38 clips like this",
        sound: 'sped up remix · dance.trend.ph',
        likes: '184K',
        comments: '2,410',
        shares: '8,920',
      },
      {
        id: 'tt-2',
        colors: ['#16243B', '#1E3A8A', '#0F172A'],
        user: 'late.night.memes',
        caption: 'POV: it is 11:45 PM and you said one last video',
        loopWarning: 'Autoplay loop · High dopamine trigger',
        sound: 'original sound · late.night.memes',
        likes: '92.4K',
        comments: '1,180',
        shares: '4,320',
      },
      {
        id: 'tt-3',
        colors: ['#331910', '#9A3412', '#450A0A'],
        user: 'prank.wars.mnl',
        caption: 'Part 14 of hiding snacks from kuya!!',
        loopWarning: 'Fast-skip binge · 19 swipes/min',
        sound: 'oh no remix · prank.wars.mnl',
        likes: '63.1K',
        comments: '890',
        shares: '2,100',
      },
      {
        id: 'tt-4',
        colors: ['#0B2B26', '#065F46', '#042F2E'],
        user: 'infinite.fyp.loop',
        caption: 'Oddly satisfying slime cutting compilation (loop)',
        loopWarning: 'Passive scroll detected · 40 min session',
        sound: 'asmr crisp · infinite.fyp.loop',
        likes: '310K',
        comments: '3,740',
        shares: '12.4K',
      },
    ],
  },
  {
    id: 'instagram',
    name: 'Instagram Reels',
    shortName: 'Reels',
    packageName: 'com.instagram.android',
    icon: require('../../assets/images/apps/instagram.png'),
    brandColor: '#E1306C',
    feedHeaderLeft: 'Reels',
    feedHeaderRight: 'Following',
    badgeText: 'Endless Reels',
    category: 'Social Reels',
    clips: [
      {
        id: 'ig-1',
        colors: ['#3B0764', '#BE185D', '#9D174D'],
        user: 'aesthetic.desk.mnl',
        caption: '10-second desk reset aesthetic (swipe for more)',
        loopWarning: 'Endless Reels scroll · 36 min straight',
        sound: 'lofi sunset · aesthetic.desk.mnl',
        likes: '48.2K',
        comments: '520',
        shares: '1,910',
      },
      {
        id: 'ig-2',
        colors: ['#1E1B4B', '#4338CA', '#312E81'],
        user: 'celeb.tea.ph',
        caption: 'You will NOT believe what happened after the show',
        loopWarning: 'Clickbait loop · Fast skip pattern',
        sound: 'dramatic sting · celeb.tea.ph',
        likes: '71.9K',
        comments: '2,040',
        shares: '5,110',
      },
      {
        id: 'ig-3',
        colors: ['#27272A', '#52525B', '#18181B'],
        user: 'meme.stash.daily',
        caption: 'Relatable school Monday memes part 92',
        loopWarning: 'Autoplay loop · High dopamine trigger',
        sound: 'original audio · meme.stash.daily',
        likes: '115K',
        comments: '1,420',
        shares: '9,800',
      },
      {
        id: 'ig-4',
        colors: ['#143326', '#047857', '#064E3B'],
        user: 'streetfood.metro',
        caption: 'Cheese overload kwek-kwek at 10 PM!!',
        loopWarning: "You've seen 29 clips like this",
        sound: 'sizzle beat · streetfood.metro',
        likes: '39.4K',
        comments: '410',
        shares: '1,230',
      },
    ],
  },
  {
    id: 'youtube',
    name: 'YouTube Shorts',
    shortName: 'Shorts',
    packageName: 'com.google.android.youtube',
    icon: require('../../assets/images/apps/chrome.png'),
    brandColor: '#FF0033',
    feedHeaderLeft: 'Shorts',
    feedHeaderRight: 'Subscriptions',
    badgeText: 'Shorts Auto-Next',
    category: 'Short Video',
    clips: [
      {
        id: 'yt-1',
        colors: ['#450A0A', '#B91C1C', '#7F1D1D'],
        user: 'top10.clips.daily',
        caption: 'Top 5 craziest clutch moments of the week #shorts',
        loopWarning: 'Autoplay Shorts queue · 42 min session',
        sound: 'hype bass · top10.clips.daily',
        likes: '210K',
        comments: '1,920',
        shares: '6,500',
      },
      {
        id: 'yt-2',
        colors: ['#1E293B', '#334155', '#0F172A'],
        user: 'minecraft.parkour.shorts',
        caption: 'Reddit story while jumping impossible blocks #118',
        loopWarning: "You've seen 34 clips like this",
        sound: 'story voice · minecraft.parkour',
        likes: '142K',
        comments: '1,105',
        shares: '3,400',
      },
      {
        id: 'yt-3',
        colors: ['#3B1D0A', '#B45309', '#78350F'],
        user: 'speed.unpacking',
        caption: 'Mystery box unboxing — wait till the end!',
        loopWarning: 'High swipe cadence · 22 swipes/min',
        sound: 'pop beats · speed.unpacking',
        likes: '88.7K',
        comments: '740',
        shares: '1,890',
      },
      {
        id: 'yt-4',
        colors: ['#172554', '#1D4ED8', '#1E3A8A'],
        user: 'catto.reactions',
        caption: 'Cats reacting to cucumbers compilation #77',
        loopWarning: 'Endless Shorts scroll detected',
        sound: 'funny boing · catto.reactions',
        likes: '264K',
        comments: '3,120',
        shares: '14.2K',
      },
    ],
  },
  {
    id: 'facebook',
    name: 'Facebook Reels',
    shortName: 'Facebook',
    packageName: 'com.facebook.katana',
    icon: require('../../assets/images/apps/facebook.png'),
    brandColor: '#1877F2',
    feedHeaderLeft: 'Reels',
    feedHeaderRight: 'Watch',
    badgeText: 'FB Watch Loop',
    category: 'Social Feed',
    clips: [
      {
        id: 'fb-1',
        colors: ['#0C2340', '#1D4ED8', '#1E3A8A'],
        user: 'Pinoy Viral Hub',
        caption: 'Watch until the ending!! Grabe tawa ko dito',
        loopWarning: 'FB Watch autoplay · 39 min session',
        sound: 'viral laugh track · Pinoy Viral Hub',
        likes: '54K',
        comments: '3,210',
        shares: '11K',
      },
      {
        id: 'fb-2',
        colors: ['#1E1B4B', '#5B21B6', '#2E1065'],
        user: 'Barkada Memes PH',
        caption: 'Tag your classmate who always forgets their ballpen',
        loopWarning: "You've scrolled past 45 posts",
        sound: 'background music · Barkada Memes',
        likes: '31K',
        comments: '4,890',
        shares: '7,400',
      },
      {
        id: 'fb-3',
        colors: ['#2C1810', '#9A3412', '#431407'],
        user: 'Kusina Quick Clips',
        caption: '3-ingredient midnight snack hack (loop)',
        loopWarning: 'Passive scroll loop detected',
        sound: 'kitchen beat · Kusina Quick Clips',
        likes: '22K',
        comments: '680',
        shares: '2,950',
      },
      {
        id: 'fb-4',
        colors: ['#0F2922', '#0D9488', '#134E4A'],
        user: 'Dashcam Moments PH',
        caption: 'Unexpected road moments caught on camera',
        loopWarning: 'Autoplay Watch · High fast-skip rate',
        sound: 'original clip · Dashcam Moments',
        likes: '41K',
        comments: '1,940',
        shares: '3,810',
      },
    ],
  },
  {
    id: 'mlbb',
    name: 'Mobile Legends',
    shortName: 'MLBB',
    packageName: 'com.mobile.legends',
    icon: require('../../assets/images/apps/mobilelegends.png'),
    brandColor: '#F59E0B',
    feedHeaderLeft: 'Highlights',
    feedHeaderRight: 'Ranked',
    badgeText: 'Match & Clip Loop',
    category: 'Gaming',
    clips: [
      {
        id: 'ml-1',
        colors: ['#1E1B4B', '#B45309', '#78350F'],
        user: 'savage.fanny.ph',
        caption: '5-man wipeout at 18 minutes!! Epic comeback',
        loopWarning: 'One-more-match loop · 44 min session',
        sound: 'legendary announcer · mlbb.clips',
        likes: '89K',
        comments: '1,540',
        shares: '4,900',
      },
      {
        id: 'ml-2',
        colors: ['#0F172A', '#0369A1', '#1E293B'],
        user: 'skin.showcase.sea',
        caption: 'New Collector skin effects comparison',
        loopWarning: 'Highlight reel loop · High arousal',
        sound: 'battle theme · skin.showcase',
        likes: '51K',
        comments: '920',
        shares: '2,100',
      },
      {
        id: 'ml-3',
        colors: ['#2E1065', '#7E22CE', '#3B0764'],
        user: 'mythic.tips.ph',
        caption: 'Fastest jungler rotation in Season 34',
        loopWarning: '40+ min continuous gaming/clips',
        sound: 'game audio · mythic.tips.ph',
        likes: '36K',
        comments: '610',
        shares: '1,420',
      },
      {
        id: 'ml-4',
        colors: ['#3F1212', '#DC2626', '#450A0A'],
        user: 'lose.streak.club',
        caption: 'Solo queue struggles at 11 PM (part 8)',
        loopWarning: 'Late-night tilt scroll detected',
        sound: 'defeat sound · lose.streak.club',
        likes: '74K',
        comments: '3,110',
        shares: '6,200',
      },
    ],
  },
  {
    id: 'twitter',
    name: 'X / Feed',
    shortName: 'X Feed',
    packageName: 'com.twitter.android',
    icon: require('../../assets/images/apps/twitter.png'),
    brandColor: '#38BDF8',
    feedHeaderLeft: 'For you',
    feedHeaderRight: 'Following',
    badgeText: 'Infinite Thread',
    category: 'Social Feed',
    clips: [
      {
        id: 'tw-1',
        colors: ['#090D16', '#1E293B', '#0F172A'],
        user: 'trending.ph',
        caption: 'Thread: 28 things everybody is arguing about tonight',
        loopWarning: 'Infinite thread scroll · 37 min',
        sound: 'quiet feed · trending.ph',
        likes: '19K',
        comments: '2,410',
        shares: '4,100',
      },
      {
        id: 'tw-2',
        colors: ['#111827', '#1D4ED8', '#0F172A'],
        user: 'stan.updates.mnl',
        caption: 'Live fancam clips from tonight’s concert (1/12)',
        loopWarning: 'Autoplay video thread loop',
        sound: 'crowd audio · stan.updates.mnl',
        likes: '44K',
        comments: '890',
        shares: '6,700',
      },
      {
        id: 'tw-3',
        colors: ['#18181B', '#3F3F46', '#09090B'],
        user: 'hot.takes.daily',
        caption: 'Unpopular opinion thread — read the replies',
        loopWarning: 'Doomscroll outrage loop',
        sound: 'silent thread · hot.takes.daily',
        likes: '12K',
        comments: '3,600',
        shares: '1,900',
      },
      {
        id: 'tw-4',
        colors: ['#0C192C', '#0284C7', '#082F49'],
        user: 'late.night.quotes',
        caption: 'Random 1 AM thoughts while avoiding sleep',
        loopWarning: 'Late scroll · Time to wind down',
        sound: 'silent thread · late.night.quotes',
        likes: '28K',
        comments: '410',
        shares: '5,200',
      },
    ],
  },
];

export function mirroredAppByIdOrPkg(idOrPkg?: string | null): MirroredApp {
  if (!idOrPkg) return MIRRORED_APPS[0];
  return (
    MIRRORED_APPS.find((a) => a.id === idOrPkg || a.packageName === idOrPkg) ??
    MIRRORED_APPS[0]
  );
}

