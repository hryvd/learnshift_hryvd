# Motion and surface polish: implementation plan

Branch: `feat/hardened-fixes` (not merged). Status: **awaiting approval.** Nothing implemented.
Evidence: the owner's video `LEARNSHIF TFIX.mp4` (5.7 s, 30 fps; looked at as 10 fps contact sheets), two Day-theme screenshots, and source on this branch.

## 1. Plus button morph and press feedback

### What the video shows
- **Open, about 0.3 s:** the orange button turns into a **tall, narrow dark column**, with the "Shift" title squashed inside it. One frame later it's a full-size card, and the tiles fade in at a smaller scale.
- **Close, about 0.25 s:** the card shrinks into a small card, then an **orange square** (not a circle), then disappears. It reads as two objects swapping, not one object changing shape.

### Root causes (code)
| Cause | Where |
|---|---|
| Width and height scale **separately**, from 58×58 up to about 390×650, so the whole card is squashed or stretched, header and title included. The header has no fade, so the squashed "Shift" shows. | `ShiftMorph.tsx` `cardStyle` (scaleX/scaleY) |
| The corner radius scales along with it, so 28 px corners shrink to about 4 px and the button becomes a square. Only the top corners are rounded at all. | `styles.card` + scale |
| The orange shell disappears by 42% of the way, so the color jumps from orange to the card color early. | `accentShellStyle` [0, 0.42] |
| Opening uses a spring that shoots most of the distance in the first ~120 ms. Closing uses a stiffer spring set not to overshoot, so it stops abruptly in about 250 ms. | `spring.smooth` / `spring.snappy` + `overshootClamping` |
| Every button press uses `spring.snappy` (damping ratio about 0.56), which overshoots, so **every button wobbles** when released. | `PressableScale.tsx`, `CenterPlusButton` rotation, `SegmentedControl` thumb |
| Tab selection "pop" uses `spring.bouncy` (ratio about 0.42) on navigation the student does 100+ times a day. | `FloatingBar.tsx` `BarTab` |

### Redesign: one object, Apple-style
Two separate layers instead of one stretched card:
1. **Shape layer** (no content), positioned with left, top, width, height and corner radius:
   - It runs on the animation thread. Only one simple view changes size, which is safe on the new architecture.
   - It moves from the button's circle (58×58, radius 29, accent color) to the card (full width, top radius `radius.sheet`, bottom radius matching the phone's screen corner).
   - Its color blends from accent to the surface color over the first 55%. Its shadow grows from the button's orange glow to the sheet shadow.
2. **Content layer** (header and tiles) sits in its final position and is **never stretched**.
   - It appears from 35% to 100%: fade, an 8 px rise, and a slight zoom (0.97 to 1).
   - Tiles stagger in about 24–40 ms apart, slightly uneven, and never block taps.
3. **Plus glyph layer** travels from the button's center to the close button, turns 45° into ×, and changes color from white to the text color. It stays one object the whole way.
4. **Timing**, using a spring set by duration and damping ratio (Reanimated 4):

   | Motion | Spring |
   |---|---|
   | Open | `{ duration: 520, dampingRatio: 0.88 }` |
   | Close (faster than open) | `{ duration: 380, dampingRatio: 1 }` |
   | Content on close | fades out in the first 35% |

   The scrim follows an ease-out curve to 0.4 opacity. Springs keep their speed when interrupted, so tapping again mid-animation reverses smoothly.
5. **Behind the card:** the screen and tab bar move back slightly (scale 0.97, 6 px down), like iOS sheets. This is optional; I recommend it.
6. **Drag down:** the card follows the finger with resistance near the top. A quick flick (speed over about 0.11 px/ms) closes it regardless of distance.
7. **Haptics:** a light tap when touched, a soft one when it finishes opening, none on close.
8. **Reduced motion:** a 180 ms crossfade, with no movement or size change.

### Press feedback everywhere (output of `find-animation-opportunities`)

| # | Location | Today | Purpose | Frequency | Motion |
|---|---|---|---|---|---|
| 1 | `ShiftMorph.tsx` | Squash/stretch scale morph | Spatial consistency | Occasional | Shape, content and glyph layers as above |
| 2 | `PressableScale.tsx` | One underdamped spring both ways; wobbles on release | Feedback | Tens/day | Press-in: 110 ms ease-out `bezier(0.23,1,0.32,1)` to the scale. Release: spring `{duration:300, dampingRatio:1}`. No overshoot. |
| 3 | `FloatingBar.tsx` `BarTab` | Bouncy 1.14× pop on every tab change | Feedback | 100+/day | Remove the pop. Keep the icon lift and label fade with a 220 ms critically damped spring. |
| 4 | `CenterPlusButton`, `SegmentedControl`, `Toggle` | `snappy` (wobbles) | State | Tens/day | New `spring.ui = {duration:280, dampingRatio:1}` |
| 5 | Raw `Pressable`s with no feedback: `FullQuizOverlay.tsx:493`, `MicroDeckView.tsx:323,487`, `onboarding.tsx:627`, `WheelPicker.tsx:123`, `focus.tsx:79`, the morph's close button | No press response | Feedback | Occasional | Switch to `PressableScale` (0.96, or 0.98 for cards) |

