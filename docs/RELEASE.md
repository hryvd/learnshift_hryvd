# LearnShift release status

Main tagline: **Scrolling better minutes.**

## Implemented

- Home, Learn, Settings and the learning feed have larger type, clearer contrast, larger controls and a simpler flow. Demo controls and break frequency stay in Settings.
- The in-app feed fills the viewport, with topic/grade above the question, a right action rail, explanations and a bottom swipe/Next area. Five questions lead to a completion screen. Close remains available throughout. Long content scrolls and reduced-motion preferences are respected.
- The preview timer only arms a break. A later upward swipe or explicit accessible Start action opens it from below. The preview pauses while it is visible and resumes after dismissal.
- Android's cross-app service waits for a later positive scroll-direction event after the interval. The notification shows a countdown and then a ready indicator. Accessibility is opt-in with an in-app disclosure and Android permission screen. Apps that do not expose usable scroll-direction events cannot trigger this path. Metadata is not proof of a physical finger swipe; programmatic scrolling can produce similar events.
- Android overlays occupy the application viewport and request transient audio focus. Focus is released on completion, close, app switch, screen lock, interruption and service destruction. Cooperating media apps pause/resume; this cannot force every app or silent video player to stop. No silent media loop, media-session access or global playback command is used. iOS does not support this Android-style cross-app overlay through the current app; existing Screen Time functionality is separate.
- 500 bundled questions: five subjects, 100 each, ten per grade per subject. See CONTENT.md for language, provisional grade placement and review limitations. Both platforms use the same bank.
- Native authentication/device credentials use Expo SecureStore; the native monitor configuration uses Android Keystore AES-GCM. Old plaintext credentials migrate after successful encryption. Android backup is disabled, native debug output redacts credentials, and reports require HTTPS without redirects. Browser credentials remain in browser storage; local device compromise is outside these protections.
- The scroll detector reads only package/direction metadata; it does not inspect screen text, screenshots, keystrokes or window content. In-app touch coordinates exist transiently for gestures and are not persisted. Signed-in app usage/learning summaries still follow existing backend sync and linked role access. The privacy screen distinguishes these flows.
- A new database migration preserves failed linking attempts instead of rolling them back and serializes concurrent guesses. Signup supports grades 1–10 while preserving old grade 11/12 database records. Grades 1–6 bypass the secondary-school math diagnostic.
- OTA runtime compatibility uses a native fingerprint. The new native service and SecureStore require a fresh development/release binary, not only an OTA JavaScript update.

## Verification performed

- `npm run typecheck`: passed.
- `EXPO_NO_TELEMETRY=1 CI=1 npm run lint -- --no-cache`: passed. The earlier missing-content lint result was a stale cache while the bank was being authored.
- `npm run test:local`: passed. Checks content coverage/structure/Android parity, timer/swipe state transitions, and credential migration/failure behavior with mocked platform storage.
- `npm run test:database`: passed against an isolated PostgreSQL 17 Docker container with every repository migration. Includes grade validation, committed failed attempts, concurrent guess limits, expiry, successful links and class joins, guardian/teacher/stranger RLS and RPC privileges. Supabase auth scaffolding is simulated; no remote project was modified.
- `EXPO_NO_TELEMETRY=1 CI=1 npx --no-install expo export --platform all --max-workers 2`: passed for web, iOS and Android JavaScript/Hermes bundles.
- Headless Chromium at 390×844: completed five questions, changed grade/subject, waited after timer expiry without automatic presentation, opened via an actual upward touch gesture, and dismissed back to the preview with the timer reset. No page runtime errors. Grade 1 and long Grade 10 content inspected visually. Small-screen/reduced-motion rendering also checked as recorded in task results.
- Native `ScrollGateTest.kt` assertions passed on the JVM. Store, Usage, OverlayController, ScrollGate, ScrollService, Reporter, MonitorService and Nudges compiled against Android 15 API classes, AndroidX Core 1.17 and Kotlin 2.1.20. The generated R resource ID was represented by a compile harness. This is an API/type compilation check, not a full Android Gradle build, APK or device test. The Expo module binding and manifest/resource merging still require the actual native build.

## Required before publishing

1. Build signed Android/iOS binaries through the existing EAS workflow. Confirm the configured EAS owner/project belongs to the intended publisher. No signing, store upload, production migration or deployment was performed.
2. On real Android devices, verify opt-in/opt-out, permission revocation, app switches, screen lock, large text, TalkBack, repeated intervals, long content and close/back. Test YouTube/TikTok audio focus with media initially playing and initially paused; record device/app versions. Test Android 15+ foreground-service eligibility. Unsupported media behavior must remain accurately disclosed.
3. Review Accessibility API and special-use foreground-service store declarations, child audience/data-safety disclosures, and privacy policy against the actual data collected. The existing cloud signup flow does not provide verified guardian approval before a child account is created. A release for children needs a product/legal-approved consent and account-provisioning workflow; a local checkbox is not sufficient proof.
4. Have an educator review the original question bank and grade sequencing. Official DepEd pages were blocked by the environment's proxy, so curriculum research/alignment is not verified.
5. Configure the real Supabase URL/public key, apply the new migration to a test project, then run the live backend suite before production. Cloud auth, Gemini tutor, push delivery and real backend integration remain unverified in this environment. SecureStore migration must also be exercised on a previously installed native build.

## Repeating the native gate check

With a Kotlin compiler installed:

```sh
kotlinc modules/usage-monitor/android/src/main/java/expo/modules/usagemonitor/ScrollGate.kt scripts/native/ScrollGateTest.kt -include-runtime -d /tmp/learnshift-gate-test.jar
java -jar /tmp/learnshift-gate-test.jar
```

Use `EXPO_PUBLIC_PITCH=1 EXPO_NO_TELEMETRY=1 npm run web` for the explicit local demo without backend credentials. Production mode still requires the configured account service. Do not present seeded demo usage as real measurements.
