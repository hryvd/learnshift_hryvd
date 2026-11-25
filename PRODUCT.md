# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

- **Primary user — Student (Grades 1–12; core DepEd secondary track Grades 7–12):** Filipino students who lose study focus to short-form video, social feeds, and mobile games. They take 45-second learning breaks, practice quizzes, build their personal Isla, and now study together in small friend groups ("barkada" pacts) inside **Kapuluan**.
- **Guardian (Parent / Carer):** Links via 6-digit student code under RA 10173 consent. Monitors screen-time habits, nudges, and app usage; sets bedtime/lock/limits and toggles social & chat permissions. Never sees numeric quiz grades, answers, or chat message contents.
- **Teacher:** Creates class sections with join codes, publishes AI-assisted lesson modules, monitors root-gap mastery heatmaps, and reviews low-confidence tutor explanations. Never sees student screen time or private chats.

## Product Purpose

LearnShift turns passive entertainment scrolling into brief, high-leverage learning moments without shame or punitive countdowns. With **Kapuluan**, a student's solo Isla expands into a shared Filipino archipelago where up to 5 friends form named streak pacts ("barkada"), keep daily bridges (**Tulay**) alive together, cheer each other with paddles (**Sagwan**), unlock shared landmarks, and chat safely.

## Positioning

- **Gentle accountability over streak anxiety:** Study momentum (**Agos**) blends effort (breaks and questions completed), accuracy, and personal improvement over a 7-day rolling window—never accuracy alone. Falling behind triggers reversible visual drift (**Anod**: fog, choppy water, stretching bridge, Paty waving a paddle) rather than losing buildings or hard-failing.
- **Strict three-way privacy wall:** Guardians see habits and social safety toggles; Teachers see curriculum mastery; Friends see only island appearance, tide state, bridge streak, and shared pact chat—never raw grades, mastery percentages, or private app-usage logs.
- **No stores, no pay-to-win:** Coins and group milestones come strictly from healthy study habits and verified effort.

## Operating Context

- **Offline-first student app:** Persisted local Zustand store (`src/store/useAppStore.ts`) with outbox sync (`src/services/backend/sync.ts`) and dedicated offline pitch demo mode (`IS_PITCH` / `EXPO_PUBLIC_PITCH=1`, centered on Mika in Grade 8 Sampaguita).
- **Native mobile + web preview:** Android native foreground monitor & overlay (`modules/usage-monitor`), optional iOS Screen Time (`react-native-device-activity`), and Expo web build (student views inside a 9:16 `PhoneFrame` on desktop; full-width Guardian/Teacher views).
- **Server-authoritative social & scoring:** Supabase Postgres with Row Level Security (`private.is_friend_of`, `private.shares_archipelago`), `SECURITY DEFINER` RPCs with rate limits, Realtime subscriptions, Expo Push via `notify`, and Manila-timezone (`Asia/Manila`) daily streak/tide computation.

## Capabilities and Constraints

- **Confirmed Kapuluan product decisions:**
  - **Pact groups (a):** Each streak pact is a named archipelago ("barkada") capped at **5 islands max**. A student can belong to multiple archipelagos.
  - **Messaging & Guardian control:** Full text chat (plus Paty stickers, quick encouragement phrases, and "study with me" invites) with English + Filipino profanity filtering on client and server, rate limiting, block, and report. Guardians can switch social and/or chat off and see the friend list, **never message contents**.
  - **Drift scoring:** **Agos** combines effort + accuracy + personal improvement over 7 days so hardworking struggling learners do not drift solely for low accuracy, while consistently excelling students pull ahead. Earned buildings are never lost.
  - **Friend discovery safety:** Minor-safe by design—add friends only via 6-character friend codes, QR codes (friend codes shipped immediately; camera QR deferred until next native APK build), or shared class rosters. No public user directory search.
  - **Quiet hours:** Social push notifications respect student bedtime wind-down windows.
- **Technical constraints:** Expo SDK 58, React Native 0.88, React 19 with React Compiler (`eslint` rules enforced), Reanimated 4 (`.get()`/`.set()`), TypeScript strict, SVG-based illustrations (`react-native-svg`) kept smooth on budget Android phones (`alive={false}` on non-focused islands).

## Brand Commitments

- **Identity:** LearnShift, mascot **Paty** (pixel-art Filipino student), **Isla** & **Kapuluan** (isometric SVG Filipino archipelago with day and night palettes).
- **Typography:** `Bungee_400Regular` for display headlines (`weight: 800`), `Poppins_700Bold` for body/UI (`weight: 500/600/700`).
- **Color system:** Dual complete palettes in `src/design/tokens.ts`—Day (`#F6F5F1` canvas, `#C8400F` terracotta accent, `#FFB21E` spark gold) and Night (`#0D1020` night sky, `#F2A65A` warm lantern, `#F5C46B` spark).
- **Bilingual copy:** All student and guardian UI copy lives in `src/i18n/en.ts`, `src/i18n/fil.ts`, and `src/i18n/staff.ts` (English + conversational Filipino); Teacher UI remains English-only.

## Evidence on Hand

- Existing codebase under `src/`, `supabase/`, and `scripts/` including `src/app/(student)/isla.tsx`, `src/components/isla/IslaScene.tsx`, `src/components/isla/IslaBackdrop.tsx`, `src/services/backend/`, `supabase/migrations/`, and `scripts/backend-test.mjs`.
- Local curriculum bank (`src/data/bank/`, `src/data/questions.ts`, `src/data/skills.ts`).

## Product Principles

1. **Effort before perfection:** Consistent showing up and personal growth anchor the archipelago; accuracy rewards excellence without punishing effort.
2. **Never destroy progress:** Drift creates friendly urgency and visual weather, never deleted buildings or punitive resets.
3. **Minor-safe social by default:** Closed friend codes/classmates, bilingual moderation, instant block/report, quiet-hour notification gating, and guardian on/off switches without reading private DMs.
4. **Budget-phone smooth:** Keep off-focus islands static (`alive={false}`) and SVG layers lean so 5-island seas stay responsive on low-end Android devices.
5. **Dual-mode parity:** Every student/social surface works cleanly in Day & Night themes, English & Filipino, and both live Supabase and offline `IS_PITCH` demo builds.

## Accessibility & Inclusion

- Minimum interactive touch targets of 44×44 pt (iOS) / 48×48 dp (Android) with 8+ dp spacing.
- Transparent `Pressable` overlays over interactive SVG islands/buildings with descriptive `accessibilityLabel`s, `accessibilityRole="button"`, and `hitSlop`.
- Respect `useReducedMotion()` across all island, bridge, drift, and celebration animations.
- Minimum 4.5:1 text contrast across both Day and Night themes, including text over sea/sky backdrops and chat bubbles.