Add to `src/design/motion.ts`:
- `spring.ui`
- `spring.morphOpen` and `spring.morphClose`
- `ease.outStrong = bezier(0.23,1,0.32,1)`
- `ease.drawer = bezier(0.32,0.72,0,1)`

These replace one-off values, so the whole app shares one motion system.

### Rejected
- **Tab bar switch animation between screens:** it's core navigation used 100+ times a day, so it stays instant.
- **Stagger on every Settings card entering:** seen many times a day, so it would feel slow. Keep it only in the plus card.
- **Bounce on the morph:** it's a functional surface, so no visible bounce (ratio ≥ 0.88).

### Acceptance
- A 60 fps screen recording, played frame by frame:
  - no frame shows squashed or stretched text
  - the shape stays rounded the whole way (never a square)
  - the color changes gradually
  - open takes about 0.5 s and close about 0.38 s
- Ten fast taps on +: it never sticks and the tab bar always works afterwards.
- No button wobbles on release.
- Measured on an Android phone (dropped frames on budget Android) and on iPhone through Expo Go.

## 2. Settings tiles: dirty white with modern shadows

### Today
White `#FFFFFF` tiles with a hairline border. Titles get cut short ("Offline pa…", "Link a guard…", and in the plus card "White Sw…", "Start a br…", "App Guar…").

### Change (`FeatureTile`, Day theme)
- **Surface:** warm paper `#F0EEE9` (option A in the mock). It's a dirty white that matches the warm `#F6F5F1` background. B Stone `#E8E5DE` and C Mist `#E6E7EA` are the alternatives.
- **Shadow:** no border. Uses React Native 0.88's `boxShadow` with several layers, which works the same on Android, iOS and web:
  `0 1px 2px rgba(28,25,20,.06), 0 8px 22px -10px rgba(28,25,20,.18), inset 0 1px 0 rgba(255,255,255,.7)`
  A tight contact shadow, a soft lifted shadow, and a thin highlight along the top edge.
- **Pressed:** the shadow tightens (lift down to 4 px) and the tile scales to 0.98 over 110 ms.
- **Text fit:** titles get up to 2 lines, the art shrinks to 56 px and stays tucked in the corner, and the status line wraps instead of being cut off.
- **Contrast:** check text on `#F0EEE9`. `#5F636A` is about 5.4:1 and `#C8400F` is about 4.6:1, both above 4.5:1.
- **Night:** keep the current colors and add the same layered shadow at higher opacity, so it matches.
- The same tile appears on Profile, the plus card and Wind-down, so all three update together.

## 3. Bottom navigation bar

### Today (`FloatingBar.tsx`)
| Platform | Layers |
|---|---|
| Android | a solid 88% white frost under the blur, so almost no blur is visible |
| All | blur strength 80, plus a tint wash, a highlight gradient, a white top rim stroke, and a 7% outline stroke |

### Change
- **Blur strength 5** (`BlurView`; on Android, Dimezis at intensity 5). Remove the 88% frost layer once the blur has sampled. Keep it only as a fallback before the first sample, so the bar never flashes black.
- **Remove** the highlight gradient, the rim stroke and the outline stroke.
- **Edge light wrap:** light glowing inward from every edge, with no line, using inset `boxShadow`:
  `inset 0 0 0 .5px rgba(255,255,255,.55), inset 0 1px 10px rgba(255,255,255,.75), inset 0 -1px 8px rgba(255,255,255,.35)`
  Night uses about 1/4 of those white levels.
- **Legibility:** with very little blur, icons sit over busy content. A 62% white tint (night: 55% `#161A2C`) keeps idle icons at about 4.5:1. I'll tune it on a real phone over the gradient-heavy Home screen.
- Keep one soft drop shadow: `0 10px 26px -8px rgba(28,25,20,.22)`.
- iOS 26 liquid glass (`GlassView`) is unchanged.

## Order and verification
1. Motion tokens and `PressableScale` (item 1, rows 2–5).
2. `ShiftMorph` rebuild (item 1, row 1).
3. `FeatureTile` (item 2).
4. `FloatingBar` (item 3).
5. Run typecheck, lint, `test:local` and `export:web`.
6. Before/after screen recordings in Expo Go (iPhone) and on a mid-range Android, played frame by frame. Dev gallery screenshots `?mode=both`.
7. Update DECISIONS.md: motion tokens, morph layers, tile surface, bar recipe.

All JS only; no native rebuild is needed. Can ship by OTA after approval.
About 1–1.5 days.

## Decisions needed
1. Tile color: **A Warm paper (recommended)**, B Stone, or C Mist gray.
2. Background recedes behind the open card (iOS sheet style): **yes (recommended)** or no.
