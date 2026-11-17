# LearnShift: AI System Architecture, UX Design & Development Blueprint

**Version 2.** Technical engineering guide, UX wireframes, privacy and compliance plan, pilot design, research foundations and low-RAM optimization plan for AIdeathon.

> How to read the numbers: anything marked *(target)* is an engineering goal we will measure on the demo phone. It is not a result we have already achieved.

---

## At a glance

LearnShift catches the moment a student is about to keep doomscrolling and turns it into a 30 to 45 second micro-lesson. It never records the screen, never reads what is in the feed, and never runs a second video app. It counts *how* a student scrolls (swipe timing, not content), waits for a moment when an interruption is likely to be tolerated, and slides a short bilingual card over the feed. Cards are drafted by AI, approved by a teacher, and checked by code before a student sees them.

### What makes it different

| # | Idea | What it does |
|---|------|--------------|
| 1 | **Adaptive tick rate** | Four states: Sleep, Sentinel, Armed, Burst. Idle cost is close to zero because the OS only wakes LearnShift for apps the student picked. High frame rates are used only for the overlay animation. |
| 2 | **Friction ladder, not a wall** | Five levels, from a small heads-up pill to a bedtime card. Every level can be dismissed. A bandit learns which level works for each student. |
| 3 | **Permission ladder** | Three access levels. The product still works if a family declines Accessibility, if Play review is strict, or if the phone runs Android 17 Advanced Protection Mode. |
| 4 | **Drafted by AI, approved by teachers, verified by code** | The LLM writes card templates. A solver computes the answers. A teacher approves each pack. The model never has the last word on a number. |
| 5 | **Misconception-tagged answers** | Every wrong choice maps to a named misconception, so the teacher heatmap shows *why* a class is stuck, not just a score. |
| 6 | **Retention-aware mastery** | Bayesian Knowledge Tracing plus a forgetting curve. A skill comes back just before it fades. |
| 7 | **Finite by design** | Daily cap, a "done for today" card, and "Learn once, scroll free". No streaks, no leaderboards, no guilt. |
| 8 | **Mutual transparency** | A Privacy Receipt shows what LearnShift observed and what it did not. Guardians see what the student sees. Teachers see learning, never scrolling. |
| 9 | **Teacher Studio** | A teacher uploads a module and gets quizzes in many styles plus flashcards, packaged for offline use. |

---

# 1. Executive Summary and Core Architectural Pivot

LearnShift is a mobile learning system that turns passive short-form video scrolling into high-retention micro-learning. It is built for the budget Android phones (2 GB to 4 GB RAM) that most K-12 and university students in the Philippines actually carry.

## 1.1 Operating context and privacy boundaries

LearnShift follows a zero-trust privacy model. It stays inside the standard Android security framework and is designed to pass Google Play review (Section 5 has the compliance plan).

- **No screen recording or OCR.** It never captures the display buffer or analyzes video frames from other apps.
- **No content reading.** It does not inspect text, messages, view hierarchies or UI elements inside other apps. The service is declared with `canRetrieveWindowContent="false"`, so the OS itself blocks content access. Anyone can verify this in the manifest.
- **No code injection or app modification.** It works through standard system events and does not patch, hook or alter any other package.
- **Student-chosen apps only.** LearnShift listens to the apps a student adds to their own watch list and nothing else.
- **On-device first.** Risk scoring, mastery tracking and card selection run on the phone. Only aggregated learning summaries sync, and only with consent.
- **No dark patterns.** Every intervention carries LearnShift branding, explains itself in plain words, and can be dismissed with one downward flick.

## 1.2 The architectural problem: app duplication and memory exhaustion

An obvious idea for a wellbeing tool is to embed or clone a short-video feed (TikTok, YouTube Shorts, Reels) and mix educational cards into it. On a 2 GB to 4 GB phone this fails for two reasons.

**Memory.** A video player context takes roughly 400 MB to 900 MB of RAM: decoder buffers, thread pools and deep view hierarchies. On MediaTek Helio G35/G85 or Unisoc chips, running the real app and a cloned player together leaves almost no headroom. Android's Low Memory Killer (LMK) starts ending processes, and once the cached apps are gone it goes after the foreground one.

**Policy.** Wrapping another company's feed raises Google Play and terms-of-service problems: unauthorized wrapping of third-party content, and impersonating another app's interface.

Typical ranges on a 4 GB phone. These are estimates to be re-measured with `adb shell dumpsys meminfo` on the demo device:

| | Clone / wrapper design | LearnShift overlay design |
|---|---|---|
| RAM left for apps after Android and system services (~1.8 to 2.2 GB used) | ~1.9 to 2.3 GB | ~1.9 to 2.3 GB |
| Real short-video app (foreground) | ~0.75 GB | ~0.75 GB |
| Second video player or wrapper | ~0.65 GB | none |
| LearnShift | none | ~0.04 GB |
| Keyboard, launcher, messengers (cached) | ~0.5 GB | ~0.5 GB |
| **Total demand** | **~1.9 GB, no headroom** | **~1.3 GB, ~0.6 to 1.0 GB spare** |
| Likely result | LMK kills processes, frames drop below 15 FPS, apps restart | The video app is left alone |

## 1.3 The native solution: an event-driven behavioral sentinel

LearnShift separates **detecting behavior** from **drawing UI**. The target app stays in its own process. LearnShift watches lightweight metadata and, only when it is worth it, slides a small native overlay above the feed. The total memory envelope target is **30 to 40 MB peak** (Section 6).

