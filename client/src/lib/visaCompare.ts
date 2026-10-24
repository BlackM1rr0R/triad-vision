/**
 * "Which visa fits me?" mini wizard of the comparison page (/compare-visas). Pure functions, no imports, so
 * the server test suite can load this file directly (server/tests/unit/visaCompareWizard.test.ts).
 *
 * Six questions → a score 0–100 per route with reason codes (translated on the page:
 * discover.compare.reasons.<code>). The scores are a rough orientation that mirrors the comparison table;
 * the binding decision is the embassy's.
 */

export type RouteKey = 'chancenkarte' | 'blueCard' | 'ausbildung' | 'skilled18a' | 'family';
export const ROUTE_KEYS: RouteKey[] = ['chancenkarte', 'blueCard', 'ausbildung', 'skilled18a', 'family'];

export type Qualification = 'degree' | 'vocational' | 'none';
export type Recognition = 'full' | 'partial' | 'no' | 'unknown';
/** Job offer and its gross salary compared with the Blue Card thresholds. */
export type Offer = 'none' | 'below' | 'shortage' | 'above';
export type German = 'none' | 'A1' | 'A2' | 'B1' | 'B2';
export type Age = 'u35' | '35to44' | '45plus';
export type FamilyInGermany = 'yes' | 'no';

export interface WizardAnswers {
  qualification: Qualification;
  recognition: Recognition;
  offer: Offer;
  german: German;
  age: Age;
  family: FamilyInGermany;
}

export type QuestionKey = keyof WizardAnswers;

export const QUESTIONS: { key: QuestionKey; options: string[] }[] = [
  { key: 'qualification', options: ['degree', 'vocational', 'none'] },
  { key: 'recognition', options: ['full', 'partial', 'no', 'unknown'] },
  { key: 'offer', options: ['none', 'below', 'shortage', 'above'] },
  { key: 'german', options: ['none', 'A1', 'A2', 'B1', 'B2'] },
  { key: 'age', options: ['u35', '35to44', '45plus'] },
  { key: 'family', options: ['yes', 'no'] },
];

/** Questions to ask for the answers so far (recognition is skipped without a qualification). */
export const visibleQuestions = (a: Partial<WizardAnswers>) => QUESTIONS.filter((q) => !(q.key === 'recognition' && a.qualification === 'none'));

export type Fit = 'high' | 'medium' | 'low';

export interface Recommendation {
  route: RouteKey;
  score: number;
  fit: Fit;
  /** Reason codes, positive first (`+code`) then the gaps (`-code`). */
  reasons: string[];
}

