const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Registers LearnShift as an optional Android Home Launcher candidate so the
 * app can intercept and launch distracting apps under LearnShift Shield.
 */
function withLauncherHome(config) {
  return withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application?.[0];
    const main = app?.activity?.find((a) => a.$?.['android:name'] === '.MainActivity');
    if (main) {
      main['intent-filter'] = main['intent-filter'] ?? [];
      const hasHome = main['intent-filter'].some((f) =>
        (f.category ?? []).some((c) => c.$?.['android:name'] === 'android.intent.category.HOME'),
      );
      if (!hasHome) {
        main['intent-filter'].push({
          action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
          category: [
            { $: { 'android:name': 'android.intent.category.HOME' } },
            { $: { 'android:name': 'android.intent.category.DEFAULT' } },
          ],
        });
      }
    }
    return mod;
  });
}

// Adds iPhone Screen Time only when an Apple Team ID is provided, because
// Apple must approve the Family Controls entitlement before an iPhone can
// install a build that includes it. Android and web are unaffected.
//   APPLE_TEAM_ID=XXXXXXXXXX eas build -p ios --profile development
module.exports = ({ config }) => {
  const teamId = process.env.APPLE_TEAM_ID;
  const pitch = process.env.EXPO_PUBLIC_PITCH === '1';
  const plugins = [...(config.plugins ?? []), withLauncherHome];
  if (teamId) {
    plugins.push(['react-native-device-activity', { appleTeamId: teamId, appGroup: 'group.com.learnshift.app' }]);
  }
  return {
    ...config,
    name: pitch ? 'LearnShift Pitch' : config.name,
    ios: {
      ...config.ios,
      ...(teamId ? { appleTeamId: teamId } : {}),
      bundleIdentifier: pitch ? 'com.learnshift.pitch' : config.ios.bundleIdentifier,
    },
    android: {
      ...config.android,
      package: pitch ? 'com.learnshift.pitch' : config.android.package,
    },
    plugins,
    extra: { ...config.extra, screenTime: !!teamId },
  };
};
