// Builds LearnShift for Teachers (the teacher-only desktop app) into dist-teacher/.
//   node scripts/export-teacher.mjs
// Same code as the student site, built with EXPO_PUBLIC_APP=teacher, then given its
// own name, manifest (Microsoft Store / PWABuilder ready) and screenshots from web-teacher/.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'dist-teacher';
const NAME = 'LearnShift for Teachers';
const run = (cmd, env = {}) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });

run('node scripts/sync-web-assets.mjs --check');
fs.rmSync(OUT, { recursive: true, force: true });
run(`npx expo export -p web --output-dir ${OUT}`, { EXPO_PUBLIC_APP: 'teacher' });
run(`node scripts/web-postexport.mjs ${OUT}`);

// Teacher identity: manifest, screenshots, title and description.
const copy = (from, to) => {
  for (const f of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, f.name);
    const b = path.join(to, f.name);
    if (f.isDirectory()) {
      fs.mkdirSync(b, { recursive: true });
      copy(a, b);
    } else fs.copyFileSync(a, b);
  }
};
copy('web-teacher', OUT);
const html = path.join(OUT, 'index.html');
let s = fs.readFileSync(html, 'utf8');
s = s
  .replace(/<title>[^<]*<\/title>/, `<title>${NAME}</title>`)
  .replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="Class mastery, lesson modules and tutor review for teachers."`)
  .replace(/<meta name="apple-mobile-web-app-title" content="[^"]*"/, `<meta name="apple-mobile-web-app-title" content="LearnShift Teachers"`);
fs.writeFileSync(html, s);
console.log(`PASS: ${NAME} built in ${OUT}/ (deploy: npx eas-cli@latest deploy --alias teacher --export-dir ${OUT})`);
