import math from './bank/math.json';
import english from './bank/english.json';
import filipino from './bank/filipino.json';
import science from './bank/science.json';
import aralingPanlipunan from './bank/araling-panlipunan.json';

export type SubjectId = 'math' | 'english' | 'filipino' | 'science' | 'araling-panlipunan';

export type LocalQuestion = {
  id: string;
  subject: SubjectId;
  grade: number;
  topic: string;
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
};

export const SUBJECTS: { id: SubjectId; label: string }[] = [
  { id: 'math', label: 'Math' },
  { id: 'english', label: 'English' },
  { id: 'filipino', label: 'Filipino' },
  { id: 'science', label: 'Science' },
  { id: 'araling-panlipunan', label: 'Araling Panlipunan' },
];

/** Bundled practice content; answers never require a network request. */
export const LOCAL_QUESTIONS = [
  ...math,
  ...english,
  ...filipino,
  ...science,
  ...aralingPanlipunan,
] as LocalQuestion[];
