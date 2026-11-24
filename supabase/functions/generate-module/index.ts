// Generates student flashcards and multiple-choice quizzes from a teacher's uploaded module.
// Authenticated teachers only; rate-limited per teacher.
import { admin, HttpError, json, rateTake, requireUser, serve } from '../_shared/server.ts';

const KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const MODELS = (Deno.env.get('GEMINI_MODELS') ?? 'gemini-3.5-flash,gemini-3.5-flash-lite')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const MODULE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING', description: '2-3 clear sentences summarizing the uploaded lesson for students.' },
    flashcards: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          front: { type: 'STRING', description: 'Short term, question, or concept prompt.' },
          back: { type: 'STRING', description: 'Clear 1-2 sentence explanation or formula.' },
          hint: { type: 'STRING', description: 'Optional brief memory tip.' },
        },
        required: ['front', 'back'],
      },
    },
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          prompt: { type: 'STRING' },
          options: { type: 'ARRAY', items: { type: 'STRING' } },
          answer: { type: 'INTEGER', description: '0-based index (0 to 3) of the correct option.' },
          explanation: { type: 'STRING' },
          topic: { type: 'STRING' },
        },
        required: ['prompt', 'options', 'answer', 'explanation', 'topic'],
      },
    },
  },
  required: ['summary', 'flashcards', 'questions'],
};

async function callGemini(model: string, prompt: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'application/json',
          responseSchema: MODULE_SCHEMA,
          maxOutputTokens: 4096,
        },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 240)}`);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('');
    if (!text) throw new Error('Gemini returned no content');
    return text.trim();
  } finally {
    clearTimeout(t);
  }
}

serve(async (req) => {
  const user = await requireUser(req);
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'teacher') throw new HttpError(403, 'Only teachers can generate modules');
  if (!(await rateTake(user.id, 'generate-module', 20, 3600))) {
    throw new HttpError(429, 'Module generator busy — try again shortly');
  }
  if (!KEY) throw new HttpError(503, 'AI key not configured');

  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? '').trim().slice(0, 120);
  const subject = String(body.subject ?? 'general').trim().slice(0, 40) || 'general';
  const content = String(body.content ?? '').trim().slice(0, 10000);
  if (title.length < 2 || content.length < 40) {
    throw new HttpError(400, 'Provide a title and at least a short lesson excerpt');
  }

  const prompt = [
    'You are helping a Philippine junior/senior high teacher turn a lesson module into bite-sized student study materials.',
    'Create a concise summary, 5 to 6 study flashcards, and 5 to 6 multiple-choice quiz questions based ONLY on the module text below.',
    'Rules: simple everyday language, no markdown, every quiz question must have exactly 4 distinct options and a valid 0-3 answer index.',
    `Module title: ${title}`,
    `Subject: ${subject}`,
    'Lesson text:',
    content,
  ].join('\n\n');

  let raw = '';
  let usedModel = '';
  let lastErr: unknown;
  for (const model of MODELS) {
    try {
      raw = await callGemini(model, prompt);
      usedModel = model;
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!raw) throw (lastErr instanceof Error ? lastErr : new HttpError(502, 'Could not generate module'));

  const parsed = JSON.parse(raw.replace(/^```(json)?|```$/g, ''));
  const summary = String(parsed.summary ?? '').trim().slice(0, 800);
  const flashcards = (Array.isArray(parsed.flashcards) ? parsed.flashcards : [])
    .slice(0, 8)
    .map((f: { front?: unknown; back?: unknown; hint?: unknown }, i: number) => ({
      id: `fc-${i + 1}`,
      front: String(f?.front ?? '').trim().slice(0, 220),
      back: String(f?.back ?? '').trim().slice(0, 400),
      ...(f?.hint ? { hint: String(f.hint).trim().slice(0, 160) } : {}),
    }))
    .filter((f: { front: string; back: string }) => f.front.length > 0 && f.back.length > 0);

  const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
    .slice(0, 8)
    .map(
      (
        q: { prompt?: unknown; options?: unknown[]; answer?: unknown; explanation?: unknown; topic?: unknown },
        i: number,
      ) => {
        const opts = (Array.isArray(q?.options) ? q.options : []).map((o) => String(o ?? '').trim().slice(0, 180)).slice(0, 4);
        while (opts.length < 4) opts.push(`Option ${opts.length + 1}`);
        const ans = Number.isInteger(Number(q?.answer)) ? Math.max(0, Math.min(3, Number(q.answer))) : 0;
        return {
          id: `mq-${i + 1}`,
          prompt: String(q?.prompt ?? '').trim().slice(0, 320),
          options: opts as [string, string, string, string],
          answer: ans,
          explanation: String(q?.explanation ?? '').trim().slice(0, 360) || `The correct answer is ${opts[ans]}.`,
          topic: String(q?.topic ?? subject).trim().slice(0, 60) || title,
        };
      },
    )
    .filter((q: { prompt: string }) => q.prompt.length > 0);

  if (flashcards.length === 0 || questions.length === 0) {
    throw new HttpError(502, 'AI returned incomplete cards');
  }

  return json({ summary, flashcards, questions, model: usedModel });
});
