import { IS_PITCH } from '@/lib/config';
import { supabase } from '@/lib/supabase';

export type ModuleFlashcard = {
  id: string;
  front: string;
  back: string;
  hint?: string;
};

export type ModuleQuestion = {
  id: string;
  prompt: string;
  options: [string, string, string, string];
  answer: number;
  explanation: string;
  topic: string;
};

export type ClassModule = {
  id: string;
  classId: string;
  title: string;
  subject: string;
  sourceName: string | null;
  summary: string;
  flashcards: ModuleFlashcard[];
  questions: ModuleQuestion[];
  published: boolean;
  createdAt: string;
};

export type GeneratedModuleDeck = {
  summary: string;
  flashcards: ModuleFlashcard[];
  questions: ModuleQuestion[];
  source: 'ai' | 'local';
  model?: string;
};

export const SAMPLE_MODULE_TEXT = [
  'Linear Equations & Slope — Grade 8 Quarter 2 Module',
  'Slope: The slope (m) of a line measures steepness as rise over run, calculated with (y2 - y1) / (x2 - x1).',
  'Y-intercept: The y-intercept (b) is the point where the graph crosses the vertical y-axis (where x = 0).',
  'Slope-Intercept Form: y = mx + b immediately reveals both the slope m and the y-intercept b.',
  'Parallel Lines: Two non-vertical lines are parallel when they have identical slopes and different y-intercepts.',
  'Rate of Change: In word problems, slope represents the constant rate per unit, while b is the starting amount.',
].join('\n');

export const SAMPLE_PITCH_MODULES: ClassModule[] = [
  {
    id: 'mod-pitch-1',
    classId: 'sampaguita',
    title: 'Linear Equations & Slope Review',
    subject: 'Math',
    sourceName: 'grade8-q2-linear-equations.txt',
    summary:
      'Review how slope measures rate of change, how y = mx + b identifies slope and y-intercept directly, and why parallel lines share the same slope.',
    flashcards: [
      {
        id: 'fc-p1',
        front: 'What does slope (m) measure?',
        back: 'Steepness of a line, computed as rise over run: (y2 - y1) / (x2 - x1).',
        hint: 'Rise goes up/down (y); run goes left/right (x).',
      },
      {
        id: 'fc-p2',
        front: 'In y = mx + b, what are m and b?',
        back: 'm is the slope (rate of change) and b is the y-intercept (starting value at x = 0).',
        hint: 'm = move, b = begin on the y-axis.',
      },
      {
        id: 'fc-p3',
        front: 'When are two lines parallel?',
        back: 'When they have equal slopes and different y-intercepts so they never intersect.',
      },
    ],
    questions: [
      {
        id: 'mq-p1',
        prompt: 'In y = 3x - 5, what is the slope of the line?',
        options: ['3', '-5', '5', '1/3'],
        answer: 0,
        explanation: 'In slope-intercept form y = mx + b, the coefficient of x is the slope m = 3.',
        topic: 'Slope-Intercept Form',
      },
      {
        id: 'mq-p2',
        prompt: 'Which equation describes a line parallel to y = 2x + 1?',
        options: ['y = -2x + 1', 'y = 2x - 4', 'y = 1/2 x + 3', 'y = -1/2 x + 1'],
        answer: 1,
        explanation: 'Parallel lines have identical slopes (m = 2) and different y-intercepts.',
        topic: 'Parallel Lines',
      },
      {
        id: 'mq-p3',
        prompt: 'Where does a line cross the y-axis?',
        options: ['At x = 1', 'At y = 1', 'At x = 0 (y-intercept)', 'Where slope equals 0'],
        answer: 2,
        explanation: 'Every point on the y-axis has x-coordinate 0, giving the y-intercept b.',
        topic: 'Y-intercept',
      },
    ],
    published: true,
    createdAt: new Date().toISOString(),
  },
];

type Fact = { term: string; detail: string };

