# LearnShift hardened fixes: implementation plan

Scope: **Hardened** (chosen 2026-11-28). Planner: Opus. Implementer: Neon.
Status: **awaiting implementation approval.** Nothing in this plan has been implemented.

Evidence key: **[code]** read in source, **[data]** read-only query on the live DB, **[hyp]** hypothesis needing device confirmation.
No item was reproduced at runtime during planning. Neon must reproduce each bug before fixing it (step 0 of each item).

---

## Decisions made on the owner's behalf

| # | Question | Decision |
|---|---|---|
| D1 | What are "points"? | **Coins** are the one visible reward balance. "Points" are the server-computed **Agos tide points** (effort, accuracy, improvement), which come from the same events. Coin awards become server-authoritative. Agos keeps reading `attempts` and `usage_daily`, so fixing the events fixes both. |
| D2 | Which "black rectangles"? | Every `DarkTile`: Profile (4), plus-button card (8–9), Wind-down (3). They turn **white in Day theme**. Night theme keeps its dark tiles, because the night palette is a deliberate full token set (DECISIONS.md). The teacher's black `#161616` "Review & Create" button is fixed under item 6. The share card, toasts and streak popover stay dark, because they are tooltips or an exported image, not page surfaces. |
| D3 | Mirror timer | It is a trigger: "switch to learning content after N minutes of continuous use in a mirrored app". It sits beside the existing risk trigger: **Smart \| Timer \| Both**, default Smart (today's behavior). When it expires, a learning video plays in the same app and the timer restarts. Details in item 4. |
| D4 | Plus-button card | This reverses the DECISIONS.md line *"The Shift sheet is … under the bar, so the center button stays tappable"*. Update that line. |
| D5 | Quiz pipeline | Draft quizzes are teacher-only. Assigning publishes an **immutable snapshot** to each class. Later edits to the draft never change what students see until the teacher explicitly re-assigns. |
| D6 | Original file | Kept in a **private Storage bucket** and always available to the teacher through a signed URL. It is shared with students only if the teacher turns on "Also share the original" when assigning (default off). |
| D7 | Grade range | The picker shows grades 1–12, matching the DB and sign-up. The question bank covers grades 1–10. For grades 11–12, practice uses the Grade 10 pool and shows a visible note. |
| D8 | Learn-tab subject cards | Tapping a subject on Learn becomes a **session choice**. It no longer silently overwrites the saved Personalization subject (today it does: `learn.tsx:94,109`). |

The `design-reference-library` skill is not installed in this environment. Use the existing tokens in `src/design/tokens.ts`, the `impeccable` and `apple-design` skills for the morph (item 5) and upload card (item 6), and `animate-expo` for Reanimated work.

---

## Approval gates (stop and ask the owner)

These change external systems. Get explicit approval for each one at the time it is needed:
1. `npx supabase db push --remote --yes` (all migrations below hit the **live** project, and `scripts/backend-test.mjs` runs against live).
2. `npx supabase functions deploy …` (`ingest`, and any new function).
3. `npx eas-cli@latest build -p android --profile preview`. This is **one** batched native build for items 4, 6 (document picker) and 8.
4. Any `eas update` or `eas deploy --prod`.

Commit and push on branch `feat/hardened-fixes` are pre-authorized once verified. Opening and merging your own PR is allowed once checks pass.

---

## Implementation order

```
Phase 0  Baseline: branch, run typecheck/lint/test:local/backend-test, save output
Phase 1  DB migrations + backend tests (gate 1)      → unblocks 1, 2, 7, 8(server)
Phase 2  Item 1 Rewards (client)
Phase 3  Item 2 Personalization
Phase 4  Item 3 White tiles → Item 5 Plus morph → Item 6 Upload card
Phase 5  Item 7 Quiz pipeline + Playwright E2E
Phase 6  Native: Item 8 Spotify, Item 4 Mirror, picker → ONE EAS build (gate 3) → device matrix
Phase 7  Docs (DECISIONS.md, CLAUDE.md), PR, report
```

Why this order: server truth first, so the client is built against the real RPCs. Item 3 comes before 5 because the morph card uses the new white tiles. Item 6 comes before 7 because the quiz flow starts from the new card. All Kotlin work is batched into one build, per the owner's stated preference.

Every JS call to a new native function must be optional (`?.()`), because OTA updates reach older APKs.

---

## Item 1: Coins and points

**Roles:** student (earns), guardian and teacher (no change, no access to the ledger).

### Verified current behavior [code]
- Break (`src/app/(student)/break/[id].tsx:362-368`) and quiz (`src/app/(student)/quiz/[skillId].tsx:294-300`) call `addCoins` **only when the 6th flying-coin animation finishes**.
  - `CoinFly` returns `null` until both layout points are measured (`src/components/learn/Effects.tsx:81`), so no award fires if layout doesn't settle.
  - Leaving within about 1.1 s also skips the award.
- Module completion (`src/app/(student)/module/[id].tsx:66-73`) guards with component state `rewarded`. Reopening the module awards +25 **and** `recordBreak(3)` again, inflating Agos effort as well.
- Feed decks (`MicroDeckView.tsx:148` calls the bandit `reward`, not coins) and overlay quizzes (`FullQuizOverlay.tsx`) award nothing.
- Sync pushes the absolute balance (`src/services/backend/sync.ts:341`) and the pull overwrites it when not dirty (`sync.ts:114`). Two devices, or a reinstall racing a pending push, lose coins. There is no idempotency.
- `progress.coins` is client-writable, so the server trusts any value.

### Changes
**DB (new migration `…_reward_ledger.sql`):**
- `public.reward_events`: `id uuid pk`, `student_id uuid fk profiles on delete cascade`, `key text not null`, `kind text check in ('break','quiz','overlay_quiz','deck','focus','module','legacy')`, `amount int check (amount between 0 and 1000)`, `ref text`, `meta jsonb`, `created_at timestamptz default now()` (UTC), `unique(student_id, key)`.
- RLS: a student can select their own rows. No insert, update or delete for `authenticated` (all writes go through the RPC). Grant `service_role` all. Guardian and teacher policies: none.
- `public.claim_reward(p_key text, p_kind text, p_ref text, p_meta jsonb) returns jsonb` (SECURITY DEFINER, `auth.uid()` must be a student):
  - Amount is computed **server-side** by `private.reward_amount(kind, meta)`:

    | kind | amount |
    |---|---|
    | break | 20 |
    | quiz / overlay_quiz | 10 × correct, correct 0–5 |
    | deck | 5 |
    | focus | round(min/5)×3, min ≤ 120 |
    | module | 25 |

  - Evidence checks:
    - **quiz and overlay_quiz:** `correct` is recounted from `attempts` whose `client_id` starts with `<sessionId>:`. If the attempts haven't arrived yet, return `{status:'pending_evidence'}`.
    - **module:** the module must be published to a class the student belongs to (`private.is_member_of`). One award per `module:<moduleId>` ever.
    - **focus:** at most 120 min, and 240 focus-minutes per Manila day.
  - Caps: 12 breaks a day, 30 decks a day, and a daily total of 600 coins per student (Asia/Manila day, matching Agos).
  - Rate limit: reuse the existing private rate-limit helper used by the social RPCs.
  - `insert … on conflict (student_id, key) do nothing`. Returns `{status:'applied'|'duplicate'|'capped'|'pending_evidence', amount, coins}`.
- Make `progress.coins` derived:
  - An AFTER INSERT trigger on `reward_events` updates `progress.coins = coins + amount`.
  - A **BEFORE UPDATE trigger on `progress` sets `NEW.coins := OLD.coins`**. Do *not* revoke the column privilege: old APKs still send `coins` in their progress update, and a privilege error would fail their whole progress sync.
- Backfill: one `legacy` row per student, `key = 'legacy:opening'`, amount = current `progress.coins`.
- `attempts.context` check: add `'module'` and `'overlay'`.

**Client:**
- New `src/lib/rewards.ts`: kinds, local amount preview (must match the server table), and key builders:

  | kind | key |
  |---|---|
  | break | `break:<uuid>` |
  | quiz | `quiz:<sessionId>` |
  | overlay_quiz | `overlay:<sessionId>` |
  | deck | `deck:<cardId>:<YYYY-MM-DD Manila>` |
  | focus | `focus:<endAtMs>` |
  | module | `module:<moduleId>` |

  Session and break ids come from a lazy `useState` at screen mount, never from `Date.now()` during render.
- Store (`src/store/useAppStore.ts`):
  - Replace `addCoins` with `claimReward({key, kind, ref, meta})`.
  - Store `coinsConfirmed` (server) and `pendingRewards: {key, kind, amount, ...}[]`. The displayed balance is `coinsConfirmed + sum(pending)` (optimistic).
  - A claim with an already-seen key is a no-op locally too.
  - Pending rewards persist through AsyncStorage.
  - Persist-version migration: the old `coins` becomes `coinsConfirmed`.
- Sync (`src/services/backend/sync.ts`):
  - New outbox kind `reward`, flushed **after** attempts, so evidence lands first.
  - `applied` or `duplicate`: drop from pending, set `coinsConfirmed`.
  - `pending_evidence`: retry on the next flush, at most 5 tries, then drop with a logged warning.
  - `capped`: drop, and show a gentle toast once a day: "You've earned today's max coins. Nice work!" (EN and FIL).
  - Pull always takes `progress.coins` (it's server-derived, so it's safe).
  - Stop sending `coins` in the progress update.
- Screens: claim **at the moment of completion** (when the result screen mounts). Animation is decoration only, and `CoinCounter` reads the store.
  - Break, quiz, focus, module: replace `addCoins`. Module: `recordBreak(3)` is also guarded by the same key.
  - Module quiz answers: record attempts (`context:'module'`, `question_id = '<moduleId>:<qid>'`, `skill_id='module'`) through a new `recordModuleAttempt` that does **not** touch BKT mastery. This also fixes teachers never seeing module results.
  - Feed deck completion and FullQuizOverlay completion: new claims.
- `IS_PITCH`: the same store logic with no server. Pending rewards stay local, and the displayed balance is the confirmed balance plus pending.

### Acceptance criteria
- Completing a break shows +20 immediately. After force-close and reopen, the balance includes it. After sync, `reward_events` has exactly one `break:` row.
- Leaving the result screen instantly still awards (claim on mount, not on animation end).
- Reopening a finished module and finishing again: the balance doesn't change. The server has one `module:<id>` row.
- Replaying the same outbox twice (simulate offline, then flush twice): one ledger row.
- Two devices on one account: both earn while offline, and after both sync the balance equals the sum (no overwrite).
- A student calling `update progress set coins = 99999` leaves coins unchanged. A direct `insert into reward_events` is denied.
- Agos `effort_pts` doesn't double-count a re-finished module.

### Tests
- `scripts/backend-test.mjs`: idempotency, all caps, pending_evidence, RLS deny on direct insert and update, the coin-freeze trigger, guardian and teacher read denial on `reward_events`, backfill correctness.
- New `scripts/test-rewards.ts` (tsx): key builders, local amounts equal the server table (assert against a JSON export of the server rules), and pending-merge math.

---

## Item 2: Grade and subject into Profile → Personalization

**Roles:** student.

### Verified current behavior [code]
- A "Your questions" card on the Settings tab (`src/app/(student)/(tabs)/profile.tsx:100-144`) offers grades 1–10. The DB and sign-up allow 1–12.
- Grade writes `profiles.grade`. But `session.tsx:72` adopts the server grade **only on user switch** and clamps it to 10, so a change on device B never reaches device A.
- Subject lives only in local AsyncStorage, so it's lost on reinstall or a second device.
- Learn-tab subject cards overwrite the saved subject (D8).
- Consumers: Home (`home.tsx:63-64`), Learn, FullQuizOverlay (`:79`), Mirror (`mirror.tsx:88,159`), native bridge (`bridge.ts:111-112,137-138,170-171`).

### Changes
- DB: `student_settings.learning_subject text null check (learning_subject in ('mixed', …SUBJECT ids))`. Mirror the ids from `src/data/localQuestions.ts` `SUBJECTS`.
- Store: a new dirty flag `personalization`. Flush grade through `api.updateProfile({grade})` and subject through `student_settings`. Pull applies `profiles.grade` and `learning_subject` unless that flag is dirty.
- Carry-over: on the first pull after upgrade, if the server subject is `null`, push the local value. If the local grade is unset, use the server grade. No user action needed.
- Remove the grade clamp in `session.tsx`. Add a `practiceGrade(grade)` helper (min(grade, 10)) used by question pickers and the native bridge (D7).
- UI:
  - New route `src/app/(student)/personalization.tsx` (Stack screen, large title "Personalization" / FIL "Pag-personalize"):
    - grade chips 1–12 in three labeled rows (Grade school / Junior high / Senior high)
    - subject chips
    - for grades 11–12, the note "Practice uses Grade 10 questions for now."
  - Profile tab: remove the "Your questions" card. Add a `ListRow` "Personalization" with the current value ("Grade 8 · Math") above Account.
  - Saving is optimistic and immediate: chip state flips on tap, with haptic select and a subtle "Saved" caption. On failure, revert with a plain-language error.
- Learn tab: subject cards pass the subject as a route param to `/feed` (`?subject=`) instead of calling `setLearningSubject`. The feed and overlay take the param when present, otherwise the saved preference.
- All copy goes in `en.ts` and `fil.ts`.

### Acceptance criteria
- After the upgrade, existing grade and subject show in Personalization unchanged.
- Changing them updates Home, Learn, the next overlay quiz, the Mirror "test shift", and the native config (verify with `UsageMonitor.status()` or a log) without restarting.
- The values survive a reinstall (server pull) and appear on a second device after the next foreground sync.
- Tapping "Science" on Learn opens a science feed but leaves Personalization on its saved value.
- Grade 12 student: the profile shows 12, and practice shows the Grade 10 note.

### Tests
- backend-test: `learning_subject` roundtrip, check constraint, a guardian can't update it.
- Typecheck, lint, and a manual web pass at 360 px in Day and Night, EN and FIL.

---

## Item 3: Black tiles → white (Day theme)

**Roles:** student.

### Verified current behavior [code]
`DarkTile` (`src/components/ui/DarkTile.tsx`) uses `c.tileDark` (Day `#1F2227`). It's used on Profile (4 tiles), ShiftSheet (8–9 tiles) and Wind-down (3 tiles), plus the dev gallery.

### Changes
- `DarkTile` picks its surface from the theme:
  - **Day:** `c.card` background, a hairline border (`c.hairline`), the standard card shadow from `Card.tsx`.
    - Title: `c.text`. Status: `c.textSecondary`. Accent status: `c.accent`.
  - **Night:** unchanged (`tileDark`).
- Rename it to `FeatureTile` and keep a `DarkTile` re-export, so there's no churn elsewhere. Update the docstring.
- Tile art on white:
  - `TileArt` shadows (`#000` at 0.35) drop to 0.12 in Day.
  - Phosphor icons that are low-contrast on white (spark gold `#FFB21E`) sit on a 56 px `accentTint`-style disc so they read.
- Press feedback is unchanged (scale 0.98).

### Acceptance criteria
- In Day, Profile, the plus card and Wind-down show white tiles with visible edges on the `#F6F5F1` canvas. Night is unchanged.
- Text contrast is ≥ 4.5:1 for title and status (check `#C8400F` on white, about 5:1, and `textSecondary` on white). Icons are recognizable.
- Dev gallery `?mode=both` screenshots for both themes are attached to the report.

---

## Item 4: App Mirror: timer option and continuous switching

**Roles:** student (Android only; iOS has no Mirror).

### Verified current behavior [code]
- Triggers: only the risk trigger. `MonitorService.kt:434-462` dispatches when `mirror_auto_enabled` and risk > 0.75, with a 180 s cooldown. There is no timer.
- Switching: `SmartStudyGuardService.dispatchWithLearningVideo` chooses between:
  - **Tier A:** a work-profile trampoline that opens the deep link with `FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_CLEAR_TOP` (`MirrorWorkProfile.kt:210-212`). CLEAR_TOP plus a fresh task restarts the target app's task, which is the visible jump.
  - **Tier C:** without a work profile, it shows `DecelerationOverlayActivity` instead of in-app content at all.

### Changes
**Timer semantics (D3):**
- Prefs (native SharedPreferences, set from JS):
  - `mirror_trigger ∈ {smart, timer, both}`, default `smart`
  - `mirror_timer_min ∈ {5,10,15,20,30}`, default 15
- The timer counts **continuous foreground time in a mirrored target app** (`Categories.isTargetApp`).
  - Gaps under 2 min (the existing `APP_GAP_MS`) pause it.
  - Screen off for 2 min or more, leaving to a non-target app for 2 min or more, or a completed shift, resets it.
- On expiry, dispatch a learning video in **the same app**, then restart the timer.
- Priority stays as today: lockdown > bedtime wind-down > guardian limit > Mirror.
  - Snooze, focus mode and not-now suppress the timer: it freezes, it doesn't fire.
  - During bedtime the selector already picks calm pacing (`inBedtime`).
- Minimum 180 s between any two dispatches, shared between the risk and timer triggers.
- Pure decision function `MirrorTimer.kt` with a TS twin `src/services/monitor/mirrorTimer.ts` (same pattern as `riskModel.ts` and `Nudges.kt`), plus `scripts/test-mirror-timer.ts`.

**Continuous switching:**
- New **Tier B: same-profile, same-app deep link.**
  - `Intent(ACTION_VIEW, deepLink).setPackage(resolvedPkg)` with `FLAG_ACTIVITY_NEW_TASK` only (no CLEAR_TOP), so the app receives it in its existing task (`onNewIntent`) and Back returns to the previous content.
  - Order: A → B → C.
- In Tier A's trampoline, drop `CLEAR_TOP` when the target is the app already in front.
- Handoff masking: a 280 ms fade-to-surface overlay (reuse the `OverlayController` window) **before** the intent, then the existing 1.8 s honest pill, "Switching to a learning video", in EN and FIL.
- Audio: a transient focus request across the handoff only. Never media keys (item 8).

**UI (`src/app/(student)/mirror.tsx`):**
- Under the Auto toggle: a SegmentedControl "When to switch: Smart · Timer · Both", plus minute chips when Timer or Both is selected.
- A status line from native `getMirrorStatus().timerRemainingSec` (new optional field): "Next switch in about 7 min" or "Timer paused".
- JS → native: `setMirrorTrigger?.(mode, minutes)`, guarded. Older APKs hide the control (feature-detect).
- Strings in `en.ts` and `fil.ts`.

### Acceptance criteria (device)
- Timer 5 min, Mirror on, scrolling YouTube: at about 5:00 (±15 s), a learning video opens **inside YouTube**, with no launcher or home flash and no black frame visible in a screen recording.
  - Back returns to the previous YouTube content.
  - The status line shows the next cycle.
- Leaving for 1 min and returning keeps the countdown. Leaving for 3 min resets it.
- Smart mode behaves exactly as before (regression).
- Both: whichever fires first wins, and the 180 s gap is respected.
- Bedtime: calm-pacing video. Lockdown and limit countdown suppress Mirror.
- Platforms to check: YouTube, TikTok, Facebook (or whichever seeds exist in `learning_video_seeds.json`), with and without a work profile.

### Needs real-device confirmation
- Each app's deep-link handling with NEW_TASK only. Some apps may still restart. Record the result per app, and keep Tier C as the fallback.

---

## Item 5: Plus button morphs into the card

**Roles:** student.

### Verified current behavior [code]
`ShiftSheet` is a `BottomSheet` rendered **under** `TabBar` (`src/app/(student)/(tabs)/_layout.tsx:36-52`). The tab bar stays visible and tappable while the sheet is open. The center button rotates to ×. There is no Android Back handling.

### Changes
- New `src/components/student/ShiftMorph.tsx`, rendered **after** `TabBar` in `_layout.tsx`, so it sits above the bar.
  - `CenterPlusButton` reports its window rect (`measureInWindow` on open).
  - On open, one Reanimated progress value (spring `spring.smooth`) interpolates the container from the button (56×56, radius 28, `c.accent`) to the card:
    - full width, anchored at the bottom with safe-area padding
    - covers the tab bar
    - top radius `radius.sheet`, height up to 85% of the window
    - `c.bg` surface
  - The plus glyph rotates 45° into × and travels to the card's top-right, becoming the close button.
  - Tile content fades and rises in from progress 0.55 to 1 (stagger 20 ms).
  - The real center button is hidden (opacity 0) while open, so the button *becomes* the card. Close reverses the motion, and the button reappears when progress hits 0.
- Covers the bar:
  - Scrim over everything.
  - `TabBar` gets `pointerEvents="none"` and `importantForAccessibility="no-hide-descendants"` while open.
  - The card has `accessibilityViewIsModal`.
- Close: the ×, a scrim tap, drag-down (reuse the `BottomSheet` pan logic), Android Back (`BackHandler`), and navigating from a tile.
- Reduced motion (`useReducedMotion`): a 150 ms crossfade instead of the morph.
- Web: the same component inside PhoneFrame.
- Remove the `BottomSheet` usage in `ShiftSheet`. Keep the tile grid as `ShiftSheetContent`.
- Update DECISIONS.md (D4).

### Acceptance criteria
- Tapping + makes the button visibly grow into the card (screen-record at 60 fps on a budget Android and on web). There's no separate sheet sliding up.
- While open, tapping where the tab icons were does nothing to the tabs. Screen readers can't reach the bar.
- After closing by any of the five paths, + and all four tabs respond on the first tap.
- Rapid open/close spam (10 taps) never leaves the bar non-interactive or the button hidden.
- No dropped frames on mid-range Android (check with the `animation-performance` guidance): animate transform and opacity only, and animate the width/height morph with a scale-and-clip approach if layout animation janks.

---

## Item 6: Module upload card

**Roles:** teacher. Mobile: `src/components/teacher/TeacherUploadSheet.tsx`. Laptop: `src/components/teacher/TeacherUploadDialog.tsx`.

### Verified current behavior [code]
- Mobile:
  - The card is solid orange `#C2410C`.
  - The drop zone is pink `#F4A98E`.
  - There's a separate white "SELECT MODULE TO UPLOAD" pill (`:373-381`).
  - There's a black `#161616` generate button (`:457`).
- Laptop: the drop zone has a separate "Choose file" button (`:266`).
- Status: errors show as a `Notice`. I saw no explicit reading or uploading progress state (Neon: confirm).

### Changes
- One shared `UploadDropCard` component used by both surfaces:
  - Surface `c.card`, drop zone `c.accentTint` with a 2 px dashed `c.accent` border, icon and title in `c.accent`. One accent family, with clear hierarchy.
  - The **whole card** is the target:
    - `Pressable`, `accessibilityRole="button"`, and on web `role="button"` with Enter/Space opening the picker
    - web `onDragEnter/Over/Leave/Drop` on the card root
    - hover and active styles
  - Remove the "SELECT MODULE TO UPLOAD" pill and the "Choose file" button.
  - The black generate button becomes primary accent.
- Explicit state machine `idle → dragging → reading → uploading(pct) → ready | failed`:
  - **reading:** file name plus a skeleton bar.
  - **uploading:** a determinate progress bar (Storage upload, item 7).
  - **ready:** a green check, file name, character count, and "Tap to replace".
  - **failed:** plain-language reason in the card ("That file is over 20 MB", "We can't read this file type", "Upload stopped, tap to try again") and a tap to retry.
  - While reading or uploading, the card ignores taps.
- Validation, client and server: allowed types pdf, docx, txt, md, csv, html; at most 20 MB; empty-text files rejected.
- Native picker: replace the custom `pickModuleFile` with `expo-document-picker` (`npx expo install expo-document-picker`; `expo-file-system` is already installed) so the phone can keep the original bytes for item 7.
  - Guard the import, so an older APK without the module falls back to `UsageMonitor.pickModuleFile`.
  - Phone text extraction stays txt/md/csv/html. PDF and DOCX picked on a phone are stored as originals, and the card says "Text from PDF/Word is extracted on the laptop app. Paste notes here, or open this on a laptop." No silent failure.

### Acceptance criteria
- Clicking or tapping anywhere on the card opens the picker. There's no other upload button.
- Dropping a file on the card (Chrome and Edge desktop) works and shows the drag-over state.
- Idle, reading, uploading, ready and failed each render visibly. A 25 MB file and a `.exe` show the right failed message. Retry works.
- Screenshots of every state on mobile web and laptop are attached.

---

## Item 7: Editable quizzes from uploads

**Roles:** teacher (creates, edits, assigns), student (sees assigned versions only), guardian (none).

### Verified current behavior [code]
- Generate leads to an "Approve & send" step that **publishes immediately** with `published: true` (`teacher.ts:430-505`). There's no draft and no edit before sending on mobile.
- The laptop can edit only *after* publishing (`ModuleEditDialogs.tsx`), and that edit changes what students already have.
- The original isn't kept: `source_excerpt` is filled with the summary (`teacher.ts:474`).
- RLS already hides `published=false` rows from students (`20261123000000…sql:31-36`).
- On Android, teacher modules are also served over LAN/P2P (`persistTeacherLocalModules`, `broadcastClassModules`).

### Changes
**DB (migration `…_quiz_drafts.sql`):**
- Storage bucket `module-sources`:
  - private, `file_size_limit` 20 MB, `allowed_mime_types` = the six types above
  - storage RLS: objects under `{auth.uid()}/…` are insert/select/delete by owner only
- `public.module_sources`:
  - `id`, `teacher_id default auth.uid()`, `storage_path unique`, `file_name`, `mime`, `size_bytes`, `sha256`, `extracted_text (≤ 200k chars)`, `created_at`, `deleted_at`
  - RLS owner-only
- `public.quiz_drafts`:
  - `id`, `teacher_id`, `source_id fk null`, `title`, `subject`, `summary`, `flashcards jsonb`, `questions jsonb`, `version int default 1`, `updated_at`, `archived_at`
  - RLS owner-only
  - A trigger bumps `version` and `updated_at` on update
  - A content validation function (four options, answer 0–3, non-empty prompts, at most 30 questions)
- `class_modules`: add `quiz_id uuid null`, `quiz_version int null`, `assigned_at`, `share_source boolean default false`, `source_id uuid null`, and `unique (quiz_id, quiz_version, class_id)`.
  - Revoke direct `insert` and `update` of content columns for `authenticated` on rows that have a `quiz_id`. Content changes go only through the RPC.
  - Keep the existing delete-own policy as the "Unassign" action.
- `public.assign_quiz(p_quiz_id uuid, p_expected_version int, p_class_ids uuid[], p_share_source bool) returns jsonb`, SECURITY DEFINER:
  - owner check, and `private.is_teacher_of` for every class
  - version must equal the draft's current version, otherwise `conflict`
  - validate content
  - per class: insert the snapshot `published=true`, and set any previous snapshot of the same quiz in that class to `published=false` (students keep their attempt history)
  - idempotent through the unique constraint
- `public.source_signed_url(p_module_id uuid)`: returns a 10-minute signed URL. Allowed for the owner, or for a class member when `share_source`. It goes through an edge function if signing needs the service role.
- Backfill: one `quiz_drafts` row per existing `class_modules` row, linked through `quiz_id` and `quiz_version=1`, so legacy modules are editable as drafts.
- Soft delete: deleting a draft sets `archived_at`. Assigned snapshots and attempts are never broken.

**Client:**
- Flow:
  1. Upload card (item 6). The original uploads to Storage and a `module_sources` row is created, with progress shown.
  2. Generate, which **saves a draft** (not publish).
  3. **Review & edit** screen.
  4. **Assign** sheet: pick classes, optional "Also share the original", confirm.
  5. Result.
- Shared `QuizEditor` component, from `ModuleEditDialogs.tsx` generalized for mobile and laptop:
  - edit title, summary, flashcards, and questions (prompt, four options, correct radio, explanation)
  - add, delete and reorder
  - inline validation that names the exact field
- Draft autosave: debounced 800 ms, optimistic. A "Saved · just now" indicator. Saved locally first (teacher store persist), then the server.
- Conflict on `expected_version` reloads with the message "This draft changed on another device. Showing the latest version."
- Teacher Modules list (`src/app/teacher/modules.tsx`):
  - sections **Drafts** and **Assigned**
  - assigned rows show the version and "Edited since assigning, Update students?" when `draft.version > quiz_version`
  - "View original" opens the signed URL
- The Assign button locks after the first tap and shows a loading state. A retry is safe (idempotent RPC).
- Android LAN/P2P: `persistTeacherLocalModules` and broadcast include **only** assigned snapshots, never drafts.
- Remove the immediate-publish path from `publishModulesToClasses`. `copyModuleToClasses` becomes `assign_quiz` with the existing draft.
- Student: no UI change. The module screen shows the snapshot, and its quiz answers now record attempts (item 1).

### Acceptance criteria (full flow, with test data)
1. A teacher uploads `sample.pdf` on the laptop. The original is in Storage and "View original" downloads the same bytes (sha256 match).
2. Generate creates a draft. The student account (same class) sees **nothing new** after a sync.
3. Edit question 2's prompt and correct answer, then reload. The edits persist.
4. Assign to class A only. A student in A sees the edited prompt and correct answer. A student in class B sees nothing.
5. Edit the draft again without re-assigning. Student A still sees the previous version. Choose "Update students", and A now sees the new version and the old snapshot is unpublished.
6. Another teacher can't read the draft, the source row, or the Storage object (backend-test).
7. A student calling `assign_quiz`, or inserting into `class_modules` directly with a `quiz_id`, is denied.
8. Double-tapping Assign creates one snapshot per class.

### Tests
- backend-test: every RLS and RPC case above, plus storage policy, signed-URL authorization, backfill.
- Extend `scripts/e2e-teacher-desktop.mjs` (Playwright): upload, draft, edit, assign, then a student web session checks the edited question text, plus a draft-invisibility check. Screenshots go to `e2e-shots/`.

---

## Item 8: Spotify launch and parent status

**Roles:** student device (cause), guardian (sees the status).

### Verified current behavior
- **Launch path 1 [code]:** `OverlayController.pauseMedia` (`:126-148`) treats `AudioManager.isMusicActive` as "music playing". That flag is true for **any** audio, including TikTok and YouTube videos. It then sends a **global** `KEYCODE_MEDIA_PAUSE`. On break completion, `releaseMedia(resume=true)` sends a global `KEYCODE_MEDIA_PLAY` (`:163-165`). Global media keys go to the most recently active media session, often Spotify, which starts playing and can come to the front. **[hyp: confirm with logcat]**
- **Launch path 2 [code]:** "Open <app>" after a break (`exitToLastApp` → `UsageMonitorModule.returnToLastApp`, `:366-386`) and overlay completion (`OverlayController.returnToExternalApp`) relaunch `lastUsedPkg`. That can be Spotify if it was ever recorded as foreground (see below).
- **False parent status [code]:** `Tracker.update` (`Usage.kt:241-261`) falls back, when no foreground app is known, to the package with the newest `UsageStats.lastTimeUsed` within 30 s.
  - Background playback services can refresh that.
  - The result is assigned to `fgPkg` and **sticks** until that package emits PAUSED, which a background-only app never does.
  - It's reported to `live_status` and shown as LIVE "Using now" (`AppUsage.tsx:70`).
- **[data]** `live_status` has 1 Spotify row (last 2026-11-17 14:04 UTC). `app_usage` has 3 Spotify rows.
- **Shared cause?** Partly, as a hypothesis. A PLAY key that brings Spotify forward yields a real RESUMED event, so the parent status then shows Spotify. The sticky fallback is an independent cause. Neon must test both separately.

### Changes (native, `modules/usage-monitor`)
- Media:
  - **Never send `KEYCODE_MEDIA_PLAY`.**
  - Pause with a transient audio-focus request only. Well-behaved players pause on `AUDIOFOCUS_LOSS_TRANSIENT` and resume themselves only if they were playing when focus is abandoned.
  - Send `KEYCODE_MEDIA_PAUSE` only as a fallback when the focus request is not granted **and** the overlaid app is the foreground app.
  - Delete the `pausedByUs` resume logic. Same for `pauseMediaForLockdown`.
- Return-to-app:
  - `lastUsedPkg` is written only from real `ACTIVITY_RESUMED` events (never from the fallback), only for `Categories.distracting` apps, and only with a timestamp.
  - `returnToLastApp` relaunches only if that record is under 10 minutes old and the app isn't an audio or music category. Otherwise it moves LearnShift to the back.
  - The "Open <app>" button hides when there's no eligible app.
- Tracker fallback:
  - Use `UsageStats.getLastTimeVisible()` (API 29+; skip the fallback below 29), within 30 s.
  - Never when `KeyguardManager.isKeyguardLocked` or the screen isn't interactive.
  - The result is **not sticky**: it's used for that tick only, and `fgPkg` stays null.
  - Mark it `confidence='inferred'`. Real RESUMED is `confidence='visible'`.
- Report `confidence` with live status.

**Server and guardian:**
- Migration: `live_status.confidence text not null default 'visible' check in ('visible','inferred')`.
- Ingest: validate and store it. Default `'inferred'` when an old APK omits it? **No**: old APKs keep `'visible'` to avoid regressing honest reports. Old builds will keep the sticky bug until updated, which is acceptable.
- `AppUsage.tsx`:
  - LIVE "Using now" only when fresh, `screenOn`, and `confidence==='visible'`.
  - `inferred` shows "Recently used: Spotify · 1 min ago" with no LIVE badge.
  - Never use the words "playing" or "listening". Playback can't be observed without notification-listener access, which we don't request.
  - Strings in `staff.ts` (EN and FIL).

### Acceptance matrix (real device; record logcat tags `LearnShift/Media`, `LearnShift/Tracker`)

For each Spotify state (**closed / open-idle / paused / playing in background / playing in foreground**), crossed with these scenarios:

| Scenario | Expected |
|---|---|
| Break overlay over TikTok, completed | Spotify is never started or brought forward unless it was playing before, in which case it resumes on its own. |
| Break overlay dismissed (not completed) | Spotify state is unchanged. |
| "Open <app>" after a break | Returns to the overlaid app, never to Spotify. |
| Lockdown on, then off | Spotify isn't started. |
| Screen locked, Spotify playing | Guardian shows not LIVE: idle, or "Recently used" at most. |
| Home screen, Spotify playing in background | Guardian shows no LIVE Spotify. |
| Spotify in foreground | Guardian shows LIVE Spotify (true positive kept). |

- Devices: at least one Android 13–15 Samsung (One UI) and one Pixel or AOSP-like. Android 10 if available.
- Verify that the old live row clears: after the new build reports, `live_status.package` updates within 1 tick of a real app change.

---

## Phase 7: Docs and reporting
- DECISIONS.md: add D1 to D8 as one-liners, and replace the Shift-sheet line (D4).
- CLAUDE.md:
  - architecture notes for the reward ledger and quiz drafts
  - the new tables in the privacy-split list (`reward_events`: student only; `quiz_drafts`, `module_sources`: teacher only)
- Neon's final report, per item:
  - the observed result
  - pasted output of `npm run typecheck`, `npm run lint`, `npm run test:local` (including the new `test-rewards.ts` and `test-mirror-timer.ts`), `node --env-file=.env scripts/backend-test.mjs`, `scripts/e2e-teacher-desktop.mjs`, `npx supabase db advisors --remote`, and `npm run export:web`
  - EAS build ID and link
  - the filled-in device matrix
  - an explicit list of anything not verified

## Risks and open items
- **Deep-link behavior differs by app** (item 4). Some apps may still restart. Keep Tier C, and report per app.
- **OTA to old APKs:** the reward RPC and personalization are JS plus server, so they work on old binaries. Mirror timer, Spotify fixes and the document picker need the new APK. The UI must feature-detect.
- **Live DB:** every migration lands on production (gate 1). Write migrations to be idempotent (`if not exists`) and back-compatible: the coin-freeze trigger instead of a privilege revoke, the `confidence` default.
- **Economy change:** feed decks (+5) and overlay quizzes (+10/correct) now earn coins, with a daily cap of 600. Isla unlock thresholds (100–3200) are unchanged.

## Effort estimate
About 8 working days: Phase 1 (1), Phase 2 (1), Phase 3 (0.5), Phase 4 (1.5), Phase 5 (2), Phase 6 (1.5 plus the build wait plus device time), Phase 7 (0.5).
