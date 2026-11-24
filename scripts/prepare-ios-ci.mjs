#!/usr/bin/env node
/**
 * CI-only helper executed on GitHub Actions macOS runners before `expo prebuild --platform ios`.
 * Refuses to run outside CI unless `--ci` is explicitly passed so local/Android builds stay untouched.
 */
import fs from 'node:fs';
import path from 'node:path';

const isCI = process.env.GITHUB_ACTIONS === 'true' || process.argv.includes('--ci');
if (!isCI) {
  console.error('Refusing to modify package.json outside CI. Pass --ci inside CI runners.');
  process.exit(1);
}

const rootDir = process.cwd();
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const excludePods = ['@expo/ui', 'expo-glass-effect'];
if (!process.env.APPLE_TEAM_ID) {
  excludePods.push('react-native-device-activity', '@kingstinct/expo-apple-targets');
}

pkg.expo = pkg.expo ?? {};
pkg.expo.autolinking = pkg.expo.autolinking ?? {};

for (const platformKey of ['ios', 'apple']) {
  const current = pkg.expo.autolinking[platformKey] ?? {};
  const mergedExclude = Array.from(new Set([...(current.exclude ?? []), ...excludePods]));
  pkg.expo.autolinking[platformKey] = {
    ...current,
    exclude: mergedExclude,
  };
}

fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log(`Configured iOS CI autolinking exclusions: ${excludePods.join(', ')}`);
