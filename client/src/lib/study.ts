/**
 * Study in Germany (/study): shared types and helpers of the catalogue, the programme page, the apply form and
 * the admin page. The server computes the deadlines for today's German date (server lib/study/deadlines.ts), so
 * the page renders the same text on the server and after hydration (no clock is read while rendering).
 */
import type { L10n, L10nList } from '@/lib/types';

export const STUDY_DEGREES = ['BACHELOR', 'MASTER', 'STUDIENKOLLEG', 'AUSBILDUNG_DUAL'] as const;
export const STUDY_SUBJECTS = [
  'computer-science',
  'data-science',
  'engineering',
  'natural-sciences',
  'mathematics',
  'medicine-health',
  'business',
  'economics',
  'social-sciences',
  'law',
  'humanities',
  'arts-design',
  'agriculture-environment',
  'other',
] as const;
export const STUDY_LANGUAGES = ['EN', 'DE', 'EN_DE'] as const;
export const STUDY_ROUTES = ['UNI_ASSIST', 'DIRECT', 'VPD', 'HOCHSCHULSTART'] as const;
export const STUDY_LANG_FILTERS = ['en', 'de', 'en_only', 'de_only'] as const;
export const STUDY_WITHIN = ['1', '2', '3', '6', '12'] as const;
export const STUDY_STATES: Record<string, string> = {
  BW: 'Baden-Württemberg',
  BY: 'Bayern',
  BE: 'Berlin',
  BB: 'Brandenburg',
  HB: 'Bremen',
  HH: 'Hamburg',
  HE: 'Hessen',
  MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen',
  NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz',
  SL: 'Saarland',
  SN: 'Sachsen',
  ST: 'Sachsen-Anhalt',
  SH: 'Schleswig-Holstein',
  TH: 'Thüringen',
};
export const STUDY_CERTIFICATES = ['IELTS', 'TOEFL', 'CAMBRIDGE', 'PTE', 'DUOLINGO', 'TESTDAF', 'DSH', 'GOETHE', 'TELC', 'OTHER', 'NONE'] as const;
export const STUDY_CURRENT_DEGREES = ['SCHOOL', 'BACHELOR', 'MASTER', 'OTHER'] as const;

export type Intake = 'WINTER' | 'SUMMER';

export interface StudyDeadline {
  intake: Intake;
  from: string | null;
  to: string;
  note: string | null;
}

/** One deadline's next occurrence (server lib/study/deadlines.ts occurrence()). */
export interface DeadlineOccurrence extends StudyDeadline {
  closes: string;
  opens: string | null;
  daysLeft: number;
  open: boolean | null;
  intakeYear: number;
}

export interface PublicStudyProgramme {
  slug: string;
  university: string;
  city: string;
  federalState: string;
  degree: string;
  subjectArea: string;
  name: string;
  teachingLanguage: string;
  languageRequirement: string | null;
  durationSemesters: number;
  tuitionPerSemester: number;
  semesterContribution: number | null;
  applicationRoute: string;
  officialUrl: string;
  description: L10n | null;
  requirements: L10nList | null;
  published: boolean;
  featured: boolean;
  updatedAt: string;
  deadlines: DeadlineOccurrence[];
  nextDeadline: DeadlineOccurrence | null;
  soon: boolean;
}

export interface Facet {
  value: string;
  count: number;
}

export interface StudyCatalogue {
  items: PublicStudyProgramme[];
  total: number;
  facets: { degrees: Facet[]; subjects: Facet[]; cities: Facet[]; states: Facet[] };
  today: string;
}

export interface StudyDetailResponse {
  programme: PublicStudyProgramme;
  related: PublicStudyProgramme[];
  /** Today's German date (YYYY-MM-DD) the deadlines were computed for. */
  today: string;
}

export const euro = (n: number) => `${n.toLocaleString('de-DE')} €`;

/** i18n key + params of the intake label ("Winter semester 2027/28"). */
export const intakeLabel = (t: (k: string, o?: Record<string, unknown>) => string, intake: Intake, year: number) =>
  t(`study.intake.${intake}`, { year, next: String(year + 1).slice(2) });

/** Intakes offered in the "desired start" select: the next two winter and summer semesters after today. */
export const intakeOptions = (deadlines: DeadlineOccurrence[], todayYear: number): { value: string; intake: Intake; year: number }[] => {
  const fromDeadlines = deadlines.map((d) => ({ intake: d.intake, year: d.intakeYear }));
  const base = fromDeadlines.length ? fromDeadlines : ([{ intake: 'WINTER', year: todayYear + 1 }] as { intake: Intake; year: number }[]);
  const seen = new Set<string>();
  const out: { value: string; intake: Intake; year: number }[] = [];
  for (const b of base) {
    for (const y of [b.year, b.year + 1]) {
      const value = `${b.intake}-${y}`;
      if (!seen.has(value)) {
        seen.add(value);
        out.push({ value, intake: b.intake, year: y });
      }
    }
  }
  return out.sort((a, b) => a.year - b.year || (a.intake === 'SUMMER' ? -1 : 1));
};
