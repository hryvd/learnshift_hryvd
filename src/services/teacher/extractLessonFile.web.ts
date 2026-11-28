/**
 * Reads lesson text from a file a teacher drops or picks in the browser:
 * plain text, Word (.docx) and PDF. Libraries load on first use only.
 */
export type ExtractResult = { text: string; note: string | null } | { error: string };

export const LESSON_FILE_ACCEPT =
  '.pdf,.docx,.txt,.md,.csv,.html,.htm,text/plain,text/markdown,text/csv,text/html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PAGES = 40;
const MAX_CHARS = 10000;
const ALLOWED_EXTS = new Set(['pdf', 'docx', 'txt', 'md', 'csv', 'html', 'htm']);

function ext(name: string) {
  return name.toLowerCase().split('.').pop() ?? '';
}

async function readPdf(file: File): Promise<ExtractResult> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  let doc;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    doc = await task.promise;
  } catch (e) {
    const name = (e as { name?: string }).name;
    void task.destroy();
    if (name === 'PasswordException') return { error: 'This PDF is password-protected. Remove the password, then try again.' };
    return { error: 'Could not open this PDF. Try saving it again, or paste the lesson text.' };
  }
  const pages = Math.min(doc.numPages, MAX_PAGES);
  const total_pages = doc.numPages;
  const parts: string[] = [];
  let total = 0;
  try {
  for (let i = 1; i <= pages && total < MAX_CHARS; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((it) => ('str' in it ? it.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (line) {
      parts.push(line);
      total += line.length;
    }
    page.cleanup();
  }
  } finally {
    // Free the worker's copy of the file (large PDFs otherwise stay in memory).
    void task.destroy();
  }
  const text = parts.join('\n\n');
  if (text.trim().length < 30) {
    return {
      error: 'This PDF has no readable text. It may be a scanned image. Paste the lesson text instead.',
    };
  }
  const more = total_pages > pages ? ` (first ${pages} of ${total_pages} pages)` : '';
  return { text, note: `Read ${pages} ${pages === 1 ? 'page' : 'pages'}${more}.` };
}

async function readDocx(file: File): Promise<ExtractResult> {
  // The browser build bundles its own zip reader; no Node APIs needed.
  // @ts-expect-error: the browser build ships without types
  const mod = await import('mammoth/mammoth.browser');
  const mammoth = (mod.default ?? mod) as {
    extractRawText: (o: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
  };
  try {
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    if (value.trim().length < 30) return { error: 'This Word file has very little text.' };
    return { text: value, note: null };
  } catch {
    return { error: 'Could not read this Word file. Save it as .docx again, or paste the lesson text.' };
  }
}

/** Visible text only: no scripts, styles or markup. DOMParser never runs scripts. */
function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, noscript, template, iframe').forEach((n) => n.remove());
  return (doc.body?.innerText || doc.body?.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

export async function extractLessonFile(file: File): Promise<ExtractResult> {
  if (file.size > MAX_BYTES) return { error: 'That file is over 20 MB' };
  const e = ext(file.name);
  if (!ALLOWED_EXTS.has(e)) {
    return { error: "We can't read this file type" };
  }
  try {
    if (e === 'pdf' || file.type === 'application/pdf') return await readPdf(file);
    if (e === 'docx') return await readDocx(file);
    if (e === 'html' || e === 'htm' || file.type === 'text/html') {
      const text = htmlToText(await file.text());
      if (text.trim().length < 1) return { error: 'That file has no readable text.' };
      return { text, note: null };
    }
    const text = await file.text();
    if (text.trim().length < 1) return { error: 'That file has no readable text.' };
    return { text, note: null };
  } catch {
    return { error: 'Upload stopped, tap to try again' };
  }
}
