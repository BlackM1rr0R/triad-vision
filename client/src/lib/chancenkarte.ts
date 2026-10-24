/**
 * Chancenkarte (Opportunity Card, § 20a AufenthG) points, following the official table
 * (make-it-in-germany.com, valid since 1 June 2024):
 *
 *   partial recognition of the foreign qualification ........ 4
 *   qualification in a shortage occupation (Engpassberuf) .... 1
 *   experience: 5 of the last 7 years 3 · 2 of the last 5 years 2
 *   German: A2 1 · B1 2 · B2 or higher 3
 *   English: C1 or higher 1
 *   age: under 35 2 · 35–39 1
 *   ≥ 6 months legal stay in Germany in the last 5 years ...... 1
 *   spouse/partner also eligible, applying together ........... 1
 *
 * Minimum 6 points. Basic requirements: a foreign qualification (≥ 2 years of state-recognised vocational
 * training or a degree), German A1 or English B2, and secured livelihood. A FULLY recognised qualification
 * makes the applicant a skilled worker: the card is granted without points.
 */

export type Qualification = 'full' | 'partial' | 'foreign' | 'none';
export type GermanLevel = 'none' | 'A1' | 'A2' | 'B1' | 'B2';
export type EnglishLevel = 'none' | 'B2' | 'C1';
export type Experience = 'none' | 'two' | 'five';
export type AgeBand = 'u35' | 'u40' | 'o40';

export interface ChancenkarteInput {
  qualification: Qualification;
  shortage: boolean;
  german: GermanLevel;
  english: EnglishLevel;
  experience: Experience;
  age: AgeBand;
  stay: boolean;
  partner: boolean;
  funds: boolean;
}

export const MIN_POINTS = 6;

export const POINTS = {
  partialRecognition: 4,
  shortage: 1,
  experience: { none: 0, two: 2, five: 3 } as Record<Experience, number>,
  german: { none: 0, A1: 0, A2: 1, B1: 2, B2: 3 } as Record<GermanLevel, number>,
  english: { none: 0, B2: 0, C1: 1 } as Record<EnglishLevel, number>,
  age: { u35: 2, u40: 1, o40: 0 } as Record<AgeBand, number>,
  stay: 1,
  partner: 1,
};

export type Row = 'recognition' | 'shortage' | 'german' | 'english' | 'experience' | 'age' | 'stay' | 'partner';
export type Missing = 'qualification' | 'language' | 'funds' | 'points';

export interface ChancenkarteResult {
  status: 'skilled' | 'eligible' | 'notYet';
  points: number;
  rows: { row: Row; points: number }[];
  missing: Missing[];
  pointsShort: number;
}

export const scoreChancenkarte = (i: ChancenkarteInput): ChancenkarteResult => {
  const rows: { row: Row; points: number }[] = [
    { row: 'recognition', points: i.qualification === 'partial' ? POINTS.partialRecognition : 0 },
    { row: 'shortage', points: i.shortage && i.qualification !== 'none' ? POINTS.shortage : 0 },
    { row: 'german', points: POINTS.german[i.german] },
    { row: 'english', points: POINTS.english[i.english] },
    { row: 'experience', points: POINTS.experience[i.experience] },
    { row: 'age', points: POINTS.age[i.age] },
    { row: 'stay', points: i.stay ? POINTS.stay : 0 },
    { row: 'partner', points: i.partner ? POINTS.partner : 0 },
  ];
  const points = rows.reduce((s, r) => s + r.points, 0);
  const missing: Missing[] = [];
  if (i.qualification === 'none') missing.push('qualification');
  if (i.german === 'none' && i.english === 'none') missing.push('language');
  if (!i.funds) missing.push('funds');
  if (i.qualification === 'full') {
    // Skilled worker (full recognition): no points and no language minimum; livelihood is still required.
    const own = missing.filter((m) => m === 'funds');
    return { status: own.length ? 'notYet' : 'skilled', points, rows, missing: own, pointsShort: 0 };
  }
  const pointsShort = Math.max(0, MIN_POINTS - points);
  if (pointsShort) missing.push('points');
  return { status: missing.length ? 'notYet' : 'eligible', points, rows, missing, pointsShort };
};
