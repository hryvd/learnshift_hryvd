import { Platform } from 'react-native';

/** One CSV cell: quoted when needed, and formula-safe for Excel/Sheets. */
function cell(v: string | number | null | undefined): string {
  let s = v == null ? '' : String(v);
  // A leading = + - @ makes spreadsheets run it as a formula (CSV injection).
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

/** Web: saves a file through the browser. Returns false where unsupported. */
export function downloadFile(name: string, content: string, type = 'text/csv;charset=utf-8'): boolean {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return false;
  // BOM so Excel opens UTF-8 names (ñ, accents) correctly.
  const blob = new Blob([type.startsWith('text/csv') ? '﻿' : '', content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/**
 * Web: opens a clean printable page (user can print or save as PDF).
 * `sections` are [heading, rows] tables; all text is escaped.
 */
export function printDocument(title: string, intro: string, sections: { heading: string; head: string[]; rows: string[][] }[]) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const w = window.open('', '_blank', 'noopener=no,width=900,height=1000');
  if (!w) return false;
  const body = sections
    .map(
      (s) => `<h2>${esc(s.heading)}</h2><table><thead><tr>${s.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${s.rows
        .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`,
    )
    .join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
body{font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#1f2328;margin:32px;}
h1{font-size:22px;margin:0 0 4px}p.meta{color:#62666c;margin:0 0 20px}
h2{font-size:16px;margin:24px 0 8px}table{border-collapse:collapse;width:100%}
th,td{border:1px solid #d0cdc6;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#f1f2ef}footer{margin-top:28px;color:#62666c;font-size:12px}
@media print{body{margin:12mm}}
</style></head><body><h1>${esc(title)}</h1><p class="meta">${esc(intro)}</p>${body}
<footer>LearnShift · Learning data only. Never screen time.</footer>
<script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
  return true;
}
