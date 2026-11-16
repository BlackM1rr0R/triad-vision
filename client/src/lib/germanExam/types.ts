/**
 * Data model of the German mock exams (/german-mock-exam/a1, /german-mock-exam/b1). One ExamSet is a complete
 * practice test in the module structure of the Goethe-Zertifikat A1 (Start Deutsch 1) or B1; every text, audio
 * script and task is written by Triad Vision (not taken from Goethe / telc model papers). More sets: add a file in
 * ./sets and list it in ./sets/index.ts — sets.test.ts validates every set. No React here (unit-testable).
 */

export type ExamLevel = 'a1' | 'b1';
export type ModuleKey = 'hoeren' | 'lesen' | 'schreiben' | 'sprechen';

/** Speaker profiles of the listening scripts (browser speech synthesis, varied by voice, pitch and rate). */
export type VoiceKey = 'w1' | 'w2' | 'm1' | 'm2' | 'ann';

export interface AudioLine {
  voice: VoiceKey;
  text: string;
}

/** A reading text / ad / sign, or a listening clip (audio script). */
export interface Stimulus {
  id: string;
  /** Short heading shown above a reading text (e.g. "E-Mail", "Anzeige a"). */
  title?: string;
  /** Reading text (German). */
  text?: string;
  /** Listening script (German); played with speechSynthesis. */
  audio?: AudioLine[];
}

/** Multiple choice (also richtig/falsch, ja/nein and matching: the options are then the labels). */
export interface ChoiceQuestion {
  id: string;
  /** Stimulus this question belongs to (shown / played with it). */
  stimulus: string;
  /** The statement or question (German). */
  prompt: string;
  options: string[];
  /** Index into `options` of the one correct answer. */
  answer: number;
  /** Sentence of the text / script that proves the answer (must appear verbatim in the part's stimuli or options). */
  evidence: string;
}

interface PartBase {
  id: string;
  /** Hint key under mockExam.hints.* (localized explanation of the task type). */
  hint: string;
  /** Task instruction in German, as in the real exam. */
  instruction: string;
}

export interface ChoicePart extends PartBase {
  type: 'choice';
  stimuli: Stimulus[];
  questions: ChoiceQuestion[];
  /** Listening parts: how often each clip may be played (as in the real exam). */
  plays?: 1 | 2;
  /** Matching parts: the stimuli are a shared pool shown once above all questions (ads, opinions). */
  shared?: boolean;
}

/** Self-assessment rubric line: label key under mockExam.rubric.*, optional German parameter (e.g. content point). */
export interface RubricItem {
  key: string;
  points: number;
  param?: string;
}

/** A1 Schreiben Teil 1: fill in a form from a short text (auto-scored, 1 point per field). */
export interface FormField {
  id: string;
  label: string;
  /** Accepted answers (compared case-insensitively, punctuation and extra spaces ignored). */
  accept: string[];
}

export interface FormPart extends PartBase {
  type: 'form';
  situation: string;
  /** Fields already filled in on the form (label → value), for context. */
  given: { label: string; value: string }[];
  fields: FormField[];
}

/** Free writing (message, e-mail, forum post): model answer + self-scored rubric. */
export interface WritingPart extends PartBase {
  type: 'writing';
  situation: string;
  /** Content points to cover (German). */
  points: string[];
  /** Comment to react to (B1 forum post). */
  quote?: { author: string; text: string };
  words: number;
  model: string;
  rubric: RubricItem[];
}

/** Speaking: prompt cards, model phrases, optional examiner question (audio) and self-scored rubric. */
export interface SpeakingPart extends PartBase {
  type: 'speaking';
  situation?: string;
  cards: string[];
  phrases: string[];
  /** Examiner / partner line read aloud (German), e.g. the question after the presentation. */
  examiner?: string;
  rubric: RubricItem[];
}

export type ExamPart = ChoicePart | FormPart | WritingPart | SpeakingPart;

export interface ExamModule {
  key: ModuleKey;
  /** Working time in minutes (as in the real exam). */
  minutes: number;
  /** Preparation time before the speaking module (B1: 15 minutes). */
  prepMinutes?: number;
  parts: ExamPart[];
}

export interface ExamSet {
  id: string;
  level: ExamLevel;
  /** Short name of the set, e.g. "Übungstest 1". */
  title: string;
  /** Speech rate factor of the listening module (A1 a little slower). */
  audioRate: number;
  modules: ExamModule[];
}
