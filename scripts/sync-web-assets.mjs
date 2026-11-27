// Keeps public/pdf.worker.min.mjs identical to the installed pdfjs-dist.
// A mismatched worker breaks PDF reading at runtime ("API version does not match").
//   node scripts/sync-web-assets.mjs          copy the worker into public/
//   node scripts/sync-web-assets.mjs --check  fail if it is out of date
import fs from 'node:fs';

const src = 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs';
const dst = 'public/pdf.worker.min.mjs';
const version = JSON.parse(fs.readFileSync('node_modules/pdfjs-dist/package.json', 'utf8')).version;
const same = fs.existsSync(dst) && fs.readFileSync(src).equals(fs.readFileSync(dst));

if (process.argv.includes('--check')) {
  if (!same) {
    console.error(`FAIL: ${dst} does not match pdfjs-dist ${version}. Run: node scripts/sync-web-assets.mjs`);
    process.exit(1);
  }
  console.log(`PASS: pdf worker matches pdfjs-dist ${version}.`);
} else {
  fs.copyFileSync(src, dst);
  console.log(`${same ? 'Already current' : 'Updated'}: ${dst} (pdfjs-dist ${version}).`);
}