```
 [SLEEP]     Screen off, or a non-watched app is in front.
    |        0 Hz. No timers, no polling. The OS only wakes us for the student's watch list.
    | watched app comes to the foreground
    v
 [SENTINEL]  1 Hz tick over plain counters (no content):
    |        T_session, swipes/min, dwell variance, fast-skip ratio, clock context
    | risk >= personal threshold AND receptive moment
    v
 [ARMED]     Next card pre-inflated in an off-screen, non-touchable window.
    |        Bandit has already chosen the format. Auto-disarms after ~90 s.
    | next scroll event
    v
 [BURST]     Card slides up (~220 ms, GPU, vsync-synced). One downward flick dismisses it.
    |
    v
 [LEARN]     Card 3 answer -> BKT update. Outcome -> bandit reward. Cooldown starts.
             Back to SENTINEL, or SLEEP if the student left the app.
```

Earlier drafts called Sleep plus Sentinel "Tier 1" and Armed plus Burst "Tier 2".

---

# 2. Four-State Adaptive Pipeline: From Zero-Cost Sleep to a 60 FPS Card

## 2.1 States and cadence

| State | Entered when | Cadence | Work done | Cost *(target)* |
|---|---|---|---|---|
| **Sleep** | Screen off, or a non-watched app is in front | 0 Hz, event-driven only | Nothing | ~0% CPU |
| **Sentinel** | A watched app is in front and the screen is on | 1 Hz tick | Update counters, build the feature vector, run the risk model | ~8 MB plus ~2 MB model, under 1% CPU |
| **Armed** | Risk passes the student's threshold and the moment is receptive | Event-driven | Pre-inflate the card off-screen, hold up to ~90 s | +15 to 25 MB while armed |
| **Burst** | Next scroll event while Armed | Display refresh (60/90 Hz) for ~220 ms, then touch events while the card is open | Slide-up animation and card interaction | GPU-composited, no video decoding |

**How this maps to the "1 fps up to 60 fps" idea.** The cheap, low-rate part is a set of counters ticking at 1 Hz. The 60 fps part is only the overlay animation and the card's own touch handling. At no rate does LearnShift capture frames of another app.

## 2.2 Sleep and Sentinel in practice

The accessibility service is configured so the OS does the filtering for us:

```xml
<!-- res/xml/sentinel_config.xml -->
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeViewScrolled|typeWindowStateChanged"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:canRetrieveWindowContent="false"
    android:notificationTimeout="100"
    android:description="@string/a11y_description"
    android:settingsActivity=".ui.SettingsActivity" />
<!-- Do NOT set android:isAccessibilityTool. LearnShift is not an accessibility tool,
     so it uses the prominent-disclosure path (Section 5).
     packageNames is set at runtime from the student's watch list. -->
```

- **Package filtering means true sleep.** Events from any app outside the watch list are never delivered, so nothing runs while the student is in a chat or a game.
- **Window-state events replace 1 Hz foreground polling.** `TYPE_WINDOW_STATE_CHANGED` already carries the package name. `UsageStatsManager` becomes a fallback (permission Level B, Section 5) and a source for daily totals, not a polling loop.
- **Two layers of debounce.** `notificationTimeout` throttles at the system side. In app code, a swipe is counted only after a 300 ms quiet gap (see the Kotlin sketch in Section 4), because one fling emits many events.

**Feature vector (rebuilt every 5 seconds from counters, no content):**

| Feature | How it is computed | Why it matters |
|---|---|---|
| `t_session` | Continuous minutes in watched apps; gaps under 60 s count as the same session | Long unbroken sessions are the strongest doomscroll signal |
| `swipes_per_min` (λ) | Quiet-gap swipe counter | Rapid-fire swiping means restless browsing |
| `dwell_var` (σ²) | Variance of gaps between the last 20 swipes (gap is our proxy for dwell, since we never see content) | Erratic bursts mixed with passive pauses |
| `fast_skip_ratio` | Share of gaps under 3 s | Skipping without watching |
| `hour_sin`, `hour_cos`, `is_school_day`, `is_school_hours` | Local clock and school calendar | Late-night and class-time context |
| `since_last_card`, `dismiss_streak` | Our own interruption history | Keeps LearnShift from nagging |

## 2.3 The receptivity gate

Being at risk is not enough. The gate decides whether *now* is a tolerable moment. Defaults below are tunable by a guardian or teacher.

