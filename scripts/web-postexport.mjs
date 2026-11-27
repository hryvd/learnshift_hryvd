// After `expo export -p web`: lists the app's JS chunks in dist/precache.json so the
// service worker can cache every screen on install. Without it, a teacher who goes
// offline can't open a page they hadn't visited yet (routes load lazily).
import fs from 'node:fs';
import path from 'node:path';

const dir = 'dist/_expo/static/js/web';
if (!fs.existsSync(dir)) {
  console.error('FAIL: run `npx expo export -p web` first.');
  process.exit(1);
}
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => `/${path.posix.join('_expo/static/js/web', f)}`);
fs.writeFileSync('dist/precache.json', JSON.stringify({ built: new Date().toISOString(), files }, null, 0));
console.log(`PASS: precache.json lists ${files.length} chunks.`);
