/** Pure helpers of the eligibility quiz result: one overall readiness % and a short personal roadmap. */

export type QuizAnswers = Partial<Record<'german' | 'experience' | 'education' | string, string>>;
export type QuizMissing = { code: string; [k: string]: string | number };
export interface QuizPath {
  score: number;
  missing: QuizMissing[];
}

const GERMAN = ['none', 'A1', 'A2', 'B1', 'B2'];
const EXPERIENCE: Record<string, number> = { none: 0, lt2: 0.35, '2_5': 0.7, '5p': 1 };
const EDUCATION: Record<string, number> = { school: 0.3, vocational: 0.8, university: 1 };

/** Overall readiness 0-100: 65% best-path score, 35% own profile (German level, experience, education). */
export const readinessPercent = (answers: QuizAnswers, paths: QuizPath[]): number => {
  const best = paths.reduce((m, p) => Math.max(m, p.score), 0);
  const german = Math.max(0, GERMAN.indexOf(answers.german ?? 'none')) / (GERMAN.length - 1);
  const exp = EXPERIENCE[answers.experience ?? 'none'] ?? 0;
  const edu = EDUCATION[answers.education ?? 'school'] ?? 0;
  const profile = 0.5 * german + 0.3 * exp + 0.2 * edu;
  return Math.max(0, Math.min(100, Math.round(0.65 * best + 0.35 * profile * 100)));
};

export type RoadmapStep = { kind: 'gap'; gap: QuizMissing } | { kind: 'docs' | 'consult' | 'register' };

/** 3-5 next steps: the best path's gaps (max 3), then documents, a consultation when few gaps, and registration. */
export const roadmapSteps = (paths: { missing: QuizMissing[] }[]): RoadmapStep[] => {
  const gaps = (paths[0]?.missing ?? []).slice(0, 3).map((gap): RoadmapStep => ({ kind: 'gap', gap }));
  const steps: RoadmapStep[] = [...gaps, { kind: 'docs' }];
  if (steps.length < 3) steps.push({ kind: 'consult' });
  steps.push({ kind: 'register' });
  return steps;
};
