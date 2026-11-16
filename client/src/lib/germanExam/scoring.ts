/**
 * Scoring of the mock exams, following the published rules of the Goethe-Institut (Durchführungsbestimmungen,
 * Stand 1 September 2023):
 *
 *  A1 Start Deutsch 1 — Hören 15, Lesen 15, Schreiben 15 (Teil 1: 5, Teil 2: 10) and Sprechen 15 (3 + 6 + 6) raw
 *  points; each multiplied by 1.66 and added up, the total rounded (max 100: 75 written + 25 oral). Passed with
 *  at least 60 points and all parts taken. (The A1 exam is passed as a whole; per module we only show whether
 *  60 % were reached, as an orientation.)
 *  https://www.goethe.de/resources/files/pdf325/durchfuehrungsbestimmungen_a1_start_deutsch_1.pdf
 *
 *  B1 — four modules of 100 points each; Lesen and Hören 30 items, raw × 3.33, rounded (official table);
 *  Schreiben and Sprechen 100 points by criteria. A module is passed with at least 60 points.
 *  https://www.goethe.de/resources/files/pdf325/durchfuehrungsbestimmungen_b1-1.pdf
 *
 * Writing and speaking cannot be marked by a machine here (no AI): the learner ticks a rubric checklist.
 */
import type { ChoicePart, ExamLevel, ExamModule, ExamPart, FormField, FormPart, ModuleKey } from './types';

export const PASS_PERCENT = 60;
export const A1_FACTOR = 1.66;
export const B1_FACTOR = 3.33;

/** Answers of one set: choice answers by question id, form inputs by field id, ticked rubric keys by part id. */
export interface ExamAnswers {
  choice: Record<string, number>;
  form: Record<string, string>;
  rubric: Record<string, string[]>;
}

export const emptyAnswers = (): ExamAnswers => ({ choice: {}, form: {}, rubric: {} });

