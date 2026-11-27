/**
 * Reads lesson text from a file a teacher drops or picks in the browser:
 * plain text, Word (.docx) and PDF. Libraries load on first use only.
 */
export type ExtractResult = { text: string; note: string | null } | { error: string };

export const LESSON_FILE_ACCEPT =
  '.pdf,.docx,.txt,.md,.csv,.json,.html,text/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_PAGES = 40;
const MAX_CHARS = 10000;

function ext(name: string) {
  return name.toLowerCase().split('.').pop() ?? '';
}

async function readPdf(file: File): Promise<ExtractResult> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === 'PasswordException') return { error: 'This PDF is password-protected. Remove the password, then try again.' };
    return { error: 'Could not open this PDF. Try saving it again, or paste the lesson text.' };
  }
  const pages = Math.min(doc.numPages, MAX_PAGES);
  const parts: string[] = [];
  let total = 0;
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
  }
  const text = parts.join('\n\n');
  if (text.trim().length < 30) {
    return {
      error: 'This PDF has no readable text. It may be a scanned image. Paste the lesson text instead.',
    };
  }
  const more = doc.numPages > pages ? ` (first ${pages} of ${doc.numPages} pages)` : '';
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

export async function extractLessonFile(file: File): Promise<ExtractResult> {
  if (file.size > MAX_BYTES) return { error: 'That file is over 15 MB. Choose a smaller file or paste the lesson text.' };
  const e = ext(file.name);
  try {
    if (e === 'pdf' || file.type === 'application/pdf') return await readPdf(file);
    if (e === 'docx') return await readDocx(file);
    if (e === 'doc') return { error: 'Old .doc files are not supported. Save it as .docx or PDF, then try again.' };
    return { text: await file.text(), note: null };
  } catch {
    return { error: 'Could not read that file. Try another file or paste the lesson text.' };
  }
}