- Not before 10 minutes of continuous scrolling. (The *Can't Stop* field study started at 15 minutes.)
- 10-minute cooldown after a dismissal, 30 minutes after two in a row.
- At most 3 cards per hour and 5 decks per day.
- "Not now for 1 hour" is always one tap away on the pill and on every card.
- After the bedtime window starts, learning cards give way to the Deceleration Deck (Section 3.3).

## 2.4 Takeover timing, stated honestly

Accessibility events arrive *after* the app has begun to scroll. A card cannot get ahead of the thumb. What the student sees is the feed moving for a few frames, then the card sliding over it. To make that feel clean:

1. **Pre-warm the window.** In Armed state the card is already inflated and attached off-screen with `FLAG_NOT_TOUCHABLE`. The scroll event only has to clear the flag and start the animation.
2. **Latency budget.** Scroll event to first overlay frame in 100 ms or less *(target)*, then a 220 ms slide. We will measure it with `FrameMetrics` and Perfetto, not assume it.
3. **Fallback.** Some apps or app versions may not emit `TYPE_VIEW_SCROLLED` reliably. Phase 1 starts with a per-app compatibility probe (Section 9). Where scroll events are missing, LearnShift drops to *time-only mode*: a heads-up pill or notification at session-time thresholds instead of a swipe takeover.

## 2.5 Training the Session Risk Model: where do the labels come from?

Nobody hands us ground truth for "doomscrolling". The plan:

- **Phase 0, rules.** A hand-tuned logistic score over the features above. Ships first, and stays as the fallback if the model ever fails to load.
- **Phase 1, labels from the student.** Opt-in "Good timing?" thumbs on the heads-up pill. A one-tap end-of-session question: "Did you mean to scroll this long?" A weak signal: the student stopped within 60 seconds of a card.
- **Phase 2, small model.** Train a GBDT or MLP offline on pilot data. Export as INT8 TensorFlow Lite (under 50 KB *(target)*).
- **Phase 3, personal threshold.** A small on-device update shifts each student's threshold from their own accept and dismiss history. The default starts at 0.75.

---

# 3. UX Design System, Swipe Physics and the Deceleration Deck

## 3.1 The three-screen flow

Learners keep their familiar bottom-up swipe. LearnShift answers it with a dark-mode (`#121212`) vertical card deck, high-contrast type, a visible LearnShift badge and a one-line reason.

```
+---------------------------+  +---------------------------+  +---------------------------+
| 1. HONEST HEADS-UP        |  | 2. TAKEOVER SWIPE         |  | 3. ONE-TAP CHECK          |
+---------------------------+  +---------------------------+  +---------------------------+
| [ feed keeps playing ]    |  | [ LearnShift card deck ]  |  | Rate and proportion       |
|                           |  |                           |  |                           |
| +-----------------------+ |  | +-----------------------+ |  | Hero earns 360 gold in    |
| | LearnShift            | |  | | CARD 1 - HOOK         | |  | 4 min. Same rate: how     |
| | 40 min of scrolling.  | |  | | Bakit hindi           | |  | much in 10 min?           |
| | Up: 30-sec reset      | |  | | proportional ang      | |  |                           |
| | Down: not now         | |  | | pamasahe sa jeep?     | |  | (A) 366     (B) 900       |
| +-----------------------+ |  | +-----------------------+ |  | (C) 3,600   (D) 144       |
|                           |  |                           |  |                           |
|   ^ swipe up to start     |  |   card slides up, 220 ms  |  | [Quiet for 20 min after]  |
|                           |  |   flick down = dismiss    |  | [Not now 1h] [Wind-down]  |
+---------------------------+  +---------------------------+  +---------------------------+
```

Screen 3 shows a card that targets a real misconception: students often add the time difference instead of scaling the rate. Section 4 shows how each wrong choice is tagged.

## 3.2 The friction ladder

Research on infinite scrolling points two ways. A one-time pop-up works at first and then fades. Gradual friction lasts longer for most people, but students with high impulsivity respond better to an explicit pop-up (see *Can't Stop* in Section 10). So LearnShift does not use one fixed intervention. It uses a ladder and learns where each student sits on it.

| Level | When | What the student sees | How to dismiss |
|---|---|---|---|
| **0. Heads-up pill** | Risk is rising | A small pill: "40 min of scrolling. Swipe up for a 30-second reset." The feed keeps playing. | Ignore it, or flick |
| **1. Learning card** | Armed, and the moment is receptive | The 3-card micro-deck | Flick down |
| **2. Deceleration card** | Late night, or no skill gap to work on | Calm, low-arousal cards with slower motion | Flick down |
| **3. Soft stop** | The student kept scrolling after Level 1 or 2 | "Take 5?" with a visible "5 more minutes" button | One tap |
| **4. Wind-down** | Inside the bedtime window set with the student's guardian | A dimmed Goodnight card | One tap |

Every level can be dismissed. Levels 3 and 4 are persuasion, not locks. The starting level for each student is learned from outcomes (accept, dismiss, relapse within 5 minutes). We do not claim to measure impulsivity, and we do not label students.

## 3.3 The Deceleration Deck

When a student is doomscrolling with no learning goal, or it is past bedtime, LearnShift answers the upward-swipe reflex without feeding the dopamine loop. Design rules:

- No autoplay, no counters, no likes, no red badges.
- Transitions of 350 to 450 ms instead of snappy 200 ms ones.
- One idea per card: local trivia, a slow-paced science fact, a quiet visual puzzle, a "set up tomorrow" card.
- The deck ends. The last card says so and offers to close the app.
- Palette stays dark and low-glare while keeping WCAG AA contrast.

## 3.4 The 3-card micro-deck (30 to 45 seconds)

| Card | Job | Format | Time |
|---|---|---|---|
| **1. Interest-matched hook** | Connect the student's weakest skill to an interest they picked at onboarding: Mobile Legends gold per minute, PBA stats, jeepney fares | One question or surprising fact, English, Filipino or Taglish | ~5 s |
| **2. Micro-lesson** | Teach one idea | Bilingual flashcard, step cards, or a Lottie/SVG animation under 50 KB | ~15 s |
| **3. One-tap check** | Retrieval practice and a BKT update | One multiple-choice item or slider, with a Taglish explanation | ~10 s |

When no skill gap needs attention, Card 3 swaps for a discovery card: Filipino history, everyday physics or financial literacy.

## 3.5 Finite by design: "Learn once, scroll free"

Most screen-time tools quietly build a second habit loop. LearnShift is built to end.

- **Learn once, scroll free.** The pill says it plainly: "Finish this and I'll stay quiet for 20 minutes." The quiet window starts at 20 minutes and the policy adjusts it between 10 and 45 within guardian limits.
- **Daily cap.** Default is 5 decks per day. A "Done for today" card closes the session.
- **No streaks, no leaderboards, no guilt.** Progress is shown as skills mastered, never as a score to protect.
- **No nagging.** LearnShift sends no push notifications to pull a student back.

## 3.6 Inclusion and accessibility

- TalkBack labels on every card and control. Respect system font scale.
- WCAG AA contrast on the `#121212` surface.
- English, Filipino and Taglish toggle on every card. Short sentences and icons for lower-literacy readers.
- Controls sit in the thumb zone for one-handed use.
- Works fully offline after the first Wi-Fi sync. Data is never needed during a session.

---

# 4. How AI Powers Each Component

## Part A: Runtime and build-time AI specifications

| # | Component | Model | Runs on | Output |
|---|---|---|---|---|
| 1 | Session Risk Model | Rules first, then INT8 TFLite MLP or Kotlin GBDT (under 50 KB *(target)*) | Device | P(doomscroll) from the feature vector |
| 2 | Knowledge Gap Engine | BKT with a forgetting term and misconception tags | Device | Mastery per skill, next skill to practice |
| 3 | Intervention Policy | Contextual Thompson-sampling bandit plus hard guardrails | Device | Card format and ladder level |
| 4 | Content Engine | LLM drafts templates, solver verifies, teacher approves | Cloud, build time | Offline card packs |
| 5 | Grounded Bilingual Tutor | RAG limited to the approved teacher corpus | Cloud, only when online | Hints and explanations with a page reference |

### 4.1 Knowledge Gap Engine

**Skill graph (draft; the teacher replaces it with their own module order).**
Fractions and decimals → Integers and rational numbers → Ratio and rates → Proportion → Direct variation → Linear equations.

**BKT update** after every Card 3 answer:

```
P(L | correct)   = P(L)(1 - S) / [ P(L)(1 - S) + (1 - P(L)) G ]
P(L | incorrect) = P(L) S      / [ P(L) S      + (1 - P(L)) (1 - G) ]
P(L_next)        = P(L | obs) + (1 - P(L | obs)) T
```

Starter values: P(L0) = 0.20, T = 0.15, S = 0.10, G = 0.25 (four-option items). A skill counts as mastered at P(L) ≥ 0.95. These come from common BKT practice and get fit per skill after the pilot.

**Forgetting.** Between sessions, mastery decays toward a floor: `P(L)_t = floor + (P(L) - floor) * 2^(-Δt / h)`. The half-life `h` starts at 7 days, doubles after a successful spaced retrieval (cap 60 days) and halves after a miss. This is a heuristic in the spirit of half-life regression, not a claim of an optimal schedule.

**Misconceptions.** Each wrong choice carries a `misconception_id`. If the same misconception shows up twice in 7 days, the next deck opens with a *contrast card* that puts the wrong method next to the right one. The teacher heatmap ranks misconceptions by class.

**Next skill.** Pick the skill with the lowest mastery whose prerequisites are at 0.70 or above, and give priority to skills that are due for review.

### 4.2 Intervention Policy

A contextual multi-armed bandit with Thompson sampling. The context is a coarse bucket (late night, school hours, free time), so the whole policy is a few dozen Beta(α, β) pairs on the device.

- **Arms:** flashcard, step cards, Lottie micro-animation, one-tap check, estimation slider, spot-the-error, plus the arm "no card".
- **Reward:** 1 if the student answers the check, or stays on a card 5 seconds or more without dismissing. 0 if they dismiss within 2 seconds.
- **Annoyance guard:** if more than 70% of the last 10 cards were dismissed in under 2 seconds, halve the frequency for 3 days and ask "Too much? Choose how often."

Hard guardrails sit **outside** the bandit and always win:

| Guardrail | Rule |
|---|---|
| Bedtime | Wind-down only after the guardian-set bedtime |
| Dismissal | Always possible in one gesture |
| Frequency | Daily and hourly caps from Section 2.3 |
| Content | Only teacher-approved cards |
| Exit | If anything fails, remove the overlay (fail open) |

### 4.3 Content Engine: drafted by AI, approved by teachers, verified by code

1. **Ingest.** The teacher uploads a module (PDF, DOCX or PPTX). Text is extracted and split into chunks that keep page references.
2. **Tag.** Chunks are mapped to skills in the skill graph, and the teacher can correct the mapping.
3. **Draft.** The LLM writes card templates in several formats. It outputs the parameters and the answer *expression*. It does not compute the final number.
4. **Verify.** A solver runs in CI at pack-build time and checks that the flagged answer is correct and unique, every distractor is distinct and tied to a misconception, the lesson is 40 words or fewer, and every claim has a `source_ref` or is marked teacher-authored.
5. **Approve.** The teacher reviews, edits or rejects each card in a review queue.
6. **Publish.** The pack gets a class code. Phones pull it over Wi-Fi into the offline cache.

The same module can produce many quiz styles:

| Style | Student action | Typical time |
|---|---|---|
| Multiple choice with misconception distractors | Tap one | ~10 s |
| True or false with a "why" pick | Tap two | ~15 s |
| Estimation slider | Drag | ~8 s |
| Ordering | Tap in sequence | ~15 s |
| Fill in the blank (cloze) | Tap a word bank | ~10 s |
| Spot the error | Tap the faulty step | ~15 s |
| Match pairs | Tap two at a time | ~20 s |
| Flashcard | Flip and self-rate | ~6 s |
| Worked example, fading steps | Reveal step by step | ~20 s |

### 4.4 Grounded Bilingual Tutor

A RAG pipeline restricted to the approved teacher corpus. It answers only from retrieved passages, cites the module page, and says "that is not in your module" instead of guessing. Requests carry a skill ID and the question text, never a student identity. When offline, the app falls back to pre-written hints.

## Part B: Developer schemas and starter code

### Card schema v2

MATATAG Grade 7 competencies are not numbered the way the old K to 12 ones were, so the schema stores the teacher-verified wording instead of a code.

```json
{
  "schema_version": 2,
  "card_id": "g7_prop_mlbb_gold_0003",
  "skill_id": "g7.ratio.proportion.rate",
  "curriculum_ref": {
    "framework": "DepEd MATATAG, Grade 7 Mathematics",
    "competency_text": "<teacher-verified wording goes here>"
  },
  "interest_tag": "mobile_legends",
  "language_mode": "taglish",
  "arousal_level": "medium",
  "est_seconds": 40,
  "hook": {
    "en": "Your hero earned 360 gold in 4 minutes. Can you buy the next item by minute 10?",
    "tl": "Kumita ang hero mo ng 360 gold sa 4 minuto. Kaya na ba ang susunod na item sa minuto 10?"
  },
  "lesson": {
    "format": "step_cards",
    "steps": [
      "Hanapin muna ang rate: 360 gold ÷ 4 min = 90 gold kada minuto.",
      "Pareho ang rate, kaya i-multiply sa bagong oras: 90 × 10 = 900 gold."
    ]
  },
  "check": {
    "type": "mcq",
    "prompt": "Magkano ang gold sa 10 minuto kung pareho ang rate?",
    "choices": [
      { "text": "366",   "misconception_id": "additive_reasoning" },
      { "text": "900",   "correct": true },
      { "text": "3,600", "misconception_id": "wrong_operation" },
      { "text": "144",   "misconception_id": "inverted_ratio" }
    ],
    "explanation_taglish": "Tama ang 900! Kapag proportional, pare-pareho ang rate: 90 gold bawat minuto."
  },
  "provenance": {
    "generator": "template:prop_rate_v1#variant=3",
    "solver_verified": true,
    "teacher_status": "approved",
    "source_ref": "teacher module, p. 12"
  }
}
```

### Template that generated it (evaluated in CI, never on the phone)

```json
{
  "template_id": "prop_rate_v1",
  "skill_id": "g7.ratio.proportion.rate",
  "params": { "rate": [60, 70, 80, 90, 100, 120], "t1": [3, 4, 5, 6], "t2": [8, 9, 10, 12] },
  "given": "rate * t1",
  "answer": "rate * t2",
  "distractors": {
    "additive_reasoning": "rate * t1 + (t2 - t1)",
    "wrong_operation":    "rate * t1 * t2",
    "inverted_ratio":     "rate * t1 * t1 / t2"
  },
  "constraints": ["t2 > t1", "every choice is an integer", "all four choices are distinct"]
}
```

Six templates with five variants each give a 30-card offline pack. Because the variants are generated and checked at build time, the phone only stores static cards.

A contrast card for the same skill uses a real-life case that is **not** proportional: a jeepney fare with a base fare (for example ₱13 for the first 4 km, then ₱1.80 per extra km; use the current LTFRB figures). Doubling the distance does not double the fare, which is the point.

### Content generation prompt

```
SYSTEM: You are a Grade 7 Mathematics item writer for Filipino learners.
Write ONLY from the TEACHER MODULE EXCERPTS below. If the excerpts do not
support a fact, leave it out.

INPUT
- skill_id: {skill_id}
- competency wording (teacher-verified): {competency_text}
- interest_tag: {interest_tag}
- language_mode: {taglish | english | filipino}
- module excerpts with page refs: {chunks}

TASK: Write a 3-card micro-deck.
1. Hook: link the skill to the interest_tag in one sentence a 12-year-old would say aloud.
2. Lesson: one worked example, 40 words or fewer, one idea only.
3. Check: one multiple-choice question with 4 choices and exactly one correct choice.
   Every wrong choice must come from a named misconception
   (additive_reasoning, wrong_operation, inverted_ratio, sign_error, unit_mismatch, ...).

DO NOT compute the final answer in free text. Return the template parameters and the
answer EXPRESSION. Our solver computes the number.

OUTPUT: valid JSON that matches LearnShift Card Schema v2. No prose, no markdown fences.
```

### Kotlin starter sketch (not yet compiled; test on a real phone)

```kotlin
class SentinelService : AccessibilityService() {

    private val window = FeatureWindow()      // plain counters, no per-event allocation
    private var lastEventAt = 0L
    private val quietGapMs = 300L

    override fun onServiceConnected() {
        // Restrict events to the student's watch list so the OS filters for us.
        serviceInfo = serviceInfo.apply { packageNames = WatchList.load(this@SentinelService) }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val e = event ?: return
        val now = SystemClock.elapsedRealtime()
        when (e.eventType) {
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED ->
                Orchestrator.onForeground(e.packageName?.toString())

            AccessibilityEvent.TYPE_VIEW_SCROLLED -> {
                // One fling emits many events. Refresh the timestamp on EVERY event,
                // but count a new swipe only after a quiet gap.
                val isNewSwipe = now - lastEventAt > quietGapMs
                lastEventAt = now
                if (isNewSwipe) {
                    window.onSwipe(now)
                    Orchestrator.onSwipe(window.snapshot(now))
                }
            }
        }
    }

    override fun onInterrupt() = Unit
}

object Orchestrator {
    enum class State { SLEEP, SENTINEL, ARMED, SHOWING }
    private var state = State.SLEEP

    fun onForeground(pkg: String?) {
        state = if (pkg != null && WatchList.contains(pkg)) State.SENTINEL else State.SLEEP
        if (state == State.SLEEP) DeckController.disarm()
    }

    fun onSwipe(f: Features) {
        when (state) {
            State.SENTINEL ->
                if (RiskModel.score(f) >= Policy.threshold(f) && Policy.isReceptive(f)) {
                    DeckController.prewarm(Policy.pickDeck(f))   // also starts a ~90 s disarm timer
                    state = State.ARMED
                }
            State.ARMED -> { DeckController.slideUp(); state = State.SHOWING }
            else -> Unit
        }
    }
}

class DeckController(private val service: AccessibilityService) {
    private val wm = service.getSystemService(WindowManager::class.java)
    private lateinit var deckView: View
    private lateinit var params: WindowManager.LayoutParams

    fun prewarm(deck: Deck) {
        deckView = LayoutInflater.from(service).inflate(R.layout.deck_overlay, null).also {
            it.translationY = service.resources.displayMetrics.heightPixels.toFloat() // parked below the screen
            bind(it, deck)
        }
        params = WindowManager.LayoutParams(
            MATCH_PARENT, MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,   // no "draw over apps" grant needed
            FLAG_NOT_FOCUSABLE or FLAG_NOT_TOUCHABLE or FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        )
        wm.addView(deckView, params)
    }

    fun slideUp() {
        params.flags = params.flags and FLAG_NOT_TOUCHABLE.inv()
        wm.updateViewLayout(deckView, params)
        deckView.animate()
            .translationY(0f)
            .setDuration(220)
            .setInterpolator(DecelerateInterpolator())
            .withLayer()                       // GPU layer for the length of the animation
            .start()
    }

    fun disarm() { if (::deckView.isInitialized) runCatching { wm.removeView(deckView) } }
}
```

`ViewPropertyAnimator` is already synchronized to the display refresh, so there is no need to hand-roll Choreographer frame callbacks for the slide. Choreographer and `FrameMetrics` are for *measuring* jank.

---

# 5. Privacy, Safety and Compliance

## 5.1 Data inventory

| Data | Where it lives | Kept for | Who can see it |
|---|---|---|---|
| Swipe counts and timing in watched apps | Device only | Rolling 24 hours | The student, through the Privacy Receipt |
| Which watched app was in front | Device only | Rolling 24 hours | The student |
| Quiz answers and mastery per skill | Device, plus an aggregated summary synced with consent | Mastery until the student deletes it | Student, guardian, teacher (learning data only) |
| Screen content, text, messages, keystrokes, images | **Never collected** | n/a | n/a |

## 5.2 Mutual transparency

- **Privacy Receipt.** A screen showing, for today: "LearnShift counted 212 swipes in 2 apps you chose. It did not see any video, text or message." One tap to delete the day's counters.
- **Same view for everyone.** The guardian weekly summary is the same one the student can open. No hidden dashboards.
- **Teachers see learning, never scrolling.** The heatmap has mastery and misconceptions only. App usage never reaches a teacher.

## 5.3 Google Play compliance plan

LearnShift is not an accessibility tool, so it does **not** set `isAccessibilityTool`. Google Play then requires:

- A prominent in-app disclosure that says what is accessed and how it is used, needs an affirmative tap to accept, and sits apart from the privacy policy and terms.
- A Play Console declaration for non-accessibility-tool apps, with a short video showing the disclosure, the consent flow, and what happens when the student declines.
- Use of narrower APIs where they are enough. Play expects this, and it is the reason for the permission ladder below.

## 5.4 The permission ladder

| Level | What the student grants | What works | What does not |
|---|---|---|---|
| **A. Home mode** | Nothing special. LearnShift is the home screen or sends notification cards. | Pre-launch card when a watched app is opened from LearnShift Home, scheduled micro-decks, wind-down reminders | No scroll awareness |
| **B. Usage access** | Usage Access plus "Display over other apps" | Session-time risk detection and overlay cards at time thresholds | No swipe takeover |
| **C. Accessibility** (opt-in) | Accessibility service, events only, no content | Full experience: swipe cadence and takeover swipe | Blocked when Android Advanced Protection Mode is on |

**Android 17 note.** Reports from Android Authority (February 2026) and The Hacker News (March and October 2026) say Android 17's Advanced Protection Mode blocks accessibility access for apps that are not classified as accessibility tools, and revokes it if already granted. That mode is opt-in and exists only on Android 16 and newer, so most 2 GB to 4 GB phones today will not have it. The next generation might. The ladder means LearnShift degrades to Level B or A instead of breaking.

## 5.5 Children, consent and the law

- Design to the Data Privacy Act of 2012 (RA 10173): transparency, legitimate purpose, proportionality. Confirm obligations with the school's data protection officer before the pilot.
- Students under 18 get guardian consent plus the student's own assent, in plain Filipino and English.
- School permission is required before any in-school pilot.
- Defaults are conservative for minors: caps on, bedtime wind-down on, no data sharing beyond the learning summary.

---

# 6. Technology Stack and Low-RAM Optimization Guide

## 6.1 Subsystem tech stack and budget

| Subsystem | Technology | Role | RAM / CPU *(target)* |
|---|---|---|---|
| Sentinel | AccessibilityService (package-filtered) plus `UsageStatsManager` fallback | Window-state and scroll events, session timer | ~8 MB, under 1% CPU |
| Session Risk Model | Rules, then INT8 TFLite or Kotlin GBDT | P(doomscroll) from the feature vector | Under 50 KB binary, ~2 MB RAM |
| Overlay | `WindowManager` (accessibility overlay) plus `ViewPager2` (XML) | Pre-warmed vertical card deck | ~15 to 25 MB while armed, GPU-composited |
| Knowledge and Policy | BKT with forgetting, Thompson sampling, misconception tags | Mastery and format selection | ~3 MB, instant |
| Offline cache | Room (SQLite) plus WorkManager | Pre-fetched bilingual packs over unmetered Wi-Fi | Under 5 MB disk |
| Teacher Studio and Tutor | Cloud RAG plus Supabase | Card generation, review queue, summaries | Cloud |

Add it up: 8 + 2 + (15 to 25) + 3 = **28 to 38 MB**. The envelope target is **40 MB peak PSS**, checked in every build with `adb shell dumpsys meminfo`.

## 6.2 Eight engineering rules for low-RAM student phones

1. **Classic XML layouts.** `ViewPager2` and `ConstraintLayout` for the overlay (~15 to 25 MB). Skip Jetpack Compose on this surface to avoid shader-compilation jank on low-end GPUs.
2. **GPU-composited animation only.** Animate `translationY`, `scaleX`, `scaleY` and `alpha`. No `RenderEffect` blur or dynamic shadows. Use a static `#CC121212` scrim.
3. **Debounce in two layers.** `notificationTimeout` at the system level, a 300 ms quiet gap in code, so a fling counts once.
4. **Offline-first pre-fetch.** WorkManager on unmetered Wi-Fi into Room, with WebP images under 40 KB per card. Prepaid data is expensive; sessions never need a connection.
5. **Aggressive view recycling.** `offscreenPageLimit = 1`, so at most two card views are alive at once.
6. **OEM battery-saver survival.** Guide students through `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` and each vendor's autostart screen (Xiaomi/Redmi, Realme, Vivo, Tecno/Infinix). A persistent foreground notification is needed only in the Usage Access fallback, not for the accessibility service.
7. **Measure, don't claim.** Every build logs RAM (`dumpsys meminfo`), frame stats (`dumpsys gfxinfo`), battery (`dumpsys batterystats`) and event-to-first-frame latency. The pitch quotes measured numbers only.
8. **Fail open.** A watchdog removes the overlay on any exception, timeout or low-memory callback. LearnShift must never trap a student inside a card or crash the app underneath.

---

# 7. Pilot Design and Evaluation

## 7.1 What we measure

| Metric | How | What it tells us |
|---|---|---|
| Learning gain | 5-item pre and post check on the same skill, using items that are not in the cards | Did they learn anything? |
| Retention | Same skill re-checked after 7 days with fresh variants | Did it stick? |
| Conversion | Share of Armed events that end in a completed deck | Is doomscroll time turning into learning time? |
| Acceptance | Accepted cards vs dismissals under 2 seconds | Is the timing tolerable? |
| Regret | One-tap "Did you mean to scroll this long?" at session end | A wellbeing signal in the student's own words |
| Trust and safety | Opt-out rate, complaints, crash-free sessions | Do students and families keep it on? |
| Performance | Peak PSS, janky-frame share, daily battery use, event-to-first-frame latency | Does it run on 2 GB to 4 GB phones? |

## 7.2 Two stages

**AIdeathon mini-pilot (Days 13 to 16).** 5 to 10 volunteers on real budget phones, with guardian consent and student assent. One to two days of silent logging with no cards, then one to two days with interventions on. This is a *feasibility* test. It can tell us about acceptance, timing, bugs and performance. It cannot prove learning gains, and we will not present it that way.

**Full pilot (after AIdeathon, about 4 weeks).** A two-week silent baseline, then two weeks of interventions. Where possible, two groups with a delayed start, so exams, holidays and weekends are not mistaken for an effect of LearnShift. Report effect sizes with confidence intervals, and call small samples small.

## 7.3 Targets to test *(not results)*

- Peak PSS of 40 MB or less. Daily battery impact under 2%.
- Janky frames under 5% during the slide-up on the budget test phone.
- Event-to-first-frame of 100 ms or less.
- Median dismissal-within-2-seconds rate under 50% after the first week.
- At least 40% of Level 1 cards accepted.

**Stop rule.** If a student's dismissal-within-2-seconds rate stays above 70% for 3 days, frequency halves automatically and the student is asked how often they want cards.

---

# 8. Risks and Honest Limitations

| Risk | Why it matters | Mitigation |
|---|---|---|
| Target apps do not emit scroll events reliably | The swipe takeover depends on them, and app updates can change behavior | Day-1 probe per app and version. Time-only mode as fallback. Re-test before the demo. |
| Play review, or Android 17 Advanced Protection Mode | Accessibility is the most scrutinized permission | Prominent disclosure, Play declaration, permission ladder (Section 5) |
| OEMs kill the background service | Xiaomi, Realme, Vivo and Tecno are aggressive | Guided onboarding, watchdog, Levels A and B work without Accessibility |
| Students tune the cards out | Desensitization is well documented | Receptivity gate, daily caps, bandit, annoyance guard |
| LLM writes wrong math or stiff Taglish | Hurts trust and learning | Solver verification, teacher approval, no free-text answers from the model |
| Overlay feels janky | The takeover is the heart of the demo | Pre-warmed window, latency budget, measurement, fade-in fallback |
| LearnShift becomes another habit loop | Contradicts the mission | Finite by design: caps, no streaks, "Done for today" |
| Seen as spyware | Trust decides adoption | Privacy Receipt, manifest-verifiable no-content setting, same view for guardians |
| Over-claiming results | Judges and teachers will ask | Two-stage pilot, targets labeled as targets |

---

# 9. 16-Day Build and Verification Plan

**Phase 1 (Days 1 to 4): Sentinel and telemetry.**
- Days 1 and 2: a log-only probe that records whether each target app emits `TYPE_VIEW_SCROLLED`. Build a per-app compatibility matrix and decide go or no-go for the swipe takeover app by app.
- Package-filtered service, quiet-gap swipe counter, 1 Hz feature vector, Privacy Receipt data model.
- *Exit:* daily battery impact under 2% (`adb shell dumpsys batterystats`), Sentinel RAM near 8 MB.

**Phase 2 (Days 5 to 8): Overlay and Deceleration cards.**
- Pre-warmed accessibility overlay, `ViewPager2` deck, heads-up pill, slide-up animation, fail-open watchdog.
- Load 10 localized Grade 7 Math cards and a set of deceleration cards.
- *Exit:* event-to-first-frame of 100 ms or less, janky frames under 5% (`adb shell dumpsys gfxinfo`) on a budget test phone, peak PSS of 40 MB or less.

**Phase 3 (Days 9 to 12): Gap engine, bandit and Teacher Studio MVP.**
- BKT with forgetting across 5 to 8 skills, misconception tags, contrast cards.
- Thompson sampling with the reward in Section 4.2, and a small simulated student to check it converges.
- Teacher Studio MVP: one uploaded module goes through templates, the solver and the approval queue into an offline pack.
- *Exit:* 30 approved cards, passing BKT unit tests, bandit simulation behaving as expected.

**Phase 4 (Days 13 to 16): Dashboards, mini-pilot and demo capture.**
- Supabase sync of learning summaries. Teacher heatmap with misconception ranking. Guardian weekly summary that matches the student's own view.
- Mini-pilot (Section 7.2). Record live 60 FPS transitions for the pitch video.
- *Exit:* the demo script in Section 11 runs end to end three times in a row without a restart.

---

# 10. Peer-Reviewed Research Foundations

**Interventions for scrolling and overuse**

1. **Time2Stop: Adaptive and Explainable Human-AI Loop for Smartphone Overuse Intervention** (Orzikulova et al., CHI 2024). An adaptive system that learns when an intervention is welcome and explains why it appeared. *We use:* passive metadata, adaptive timing and a visible explanation on every intervention.
2. **InteractOut: Leveraging Interaction Proxies as Input Manipulation Strategies for Reducing Smartphone Overuse** (Lu et al., CHI 2024). Reshapes the interaction itself instead of relying on blunt timers. *We use:* answering the swipe with a card instead of a hard lock.
3. **FinerMe: Examining App-level and Feature-level Interventions to Regulate Mobile Social Media Use** (Orzikulova et al., CSCW 2023, *PACM HCI* 7(CSCW2), Article 274). In a 16-day field study with 56 participants, both app-level and feature-level interventions reduced social media time, and feature-level ones reduced time on passive features such as scrolling feeds. *We use:* targeting the scrolling feature, not the whole app.
4. **Scrolling in the Deep: Analysing Contextual Influences on Intervention Effectiveness during Infinite Scrolling on Social Media** (Meinhardt et al., CHI 2025). A 7-day study with 72 participants using an Android Accessibility-based tracker across TikTok, Instagram and other platforms. Users became desensitized when interventions lacked contextual relevance. *We use:* it shows scroll tracking through the Accessibility Service is feasible in the field, and it is the reason cards are tied to time of day and the student's interests.
5. **Can't Stop: How Context and Individual Traits Influence Effectiveness of Different Gradual Interventions for Infinite Scrolling on Short-Form Video Platforms** (Meinhardt et al., *IMWUT* 2026, doi:10.1145/3831979). A pop-up worked at first and then lost impact, a visual gradual intervention held up longest, and for highly impulsive participants the explicit pop-up worked best. *We use:* the friction ladder and learning each student's level instead of fixing one.
6. **Just-in-Time Adaptive Interventions (JITAIs) in Mobile Health** (Nahum-Shani et al., *Annals of Behavioral Medicine*, 2018). The framework of matching support to a person's state and receptivity. *We use:* the receptivity gate.

**Learning science**

7. **Knowledge Tracing: Modeling the Acquisition of Procedural Knowledge** (Corbett and Anderson, *User Modeling and User-Adapted Interaction* 4, 1994). *We use:* the BKT update and the 0.95 mastery threshold.
8. **Test-Enhanced Learning: Taking Memory Tests Improves Long-Term Retention** (Roediger and Karpicke, *Psychological Science*, 2006). *We use:* Card 3 as retrieval practice, not a re-read.
9. **A Trainable Spaced Repetition Model for Language Learning** (Settles and Meeder, ACL 2016). Half-life regression. *We use:* the idea behind the forgetting heuristic in Section 4.1.

---

# 11. AIdeathon Demo Script (about 90 seconds)

| Time | Show | Say |
|---|---|---|
| 0:00 to 0:10 | A student scrolling a feed. The heads-up pill appears. | "LearnShift noticed the scroll pattern, not the video." |
| 0:10 to 0:25 | Swipe up. The card slides over the feed. Taglish hook. | "Same swipe the student already does. New destination." |
| 0:25 to 0:45 | Micro-lesson, then the one-tap check. A wrong answer shows its misconception. A right answer shows "Quiet for 20 minutes." | "Wrong answers teach. Right answers buy back time." |
| 0:45 to 0:55 | Late-night mode: Deceleration Deck, Goodnight card. | "After bedtime it slows down instead of speeding up." |
| 0:55 to 1:10 | The Privacy Receipt, and the `canRetrieveWindowContent="false"` line in the manifest. | "Here is what we saw. Here is what the OS stops us from seeing." |
| 1:10 to 1:25 | Teacher Studio: upload a module, approve cards, open the heatmap with the top misconceptions. | "Teachers see why the class is stuck, never what students scroll." |
| 1:25 to 1:30 | Measured RAM, battery and latency on screen. | "Measured on a budget phone." |

**Claims to avoid in the pitch:** proven learning gains before the pilot, zero battery cost, support for every app, and any number we have not measured.

