# LearnShift for Teachers: Google sign-in and Microsoft Store

The teacher desktop app is the same codebase built with `EXPO_PUBLIC_APP=teacher`
(`npm run export:teacher` → `dist-teacher/`). It is deployed to its own address:

```bash
npm run export:teacher
npx eas-cli@latest deploy --alias teacher --export-dir dist-teacher
# → https://learnshift--teacher.expo.app
```

Students keep using https://learnshift.expo.app (class QR codes open `…/join/CODE` there).

## 1. Turn on Google sign-in (one time, about 15 minutes)

1. **Google Cloud Console** → APIs & Services → **OAuth consent screen**
   - User type: External. App name: *LearnShift for Teachers*. Support email: yours.
   - Scopes: only the defaults (`email`, `profile`, `openid`). No verification review is needed for these.
   - App domain / privacy policy: `https://learnshift--teacher.expo.app/privacy-policy`.
   - Publish the app (Testing mode only allows listed test users).
2. **Credentials** → Create credentials → **OAuth client ID** → *Web application*
   - Authorized redirect URI: `https://awajvyyqlafxyngwhuml.supabase.co/auth/v1/callback`
   - Copy the Client ID and Client secret.
3. **Supabase dashboard** → Authentication → **Sign In / Providers** → Google
   - Enable, paste the Client ID and secret, save.
4. **Supabase dashboard** → Authentication → **URL Configuration** → Redirect URLs, add:
   - `https://learnshift--teacher.expo.app/auth/callback`
   - `https://learnshift--teacher.expo.app/reset-password`
   - `http://localhost:8081/auth/callback` (local development)

Until step 3 is done, the Google button shows "Google sign-in isn't switched on yet. Use your email for now."

How roles work: a first Google sign-in creates a student profile (the database default), then
the app calls `claim_teacher_role()`, which turns it into a teacher only if the account is new
(under 30 minutes), has no email/password identity, and has no class, guardian link or answers.
`scripts/backend-test.mjs` covers the refusals.

## 2. Package for the Microsoft Store (PWABuilder)

Needs a **Microsoft Partner Center** developer account (individual or company; check the current
registration fee when you sign up).

1. Partner Center → Apps and games → **New product → MSIX or PWA app** → reserve the name
   **LearnShift for Teachers**.
2. Product → **Product identity**: note *Package/Identity/Name*, *Publisher (CN=…)* and
   *Publisher display name*.
3. Go to **https://www.pwabuilder.com**, enter `https://learnshift--teacher.expo.app`, run the
   report (manifest, service worker, icons and screenshots are already in place), then
   **Package for stores → Windows → Generate package** and paste the three identity values.
4. Download the zip. Upload the `.msixbundle` in Partner Center → **Packages**.
   (Keep the `.classic` package only if you also target Windows 10 before 1809.)

## 3. Store listing (copy ready to paste)

- **Name:** LearnShift for Teachers
- **Category:** Education
- **Short description:** See every student's skill gaps, turn lesson files into flashcards and quizzes, and review the AI tutor — learning data only.
- **Description:**
  LearnShift for Teachers is the classroom side of LearnShift, the learning app for Filipino students in Grades 1–10.
  - Class mastery heatmap: every student, every skill, with the root gap behind low scores.
  - Module Studio: drop a PDF or Word lesson, review and edit the flashcards and quiz, publish to one or more classes.
  - Review queue: check the AI tutor's flagged explanations before students rely on them.
  - Invite students with a QR code, a link or a 6-character code; show it full screen in class.
  - Works offline for reading; shared-laptop mode for faculty rooms.
  Teachers see learning data only, never screen time.
- **Privacy policy URL:** https://learnshift--teacher.expo.app/privacy-policy
- **Screenshots (1366×768):** `web-teacher/screenshots/` (regenerate with
  `node --env-file=.env scripts/shoot-teacher-app.mjs --store`).
- **Age rating:** complete the IARC questionnaire (no user-to-user chat in the teacher app, no purchases).

## 4. Updating

The Store app loads the deployed site, so each `deploy --alias teacher` reaches teachers on
their next launch. Repackage in PWABuilder only when the manifest (name, icons) changes.