function extractFacts(title: string, content: string): Fact[] {
  const cleaned = content
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ');
  const rawUnits = cleaned
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.replace(/^[\s*\-•\d.)]+/, '').trim())
    .filter((s) => s.length >= 18);

  const facts: Fact[] = [];
  const seen = new Set<string>();

  for (const unit of rawUnits) {
    if (facts.length >= 8) break;
    const colon = unit.match(/^([^:]{2,48}):\s*(.{12,})$/);
    if (colon) {
      const term = colon[1].trim();
      const detail = colon[2].trim();
      if (!seen.has(term.toLowerCase())) {
        seen.add(term.toLowerCase());
        facts.push({ term, detail });
      }
      continue;
    }
    const isDef = unit.match(/^([A-Za-z0-9\s/-]{3,42}?)\s+(?:is|are|measures|means|refers to)\s+(.{12,})$/i);
    if (isDef) {
      const term = isDef[1].trim();
      const detail = unit.trim();
      if (!seen.has(term.toLowerCase())) {
        seen.add(term.toLowerCase());
        facts.push({ term, detail });
      }
      continue;
    }
    const words = unit.split(/\s+/);
    const label = words.slice(0, Math.min(4, words.length)).join(' ').replace(/[,:;.]$/, '');
    const key = `Key point: ${label || title}`;
    if (!seen.has(unit.toLowerCase())) {
      seen.add(unit.toLowerCase());
      facts.push({ term: key, detail: unit });
    }
  }
  return facts;
}

function clip(s: string, max = 140): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trim()}…`;
}

const FALLBACK_DISTRACTORS = [
  'Only applies when every variable equals zero',
  'Measured strictly without comparing two quantities',
  'Reversed when the independent value increases by one',
  'Unrelated to the core rule described in this module',
];

/** Fast deterministic quiz & flashcard extractor for offline/fallback use. */
export function buildLocalModuleCards(input: {
  title: string;
  subject: string;
  content: string;
}): GeneratedModuleDeck {
  const title = input.title.trim() || 'Lesson Module';
  const subject = input.subject.trim() || 'Study';
  const facts = extractFacts(title, input.content);

  const summary =
    facts.length > 0
      ? facts
          .slice(0, 2)
          .map((f) => f.detail)
          .join(' ')
          .slice(0, 420)
      : `${title}: ${clip(input.content, 280)}`;

  const flashcards: ModuleFlashcard[] =
    facts.length > 0
      ? facts.slice(0, 6).map((f, idx) => ({
          id: `fc-${idx + 1}`,
          front: f.term.startsWith('Key point:') ? f.term : `Explain: ${f.term}`,
          back: clip(f.detail, 260),
          hint: `${subject} · ${title}`,
        }))
      : [
          {
            id: 'fc-1',
            front: `Main takeaway from ${title}`,
            back: clip(input.content, 260),
            hint: subject,
          },
        ];

  const questions: ModuleQuestion[] = [];
  const pool = facts.length >= 2 ? facts.slice(0, 6) : [{ term: title, detail: clip(input.content, 120) }];

  pool.forEach((f, idx) => {
    const correct = clip(f.detail, 120);
    const distractors: string[] = [];
    for (let j = 0; j < pool.length && distractors.length < 3; j++) {
      if (j === idx) continue;
      const cand = clip(pool[j].detail, 120);
      if (cand !== correct && !distractors.includes(cand)) distractors.push(cand);
    }
    for (const fb of FALLBACK_DISTRACTORS) {
      if (distractors.length >= 3) break;
      if (fb !== correct && !distractors.includes(fb)) distractors.push(fb);
    }
    const answer = idx % 4;
    const options = [...distractors];
    options.splice(answer, 0, correct);
    questions.push({
      id: `mq-${idx + 1}`,
      prompt: f.term.startsWith('Key point:')
        ? `Which statement matches "${f.term.replace(/^Key point:\s*/, '')}" in ${title}?`
        : `According to ${title}, what best describes ${f.term}?`,
      options: options.slice(0, 4) as [string, string, string, string],
      answer,
      explanation: clip(f.detail, 220),
      topic: f.term.replace(/^Key point:\s*/, '').slice(0, 50) || title,
    });
  });

  return { summary, flashcards, questions, source: 'local' };
}

/** Calls the Supabase AI edge function when online, or falls back cleanly to local extraction. */
export async function generateModuleDeck(input: {
  title: string;
  subject: string;
  content: string;
}): Promise<GeneratedModuleDeck> {
  if (!IS_PITCH) {
    try {
      const { data, error } = await supabase.functions.invoke('generate-module', {
        body: { title: input.title, subject: input.subject, content: input.content },
      });
      if (
        !error &&
        data &&
        Array.isArray(data.flashcards) &&
        data.flashcards.length > 0 &&
        Array.isArray(data.questions) &&
        data.questions.length > 0
      ) {
        return {
          summary: String(data.summary ?? ''),
          flashcards: data.flashcards,
          questions: data.questions,
          source: 'ai',
          model: typeof data.model === 'string' ? data.model : undefined,
        };
      }
    } catch {
      // Offline or unauthenticated fallback uses local card extraction below.
    }
  }
  return buildLocalModuleCards(input);
}