const GERMAN_RANK: Record<German, number> = { none: 0, A1: 1, A2: 2, B1: 3, B2: 4 };
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const fitOf = (score: number): Fit => (score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low');

/** Rough Chancenkarte points from the wizard answers (experience is not asked: up to 3 more points). */
export const chancenkartePoints = (a: WizardAnswers) =>
  (a.recognition === 'partial' ? 4 : 0) + Math.max(0, GERMAN_RANK[a.german] - 1) + (a.age === 'u35' ? 2 : a.age === '35to44' ? 1 : 0);

export const recommend = (input: WizardAnswers): Recommendation[] => {
  const a: WizardAnswers = { ...input, recognition: input.qualification === 'none' ? 'no' : input.recognition };
  const g = GERMAN_RANK[a.german];
  const qualified = a.qualification !== 'none';
  const hasOffer = a.offer !== 'none';
  const out: Recommendation[] = [];
  const push = (route: RouteKey, score: number, reasons: string[]) => out.push({ route, score: clamp(score), fit: fitOf(clamp(score)), reasons });

  // EU Blue Card: degree + salary above the threshold.
  {
    const r: string[] = [];
    let s = 0;
    if (a.qualification !== 'degree') {
      r.push('-needDegree');
      s = 5;
    } else {
      r.push('+degree');
      if (a.offer === 'above') {
        s = 90;
        r.push('+salaryAbove');
      } else if (a.offer === 'shortage') {
        s = 70;
        r.push('+salaryShortage');
      } else if (a.offer === 'below') {
        s = 20;
        r.push('-salaryBelow');
      } else {
        s = 40;
        r.push('-needOffer');
      }
      r.push('+noGermanNeeded');
      if (a.recognition === 'no' || a.recognition === 'unknown') {
        s -= 10;
        r.push('-checkComparability');
      }
    }
    push('blueCard', s, r);
  }

  // Skilled worker §18a (vocational training; degree holders below the Blue Card threshold: §18b).
  {
    const r: string[] = [];
    let s = 0;
    if (!qualified) {
      r.push('-needQualification');
      s = 5;
    } else {
      s = 25;
      if (a.qualification === 'degree') r.push('+use18b');
      if (hasOffer) {
        s += 30;
        r.push('+hasOffer');
      } else r.push('-needOffer');
      if (a.recognition === 'full') {
        s += 30;
        r.push('+recognised');
      } else if (a.recognition === 'partial') {
        s += 10;
        r.push('-finishRecognition');
      } else {
        r.push('-startRecognition');
      }
      if (g >= 2) {
        s += 10;
        r.push('+germanBasics');
      } else r.push('-learnGerman');
      if (a.age === '45plus' && a.offer !== 'above' && a.offer !== 'shortage') {
        s -= 15;
        r.push('-age45Salary');
      }
    }
    push('skilled18a', s, r);
  }

  // Opportunity Card: job search without an offer.
  {
    const r: string[] = [];
    let s = 0;
    if (!qualified) {
      r.push('-needQualification');
      s = 5;
    } else {
      s = hasOffer ? 35 : 60;
      if (hasOffer) r.push('-offerDirect');
      else r.push('+noOfferNeeded');
      if (a.recognition === 'full') {
        s += 25;
        r.push('+noPointsNeeded');
      } else {
        const points = chancenkartePoints(a);
        if (points >= 6) {
          s += 20;
          r.push('+pointsLikely');
        } else if (points >= 3) {
          s += 5;
          r.push('-pointsExperience');
        } else {
          s -= 15;
          r.push('-pointsLow');
        }
      }
      if (g === 0) {
        s -= 20;
        r.push('-needA1');
      }
    }
    push('chancenkarte', s, r);
  }

  // Ausbildung: training contract, usually B1, mostly for younger applicants.
  {
    const r: string[] = [];
    let s = a.qualification === 'none' ? 55 : a.qualification === 'vocational' ? 35 : 20;
    if (a.qualification === 'none') r.push('+noQualificationNeeded');
    if (a.age === 'u35') {
      s += 15;
      r.push('+age');
    } else if (a.age === '45plus') {
      s -= 30;
      r.push('-ageHigh');
    } else s -= 5;
    if (g >= 3) {
      s += 25;
      r.push('+germanB1');
    } else if (g === 2) {
      s += 8;
      r.push('-learnB1');
    } else {
      s -= 10;
      r.push('-learnB1');
    }
    r.push('+paid');
    push('ausbildung', s, r);
  }

  // Family reunification: only with a spouse / parent in Germany.
  {
    const r: string[] = [];
    let s = 3;
    if (a.family === 'yes') {
      s = 85;
      r.push('+familyMember');
      if (g === 0) r.push('-maybeA1');
    } else r.push('-noFamily');
    push('family', s, r);
  }

  return out.sort((x, y) => y.score - x.score || ROUTE_KEYS.indexOf(x.route) - ROUTE_KEYS.indexOf(y.route));
};

/** The best routes to show: every "high" fit, else the top two (never "low" unless nothing else). */
export const topRecommendations = (recs: Recommendation[]) => {
  const high = recs.filter((r) => r.fit === 'high');
  if (high.length) return high.slice(0, 3);
  const medium = recs.filter((r) => r.fit === 'medium');
  return (medium.length ? medium : recs).slice(0, 2);
};
