import { LOCAL_QUESTIONS, practiceGrade, SUBJECTS, type LocalQuestion, type SubjectId } from './localQuestions';

type Rand = () => number;

const shuffle = <T>(list: T[], rand: Rand): T[] => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** Same question with its choices in a new order, so students learn the answer rather than its position. */
export const shuffleChoices = (q: LocalQuestion, rand: Rand = Math.random): LocalQuestion => {
  const order = shuffle([0, 1, 2, 3].slice(0, q.options.length), rand);
  return { ...q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
};

export const poolKey = (grade: number, subject: SubjectId) => `${grade}:${subject}`;

/**
 * Draws `count` questions from one grade+subject, preferring ones not seen yet.
 * When every question has been seen, the cycle starts over (avoiding this session's picks).
 */
export function drawFromPool(
  pool: LocalQuestion[],
  seen: string[],
  count: number,
  rand: Rand = Math.random,
): { picked: LocalQuestion[]; seen: string[] } {
  const ids = new Set(pool.map((q) => q.id));
  let seenNow = seen.filter((id) => ids.has(id));
  const picked: LocalQuestion[] = [];
  while (picked.length < count && picked.length < pool.length) {
    const taken = new Set([...seenNow, ...picked.map((q) => q.id)]);
    let fresh = pool.filter((q) => !taken.has(q.id));
    if (!fresh.length) {
      seenNow = [];
      const now = new Set(picked.map((q) => q.id));
      fresh = pool.filter((q) => !now.has(q.id));
    }
    picked.push(...shuffle(fresh, rand).slice(0, count - picked.length));
  }
  return { picked, seen: [...seenNow, ...picked.map((q) => q.id)] };
}

/** A practice session: one per subject for mixed practice, otherwise `count` from the chosen subject. */
export function pickSession(
  grade: number,
  subject: SubjectId | 'mixed',
  seenBy: Record<string, string[]>,
  count: number,
  rand: Rand = Math.random,
): { questions: LocalQuestion[]; seen: Record<string, string[]> } {
  const g = practiceGrade(grade);
  const subjects = subject === 'mixed' ? SUBJECTS.map((s) => s.id) : [subject];
  const per = subject === 'mixed' ? 1 : count;
  const seen: Record<string, string[]> = {};
  const questions: LocalQuestion[] = [];
  for (const id of subjects) {
    const key = poolKey(g, id);
    const pool = LOCAL_QUESTIONS.filter((q) => q.grade === g && q.subject === id);
    if (!pool.length) continue;
    const draw = drawFromPool(pool, seenBy[key] ?? [], per, rand);
    seen[key] = draw.seen;
    questions.push(...draw.picked);
  }
  return { questions: questions.map((q) => shuffleChoices(q, rand)), seen };
}

/** Questions available for one grade, per subject (for labels such as "60 questions"). */
export const countFor = (grade: number, subject: SubjectId | 'mixed') => {
  const g = practiceGrade(grade);
  return LOCAL_QUESTIONS.filter((q) => q.grade === g && (subject === 'mixed' || q.subject === subject)).length;
};
