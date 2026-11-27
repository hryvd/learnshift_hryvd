# LearnShift for Teachers: Google sign-in and Microsoft Store

The teacher desktop app is the same codebase built with `EXPO_PUBLIC_APP=teacher`
(`npm run export:teacher` → `dist-teacher/`). It is deployed to its own address:

```bash
npm run export:teacher
npx eas-cli@latest deploy --alias teacher --export-dir dist-teacher
# → https://learnshift--teacher.expo.app
```

Students keep using https://learnshift.expo.app (class QR codes open `…/join/CODE` there).

## 1. Sign-in

Teachers sign in with email and password. Google sign-in was removed for now; the
`claim_teacher_role()` database function from that work is still in place (unused) if it returns.
Add `https://learnshift--teacher.expo.app/reset-password` to Supabase → Authentication →
URL Configuration → Redirect URLs so password-reset emails open the teacher app.

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
