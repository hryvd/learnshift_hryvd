# Building the LearnShift iOS `.ipa` on GitHub Actions

This repository includes an isolated GitHub Actions workflow ([build-ipa.yml](../.github/workflows/build-ipa.yml)) and CI-only autolinking helper ([prepare-ios-ci.mjs](../scripts/prepare-ios-ci.mjs)) that build an iOS `.ipa` (`LearnShift.ipa`) cleanly on GitHub's `macos-26` runners without touching local Windows/Android builds.

## Automatic vs. Manual Builds

- **Automatic**: Pushing to `main` (ignoring markdown-only and APK changes) or pushing a `v*` tag runs `Build iOS IPA` automatically.
- **Manual**: Open **Actions -> Build iOS IPA -> Run workflow** on GitHub. You can optionally switch `pitch_mode` or `export_method`.

When complete, download the `LearnShift-ipa` zip from the workflow run's **Artifacts** section and extract `LearnShift.ipa`.

## Packaging Modes

### 1. Unsigned / Sideload-Ready `.ipa` (Default — no Apple Developer account required)
If signing secrets are not set, the workflow builds a Release `iphoneos` binary, ad-hoc signs the bundle (`codesign --force --deep --sign -`), and packages `Payload/LearnShift.app` into `LearnShift.ipa`.

To keep free-Apple-ID sideloading compatible, [prepare-ios-ci.mjs](../scripts/prepare-ios-ci.mjs) runs **only inside CI** to exclude unused native UI modules (`@expo/ui`, `expo-glass-effect`) and, when `APPLE_TEAM_ID` is unset, `react-native-device-activity` + `@kingstinct/expo-apple-targets` (already runtime-guarded in JS and `app.config.js`). Local `package.json` and Android builds remain completely untouched.

You can install the unsigned `.ipa` using **Sideloadly**, **AltStore**, **SideStore**, **Feather**, or **TrollStore**.

### 2. Signed `.ipa` (Optional — with Apple Developer credentials)
To produce an `ad-hoc`, `development`, or `app-store-connect` signed `.ipa` automatically, add these **Repository Secrets** in **Settings -> Secrets and variables -> Actions**:

- `APPLE_TEAM_ID` — 10-character Apple Developer Team ID
- `BUILD_CERTIFICATE_BASE64` — Base64-encoded `.p12` distribution/development certificate
- `P12_PASSWORD` — Password for the `.p12` file
- `BUILD_PROVISION_PROFILE_BASE64` — Base64-encoded `.mobileprovision` profile matching `com.learnshift.app`
- `KEYCHAIN_PASSWORD` *(optional)* — Temporary CI keychain password

## Environment Variables for Supabase
Ensure these **Repository Variables** (or Secrets) are set in **Settings -> Secrets and variables -> Actions**:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_KEY`
