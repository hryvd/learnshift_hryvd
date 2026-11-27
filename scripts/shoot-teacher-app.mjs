// Screenshots + checks for the teacher desktop app build (dist-teacher/).
//   npm run export:teacher && node --env-file=.env scripts/shoot-teacher-app.mjs [--store]
// --store also writes the Microsoft Store / manifest screenshots into web-teacher/screenshots/.
// Uses one throwaway @learnshift-test.com teacher (deleted at the end).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const ROOT = path.resolve('dist-teacher');
const OUT = 'e2e-shots/teacher-app';
const STORE = process.argv.includes('--store');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf' };
const server = http
  .createServer((req, res) => {
    let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(ROOT, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  })
  .listen(8767);
const BASE = 'http://localhost:8767';
const results = [];
const log = (id, ok, note = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id}${note ? ` — ${note}` : ''}`);
};

const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_KEY, { auth: { persistSession: false } });
const email = `ls-test-teacher-app-${Date.now().toString(36)}@learnshift-test.com`;
const PW = 'Test-pass-1234';
const browser = await chromium.launch();
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));

  await p.goto(BASE + '/');
  await p.waitForTimeout(3500);
  const title = await p.title();
  log('Signed out → teacher sign-in, no role picker, no phone frame', /onboarding/.test(p.url()) && (await p.getByText('Who’s here?').count()) === 0 && (await p.locator('iframe').count()) === 0, `${p.url()} · title "${title}"`);
  log('App title is LearnShift for Teachers', title === 'LearnShift for Teachers', title);
  log('No Google button', (await p.getByRole('button', { name: /Google/ }).count()) === 0);
  await p.screenshot({ path: `${OUT}/signin-1366.png` });
  if (STORE) await p.screenshot({ path: 'web-teacher/screenshots/signin.png' });
  for (const [w, h] of [[1280, 720], [1920, 1080], [960, 600], [390, 844]]) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(600);
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await p.screenshot({ path: `${OUT}/signin-${w}.png` });
    log(`Sign-in ${w}×${h}: no sideways scroll`, ov <= 0, `${ov}px`);
  }
  await p.setViewportSize({ width: 1366, height: 768 });

  // Validation: empty submit shows a message, no network call
  await p.getByRole('button', { name: 'Sign in', exact: true }).click();
  await p.waitForTimeout(500);
  log('Empty sign-in shows a friendly error', (await p.getByText('Enter your school or personal email address.').count()) > 0);

  // Create account through the new form
  await p.getByRole('button', { name: 'Create a teacher account' }).click();
  await p.waitForTimeout(700);
  await p.getByRole('textbox', { name: 'Your name' }).fill("Ana O'Brien Reyes");
  await p.getByRole('textbox', { name: 'Email' }).fill('  ' + email.toUpperCase() + ' ');
  await p.locator('input[type=password]').fill(PW);
  await p.screenshot({ path: `${OUT}/signup-1366.png` });
  await p.getByRole('button', { name: 'Create account', exact: true }).click();
  await p.waitForURL(/\/teacher/, { timeout: 25000 });
  await p.waitForTimeout(3000);
  await c.auth.signInWithPassword({ email, password: PW });
  const { data: prof } = await c.from('profiles').select('role, display_name').single();
  log('Sign-up creates a teacher (email trimmed + lowercased, apostrophe kept)', prof?.role === 'teacher' && prof?.display_name === "Ana O'Brien Reyes", JSON.stringify(prof));

  // A class, then the invite dialog
  await p.getByPlaceholder('Grade 8 – Sampaguita').fill('Grade 6 – Sampaguita');
  await p.getByRole('button', { name: 'Grade 6', exact: true }).click();
  await p.getByRole('button', { name: 'Create class' }).click();
  await p.waitForTimeout(3500);
  if (STORE) await p.screenshot({ path: 'web-teacher/screenshots/classes.png' });
  await p.getByRole('button', { name: /Invite students with code/ }).click();
  await p.waitForTimeout(1800);
  log('Invite dialog shows QR + code', (await p.getByLabel('Class join QR code').count()) === 1 && (await p.getByRole('dialog', { name: 'Invite students' }).count()) === 1);
  await p.screenshot({ path: `${OUT}/invite.png` });
  if (STORE) await p.screenshot({ path: 'web-teacher/screenshots/invite.png' });
  await p.getByRole('button', { name: 'Show on classroom screen' }).click();
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/invite-present.png` });
  log('Classroom screen mode opens', (await p.getByRole('dialog', { name: 'Join code for the class' }).count()) === 1);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);
  log('Esc steps back out of both', (await p.getByRole('dialog').count()) === 0);

  // Night sign-in look
  if (STORE) {
    await p.keyboard.press('u');
    await p.waitForTimeout(900);
    await p.getByRole('button', { name: 'Load sample lesson' }).click();
    await p.waitForTimeout(400);
    await p.screenshot({ path: 'web-teacher/screenshots/studio.png' });
    await p.keyboard.press('Escape');
  }
  await p.getByRole('button', { name: /Switch to Night theme/ }).click();
  await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'Sign out' }).first().click();
  await p.waitForTimeout(3000);
  await p.screenshot({ path: `${OUT}/signin-night.png` });

  // Privacy policy route
  await p.goto(BASE + '/privacy-policy');
  await p.waitForTimeout(2500);
  log('Privacy policy page renders', (await p.getByRole('heading', { name: 'Privacy policy' }).count()) === 1);

  // Join link page (student side, same codebase)
  const ok = await (await fetch(`${BASE}/manifest.json`)).json();
  log('Teacher manifest: name, id, maskable icon, screenshots', ok.name === 'LearnShift for Teachers' && ok.id === '/teacher' && ok.icons.some((i) => i.purpose === 'maskable') && ok.screenshots.length >= 3);
} catch (e) {
  log('script', false, e.stack);
} finally {
  await c.auth.signInWithPassword({ email, password: PW });
  const { error } = await c.functions.invoke('delete-account', { body: {} });
  console.log(`cleanup: ${error ? 'FAILED ' + error.message : 'deleted'}`);
  await browser.close();
  server.close();
  const errs = [...new Set(errors)];
  console.log(`console errors: ${errs.length}${errs.length ? '\n' + errs.join('\n') : ''}`);
  console.log(`${results.filter(Boolean).length}/${results.length} passed`);
  process.exitCode = results.every(Boolean) ? 0 : 1;
}
