// Teacher laptop end-to-end checks against the built website + the LIVE Supabase project.
//   npm run export:web
//   node --env-file=.env scripts/e2e-teacher-desktop.mjs
// Creates throwaway @learnshift-test.com accounts and deletes them at the end.
// Screenshots go to e2e-shots/. Exit code 1 if any check fails.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY;
if (!URL_ || !KEY) {
  console.error('Run with --env-file=.env');
  process.exit(1);
}
const ROOT = path.resolve('dist');
if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error('Run `npm run export:web` first.');
  process.exit(1);
}
const PORT = 8765;
const BASE = `http://localhost:${PORT}`;
const OUT = 'e2e-shots';
fs.mkdirSync(OUT, { recursive: true });

// ── Static server with SPA fallback (what EAS Hosting does) ──
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.css': 'text/css' };
const server = http
  .createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(ROOT, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  })
  .listen(PORT);

// ── Fixtures ──
const FIX = path.join(OUT, 'fixtures');
fs.mkdirSync(FIX, { recursive: true });
const LESSON = [
  'Slope of a Line',
  'The slope of a line measures how steep it is. Slope equals rise over run.',
  'For two points (x1, y1) and (x2, y2), slope m = (y2 - y1) / (x2 - x1).',
  'A positive slope rises from left to right. A negative slope falls from left to right.',
  'A horizontal line has slope zero. A vertical line has an undefined slope.',
].join('\n');
fs.writeFileSync(path.join(FIX, 'slope.txt'), LESSON);
fs.writeFileSync(
  path.join(FIX, 'slope.html'),
  `<html><head><style>.x{color:red}</style><script>alert(1)</script></head><body><h1>Slope</h1><p>${LESSON.replace(/\n/g, '</p><p>')}</p></body></html>`,
);

