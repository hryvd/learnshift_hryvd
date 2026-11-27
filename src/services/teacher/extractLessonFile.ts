/**
 * Native fallback. PDF and Word extraction runs only on the web build
 * (`extractLessonFile.web.ts`), so phone bundles never ship pdf.js or mammoth.
 */
export type ExtractResult = { text: string; note: string | null } | { error: string };

export const LESSON_FILE_ACCEPT = '.txt,.md,.csv,.json,.html,text/*';

export async function extractLessonFile(file: { name: string; text: () => Promise<string> }): Promise<ExtractResult> {
  try {
    return { text: await file.text(), note: null };
  } catch {
    return { error: 'Could not read that file.' };
  }
}
