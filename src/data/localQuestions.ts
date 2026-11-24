import math from './bank/math.json';
import english from './bank/english.json';
import filipino from './bank/filipino.json';
import science from './bank/science.json';
import aralingPanlipunan from './bank/araling-panlipunan.json';

export type SubjectId = 'math' | 'english' | 'filipino' | 'science' | 'araling-panlipunan';

export type VisualSceneId =
  | 'eye'
  | 'ear'
  | 'butterfly'
  | 'dog'
  | 'cat'
  | 'fish'
  | 'chicken'
  | 'plant'
  | 'flower'
  | 'sun'
  | 'rain_cloud'
  | 'ball'
  | 'ball_under_table'
  | 'books'
  | 'ruler'
  | 'thermometer'
  | 'magnet'
  | 'compass'
  | 'wash_hands'
  | 'school'
  | 'firefighter'
  | 'rice_field'
  | 'red_bag'
  | 'banana';

export type CountItemId = 'pencil' | 'banana' | 'cookie' | 'apple' | 'star' | 'marble' | 'block';

export type QuestionVisual =
  | { kind: 'scene'; id: VisualSceneId; hideEast?: boolean }
  | {
      kind: 'count';
      item: CountItemId;
      count: number;
      addCount?: number;
      crossOut?: number;
      groupSize?: number;
      askNext?: boolean;
    }
  | { kind: 'shape'; shape: 'triangle' | 'square' | 'rectangle' | 'circle' | 'right_angle'; sideLabel?: string }
  | { kind: 'clock'; hour: number; minute: number }
  | {
      kind: 'fraction';
      parts: number;
      filled: number;
      style?: 'pie' | 'bar';
      compareParts?: number;
      compareFilled?: number;
    }
  | { kind: 'bars'; items: { label: string; value: number }[] }
  | { kind: 'grid'; rows: number; cols: number; rowLabel?: string; colLabel?: string };

export type LocalQuestion = {
  id: string;
  subject: SubjectId;
  grade: number;
  topic: string;
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
  visual?: QuestionVisual;
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
