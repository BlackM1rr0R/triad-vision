/**
 * Progress of a mock exam set in localStorage (best effort via lib/games/common: private mode or blocked storage
 * simply means nothing is kept). One entry per set: answers, written texts, plays used, finished modules and the
 * running module deadlines (so a reload keeps the timer). Pure apart from load/store: unit-tested.
 */
import { loadProgress, saveProgress } from '@/lib/games/common';
import { emptyAnswers, type ExamAnswers } from './scoring';
import type { ExamModule, ModuleKey } from './types';

export interface SavedExam {
  v: 1;
  answers: ExamAnswers;
  /** Written texts by part id. */
  texts: Record<string, string>;
  /** Plays used by stimulus id (listening). */
  plays: Record<string, number>;
  /** Stimulus ids whose transcript was opened because the browser cannot speak. */
  transcripts: string[];
  /** Finished modules (ISO date). */
  done: Partial<Record<ModuleKey, string>>;
  /** Running modules: deadline in ms since epoch. */
  deadlines: Partial<Record<ModuleKey, number>>;
}

export const emptySaved = (): SavedExam => ({ v: 1, answers: emptyAnswers(), texts: {}, plays: {}, transcripts: [], done: {}, deadlines: {} });

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** A stored value of unknown shape → a valid SavedExam (anything broken is dropped). */
export const sanitizeSaved = (raw: unknown): SavedExam => {
  const e = emptySaved();
  if (!isObj(raw) || raw.v !== 1) return e;
  const a = isObj(raw.answers) ? raw.answers : {};
  const nums = (o: unknown) => (isObj(o) ? Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'number' && Number.isFinite(v))) : {}) as Record<string, number>;
  const strs = (o: unknown) => (isObj(o) ? Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'string')) : {}) as Record<string, string>;
  const lists = (o: unknown) => (isObj(o) ? Object.fromEntries(Object.entries(o).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).filter((x): x is string => typeof x === 'string')])) : {}) as Record<string, string[]>;
  return {
    v: 1,
    answers: { choice: nums(a.choice), form: strs(a.form), rubric: lists(a.rubric) },
    texts: strs(raw.texts),
    plays: nums(raw.plays),
    transcripts: Array.isArray(raw.transcripts) ? raw.transcripts.filter((x): x is string => typeof x === 'string') : [],
    done: strs(raw.done) as SavedExam['done'],
    deadlines: nums(raw.deadlines) as SavedExam['deadlines'],
  };
};

const key = (setId: string) => `mockExam.${setId}`;
export const loadSaved = (setId: string) => sanitizeSaved(loadProgress<unknown>(key(setId), null));
export const storeSaved = (setId: string, s: SavedExam) => saveProgress(key(setId), s);

/** Everything of one module removed (answers, texts, plays, done, deadline): for "do again". */
export const clearModule = (s: SavedExam, m: ExamModule): SavedExam => {
  const qids = new Set<string>();
  const fids = new Set<string>();
  const pids = new Set<string>();
  const sids = new Set<string>();
  for (const p of m.parts) {
    pids.add(p.id);
    if (p.type === 'choice') {
      p.questions.forEach((q) => qids.add(q.id));
      p.stimuli.forEach((st) => sids.add(st.id));
    }
    if (p.type === 'form') p.fields.forEach((f) => fids.add(f.id));
  }
  const drop = <T,>(o: Record<string, T>, ids: Set<string>) => Object.fromEntries(Object.entries(o).filter(([k]) => !ids.has(k)));
  const done = { ...s.done };
  const deadlines = { ...s.deadlines };
  delete done[m.key];
  delete deadlines[m.key];
  return {
    ...s,
    answers: { choice: drop(s.answers.choice, qids), form: drop(s.answers.form, fids), rubric: drop(s.answers.rubric, pids) },
    texts: drop(s.texts, pids),
    plays: drop(s.plays, sids),
    transcripts: s.transcripts.filter((x) => !sids.has(x)),
    done,
    deadlines,
  };
};

/** Modules whose deadline has passed while the page was closed: marked as done (time is up, as in the exam). */
export const expireDeadlines = (s: SavedExam, now: number): SavedExam => {
  const expired = (Object.entries(s.deadlines) as [ModuleKey, number][]).filter(([k, d]) => d <= now && !s.done[k]);
  if (!expired.length) return s;
  const done = { ...s.done };
  const deadlines = { ...s.deadlines };
  for (const [k] of expired) {
    done[k] = new Date(now).toISOString();
    delete deadlines[k];
  }
  return { ...s, done, deadlines };
};

/** Words in a text (for the writing counter). */
export const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);