const run = Date.now().toString(36);
const PW = 'Test-pass-1234';
const results = [];
const log = (id, ok, note = '') => {
  results.push({ id, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id}${note ? ` — ${note}` : ''}`);
};

const accounts = [];
async function makeUser(role, name, grade = null) {
  const c = createClient(URL_, KEY, { auth: { persistSession: false } });
  const email = `ls-test-${role}-${run}-${accounts.length}@learnshift-test.com`;
  const { data, error } = await c.auth.signUp({ email, password: PW, options: { data: { role, display_name: name, grade, lang: 'en' } } });
  if (error || !data.session) throw new Error(`signup ${role}: ${error?.message ?? 'no session'}`);
  const u = { c, email, id: data.user.id, role };
  accounts.push(u);
  return u;
}

const browser = await chromium.launch();
const consoleErrors = [];
async function page(w, h, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, acceptDownloads: true, ...opts });
  const p = await ctx.newPage();
  p.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 220));
  });
  p.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message.slice(0, 220)));
  return { ctx, p };
}
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const nav = (p) => p.getByRole('navigation', { name: 'Teacher workspace' }).count();
async function signIn(p, email) {
  await p.goto(`${BASE}/onboarding?mode=signin`);
  await p.getByPlaceholder('you@example.com').fill(email);
  await p.locator('input[type=password]').fill(PW);
  await p.getByRole('button', { name: 'Sign in' }).last().click();
  await p.waitForURL(/\/teacher|\/home|\/guardian|\/onboarding/, { timeout: 20000 });
  await p.waitForTimeout(2500);
}

try {
  const teacherA = await makeUser('teacher', 'Ana Reyes');
  const teacherB = await makeUser('teacher', 'Ben Cruz');
  const student = await makeUser('student', "Mika O'Brien Santos", 8);

  // ── Entry ──
  {
    const { ctx, p } = await page(1280, 720);
    await p.goto(`${BASE}/`);
    await p.waitForTimeout(2000);
    log('Student root keeps phone frame', (await p.locator('iframe[title=LearnShift]').count()) === 1);
    await p.goto(`${BASE}/teacher`);
    await p.waitForTimeout(2500);
    log('Signed-out /teacher → sign-in, no frame', /onboarding/.test(p.url()) && (await p.locator('iframe').count()) === 0, p.url());
    await p.goto(`${BASE}/reset-password`);
    await p.waitForTimeout(2500);
    log('Reset page without email token is refused', (await p.getByText(/expired or was already used/).count()) > 0);
    await ctx.close();
  }

  // ── Classes ──
  const { ctx: tctx, p: t } = await page(1366, 768);
  await signIn(t, teacherA.email);
  log('Teacher lands on /teacher with sidebar + top bar', /\/teacher/.test(t.url()) && (await nav(t)) === 1 && (await t.getByRole('banner').count()) >= 1, t.url());
  await t.getByPlaceholder('Grade 8 – Sampaguita').fill('Grade 8 – Narra');
  await t.getByRole('button', { name: 'Grade 8', exact: true }).click();
  await t.getByRole('button', { name: 'Create class' }).click();
  await t.waitForTimeout(3000);
  const { data: cls } = await teacherA.c.from('classes').select('id, name, grade, join_code').eq('teacher_id', teacherA.id);
  const klass = cls[0];
  await teacherA.c.from('classes').insert({ name: 'Grade 8 – Molave', grade: 8 });
  await student.c.rpc('join_class', { p_code: klass.join_code });
  await t.reload();
  await t.waitForTimeout(5000);
  log('Student appears on heatmap', (await t.getByText("Mika O'Brien Santos").count()) > 0);

  for (const [w, h, label] of [[1280, 720], [1366, 768], [1920, 1080], [1024, 576, '1280@125%'], [853, 480, '1280@150%']]) {
    await t.setViewportSize({ width: w, height: h });
    await t.waitForTimeout(700);
    const ov = await overflow(t);
    const n = await nav(t);
    await t.screenshot({ path: `${OUT}/heatmap-${label ?? `${w}x${h}`}.png` });
    // Below 960 CSS px the phone layout takes over by design.
    log(`Viewport ${label ?? `${w}×${h}`}: no sideways scroll`, ov <= 0 && (w >= 960 ? n === 1 : n === 0), `overflow=${ov}px sidebar=${n}`);
  }
  await t.setViewportSize({ width: 1366, height: 768 });
  await t.locator('body').click({ position: { x: 700, y: 20 } });
  await t.keyboard.press('/');
  log('"/" focuses student search', (await t.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Search students');
  await t.keyboard.press('Escape');
  await t.locator('body').click({ position: { x: 700, y: 20 } });
  await t.keyboard.press('u');
  await t.waitForTimeout(800);
  log('"U" opens Module Studio', (await t.getByRole('dialog', { name: 'Upload a lesson' }).count()) === 1);
  await t.keyboard.press('Escape');
  await t.waitForTimeout(500);
  log('Esc closes the dialog', (await t.getByRole('dialog', { name: 'Upload a lesson' }).count()) === 0);

  const dl = t.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await t.getByRole('button', { name: 'Export CSV' }).click();
  const file = await dl;
  const csv = file ? fs.readFileSync(await file.path(), 'utf8') : '';
  log('CSV export downloads mastery', csv.includes("Mika O'Brien Santos") && csv.includes('Root gap'), file?.suggestedFilename() ?? 'no download');

  const cell = t.getByRole('button', { name: /Mika O'Brien Santos, .*%/ }).first();
  await cell.focus();
  await t.keyboard.press('Enter');
  await t.waitForTimeout(800);
  const drawer = await t.getByRole('dialog', { name: "Mika O'Brien Santos" }).count();
  await t.screenshot({ path: `${OUT}/cell-drawer.png` });
  await t.keyboard.press('Escape');
  await t.waitForTimeout(500);
  log('Cell opens right drawer; Esc closes it', drawer === 1 && (await t.getByRole('dialog', { name: "Mika O'Brien Santos" }).count()) === 0, `open=${drawer}`);

  // Night theme contrast on cells
  await t.getByRole('button', { name: /Switch to Night theme/ }).click();
  await t.waitForTimeout(1800);
  const ink = await t.evaluate(() => {
    const el = [...document.querySelectorAll('[role=button]')].find((b) => /Mika O'Brien Santos, .*%/.test(b.getAttribute('aria-label') || ''));
    const txt = el?.querySelector('[dir]');
    return txt ? getComputedStyle(txt).color : null;
  });
  const theme = await t.evaluate(() => document.documentElement.dataset.theme);
  await t.screenshot({ path: `${OUT}/heatmap-night.png` });
  log('Night theme: dark ink on mastery cells + data-theme synced', theme === 'night' && ink !== 'rgb(255, 255, 255)', `theme=${theme} ink=${ink}`);
  await t.getByRole('button', { name: /Switch to Day theme/ }).click();
  await t.waitForTimeout(1500);

  // Student page: direct URL + prev/next
  await t.goto(`${BASE}/teacher/student/${student.id}`);
  await t.waitForTimeout(5000);
  log('Direct student URL loads with breadcrumb', (await t.getByText(/Mika O'Brien Santos/).count()) > 0 && (await t.getByRole('link', { name: /Classes/ }).count()) > 0);

  // ── Module Studio (UploadDropCard + Private Drafts + Immutable Snapshots) ──
  await t.goto(`${BASE}/teacher/modules`);
  await t.waitForTimeout(3500);
  await t.keyboard.press('u');
  await t.waitForTimeout(800);
  await t.screenshot({ path: `${OUT}/upload-card-idle.png` });

  // Unsupported file type fails with plain-language message in the card
  const exePath = path.join(FIX, 'bad.exe');
  fs.writeFileSync(exePath, 'MZ-not-a-lesson');
  await t.locator('input[type=file]').last().setInputFiles(exePath);
  await t.waitForTimeout(1000);
  const badRejected = (await t.getByText(/can't read this file type/i).count()) > 0;
  await t.screenshot({ path: `${OUT}/upload-card-failed.png` });
  log('Upload card rejects .exe with plain-language error', badRejected);

  // HTML lesson: scripts/styles stripped & uploaded privately
  await t.locator('input[type=file]').last().setInputFiles(path.join(FIX, 'slope.html'));
  await t.waitForTimeout(3000);
  const text = await t.getByRole('textbox', { name: /Lesson content/ }).inputValue().catch(() => '');
  log('HTML lesson: scripts/styles stripped', text.includes('rise over run') && !text.includes('alert(1)') && !text.includes('color:red'));

  await t.locator('input[type=file]').last().setInputFiles(path.join(FIX, 'slope.txt'));
  await t.waitForTimeout(3000);
  await t.screenshot({ path: `${OUT}/upload-card-ready.png` });

  // Generate creates a PRIVATE draft (student sees nothing!)
  await t.getByRole('button', { name: 'Generate draft quiz' }).click();
  await t.waitForSelector('text=Review & edit draft', { timeout: 60000 });
  await t.screenshot({ path: `${OUT}/studio-review.png` });

  const { data: beforeAssign } = await student.c.from('class_modules').select('id').eq('class_id', klass.id);
  log('Draft is invisible to students before assigning', (beforeAssign ?? []).length === 0, `${beforeAssign?.length ?? 0} rows`);

  // Edit Question 2 prompt (default Quiz tab) + Flashcard Front (Flashcards tab) and wait for 800ms autosave
  const q2Prompt = t.getByRole('textbox', { name: 'Question 2 prompt' });
  const targetPrompt = (await q2Prompt.count()) > 0 ? q2Prompt : t.getByRole('textbox', { name: 'Question 1 prompt' });
  await targetPrompt.fill('EDITED Q2: Which formula gives the slope of a line?');
  await t.getByRole('tab', { name: /Flashcards \(/ }).click();
  await t.waitForTimeout(300);
  const front = t.getByRole('textbox', { name: 'Front' }).first();
  await front.fill('EDITED: What is slope?');
  await t.waitForTimeout(2000);
  await t.getByRole('button', { name: 'Save private draft' }).click();
  await t.waitForTimeout(1500);

  // Reload and verify draft edits persisted in DB
  await t.reload();
  await t.waitForTimeout(4000);
  const { data: persistedDrafts } = await teacherA.c.from('quiz_drafts').select('id, version, flashcards, questions').eq('teacher_id', teacherA.id);
  const persistedEdit =
    persistedDrafts?.[0]?.flashcards?.some((f) => f.front === 'EDITED: What is slope?') &&
    persistedDrafts?.[0]?.questions?.some((q) => q.prompt === 'EDITED Q2: Which formula gives the slope of a line?');
  log('Draft edits persist after reload', !!persistedEdit, `v${persistedDrafts?.[0]?.version ?? 0}`);

  // Assign draft to Class A only (klass)
  await t.getByRole('button', { name: 'Assign', exact: true }).first().click();
  await t.waitForTimeout(800);
  await t.getByRole('button', { name: /Assign to 1 class/ }).click();
  await t.waitForTimeout(4000);
  const { data: mods } = await student.c.from('class_modules').select('id, title, quiz_version, flashcards, questions').eq('class_id', klass.id).eq('published', true);
  const studentSeesEdit = mods?.[0]?.questions?.some((q) => q.prompt === 'EDITED Q2: Which formula gives the slope of a line?');
  log('Assign publishes edited snapshot to class A', !!mods?.length && /^[0-9a-f-]{36}$/.test(mods[0].id) && studentSeesEdit, `${mods?.length} rows v${mods?.[0]?.quiz_version}`);

  // Edit draft again WITHOUT re-assigning -> student still sees old snapshot until "Update students"
  await t.getByRole('button', { name: 'Edit draft' }).first().click();
  await t.waitForTimeout(800);
  await t.getByRole('textbox', { name: 'Title' }).fill('Slope (revised v2)');
  await t.getByRole('button', { name: 'Done', exact: true }).click();
  await t.waitForTimeout(3000);
  const { data: stillOld } = await student.c.from('class_modules').select('title').eq('class_id', klass.id).eq('published', true);
  log('Editing draft does not mutate assigned snapshot', stillOld?.[0]?.title !== 'Slope (revised v2)', stillOld?.[0]?.title);

  // Click "Update students" -> student now sees revised snapshot
  await t.getByRole('button', { name: 'Update students' }).first().click();
  await t.waitForTimeout(3500);
  const { data: updatedSnap } = await student.c.from('class_modules').select('title, quiz_version').eq('class_id', klass.id).eq('published', true);
  log('Update students publishes new snapshot version', updatedSnap?.[0]?.title === 'Slope (revised v2)', `${updatedSnap?.[0]?.title} v${updatedSnap?.[0]?.quiz_version}`);
  await t.screenshot({ path: `${OUT}/modules.png` });

  // ── Review workbench ──
  const { error: seedErr } = await student.c.from('tutor_answers').insert({ student_id: student.id, question_id: 'q1', wrong_index: 0, confidence: 0.4, lang: 'en', content: { what: 'Draft explanation', problems: ['math check failed'] }, source: 'generated', status: 'needs_review' });
  if (seedErr) log('Review workbench', false, `seed failed: ${seedErr.message}`);
  else {
    await t.goto(`${BASE}/teacher/review`);
    await t.waitForTimeout(4000);
    await t.screenshot({ path: `${OUT}/review.png` });
    await t.keyboard.press('e');
    await t.waitForTimeout(500);
    await t.keyboard.press('Escape');
    await t.keyboard.press('a');
    await t.waitForTimeout(3000);
    const { data: ta } = await teacherA.c.from('tutor_answers').select('status, reviewed_by').eq('student_id', student.id);
    log('Review: keyboard approve persists', ta?.[0]?.status === 'approved' && ta?.[0]?.reviewed_by === teacherA.id, JSON.stringify(ta));
  }

  // ── Settings: rename class, invite dialog ──
  await t.goto(`${BASE}/teacher/settings`);
  await t.waitForTimeout(3500);
  await t.getByRole('button', { name: `Edit ${klass.name}` }).click();
  await t.waitForTimeout(600);
  await t.getByRole('textbox', { name: 'Class name' }).fill('Grade 9 – Narra');
  await t.getByRole('radio', { name: 'Grade 9' }).click();
  await t.getByRole('button', { name: 'Save', exact: true }).click();
  await t.waitForTimeout(3000);
  const { data: rn } = await teacherA.c.from('classes').select('name, grade, join_code').eq('id', klass.id).single();
  log('Rename class + grade (code unchanged)', rn.name === 'Grade 9 – Narra' && rn.grade === 9 && rn.join_code === klass.join_code, JSON.stringify(rn));
  await t.getByRole('button', { name: /Invite students with code/ }).click();
  await t.waitForTimeout(800);
  const proj = await t.getByLabel('Class join QR code').count();
  await t.screenshot({ path: `${OUT}/invite.png` });
  await t.keyboard.press('Escape');
  await t.waitForTimeout(500);
  log('Invite dialog shows QR; Esc closes', proj > 0 && (await t.getByRole('dialog', { name: 'Invite students' }).count()) === 0);
  await t.screenshot({ path: `${OUT}/settings.png` });

  // ── Offline + sign-out wipe ──
  await t.goto(`${BASE}/teacher`);
  await t.waitForTimeout(4000);
  const cached = await t.evaluate(() => !!localStorage.getItem('learnshift:teacher-cache:v1'));
  await tctx.setOffline(true);
  await t.evaluate(() => window.dispatchEvent(new Event('offline')));
  await t.waitForTimeout(800);
  log('Offline banner + saved copy', cached && (await t.getByText(/You’re offline/).count()) > 0);
  await tctx.setOffline(false);
  await t.evaluate(() => window.dispatchEvent(new Event('online')));
  await t.getByRole('button', { name: 'Sign out' }).first().click();
  await t.waitForTimeout(3000);
  const left = await t.evaluate(() => Object.keys(localStorage).filter((k) => /teacher|ls-staff/.test(k)));
  log('Sign-out wipes class data + staff flag', left.length === 0 && /onboarding/.test(t.url()), `left=${left.join(',') || 'none'}`);
  await tctx.close();

  // ── Permissions ──
  {
    const { ctx, p } = await page(1280, 720);
    await signIn(p, teacherB.email);
    await p.goto(`${BASE}/teacher/student/${student.id}`);
    await p.waitForTimeout(6000);
    log('Teacher B cannot open teacher A student', (await p.getByText('Student not found').count()) === 1 && (await p.getByText(/Mika O'Brien/).count()) === 0);
    const { data: bm } = await teacherB.c.from('class_modules').select('id');
    const { data: bmast } = await teacherB.c.from('mastery').select('student_id').eq('student_id', student.id);
    const { error: upd } = await teacherB.c.from('classes').update({ name: 'hijack' }).eq('id', klass.id).select().single();
    log("Teacher B: 0 modules, 0 mastery, can't rename A's class", (bm ?? []).length === 0 && (bmast ?? []).length === 0 && !!upd);
    await ctx.close();
  }
  {
    const { ctx, p } = await page(1280, 720);
    await signIn(p, student.email);
    await p.goto(`${BASE}/teacher`);
    await p.waitForTimeout(4000);
    log('Student opening /teacher is redirected', !/\/teacher/.test(p.url()) && (await nav(p)) === 0, p.url());
    const { error } = await student.c.from('classes').insert({ name: 'x', grade: 8 });
    log('Student cannot create classes (RLS)', !!error);
    await ctx.close();
  }
  {
    const { ctx, p } = await page(390, 844);
    await signIn(p, teacherB.email);
    await p.waitForTimeout(2000);
    await p.screenshot({ path: `${OUT}/mobile-390.png` });
    log('Mobile 390×844 keeps the phone layout', (await nav(p)) === 0);
    await ctx.close();
  }

  // ── Dev gallery Day/Night visual check ──
  {
    const { ctx, p } = await page(1280, 900);
    await p.goto(`${BASE}/dev/gallery?mode=both&full`);
    await p.waitForTimeout(2500);
    await p.screenshot({ path: `${OUT}/gallery-both.png`, fullPage: true });
    log('Dev gallery ?mode=both renders Day & Night', (await p.locator('body').innerText()).trim().length > 20);
    await ctx.close();
  }

  // ── PWA ──
  {
    const { ctx, p } = await page(1280, 720);
    const res = await p.goto(`${BASE}/precache.json`);
    const pre = await res.json().catch(() => null);
    const mf = await (await p.goto(`${BASE}/manifest.json`)).json();
    log('precache.json + manifest present', !!pre?.files?.length && mf.start_url === '/teacher', `${pre?.files?.length} chunks`);
    await ctx.close();
  }
} catch (e) {
  log('script', false, e.stack);
} finally {
  for (const a of accounts) {
    // The UI sign-out revokes every session, so sign in again before deleting.
    await a.c.auth.signInWithPassword({ email: a.email, password: PW });
    const { error } = await a.c.functions.invoke('delete-account', { body: {} });
    console.log(`cleanup ${a.role}: ${error ? 'FAILED ' + error.message : 'deleted'}`);
  }
  await browser.close();
  server.close();
  const errs = [...new Set(consoleErrors)];
  console.log(`\nconsole errors (${errs.length} unique)${errs.length ? ':\n' + errs.slice(0, 15).join('\n') : ''}`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} passed`);
  process.exitCode = passed === results.length ? 0 : 1;
}