/** Lower-case, umlaut-tolerant (ue → ü …, ss → ß), no punctuation, single spaces. */
export const normalizeAnswer = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFC')
    .replace(/ae/g, 'ä')
    .replace(/oe/g, 'ö')
    .replace(/ue/g, 'ü')
    .replace(/ß/g, 'ss')
    .replace(/[.,;:!?"'„“()/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const formFieldCorrect = (field: FormField, value: string | undefined) => {
  const v = normalizeAnswer(value ?? '');
  return !!v && field.accept.some((a) => normalizeAnswer(a) === v);
};

/** Rubric keys are unique within a part: "<key>" or "<key>:<index>" for repeated keys. */
export const rubricIds = (items: { key: string }[]) => items.map((r, i) => (items.filter((x) => x.key === r.key).length > 1 ? `${r.key}:${i}` : r.key));

export const partMax = (part: ExamPart): number => {
  switch (part.type) {
    case 'choice':
      return part.questions.length;
    case 'form':
      return part.fields.length;
    default:
      return part.rubric.reduce((s, r) => s + r.points, 0);
  }
};

export const partScore = (part: ExamPart, a: ExamAnswers): number => {
  switch (part.type) {
    case 'choice':
      return part.questions.filter((q) => a.choice[q.id] === q.answer).length;
    case 'form':
      return part.fields.filter((f) => formFieldCorrect(f, a.form[f.id])).length;
    default: {
      const ticked = new Set(a.rubric[part.id] ?? []);
      const ids = rubricIds(part.rubric);
      return part.rubric.reduce((s, r, i) => s + (ticked.has(ids[i]) ? r.points : 0), 0);
    }
  }
};

export const moduleMax = (m: ExamModule) => m.parts.reduce((s, p) => s + partMax(p), 0);
export const moduleRaw = (m: ExamModule, a: ExamAnswers) => m.parts.reduce((s, p) => s + partScore(p, a), 0);

/** Official result points of a module from its raw points: A1 raw × 1.66 (max 25), B1 0–100. */
export const modulePoints = (level: ExamLevel, raw: number, max: number): number => {
  if (level === 'a1') return Math.round(raw * A1_FACTOR * 10) / 10;
  if (max === 30) return Math.round(raw * B1_FACTOR); // Lesen / Hören: the official conversion table
  return max ? Math.round((raw / max) * 100) : 0;
};

/** Maximum result points of a module: A1 25 (raw 15 × 1.66 ≈ 24.9, shown as 25), B1 100. */
export const modulePointsMax = (level: ExamLevel) => (level === 'a1' ? 25 : 100);

export const modulePercent = (raw: number, max: number) => (max ? Math.round((raw / max) * 100) : 0);

/** B1: passed with ≥ 60 of 100; A1 (orientation only): ≥ 60 % of the raw points. */
export const modulePassed = (level: ExamLevel, raw: number, max: number) =>
  level === 'b1' ? modulePoints('b1', raw, max) >= PASS_PERCENT : modulePercent(raw, max) >= PASS_PERCENT;

export interface ModuleResult {
  key: ModuleKey;
  raw: number;
  max: number;
  points: number;
  pointsMax: number;
  passed: boolean;
}

export const moduleResult = (level: ExamLevel, m: ExamModule, a: ExamAnswers): ModuleResult => {
  const raw = moduleRaw(m, a);
  const max = moduleMax(m);
  return { key: m.key, raw, max, points: modulePoints(level, raw, max), pointsMax: modulePointsMax(level), passed: modulePassed(level, raw, max) };
};

export interface ExamOutcome {
  /** A1: the total of 100 (null until all four modules are done). B1: null (no total; modules count separately). */
  total: number | null;
  /** A1: passed overall (≥ 60, all parts). B1: every module passed. Null while modules are missing. */
  passed: boolean | null;
  modules: ModuleResult[];
}

/** Outcome from the finished modules' raw points (`done`: raw points by module key). */
export const examOutcome = (level: ExamLevel, modules: ExamModule[], done: Partial<Record<ModuleKey, { raw: number; max: number }>>): ExamOutcome => {
  const results: ModuleResult[] = modules
    .filter((m) => done[m.key])
    .map((m) => {
      const { raw, max } = done[m.key]!;
      return { key: m.key, raw, max, points: modulePoints(level, raw, max), pointsMax: modulePointsMax(level), passed: modulePassed(level, raw, max) };
    });
  const complete = results.length === modules.length;
  if (level === 'a1') {
    const total = complete ? Math.round(results.reduce((s, r) => s + r.raw * A1_FACTOR, 0)) : null;
    return { total, passed: total === null ? null : total >= PASS_PERCENT, modules: results };
  }
  return { total: null, passed: complete ? results.every((r) => r.passed) : null, modules: results };
};

/** Official grade ("Prädikat") of a 0–100 result: sehr gut 90+, gut 80+, befriedigend 70+, ausreichend 60+. */
export const grade = (points: number): 'veryGood' | 'good' | 'satisfactory' | 'sufficient' | 'fail' =>
  points >= 90 ? 'veryGood' : points >= 80 ? 'good' : points >= 70 ? 'satisfactory' : points >= 60 ? 'sufficient' : 'fail';

/** Choice questions of a module answered wrongly or not at all (for the review). */
export const mistakes = (m: ExamModule, a: ExamAnswers) =>
  m.parts
    .filter((p): p is ChoicePart => p.type === 'choice')
    .flatMap((p) => p.questions.filter((q) => a.choice[q.id] !== q.answer).map((q) => ({ part: p, question: q, given: a.choice[q.id] })));

export const formMistakes = (m: ExamModule, a: ExamAnswers) =>
  m.parts.filter((p): p is FormPart => p.type === 'form').flatMap((p) => p.fields.filter((f) => !formFieldCorrect(f, a.form[f.id])).map((f) => ({ part: p, field: f, given: a.form[f.id] ?? '' })));

/** Seconds left of a module timer (deadline in ms since epoch). */
export const secondsLeft = (deadline: number, now: number) => Math.max(0, Math.ceil((deadline - now) / 1000));
